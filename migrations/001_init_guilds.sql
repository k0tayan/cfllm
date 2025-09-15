-- D1 schema for guild allowlist management
CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  is_active INTEGER NOT NULL DEFAULT 1,
  registered_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  registered_by_user_id TEXT,
  registered_channel_id TEXT,
  unregistered_at INTEGER,
  unregistered_by_user_id TEXT
);

-- Optional index to filter active guilds quickly
-- CREATE INDEX IF NOT EXISTS idx_guilds_is_active ON guilds(is_active);

