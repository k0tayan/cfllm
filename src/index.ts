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

  if (interaction.type === 2 && interaction.data.name === 'dominate_with_message_url') {
    c.executionCtx.waitUntil(handleDominateWithMessageUrl(c, interaction));
    return c.json({ type: 5 }); // public deferred response
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

async function handleDominateWithMessageUrl(c: any, interaction: any) {
  const followupUrl = `https://discord.com/api/v10/webhooks/${c.env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
  try {
    const urlOpt = interaction.data.options?.find((opt: any) => opt.name === 'url');
    const inputUrl: string | undefined = urlOpt?.value;
    if (!inputUrl || typeof inputUrl !== 'string') {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'URLが指定されていません。`https://discord.com/channels/...` を指定してください。' }),
      });
    }

    const parsed = parseDiscordMessageUrl(inputUrl);
    if (!parsed) {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '対応していないURL形式です。`https://discord.com/channels/{guild}/{channel}/{message}` を指定してください。' }),
      });
    }

    const { guildId, channelId, messageId } = parsed;
    if (guildId === '@me') {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'DMのメッセージは対象外です。' }),
      });
    }

    if (!ALLOWED_GUILD_IDs.includes(guildId)) {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'このギルドのメッセージは対象外です。' }),
      });
    }

    const getUrl = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `Bot ${c.env.DISCORD_BOT_TOKEN}` },
    });

    if (!getRes.ok) {
      const msg =
        getRes.status === 403 || getRes.status === 401
          ? 'メッセージを取得できませんでした（権限/設定を確認してください）。'
          : getRes.status === 404
          ? 'メッセージが見つかりませんでした。URLを確認してください。'
          : `メッセージ取得に失敗しました。（${getRes.status}）`;
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg }),
      });
    }

    const message = await getRes.json();
    const text: string = typeof message?.content === 'string' ? message.content : '';
    if (!text.trim()) {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'メッセージ本文が見つかりませんでした。' }),
      });
    }

    const result = await analyzeCrimeCoefficient(c.env.AI, text);
    const executionMode = getExecutionMode(result.crime_coefficient);

    const authorName: string = message?.author?.username ? `${message.author.username}` : '不明なユーザー';
    const content = `**犯罪係数測定結果**\n\n対象メッセージ: ${inputUrl}\n投稿者: ${authorName}\n犯罪係数: ${result.crime_coefficient}\n執行モード: ${executionMode}\n\n**判定理由**\n${result.reason}`;

    return await fetch(followupUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (error: any) {
    console.error('Error handling /dominate_with_message_url command:', error);
    return await fetch(followupUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `エラーが発生しました: ${error?.message ?? 'unknown error'}` }),
    });
  }
}

function parseDiscordMessageUrl(input: string): { guildId: string; channelId: string; messageId: string } | null {
  try {
    const url = new URL(input);
    const host = url.host;
    if (!/(^|\.)discord\.com$/.test(host) && !/(^|\.)discordapp\.com$/.test(host)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    // Expect: /channels/{guild}/{channel}/{message}
    if (parts.length !== 4 || parts[0] !== 'channels') return null;
    const [_, guildId, channelId, messageId] = parts as [string, string, string, string];
    if (!guildId || !channelId || !messageId) return null;
    return { guildId, channelId, messageId };
  } catch {
    return null;
  }
}
