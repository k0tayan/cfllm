import type { Ai } from '@cloudflare/ai';

export async function executeLlmTask(ai: Ai, prompt: string): Promise<any> {
  if (!prompt) {
    throw new Error('Prompt is missing.');
  }

  try {
    const response = await ai.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt,
    });
    return response;
  } catch (error) {
    console.error('Error executing LLM task:', error);
    throw new Error('An internal error occurred while executing the LLM task.');
  }
}
