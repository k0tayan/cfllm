import type { Bindings } from '../bindings';
import type { LLMClient } from './types';
import { buildPrompt } from './prompt';
import { extractAiText, normalizeCrimeResult, safeParseCrimeResult } from './json';

export function createWorkersAiClient(env: Bindings): LLMClient {
  return {
    async analyzeCrimeCoefficient(message: string) {
      if (!message || typeof message !== 'string' || !message.trim()) {
        return { crime_coefficient: 0, reason: '解析対象のメッセージが空でした。' };
      }

      const prompt = buildPrompt(message);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res: any = await env.AI.run('@cf/google/gemma-3-12b-it', { prompt });
          const text = extractAiText(res);
          const parsed = safeParseCrimeResult(text);
          if (parsed) {
            return normalizeCrimeResult(parsed);
          }
        } catch (e) {
          console.error('Workers AI analyze attempt failed:', e);
        }
      }

      return { crime_coefficient: 0, reason: '解析に失敗しました。' };
    },
  };
}

