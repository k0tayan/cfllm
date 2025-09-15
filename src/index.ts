import { Hono } from 'hono';
import { verifyDiscordRequest } from './verify';
import { analyzeCrimeCoefficient } from './llm';

// Types for bindings from wrangler.toml
type Bindings = {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  AI: any;
};

const ALLOWED_GUILD_IDs = ['954675852912787476', '826084795720794122'];

const app = new Hono<{ Bindings: Bindings }>();

// Root endpoint for basic health check
app.get('/', (c) => {
  return c.text('Hello! Dominator online — 犯罪係数測定システム稼働中');
});

// --- Discord Interactions Endpoint ---
app.post('/api/interactions', async (c) => {
  const { isValid, body } = await verifyDiscordRequest(
    c.req.raw.clone(),
    c.env.DISCORD_PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request signature', 401);

  const interaction = JSON.parse(body);

  if (ALLOWED_GUILD_IDs.includes(interaction.guild_id) === false) {
    return c.json({
      type: 4,
      data: {
        content: 'This command is not available in this server.',
        flags: 1 << 6, // EPHEMERAL
      },
    });
  }

  if (interaction.type === 1) return c.json({ type: 1 }); // PING

  if (interaction.type === 2 && interaction.data.name === 'dominate') {
    c.executionCtx.waitUntil(handleDominateCommand(c, interaction));
    return c.json({ type: 5 }); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  }

  console.error('Unhandled interaction type:', interaction.type);
  return c.text('Unhandled interaction type', 400);
});

export default app;

async function handleDominateCommand(c: any, interaction: any) {
  const followupUrl = `https://discord.com/api/v10/webhooks/${c.env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
  try {
    const userOpt = interaction.data.options?.find((opt: any) => opt.name === 'user');
    const targetUserId: string | undefined = userOpt?.value;
    if (!targetUserId) {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'ユーザー指定が無効です。' }),
      });
    }

    const username: string =
      interaction.data.resolved?.users?.[targetUserId]?.username || `<@${targetUserId}>`;
    const channelId: string = interaction.channel_id;

    // Fetch last 50 messages and pick the latest by the target user
    const listUrl = `https://discord.com/api/v10/channels/${channelId}/messages?limit=50`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bot ${c.env.DISCORD_BOT_TOKEN}` },
    });

    if (!listRes.ok) {
      const msg = listRes.status === 403 || listRes.status === 401
        ? 'メッセージを取得できませんでした（権限/設定を確認してください）。'
        : `メッセージ取得に失敗しました。（${listRes.status}）`;
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg }),
      });
    }

    const messages = (await listRes.json()) as Array<any>;
    const latest = messages.find((m) => m?.author?.id === targetUserId && typeof m?.content === 'string');

    if (!latest) {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '対象ユーザーの直近メッセージが見つかりませんでした。' }),
      });
    }

    const result = await analyzeCrimeCoefficient(c.env.AI, latest.content);
    const executionMode = getExecutionMode(result.crime_coefficient);

    const content = `**犯罪係数測定結果**\n\n対象ユーザー: ${username}\n犯罪係数: ${result.crime_coefficient}\n執行モード: ${executionMode}\n\n**判定理由**\n${result.reason}`;

    return await fetch(followupUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (error: any) {
    console.error('Error handling /dominate command:', error);
    return await fetch(followupUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `エラーが発生しました: ${error?.message ?? 'unknown error'}` }),
    });
  }
}

function getExecutionMode(cc: number): string {
  if (cc > 300) return 'Lethal Eliminator';
  if (cc >= 100 && cc <= 299) return 'Non-Lethal Paralyzer';
  if (cc > 0 && cc < 100) return '執行対象外';
  if (cc === 0) return '執行対象外(免罪体質者)';
  return '不明';
}
