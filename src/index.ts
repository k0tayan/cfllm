import { Hono } from 'hono';
import { verifyDiscordRequest } from './verify';
import { Bindings } from './bindings';
import { handleDominateCommand, handleDominateWithMessageUrl } from './commands';
import { isGuildAllowed } from './guilds';
import { handleRegister, handleUnregister } from './registration';

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

  // PING
  if (interaction.type === 1) return c.json({ type: 1 });

  // Application Command
  if (interaction.type === 2 && interaction.data?.name === 'register') {
    const res = await handleRegister(c.env, interaction);
    return c.json(res);
  }

  if (interaction.type === 2 && interaction.data?.name === 'unregister') {
    const res = await handleUnregister(c.env, interaction);
    return c.json(res);
  }

  // Gate all other commands by D1 allowlist
  const allowed = await isGuildAllowed(c.env, interaction.guild_id);
  if (!allowed) {
    return c.json({
      type: 4,
      data: {
        content: 'このサーバーではコマンドを利用できません。/register を実行して登録してください。',
        flags: 1 << 6,
      },
    });
  }

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
