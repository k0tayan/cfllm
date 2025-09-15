#/dominate_with_message_url — メッセージURL経由で犯罪係数を測定する

このドキュメントは、新しいDiscordスラッシュコマンド「/dominate_with_message_url」を設計し、既存の「/dominate」と同一アルゴリズムで、指定されたDiscordメッセージURLから本文を取得して犯罪係数を測定するフローをまとめたものです。

## 目的
- Discordのメッセージリンク（URL）を受け取り、そのリンク先メッセージの内容を解析対象テキストとして流用する。
- 測定アルゴリズムは既存の「/dominate」と完全に共通（`src/llm.ts` の呼び出し・パラメータを流用）。
- 既存のインタラクション処理（`/dominate` の Deferred Update パターン）を踏襲し、応答時間制約を回避。

## スラッシュコマンド仕様
- コマンド名: `/dominate_with_message_url`
- 説明: メッセージURLから本文を取得して犯罪係数を測定します
- オプション:
  - `url` (string, required): DiscordメッセージURL
- ギルド制限: 既存の許可ギルド（`ALLOWED_GUILD_IDs`）に準拠

登録例（`scripts/register-commands.mjs` のpayload追加イメージ）:
```jsonc
{
  "name": "dominate_with_message_url",
  "description": "メッセージURLから本文を取得して犯罪係数を測定します",
  "type": 1,
  "options": [
    {
      "type": 3,
      "name": "url",
      "description": "DiscordメッセージのURL",
      "required": true
    }
  ]
}
```

## 対応するURL形式
以下の形式を受け付け、`guild_id` / `channel_id` / `message_id` を抽出します。
- `https://discord.com/channels/{guild_id}/{channel_id}/{message_id}`
- `https://ptb.discord.com/channels/{guild_id}/{channel_id}/{message_id}`
- `https://canary.discord.com/channels/{guild_id}/{channel_id}/{message_id}`
- `https://discordapp.com/channels/{guild_id}/{channel_id}/{message_id}`

注意:
- DMリンク（`guild_id` が `@me`）は対象外とし、明示的なエラーメッセージを返します。
- モバイル深リンク（`discord://`）はサポート外。上記Web URLへの張り替えを促すエラーを返します。

## インタラクション処理フロー
1. 署名検証: 既存の `/api/interactions` の署名検証（`src/verify.ts`）をそのまま使用。
2. PING: 既存同様にヘルスチェック応答。
3. COMMAND受信 (`dominate_with_message_url`):
   - 受理直後に Deferred Channel Message with Source (type 5) を返す（公開返信）。
4. URLパース:
   - 許容形式にマッチするか検証し、`guild_id`/`channel_id`/`message_id` を抽出。
   - `guild_id` が `@me` の場合は非対応エラー（エフェメラルで更新）。
5. ギルド許可チェック:
   - 既存の `ALLOWED_GUILD_IDs` に `guild_id` が含まれるか確認。含まれない場合はエラー更新。
6. メッセージ取得（Discord REST）:
   - エンドポイント: `GET /channels/{channel_id}/messages/{message_id}`
   - ヘッダ: `Authorization: Bot ${DISCORD_BOT_TOKEN}`
   - 必要権限: `Read Message History`, `View Channel`（メッセージが参照可能なチャンネルであること）
   - 404/403 の場合は、URL誤り・閲覧権限不足・Bot未参加等の可能性としてユーザー向けにエラーメッセージ。
7. テキスト抽出と正規化:
   - `message.content` を基準に抽出。
   - 添付ファイルや埋め込みはv1では無視（将来拡張で本文化を検討）。
   - 空文字の場合はエラー（メッセージに本文が無い）を返す。
8. 既存アルゴリズムでの測定:
   - `/dominate` と同じヘルパ（`src/llm.ts`）呼び出し、同等のプロンプト／パラメータ。
   - 出力フォーマットも `/dominate` と揃える（スコア、説明、注意喚起など）。
9. 追跡返信（type 7: Update Message）:
   - スコアと要約を含む結果で初回応答を公開で更新。

## エラーハンドリング
ユーザーに理解しやすい短いメッセージで返します。代表例:
- URL形式エラー: 「対応していないURL形式です。`https://discord.com/channels/...` を指定してください。」
- DMリンク: 「DMのメッセージは対象外です。」
- 権限/参照不可: 「メッセージを取得できませんでした。Botがチャンネルを閲覧できるか確認してください。」
- 空本文: 「メッセージ本文が見つかりませんでした。」
- 予期せぬエラー: 「内部エラーが発生しました。時間をおいて再度お試しください。」

## セキュリティとプライバシー
- 署名検証は必須（既存実装を流用）。
- 許可ギルド外からの呼び出しは拒否。
- `DISCORD_BOT_TOKEN` はWranglerのシークレットとして管理（コミット禁止）。
- メッセージ内容は測定のためにのみ使用し、永続保存しない（ログにも残さないか、PIIを取り除く）。
- 応答は常に公開として送信。

## 実装ポイント（既存構成への最小変更）
- `src/index.ts`
  - コマンドルーティングに `dominate_with_message_url` を追加。
  - 入力（URL）のパース、ギルドチェック、Discord REST呼び出しを追加。
  - テキスト抽出後は既存の `/dominate` と同じ処理へ委譲。
- `src/llm.ts`
  - 変更不要（完全再利用）。
- `scripts/register-commands.mjs`
  - 新コマンド定義（上記JSON）を追加して登録可能に。
- `wrangler.toml`
  - 変更不要（既存の `/api/interactions` エンドポイントを利用）。

## 登録・動作確認
1. コマンド登録
   - `.env` に `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID` を設定。
   - `npm run register-commands` を実行し、新コマンドがGuild/Globalに反映されることを確認。
2. ローカル開発
   - `npm run dev` を起動。
   - Discordクライアントから `/dominate_with_message_url url:<メッセージURL>` を実行。
   - まず「処理中…」のDeferred応答が表示され、数秒後に犯罪係数の結果が更新されることを確認。
3. 代表ケース
   - 正常系: 通常のテキストメッセージURL。
   - 権限不足: Botが閲覧不可のチャンネル。
   - 空本文: 埋め込みのみのメッセージやスタンプのみ。
   - 不正URL: 期待形式でないURL、DMリンク。

## 将来拡張
- 添付ファイル（テキスト/画像）の内容解析（OCRやテキスト抽出）を統合。
- クロスポスト（フォーラム/スレッド）のタイトル・タグも解析対象へ拡張。
- 複数URL入力や、URL+追記説明の同時入力に対応。
- メッセージ引用（引用ブロックの整形）やメンション解決の強化。

---

この設計は既存の `/dominate` 実装を最大限に再利用しつつ、入力起点のみを「URL→メッセージ本文」に差し替えることで、最小変更での追加を目指しています。
