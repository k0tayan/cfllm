import type { CrimeResult } from './types';

export function safeParseCrimeResult(text: string): CrimeResult | null {
  if (!text) return null;
  try {
    const obj = JSON.parse(text);
    if (isCrimeResult(obj)) return normalizeCrimeResult(obj);
  } catch {}

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const snippet = text.slice(start, end + 1);
    try {
      const obj = JSON.parse(snippet);
      if (isCrimeResult(obj)) return normalizeCrimeResult(obj);
    } catch {}
  }
  return null;
}

export function isCrimeResult(obj: any): obj is CrimeResult {
  return (
    obj &&
    (typeof obj.crime_coefficient === 'number' || typeof obj.crime_coefficient === 'string') &&
    (typeof obj.reason === 'string' || typeof obj.reason === 'number')
  );
}

export function extractAiText(res: any): string {
  if (!res) return '';
  if (typeof res === 'string') return res;
  if (typeof (res as any).response === 'string') return (res as any).response;
  if (typeof (res as any).output_text === 'string') return (res as any).output_text;
  if (typeof (res as any).text === 'string') return (res as any).text;
  if ((res as any).result && typeof (res as any).result.response === 'string') return (res as any).result.response;
  try {
    return JSON.stringify(res);
  } catch {
    return '';
  }
}

export function normalizeCrimeResult(obj: any): CrimeResult {
  const ccRaw = (obj as any).crime_coefficient;
  const reasonRaw = (obj as any).reason;
  const crime_coefficient = typeof ccRaw === 'number' ? ccRaw : Number(ccRaw ?? 0);
  const reason = String(reasonRaw ?? '').trim() || '理由の抽出に失敗しました。';
  return { crime_coefficient, reason };
}

