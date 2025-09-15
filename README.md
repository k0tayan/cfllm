# cfllm — Discord 犯罪係数測定ボット（Cloudflare Workers）

Discord のスラッシュコマンドでメッセージ内容を解析し、犯罪係数と執行モードを判定するボットです。Cloudflare Workers 上で動作し、Hono を用いたルーティング、Discord 署名検証、LLM（Gemini または Workers AI）による推論、D1 によるギルド許可管理を備えています。

* 実行環境: Cloudflare Workers + Hono
* エンドポイント: `GET /`（ヘルスチェック）, `POST /api/interactions`（Discord 連携）
* コマンド: `/dominate`, `/dominate_with_message_url`, `/register`, `/unregister`
* LLM 切替: `GEMINI` または `Workers AI` を環境変数で選択可能
* セキュリティ: Discord 署名検証、ギルド許可リスト（D1）

## ドキュメント（doc/）

* 導入・デプロイ手順: `doc/deploy.md`
* システム概要: `doc/system-design.md`
* `/dominate` の設計: `doc/dominate_system_design.md`
* メッセージURL解析コマンド: `doc/dominate-with-message-url.md`
* ギルド登録の手順（許可リスト）: `doc/register-guild.md`
* LLM バックエンドの切り替え: `doc/change-llm-backend.md`

詳細は各ドキュメントを参照してください。開発・デプロイコマンドやシークレット設定、運用上の考慮事項も doc/ 以下にまとまっています。

# 追加URL

https://discord.com/oauth2/authorize?client\_id=1416704551507067150
