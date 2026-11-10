import type { Usage } from "./types.js";

/** USD per 1M tokens. Cached 2026-11-10 from the Claude API reference; Gemini row is a placeholder to verify. */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICING: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
  "gemini-flash": { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0.3 },
  "fake-cheap": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "fake-strong": { input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
};

export function costOf(usage: Usage, model: string): number {
  const p = PRICING[model];
  if (!p) throw new Error(`no price for model ${model}`);
  const perToken = 1 / 1_000_000;
  return (
    usage.inputTokens * p.input * perToken +
    usage.outputTokens * p.output * perToken +
    usage.cacheReadTokens * p.cacheRead * perToken +
    usage.cacheWriteTokens * p.cacheWrite * perToken
  );
}

export function inputPrice(model: string): number {
  return PRICING[model]?.input ?? Number.POSITIVE_INFINITY;
}
