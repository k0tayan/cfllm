import { Context } from 'hono';

import { analyzeCrimeCoefficient } from './llm';
import { isGuildAllowed } from './guilds';
import { getExecutionMode, parseDiscordMessageUrl } from './utils';
import type { Bindings } from './bindings';

export async function handleDominateCommand(c: Context<{ Bindings: Bindings }>, interaction: any) {
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
      const msg =
        listRes.status === 403 || listRes.status === 401
          ? 'メッセージを取得できませんでした（権限/設定を確認してください）。'
          : `メッセージ取得に失敗しました。（${listRes.status}）`;
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg }),
      });
    }

    const messages = (await listRes.json()) as Array<any>;
    const latest = messages.find(
      (m) => m?.author?.id === targetUserId && typeof m?.content === 'string'
    );

    if (!latest) {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '対象ユーザーの直近メッセージが見つかりませんでした。' }),
      });
    }

    const result = await analyzeCrimeCoefficient(c.env, latest.content);
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

export async function handleDominateWithMessageUrl(c: Context<{ Bindings: Bindings }>, interaction: any) {
  const followupUrl = `https://discord.com/api/v10/webhooks/${c.env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
  try {
    const urlOpt = interaction.data.options?.find((opt: any) => opt.name === 'url');
    const inputUrl: string | undefined = urlOpt?.value;
    if (!inputUrl || typeof inputUrl !== 'string') {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content:
            'URLが指定されていません。`https://discord.com/channels/...` を指定してください。',
        }),
      });
    }

    const parsed = parseDiscordMessageUrl(inputUrl);
    if (!parsed) {
      return await fetch(followupUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content:
            '対応していないURL形式です。`https://discord.com/channels/{guild}/{channel}/{message}` を指定してください。',
        }),
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

    const allowed = await isGuildAllowed(c.env, guildId);
    if (!allowed) {
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

    const result = await analyzeCrimeCoefficient(c.env, text);
    const executionMode = getExecutionMode(result.crime_coefficient);

    const authorName: string = message?.author?.username
      ? `${message.author.username}`
      : '不明なユーザー';
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
