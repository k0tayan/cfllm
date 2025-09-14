// scripts/register-commands.mjs
import 'dotenv/config';
import { fetch } from 'undici';

const token = process.env.DISCORD_BOT_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token || !applicationId) {
  throw new Error('DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set.');
}

const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;

const command = {
  name: 'ask',
  description: 'Ask a question to the LLM.',
  options: [
    {
      name: 'prompt',
      description: 'The question you want to ask.',
      type: 3, // STRING
      required: true,
    },
  ],
};

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bot ${token}`,
  },
  body: JSON.stringify(command),
});

if (response.ok) {
  console.log('Successfully registered /ask command.');
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.error('Failed to register /ask command.');
  const error = await response.text();
  console.error(error);
  process.exit(1);
}
