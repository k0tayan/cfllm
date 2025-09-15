import { Ai } from '@cloudflare/workers-types/experimental';
import type { D1Database } from '@cloudflare/workers-types';

// Types for bindings from wrangler.toml
export type Bindings = {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  AI: Ai;
  GUILDS_DB: D1Database;
  // LLM provider selection and Gemini config
  LLM_PROVIDER?: string; // 'gemini' | 'workers-ai'
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string; // default: 'gemini-2.0-flash'
};
