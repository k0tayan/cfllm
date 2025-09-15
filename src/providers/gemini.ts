import type { Bindings } from '../bindings';
import type { LLMClient } from './types';
import { buildPrompt } from './prompt';
import { normalizeCrimeResult, safeParseCrimeResult } from './json';

// Importing SDK; ensure dependency exists in package.json
import { GoogleGenAI, Type } from '@google/genai';

export function createGeminiClient(env: Bindings): LLMClient {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || 'gemini-2.0-flash';
  // Instantiate per-client; Workers keeps module singletons per isolate
  const ai = new GoogleGenAI({ apiKey });

  return {
    async analyzeCrimeCoefficient(message: string) {
      if (!message || typeof message !== 'string' || !message.trim()) {
        return { crime_coefficient: 0, reason: '解析対象のメッセージが空でした。' };
      }
      if (!apiKey) {
        return { crime_coefficient: 0, reason: 'Gemini の API キーが未設定です。' };
      }

      const prompt = buildPrompt(message);

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response: any = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  crime_coefficient: { type: Type.NUMBER },
                  reason: { type: Type.STRING },
                },
                required: ['crime_coefficient', 'reason'],
                propertyOrdering: ['crime_coefficient', 'reason'],
              },
            },
          });

          // SDK returns text; structure per SDK docs
          const text: string =
            typeof response?.text === 'string'
              ? response.text
              : typeof response?.output_text === 'string'
              ? response.output_text
              : '';

          const parsed = safeParseCrimeResult(text);
          if (parsed) return normalizeCrimeResult(parsed);
        } catch (e) {
          console.error('Gemini analyze attempt failed:', e);
        }
      }

      return { crime_coefficient: 0, reason: '解析に失敗しました。' };
    },
  };
}

