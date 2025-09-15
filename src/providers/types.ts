export type CrimeResult = {
  crime_coefficient: number;
  reason: string;
};

export interface LLMClient {
  analyzeCrimeCoefficient(message: string): Promise<CrimeResult>;
}

