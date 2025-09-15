# デプロイ手順書

このドキュメントでは、`cfllm`アプリケーションをCloudflare Workersにデプロイする手順を説明します。

## 1. 前提条件

* [Node.js](https://nodejs.org/) (v18以降) と npm がインストールされていること。
* [Cloudflare](https://dash.cloudflare.com/)のアカウントを持っていること。
* [Git](https://git-scm.com/)がインストールされていること。

## 2. プロジェクトのセットアップ

まず、プロジェクトをローカル環境にセットアップします。

```bash
# 1. プロジェクトをクローン
git clone <repository-url>
cd cfllm

# 2. 依存関係をインストール
npm install

# 3. Wrangler CLIでCloudflareにログイン
npx wrangler login
```

## 3. Discordアプリケーションの作成

本システムはDiscordのBot機能を利用します。Discord Developer Portalでアプリケーションを作成し、必要な情報を取得してください。

1. **アプリケーションの作成**
   * [Discord Developer Portal](https://discord.com/developers/applications)にアクセスし、「New Application」をクリックして新しいアプリケーションを作成します。

2. **Botの追加**
   * 左側のメニューから「Bot」タブに移動し、「Add Bot」をクリックしてBotを作成します。
   * Botのアイコンの下にある「Reset Token」をクリックし、表示された**Botトークン**を安全な場所に控えます。これが `DISCORD_BOT_TOKEN` になります。

3. **アプリケーション情報の取得**
   * 「General Information」タブで、`APPLICATION ID`、`PUBLIC KEY` を控えます。それぞれ `DISCORD_APPLICATION_ID`、`DISCORD_PUBLIC_KEY` となります。

## 4. 環境変数とシークレットの設定

### コマンド登録用の環境変数

Discordのスラッシュコマンドを登録するために、ローカル用の `.env` ファイルを作成します。プロジェクトルートに `.env` ファイルを作成し、Discordから取得した値を設定します。

```dotenv
# .env
DISCORD_APPLICATION_ID=YOUR_APPLICATION_ID
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
```

### デプロイ用のシークレット

デプロイ環境で利用する機密情報をWranglerのシークレットとして設定します。

```bash
# Discordから取得した値を設定
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_APPLICATION_ID
```

## 5. Discordコマンドの登録

設定した環境変数を使って、Discordに `/dominate` スラッシュコマンドを登録します。

```bash
npm run register-commands
```

成功すると、コマンド情報がコンソールに表示されます。

## 6. デプロイ

すべての設定が完了したら、アプリケーションをCloudflare Workersにデプロイします。

```bash
npm run deploy
```

デプロイが成功すると、コンソールにWorkerのURL（例: `https://cfllm.your-subdomain.workers.dev`）が表示されます。

以上でデプロイは完了です。
