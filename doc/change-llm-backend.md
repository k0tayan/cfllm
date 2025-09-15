# LLMバックエンド切替設計（Workers AI と Gemini 選択式）

## 背景 / 目的
- 現状の `analyzeCrimeCoefficient` は Cloudflare Workers AI（`Ai.run`）に密結合。
- Google Gemini（モデル: `gemini-2.0-flash`）を利用したい要求がある。
- 将来的なプロバイダー追加（例: OpenAI, Vertex, Bedrock 等）に備え、LLM 呼び出しを疎結合に再設計する。

本設計では、プロバイダー非依存のインターフェースを導入し、Workers AI と Gemini を環境変数で切り替え可能にする。既定は Gemini を選択する。

## 要件
- 機能要件
  - `analyzeCrimeCoefficient` のロジックをプロバイダー非依存化する。
  - プロバイダーの選択: `gemini` または `workers-ai` をサポート。
  - 既存の Discord コマンドフロー（`/dominate`, `/dominate_with_message_url`）は変更なく動作する。
  - 署名検証やギルド許可リスト等のセキュリティは維持。
- 非機能要件
  - 依存ライブラリは極力追加しない（Workers 標準 `fetch` を活用）。
  - Cloudflare Workers ランタイムで動作。
  - Secrets は Wrangler の `secret` 機構で管理し、レポジトリにコミットしない。

## アーキテクチャ
- ファサード（既存のエントリ）: `src/llm.ts`
  - 役割を「プロバイダー選択と委譲」に変更する（既存の `prompt`/JSON整形は共通化して再利用）。
- プロバイダー実装: `src/providers/` ディレクトリを追加
  - `src/providers/types.ts` — 共通型とインターフェース定義
    - `CrimeResult`: 既存と同義
    - `LLMClient`: `analyzeCrimeCoefficient(message: string): Promise<CrimeResult>` を公開
  - `src/providers/workersai.ts` — 既存実装を移植（`Ai.run` 経由）
  - `src/providers/gemini.ts` — Gemini 呼び出し（`fetch` + API Key）
- 共通ユーティリティ
  - `src/providers/prompt.ts` — プロンプト生成
  - `src/providers/json.ts` — JSON 抽出/安全パース（既存の `safeParseJson` ロジックを移動）
- バインディング/設定
  - `src/bindings.ts` を拡張し、`GEMINI_API_KEY`, `LLM_PROVIDER`, （任意で）`GEMINI_MODEL` を追加

### インターフェース
```ts
// src/providers/types.ts
export type CrimeResult = { crime_coefficient: number; reason: string };
export interface LLMClient {
  analyzeCrimeCoefficient(message: string): Promise<CrimeResult>;
}
```

### ファクトリーとファサード
```ts
// src/llm.ts（新役割: プロバイダー選択）
import type { Bindings } from './bindings';
import { createWorkersAiClient } from './providers/workersai';
import { createGeminiClient } from './providers/gemini';

export function getLLM(env: Bindings) {
  const provider = (env.LLM_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'workers-ai') return createWorkersAiClient(env);
  return createGeminiClient(env);
}

export async function analyzeCrimeCoefficient(env: Bindings, message: string) {
  return getLLM(env).analyzeCrimeCoefficient(message);
}
```

既存呼び出し箇所（`src/commands.ts`）は `analyzeCrimeCoefficient(c.env.AI, text)` から `analyzeCrimeCoefficient(c.env, text)` に変更する。Workers AI の `Ai` バインド受け渡しは `env` 経由で継続可能。

### Workers AI 実装（移植）
- 既存のモデル呼び出し（`ai.run('@cf/google/gemma-3-12b-it', { prompt })`）を `createWorkersAiClient` に移行。
- 返却テキストから JSON を抽出するロジックは共通ユーティリティへ移動。

擬似コード:
```ts
export function createWorkersAiClient(env: Bindings): LLMClient {
  return {
    async analyzeCrimeCoefficient(message) {
      if (!message?.trim()) return { crime_coefficient: 0, reason: '解析対象のメッセージが空でした。' };
      const prompt = buildPrompt(message);
      for (let i = 0; i < 2; i++) {
        const res: any = await env.AI.run('@cf/google/gemma-3-12b-it', { prompt });
        const text = extractAiText(res);
        const parsed = safeParseCrimeResult(text);
        if (parsed) return normalizedCrimeResult(parsed);
      }
      return { crime_coefficient: 0, reason: '解析に失敗しました。' };
    },
  };
}
```

### Gemini 実装（構造化出力 + 公式 SDK 利用）
- ライブラリ: `@google/genai`
- インポート: `import { GoogleGenAI, Type } from '@google/genai'`
- 既定モデル: `gemini-2.0-flash`（`GEMINI_MODEL` で上書き可能）
- 構造化出力（JSON）を強制するため、`config.responseMimeType` と `config.responseSchema` を使用。
- `responseSchema` は以下のオブジェクトを指定:
  - `crime_coefficient`: `Type.NUMBER`
  - `reason`: `Type.STRING`

依存追加（開発時）:
- `npm i @google/genai`

