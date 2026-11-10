import type { Budget } from "./budget.js";
import { costOf, inputPrice } from "./pricing.js";
import { noopTracer } from "./tracing.js";
import {
  CoreError,
  LadderExhaustedError,
  type Attempt,
  type CallRequest,
  type CallResult,
  type ErrorKind,
  type FailureDecision,
  type Hooks,
  type Ladder,
  type Provider,
  type ProviderName,
  type Rung,
  type Step,
  type Tracer,
} from "./types.js";

export interface WalkContext {
  providers: Partial<Record<ProviderName, Provider>>;
  ladders: Record<Step, Ladder>;
  hooks: Hooks;
  budget: Budget;
  tracer?: Tracer;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function kindOf(error: unknown, outerSignal?: AbortSignal): ErrorKind {
  if (outerSignal?.aborted) return "aborted";
  if (error instanceof CoreError) return error.kind;
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "retryable";
    if (error.name === "AbortError") return "aborted";
  }
  return "fatal";
}

/** Degraded budget: the cheapest rung goes first, the rest keep their order. */
export function orderRungs(ladder: Ladder, degraded: boolean): Rung[] {
  const rungs = [...ladder];
  if (!degraded || rungs.length < 2) return rungs;
  let cheapest = 0;
  rungs.forEach((r, i) => {
    if (inputPrice(r.model) < inputPrice(rungs[cheapest]!.model)) cheapest = i;
  });
  const [c] = rungs.splice(cheapest, 1);
  return [c!, ...rungs];
}

function decide(hooks: Hooks, ctx: Parameters<Hooks["onFailure"][number]>[0], kind: ErrorKind): FailureDecision {
  for (const hook of hooks.onFailure) {
    const d = hook(ctx);
    if (d) return d;
  }
  if (kind === "aborted") return "abort";
  if (kind === "retryable" && ctx.attempt < ctx.rung.maxRetries) return "retry";
  return "next";
}

/** The one place that retries on a rung and falls through to the next. Ladders are data; this is the walker. */
export async function walk<T>(step: Step, request: CallRequest<T>, ctx: WalkContext): Promise<CallResult<T>> {
  const tracer = ctx.tracer ?? noopTracer;
  const sleep = ctx.sleep ?? realSleep;
  const degraded = ctx.budget.state() === "degraded";
  const rungs = orderRungs(ctx.ladders[step], degraded);
  const attempts: Attempt[] = [];

  return tracer.span(`walk.${step}`, { step, degraded, rungs: rungs.map((r) => r.model).join(">") }, async (walkSpan) => {
    for (const rung of rungs) {
      let tries = 0;
      for (let attempt = 0; attempt <= rung.maxRetries; attempt++) {
        tries += 1;
        const hookCtx = { step, rung, request: request as CallRequest<unknown>, attempt };

        await tracer.span("hook.preCall", { step, model: rung.model, attempt }, async () => {
          for (const hook of ctx.hooks.preCall) await hook(hookCtx);
        });

        try {
          const result = await tracer.span(
            "call",
            { step, provider: rung.provider, model: rung.model, attempt },
            async (callSpan) => {
              const provider = ctx.providers[rung.provider];
              if (!provider) throw new CoreError(`no provider registered for ${rung.provider}`, "fatal");
              const signals = [AbortSignal.timeout(rung.timeoutMs)];
              if (ctx.signal) signals.push(ctx.signal);
              const result = await provider.complete(rung.model, request, AbortSignal.any(signals));
              callSpan.setAttributes({
                "usage.input": result.usage.inputTokens,
                "usage.output": result.usage.outputTokens,
                "usage.cacheRead": result.usage.cacheReadTokens,
                latencyMs: result.latencyMs,
              });
              return result;
            },
          );
          const costUsd = costOf(result.usage, rung.model);
          ctx.budget.record(costUsd);
          await tracer.span("hook.postCall", { step, model: rung.model, costUsd }, async () => {
            for (const hook of ctx.hooks.postCall) await hook({ ...hookCtx, result, costUsd });
          });
          walkSpan.setAttributes({ "result.model": rung.model, "result.tries": tries, attemptsBefore: attempts.length });
          return result;
        } catch (error) {
          const kind = kindOf(error, ctx.signal);
          const decision = await tracer.span("hook.onFailure", { step, model: rung.model, attempt, kind }, async (s) => {
            const d = decide(ctx.hooks, { ...hookCtx, error }, kind);
            s.setAttributes({ decision: d });
            return d;
          });
          if (decision === "abort") throw error;
          if (decision === "retry") {
            await sleep(rung.backoffMs * 2 ** attempt);
            continue;
          }
          attempts.push({ rung, tries, error });
          break;
        }
      }
    }
    throw new LadderExhaustedError(step, attempts);
  });
}
