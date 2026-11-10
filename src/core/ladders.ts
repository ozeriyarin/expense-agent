import type { Ladder, Rung, Step } from "./types.js";

const haiku: Rung = { provider: "anthropic", model: "claude-haiku-5-5", maxRetries: 2, timeoutMs: 15_000, backoffMs: 300 };
const sonnet: Rung = { provider: "anthropic", model: "claude-sonnet-5-5", maxRetries: 2, timeoutMs: 30_000, backoffMs: 500 };
const gemini: Rung = { provider: "gemini", model: "gemini-flash", maxRetries: 1, timeoutMs: 15_000, backoffMs: 300 };

/** Ladders are data: order = preference, walked by `walk()`. Every rung is evaluated by the eval matrix. */
export const HAIKU_LADDER: Ladder = [haiku, gemini];
export const SONNET_LADDER: Ladder = [sonnet, haiku, gemini];

export const LADDERS: Record<Step, Ladder> = {
  guard: HAIKU_LADDER,
  categorize: HAIKU_LADDER,
  escalate: SONNET_LADDER,
  ask: SONNET_LADDER,
  report: SONNET_LADDER,
};
