import { verifyKey } from 'discord-interactions';

export async function verifyDiscordRequest(
  request: Request,
  publicKey: string
): Promise<{ isValid: boolean; body: string }> {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const body = await request.text();

  if (!signature || !timestamp) {
    return { isValid: false, body };
  }

  try {
    const isValid = verifyKey(body, signature, timestamp, publicKey);
    return { isValid, body };
  } catch (e) {
    console.error('Error verifying request:', e);
    return { isValid: false, body };
  }
}