擬似コード（Workers 互換 ESM）:
```ts
import { GoogleGenAI, Type } from '@google/genai';

export function createGeminiClient(env: Bindings): LLMClient {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || 'gemini-2.0-flash';
  const ai = new GoogleGenAI({ apiKey });
  return {
    async analyzeCrimeCoefficient(message) {
      if (!message?.trim()) return { crime_coefficient: 0, reason: '解析対象のメッセージが空でした。' };
      if (!apiKey) return { crime_coefficient: 0, reason: 'Gemini の API キーが未設定です。' };
      const prompt = buildPrompt(message);
      for (let i = 0; i < 2; i++) {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                crime_coefficient: { type: Type.NUMBER },
                reason: { type: Type.STRING },
              },
              required: ['crime_coefficient', 'reason'],
              propertyOrdering: ['crime_coefficient', 'reason'],
            },
          },
        });
        // SDK は構造化出力時、JSON テキストを返す（例: response.text）
        const text = String((response as any).text ?? '');
        const parsed = safeParseCrimeResult(text);
        if (parsed) return normalizedCrimeResult(parsed);
      }
      return { crime_coefficient: 0, reason: '解析に失敗しました。' };
    },
  };
}
```

備考:
- SDK は `fetch` ベースで Cloudflare Workers でも動作（Node 専用 API 不使用）。
- API キーはコンストラクターに渡す（Workers では `process.env` 不可のため）。

### プロンプト方針（共通）
- 既存の日本語プロンプトをそのまま利用。
- 返却形式は JSON 固定（`crime_coefficient`, `reason`）。
- 「500（操作試行）」と「999 上限」は同様に維持。

### JSON 正規化
- 既存の `safeParseJson` と `extractAiText` を `src/providers/json.ts` に移動。
- Gemini は構造化出力により JSON を返すが、安全のため最終的に `Number(...)`, `String(...).trim()` で正規化。
- Workers AI はテキスト返却を想定し、既存の抽出ロジックを使用。

## 変更ファイル一覧（予定）
- 追加
  - `src/providers/types.ts`
  - `src/providers/json.ts`
  - `src/providers/prompt.ts`
  - `src/providers/workersai.ts`
  - `src/providers/gemini.ts`
- 変更
  - `src/llm.ts`（ファサード化）
  - `src/commands.ts`（`analyzeCrimeCoefficient` 呼び出しシグネチャ変更）
  - `src/bindings.ts`（Bindings に `GEMINI_API_KEY`, `LLM_PROVIDER`, `GEMINI_MODEL?` 追加）
  - `wrangler.toml`（`vars` に `LLM_PROVIDER` 既定、必要に応じて `GEMINI_MODEL`）

## 環境変数 / Secrets
- `LLM_PROVIDER`（vars）: `gemini` | `workers-ai`（既定: `gemini`）
- `GEMINI_API_KEY`（secret）: Gemini の API キー
- `GEMINI_MODEL`（vars, 任意）: 既定 `gemini-2.0-flash`

設定例:
- ローカル（.dev.vars）
  - `LLM_PROVIDER=gemini`
  - `GEMINI_MODEL=gemini-2.0-flash`
- 本番（Wrangler）
  - `npx wrangler secret put GEMINI_API_KEY`
  - `wrangler.toml` の `[vars]` に `LLM_PROVIDER = "gemini"`

## 互換性・移行
- 既存の `/dominate` と `/dominate_with_message_url` のエンドポイント/動作は変えない。
- `src/commands.ts` の呼び出しのみ最小変更（`c.env.AI` → `c.env` を渡す）。
- ログ/エラーメッセージは既存表現を踏襲。

移行手順:
1) コード変更（本設計に沿って分離・実装）
2) `wrangler.toml` に `LLM_PROVIDER` を追加（`gemini`）
3) `npx wrangler secret put GEMINI_API_KEY` を各環境で投入
4) ローカル `.dev.vars` に `LLM_PROVIDER=gemini` を追加
5) `npm run dev` 起動 → PING と `/dominate` フローを確認

## エラーハンドリング / リトライ
- 両プロバイダーとも 2 回まで JSON 抽出リトライ。
- Gemini 側が非 2xx の場合はスキップして再試行（致命的なら共通エラーへ）。
- 返却不能時は `{ crime_coefficient: 0, reason: '解析に失敗しました。' }` を返す。

## セキュリティ
- API キーは Wrangler Secrets で管理しコミット禁止。
- 署名検証（`verifyDiscordRequest`）は現状維持。
- ギルド許可リスト（`ALLOWED_GUILD_IDs`）は現状維持。

## リスクと対策
- JSON 準拠度の差: 共通パーサで緩やかに吸収、出力正規化。
- モデル特性差による数値ブレ: プロンプトの明示制約で抑制。
- レイテンシ差: Gemini/Workers AI のどちらでも 1 リクエストで完結、ストリーミング未使用。

## 検証計画
- ローカルで `LLM_PROVIDER=gemini` に設定し、以下を確認:
  - PING 応答（type:1 → 1）
  - `/dominate` の deferred → follow-up 更新が正常
  - `/dominate_with_message_url` の URL パース/権限エラー分岐
  - 返却 JSON のフォーマット（数値/文字列の正規化）

## 今後の拡張
- ストリーミング応答（Discord への段階的更新）
- モデレーション/安全フィルタの抽象化（必要時）
- 追加プロバイダー（OpenAI, Vertex 等）を `src/providers/*` に実装

---
この設計により、LLM バックエンドを Gemini と Workers AI の間で容易に切り替え可能にしつつ、既存のコマンド体験を維持します。初期設定では Gemini（`gemini-2.0-flash`）を既定として利用します。
