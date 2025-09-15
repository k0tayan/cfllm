# D1 によるギルド登録管理（/register, /unregister）

このドキュメントは、Discord Bot が利用可能なサーバー（ギルド）の許可管理を、ハードコードではなく Cloudflare D1 で行うための設計と実装方針をまとめたものです。

## 目的
- `ALLOWED_GUILD_IDs` をソースコードから排除し、D1 による永続管理へ移行する。
- ギルドの登録はスラッシュコマンド `/register`、解除は `/unregister` で行う。
- Bot をサーバーに追加後、任意のチャンネルでユーザーが `/register` を実行すると、そのギルドが登録される。
- 登録されていないギルドからの機能コマンドは、DB 照会によりブロックし、利用方法を案内する。
- `/register` と `/unregister` の実行権限は固定のユーザー ID（`826082931201802240`）のみに制限する（ハードコード）。

## 全体像
- Cloudflare D1 に `guilds` テーブルを作成し、許可状態を保持（soft delete 推奨）。
- Worker（`src/index.ts`）のインタラクション処理で、`interaction.guild_id` を元に D1 を照会。
- `/register` と `/unregister` は Discord アプリケーションコマンドとして登録（`scripts/register-commands.mjs`）。
- 実行ユーザーは固定 ID（`826082931201802240`）のみ許可（ハードコード）。
- 実装分割:
  - D1 ヘルパー群: `src/guilds.ts`（`isGuildAllowed`, `registerGuild`, `unregisterGuild`, `isOperator`）
  - 登録/解除ハンドラ: `src/registration.ts`（`handleRegister`, `handleUnregister`）
  - ルーティング: `src/index.ts`（ハンドラへの委譲と共通ゲート）

## スキーマ設計（D1）
最小構成＋監査用フィールド。

```sql
-- migrations/001_init_guilds.sql
CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  is_active INTEGER NOT NULL DEFAULT 1, -- 1: active(許可), 0: inactive(解除)
  registered_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  registered_by_user_id TEXT,
  registered_channel_id TEXT,
  unregistered_at INTEGER,
  unregistered_by_user_id TEXT
);

-- オプション: 監査や検索を強化したい場合のインデックス
-- CREATE INDEX IF NOT EXISTS idx_guilds_is_active ON guilds(is_active);
```

- `is_active` による soft delete 運用を推奨。解除は `is_active = 0` と `unregistered_*` を更新。
- 必要に応じて `notes` や `reason` を追加可能。

## Wrangler 設定（D1 バインディング）
`wrangler.toml` に D1 を追加します。`database_name` は例です。実環境では作成後の ID を反映してください。

```toml
# wrangler.toml（一部）

[[d1_databases]]
binding = "GUILDS_DB"          # Worker から参照するバインディング名
database_name = "guilds-db"    # D1 DB 名（例）
database_id = "<prod-d1-id>"   # 本番用 D1 の ID
# preview_database_id = "<dev-d1-id>"  # 任意: dev 用に別 DB を使う場合
```

作成コマンド例（参考）：
- `npx wrangler d1 create guilds-db`（表示された `database_id` を `wrangler.toml` に反映）
- `npx wrangler d1 migrations apply guilds-db`（`migrations/001_init_guilds.sql` を適用）

> 補足: このリポジトリには `migrations/001_init_guilds.sql` を同梱しています。必要に応じて追加マイグレーションを作成してください。

## コマンド定義（Discord Application Commands）
`/register` と `/unregister` を追加します。`scripts/register-commands.mjs` に以下を反映（実コード側では既存 `/dominate` 登録に併せて 2 コマンドを追加）。

- `/register`: このコマンドが実行されたギルドを登録（有効化）。
- `/unregister`: このコマンドが実行されたギルドを解除（無効化）。

登録時の要件と挙動:
- ギルドコンテキスト必須（DM ではエラー応答）。
- 実行ユーザー固定: ユーザー ID `826082931201802240` のみが実行可能（ハードコード）。
- 既に登録済みかどうかを判定してメッセージを出し分け。
- 応答は基本 ephemeral（サーバー管理系のため）。

## インタラクション処理（Worker 側の変更方針）
`src/index.ts` のインタラクションルートで以下を実装します（実処理は分割モジュールへ委譲）。

1) シグネチャ検証は現状維持（`src/verify.ts`）。
2) コマンド分岐に `/register` と `/unregister` を追加。
3) ギルド登録状態の判定箇所を D1 照会に置換。
4) `/register` と `/unregister` は固定ユーザー ID のみ許可（`src/guilds.ts` の `isOperator`）。

擬似コード（要点）:

