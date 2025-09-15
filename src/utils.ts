export function getExecutionMode(cc: number): string {
  if (cc > 300) return 'Lethal Eliminator';
  if (cc >= 100 && cc <= 299) return 'Non-Lethal Paralyzer';
  if (cc > 0 && cc < 100) return '執行対象外';
  if (cc === 0) return '執行対象外(免罪体質者)';
  return '不明';
}

export function parseDiscordMessageUrl(
  input: string
): { guildId: string; channelId: string; messageId: string } | null {
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

