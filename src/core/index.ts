import { Budget, type BudgetConfig } from "./budget.js";
import { createDefaultHooks, type DefaultHookOptions } from "./hooks.js";
import { LADDERS } from "./ladders.js";
import { noopTracer } from "./tracing.js";
import type { CallRequest, CallResult, Hooks, Ladder, Provider, ProviderName, Step, Tracer } from "./types.js";
import { walk } from "./walker.js";

export interface CoreConfig {
  providers: Partial<Record<ProviderName, Provider>>;
  budget: BudgetConfig | Budget;
  hooks?: Partial<Hooks>;
  rules?: DefaultHookOptions["rules"];
  log?: DefaultHookOptions["log"];
  ladders?: Record<Step, Ladder>;
  tracer?: Tracer;
  sleep?: (ms: number) => Promise<void>;
}

export interface Core {
  call<T>(step: Step, request: CallRequest<T>, signal?: AbortSignal): Promise<CallResult<T>>;
  budget: Budget;
  hooks: Hooks;
  tracer: Tracer;
}

/** Wires budget, default hooks, ladders and tracing into one `call()`. Extra hooks run after the defaults. */
export function createCore(config: CoreConfig): Core {
  const budget = config.budget instanceof Budget ? config.budget : new Budget(config.budget);
  const defaults = createDefaultHooks({ budget, ...(config.log && { log: config.log }), ...(config.rules && { rules: config.rules }) });
  const hooks: Hooks = {
    preCall: [...defaults.preCall, ...(config.hooks?.preCall ?? [])],
    postCall: [...defaults.postCall, ...(config.hooks?.postCall ?? [])],
    onFailure: [...(config.hooks?.onFailure ?? []), ...defaults.onFailure],
  };
  const tracer = config.tracer ?? noopTracer;
  const ladders = config.ladders ?? LADDERS;

  return {
    budget,
    hooks,
    tracer,
    call: (step, request, signal) =>
      walk(step, request, {
        providers: config.providers,
        ladders,
        hooks,
        budget,
        tracer,
        ...(config.sleep && { sleep: config.sleep }),
        ...(signal && { signal }),
      }),
  };
}

export * from "./types.js";
export * from "./budget.js";
export * from "./pricing.js";
export * from "./ladders.js";
export * from "./hooks.js";
export * from "./walker.js";
export * from "./concurrency.js";
export * from "./speculative.js";
export * from "./redact.js";
export * from "./tracing.js";
