import { Hono } from 'hono';
import { verifyDiscordRequest } from './verify';
import { Ai } from '@cloudflare/ai';
import { executeLlmTask } from './llm';

// Types for bindings from wrangler.toml
type Bindings = {
  AI: Ai;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
};

const ALLOWED_GUILD_IDs = ['954675852912787476', '826084795720794122'];

const app = new Hono<{ Bindings: Bindings }>();

// Root endpoint for basic health check
app.get('/', (c) => {
  return c.text('Hello! The API is running.');
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

  if (interaction.type === 2 && interaction.data.name === 'ask') {
    c.executionCtx.waitUntil(handleAskCommand(c, interaction));
    return c.json({ type: 5 }); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  }

  console.error('Unhandled interaction type:', interaction.type);
  return c.text('Unhandled interaction type', 400);
});

async function handleAskCommand(c: any, interaction: any) {
  const followupUrl = `https://discord.com/api/v10/webhooks/${c.env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;

  try {
    const prompt = interaction.data.options.find((opt: any) => opt.name === 'prompt')?.value;
    const response = await executeLlmTask(c.env.AI, prompt);

    return await fetch(followupUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: response.response || 'Sorry, I could not generate a response.' }),
    });
  } catch (error: any) {
    console.error('Error handling /ask command:', error);
    return await fetch(followupUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `An error occurred: ${error.message}` }),
    });
  }
}

export default app;