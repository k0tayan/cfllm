# システム設計書: Cloudflare Workers & Discord LLM Bot

## 1. 概要 📜

本システムは、**Cloudflare Workers**をバックエンド基盤として利用し、**Discordのスラッシュコマンド**を通じて大規模言語モデル（LLM）によるタスク実行機能を提供するBotです。

## 2. アーキテクチャ 🏛️

サーバーレスアーキテクチャを採用しており、すべてのロジックはCloudflareのグローバルネットワーク上で実行されます。これにより、スケーラビリティとパフォーマンスを確保しています。

### 主要技術スタック

*   **実行環境**: Cloudflare Workers
*   **APIフレームワーク**: Hono
*   **AI/LLM**: Cloudflare Workers AI

## 3. 認証フロー 🔑

認証はDiscordからのリクエスト署名の検証によって行われます。

### Discordスラッシュコマンド経由

1.  ユーザーがDiscordクライアントでスラッシュコマンド（`/dominate`）を実行します。
2.  Discordは、Workerの `POST /api/interactions` エンドポイントにリクエストを送信します。
3.  このリクエストには、コマンドを実行したユーザーの情報（ユーザーID、サーバー情報など）が含まれています。
4.  Workerは、リクエストヘッダーに含まれる署名とタイムスタンプを使い、**Discordの公開鍵**でリクエストが正当なものであるかを検証します。
5.  検証に成功した場合、リクエストは信頼できるものとして扱われます。

***

## 4. APIエンドポイント ↔️

| Method | Path                | 説明                                                                | 認証方法                  |
| :----- | :------------------ | :------------------------------------------------------------------ | :------------------------ |
| `POST` | `/api/interactions` | **Discord**からのスラッシュコマンド（インタラクション）を処理します。 | Discordリクエスト署名検証 |

***

## 5. データフロー 🌊

### DiscordからのLLMタスク実行フロー（犯罪係数測定）

1.  **Discord User**: `/dominate user:@target` コマンドを実行。
2.  **Discord API**: Worker の `POST /api/interactions` にリクエストを送信。
3.  **Worker**:
    a. 署名検証を行い、リクエストの正当性を確認。
    b. 対象ユーザー ID を取得し、チャンネル内の直近メッセージ（最大50件）から該当ユーザーの最新メッセージを選定。
    c. Discord へ `DEFERRED` を返し、バックグラウンドで LLM 実行関数（`analyzeCrimeCoefficient`）を呼び出す。
    d. Cloudflare Workers AI にメッセージ内容を渡して解析し、構造化 JSON を取得。
    e. 犯罪係数から「執行モード」を判定し、Webhook で元メッセージを更新。
4.  **Discord User**: 測定結果が表示される。

***

## 6. 設定と環境変数 ⚙️

本システムは、Wranglerのシークレットと`wrangler.toml`の設定に依存します。

### シークレット (Wrangler Secrets)

| 変数名                   | 説明                                |
| :----------------------- | :---------------------------------- |
| `DISCORD_PUBLIC_KEY`     | Discord Botの公開鍵                 |
| `DISCORD_BOT_TOKEN`      | Discord Botのトークン               |
| `DISCORD_APPLICATION_ID` | DiscordアプリケーションのID         |

### wrangler.toml バインディング

| バインディング名 | 種類 | 説明                                  |
| :--------------- | :--- | :------------------------------------ |
| `AI`             | `ai` | Cloudflare Workers AIモデルにアクセスします。 |
