import type { Bindings } from './bindings';

export const OPERATOR_USER_ID = '826082931201802240';

export async function isGuildAllowed(env: Bindings, guildId?: string | null): Promise<boolean> {
  if (!guildId) return false;
  try {
    const row = await env.GUILDS_DB.prepare(
      'SELECT is_active FROM guilds WHERE guild_id = ? LIMIT 1'
    )
      .bind(guildId)
      .first<{ is_active: number }>();
    return !!row && row.is_active === 1;
  } catch (e) {
    console.error('D1 query failed in isGuildAllowed:', e);
    return false;
  }
}

export async function registerGuild(
  env: Bindings,
  guildId: string,
  userId: string,
  channelId: string
): Promise<void> {
  await env.GUILDS_DB.prepare(
    'INSERT INTO guilds (guild_id, is_active, registered_by_user_id, registered_channel_id) VALUES (?, 1, ?, ?)\n'
      +
      'ON CONFLICT(guild_id) DO UPDATE SET is_active = 1, registered_by_user_id = excluded.registered_by_user_id, registered_channel_id = excluded.registered_channel_id, registered_at = strftime("%s","now")'
  )
    .bind(guildId, userId, channelId)
    .run();
}

export async function unregisterGuild(env: Bindings, guildId: string, userId: string): Promise<void> {
  await env.GUILDS_DB.prepare(
    'UPDATE guilds SET is_active = 0, unregistered_at = strftime("%s","now"), unregistered_by_user_id = ? WHERE guild_id = ?'
  )
    .bind(userId, guildId)
    .run();
}

export function isOperator(interaction: any): boolean {
  const userId: string | undefined = interaction?.member?.user?.id ?? interaction?.user?.id;
  return userId === OPERATOR_USER_ID;
}

