# Repository Guidelines

## Project Structure & Module Organization
- `src/` — Worker source (TypeScript):
  - `index.ts` (Hono app, routes, Discord interactions)
  - `verify.ts` (Discord signature verification)
  - `llm.ts` (Workers AI invocation)
- `scripts/` — One‑off utilities: `register-commands.mjs` (registers `/dominate`).
- `doc/` — Deployment and system design docs.
- `wrangler.toml` — Worker entrypoint, routes, and bindings.
- `.env`, `.dev.vars` — Local development variables (do not commit secrets).

## Build, Test, and Development Commands
- `npm run dev` — Start local dev server with Wrangler (`/` health check, `/api/interactions`).
- `npm run deploy` — Deploy to Cloudflare Workers (uses `wrangler.toml`; minified).
- `npm run register-commands` — Register the Discord `/dominate` command (needs `.env`).
- Secrets (once per env):
  - `npx wrangler secret put DISCORD_PUBLIC_KEY|DISCORD_BOT_TOKEN|DISCORD_APPLICATION_ID`

## Coding Style & Naming Conventions
- Language: TypeScript (ESM, `"type": "module"`).
- Indentation: 2 spaces; use semicolons; single quotes for strings.
- File naming: lowercase with short, descriptive names (e.g., `verify.ts`, `llm.ts`).
- Keep modules focused: route handling in `index.ts`, external calls in helpers.
- Avoid new deps unless necessary; prefer platform APIs (Hono, Workers AI).

## Testing Guidelines
- No formal test runner is configured yet.
- Validate changes via `npm run dev` and manual requests:
  - Verify PING flow and `/dominate` deferred update path.
- If adding tests, prefer Vitest + `@cloudflare/workers-types`; place under `tests/` with `*.test.ts`.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject; include scope when helpful
  - Example: `feat(interactions): add guild allowlist check`.
- PRs must include:
  - What/why summary, linked issues, and risk/rollout notes.
  - Screenshots or logs for Discord interaction flows (request/response).
  - Any config changes (`wrangler.toml`, secrets) and migration steps.

## Security & Configuration Tips
- Never commit tokens or application IDs; use Wrangler secrets.
- Keep `ALLOWED_GUILD_IDs` in `src/index.ts` updated as policy changes.
- Validate signature checks remain in place for `/api/interactions`.

## Agent‑Specific Instructions
- Respect this structure; avoid editing routes or bindings casually.
- Update docs in `doc/` when behavior or endpoints change.
- Keep changes minimal and focused; prefer small, reviewable PRs.
