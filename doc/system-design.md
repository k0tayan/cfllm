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

1.  ユーザーがDiscordクライアントでスラッシュコマンド (`/ask`) を実行します。
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

### DiscordからのLLMタスク実行フロー

1.  **Discord User**: `/ask` コマンドを実行。
2.  **Discord API**: Workerの `POST /api/interactions` エンドポイントにリクエストを送信。
3.  **Worker**:
    a. 署名検証を行い、リクエストの正当性を確認。
    b. リクエストボディからプロンプトを取得。
    c. Discord APIに対し「考え中...」という応答 (`DEFERRED`) を即座に返す。
    d. バックグラウンドでLLM実行関数 (`executeLlmTask`) を呼び出す。
    e. Cloudflare Workers AIにプロンプトを送信。
    f. LLMからの応答を受け取る。
    g. DiscordのWebhook APIを使い、元のメッセージをLLMの応答結果で更新する。
4.  **Discord User**: Botのメッセージが更新され、結果が表示される。

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