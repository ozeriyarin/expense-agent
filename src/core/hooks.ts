import type { Budget } from "./budget.js";
import { redact } from "./redact.js";
import { BudgetExceededError, GuardRejectedError, type CallRequest, type Hooks } from "./types.js";

export interface CallLogEntry {
  step: string;
  provider: string;
  model: string;
  attempt: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  costUsd: number;
  latencyMs: number;
  spentUsd: number;
  meta: Record<string, string | number | boolean>;
}

/** A rules guard returns a rejection reason or null. It is free and runs before any model call. */
export type RulesGuard = (request: CallRequest<unknown>) => string | null;

export interface DefaultHookOptions {
  budget: Budget;
  log?: (entry: CallLogEntry) => void;
  rules?: RulesGuard;
}

export function budgetPreCall(budget: Budget): Hooks["preCall"][number] {
  return () => {
    if (budget.state() === "exhausted") throw new BudgetExceededError(budget.spentUsd, budget.hardUsd);
  };
}

export function rulesPreCall(rules: RulesGuard): Hooks["preCall"][number] {
  return ({ request }) => {
    const reason = rules(request);
    if (reason) throw new GuardRejectedError(reason);
  };
}

export function costLogPostCall(budget: Budget, log: (entry: CallLogEntry) => void): Hooks["postCall"][number] {
  return ({ step, rung, attempt, result, costUsd, request }) => {
    log({
      step,
      provider: rung.provider,
      model: rung.model,
      attempt,
      usage: result.usage,
      costUsd,
      latencyMs: result.latencyMs,
      spentUsd: budget.spentUsd,
      meta: redact(request.meta ?? {}),
    });
  };
}

/** Guard + budget before, cost + log after, default classification on failure (the walker's policy). */
export function createDefaultHooks(options: DefaultHookOptions): Hooks {
  const preCall: Hooks["preCall"] = [];
  if (options.rules) preCall.push(rulesPreCall(options.rules));
  preCall.push(budgetPreCall(options.budget));
  const postCall: Hooks["postCall"] = [];
  if (options.log) postCall.push(costLogPostCall(options.budget, options.log));
  return { preCall, postCall, onFailure: [] };
}
