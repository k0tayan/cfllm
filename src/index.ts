import { Hono } from 'hono';
import { verifyDiscordRequest } from './verify';
import { ALLOWED_GUILD_IDs } from './config';
import { Bindings } from './bindings';
import { handleDominateCommand, handleDominateWithMessageUrl } from './commands';

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
