import type { Bindings } from './bindings';
import type { CrimeResult } from './providers/types';
import { createWorkersAiClient } from './providers/workersai';
import { createGeminiClient } from './providers/gemini';

export function getLLM(env: Bindings) {
  const provider = (env.LLM_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'workers-ai') return createWorkersAiClient(env);
  return createGeminiClient(env);
}

export async function analyzeCrimeCoefficient(env: Bindings, userMessage: string): Promise<CrimeResult> {
  return getLLM(env).analyzeCrimeCoefficient(userMessage);
}
