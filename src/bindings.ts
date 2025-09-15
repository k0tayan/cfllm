import { Ai } from "@cloudflare/workers-types/experimental";

// Types for bindings from wrangler.toml
export type Bindings = {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  AI: Ai;
};