```ts
// env.GUILDS_DB が D1 バインディング
const OPERATOR_USER_ID = '826082931201802240';

function isOperator(interaction: any): boolean {
  // Guild command: interaction.member.user.id, DM: interaction.user.id
  const userId = interaction?.member?.user?.id ?? interaction?.user?.id;
  return userId === OPERATOR_USER_ID;
}
async function isGuildAllowed(env: Env, guildId: string): Promise<boolean> {
  const stmt = env.GUILDS_DB.prepare(
    'SELECT is_active FROM guilds WHERE guild_id = ? LIMIT 1'
  );
  const row = await stmt.bind(guildId).first();
  return !!row && row.is_active === 1;
}

async function registerGuild(env: Env, guildId: string, userId: string, channelId: string) {
  // 既存レコードがある場合は is_active を 1 にし直す（soft upsert）
  await env.GUILDS_DB.batch([
    env.GUILDS_DB.prepare(
      'INSERT INTO guilds (guild_id, is_active, registered_by_user_id, registered_channel_id) VALUES (?, 1, ?, ?)\n' +
      'ON CONFLICT(guild_id) DO UPDATE SET is_active = 1, registered_by_user_id = excluded.registered_by_user_id, registered_channel_id = excluded.registered_channel_id, registered_at = strftime("%s","now")'
    ).bind(guildId, userId, channelId),
  ]);
}

async function unregisterGuild(env: Env, guildId: string, userId: string) {
  await env.GUILDS_DB.prepare(
    'UPDATE guilds SET is_active = 0, unregistered_at = strftime("%s","now"), unregistered_by_user_id = ? WHERE guild_id = ?'
  ).bind(userId, guildId).run();
}

// ハンドラ例（要点のみ）
if (commandName === 'register') {
  if (!isOperator(interaction)) return ephemeral('You are not allowed to run /register.');
  // ... registerGuild(...)
}
if (commandName === 'unregister') {
  if (!isOperator(interaction)) return ephemeral('You are not allowed to run /unregister.');
  // ... unregisterGuild(...)
}
```

- 既存の `ALLOWED_GUILD_IDs` 参照箇所は `isGuildAllowed` を用いた D1 照会へ置換します。
- `/dominate` など機能コマンド実行前に `isGuildAllowed` をチェックし、未登録なら ephemeral で `/register` 案内を返す。

### 実行ユーザー固定チェック
- `/register` と `/unregister` はユーザー ID `826082931201802240` のみ実行可能。
- 上記以外のユーザーが実行した場合は ephemeral エラーを返す。

### DM とギルドコンテキスト
- `interaction.guild_id` が無い（= DM）場合、`/register` と `/unregister` は無効。案内を返す。

## 振る舞いの詳細
- Bot をサーバーに追加後、任意のチャンネルで `/register` を実行すると、そのギルドが登録される。
- 登録済みギルドで `/register` を実行した場合は「既に登録済み」である旨を返す。
- `/unregister` 実行で `is_active = 0` に変更。以後、そのギルドからの機能コマンドはブロック。
- 未登録ギルドが機能コマンド（例: `/dominate`）を実行すると、ephemeral で `/register` の案内を返す。

## ロギングと監査
- `registered_by_user_id`, `registered_channel_id`, `unregistered_by_user_id`, `*_at` を残し、最低限の監査線を確保。
- Worker ログには、ギルド ID と実行ユーザー ID を info レベルで記録（個人情報の扱いに注意）。

## ローカル検証手順
1) D1 の作成・マイグレーション適用
   - `npx wrangler d1 create guilds-db`
   - `npx wrangler d1 migrations apply guilds-db`
2) `wrangler.toml` に `GUILDS_DB` バインディングを追加
3) コマンド登録
   - `npm run register-commands`（`/register`, `/unregister` を追加）
4) Dev サーバー起動
   - `npm run dev`
5) Discord 側で
   - ギルドに Bot を追加
   - 任意のチャンネルで `/register` を実行し、登録成功を確認
   - `/dominate` 等の機能コマンドが動作することを確認
   - `/unregister` 後に機能コマンドがブロックされることを確認

## 変更が必要な箇所（概要）
- `wrangler.toml`: D1 バインディング `GUILDS_DB` を追加（`database_id` 設定必須）
- `migrations/`: `001_init_guilds.sql` を追加（D1 初期化）
- `scripts/register-commands.mjs`: `/register`, `/unregister` を追加
- `src/guilds.ts`: D1 照会・登録/解除・オペレーター判定を実装
- `src/registration.ts`: `/register`・`/unregister` のハンドラを実装
- `src/index.ts`: 上記ハンドラへの委譲と、機能コマンドの D1 ゲートを実装
- `doc/`: 本ドキュメント

## セキュリティと運用上の注意
- シグネチャ検証（`src/verify.ts`）は必ず維持。
- Secrets は Wrangler のシークレット管理を使用（トークンやアプリケーション ID はコミットしない）。
- コマンドは ephemeral 応答をデフォルトにし、不要な情報露出を抑制。
- 大規模化に備え、D1 照会結果の短期キャッシュ（例: 60 秒）を検討可能。
 - 実行ユーザー ID はソースにハードコード（`OPERATOR_USER_ID`）。変更が必要な場合はリリース手順に含める。

## ロールバック戦略
- 既存の `ALLOWED_GUILD_IDs` ハードコード方式は残さない方針だが、緊急時には一時的に再導入するか、D1 の `is_active` を手動更新して制御可能。
- `/unregister` 実行により即時ブロック可能（soft delete）。

## 今後の拡張候補
- 登録理由やメモ、運用者コメントの保存。
- 監査ログテーブルの追加（登録/解除イベントを追記型で保持）。
- 連携ロールの自動付与・剥奪（登録時に特定ロールを付与する等）。
- 一時停止フラグ（`is_active` とは別に `is_paused` を設け、機能のみ停止）。

```text
この設計に沿って段階的に実装を進めます：
1) D1 スキーマとバインディング追加
2) コマンド登録スクリプト拡張
3) Worker 側の D1 照会＆コマンド実装
4) 手動疎通確認とログ検証
```
