// scripts/register-commands.mjs
import 'dotenv/config';
import { fetch } from 'undici';

const token = process.env.DISCORD_BOT_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token || !applicationId) {
  throw new Error('DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set.');
}

const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;

// Primary command focuses on crime coefficient measurement
const commands = [
  {
    name: 'dominate',
    description: '指定したユーザーの犯罪係数を測定します',
    options: [
      {
        name: 'user',
        description: '測定対象のユーザー',
        type: 6, // USER
        required: true,
      },
    ],
  },
  {
    name: 'dominate_with_message_url',
    description: 'メッセージURLから本文を取得して犯罪係数を測定します',
    options: [
      {
        name: 'url',
        description: 'DiscordメッセージのURL',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'register',
    description: 'このサーバーをボットの許可リストに登録します（管理者のみ）',
  },
  {
    name: 'unregister',
    description: 'このサーバーをボットの許可リストから解除します（管理者のみ）',
  },
];

for (const command of commands) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${token}`,
    },
    body: JSON.stringify(command),
  });

  if (response.ok) {
    console.log(`Successfully registered /${command.name} command.`);
  } else {
    console.error(`Failed to register /${command.name} command.`);
    const error = await response.text();
    console.error(error);
    process.exit(1);
  }
}
