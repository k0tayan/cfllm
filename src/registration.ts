import { isGuildAllowed, isOperator, registerGuild, unregisterGuild } from './guilds';
import type { Bindings } from './bindings';

type DiscordResponse = { type: number; data?: Record<string, any> };

export async function handleRegister(env: Bindings, interaction: any): Promise<DiscordResponse> {
  if (!interaction.guild_id) {
    return {
      type: 4,
      data: { content: 'このコマンドはサーバー内でのみ実行できます。', flags: 1 << 6 },
    };
  }
  if (!isOperator(interaction)) {
    return { type: 4, data: { content: '権限がありません。', flags: 1 << 6 } };
  }

  const active = await isGuildAllowed(env, interaction.guild_id);
  if (active) {
    return { type: 4, data: { content: 'このサーバーは既に登録済みです。', flags: 1 << 6 } };
  }

  await registerGuild(
    env,
    interaction.guild_id,
    interaction?.member?.user?.id ?? interaction?.user?.id,
    interaction.channel_id
  );
  return { type: 4, data: { content: 'このサーバーを登録しました。', flags: 1 << 6 } };
}

export async function handleUnregister(env: Bindings, interaction: any): Promise<DiscordResponse> {
  if (!interaction.guild_id) {
    return {
      type: 4,
      data: { content: 'このコマンドはサーバー内でのみ実行できます。', flags: 1 << 6 },
    };
  }
  if (!isOperator(interaction)) {
    return { type: 4, data: { content: '権限がありません。', flags: 1 << 6 } };
  }

  const active = await isGuildAllowed(env, interaction.guild_id);
  if (!active) {
    return { type: 4, data: { content: 'このサーバーは未登録です。', flags: 1 << 6 } };
  }

  await unregisterGuild(env, interaction.guild_id, interaction?.member?.user?.id ?? interaction?.user?.id);
  return { type: 4, data: { content: 'このサーバーの登録を解除しました。', flags: 1 << 6 } };
}

