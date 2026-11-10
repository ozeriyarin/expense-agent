import { GuardRejectedError } from "./types.js";

export type GuardVerdict = { ok: true } | { ok: false; reason: string };

export interface SpeculateOptions<T> {
  guard: (signal: AbortSignal) => Promise<GuardVerdict>;
  main: (signal: AbortSignal) => Promise<T>;
  /** Side effects (DB write, reply) run here, only after the guard passed and main finished. */
  commit?: (result: T) => Promise<void> | void;
  signal?: AbortSignal;
}

/**
 * Speculative guard: start the guard and the main call together. A rejecting guard aborts the main call and
 * throws GuardRejectedError; nothing is committed. A passing guard returns the main result after `commit`.
 */
export async function speculate<T>(options: SpeculateOptions<T>): Promise<T> {
  const controller = new AbortController();
  options.signal?.addEventListener("abort", () => controller.abort(options.signal?.reason), { once: true });

  const mainPromise = options.main(controller.signal);
  mainPromise.catch(() => {}); // an abort-induced rejection must not surface as unhandled
  const verdict = await options.guard(controller.signal);

  if (!verdict.ok) {
    controller.abort(new GuardRejectedError(verdict.reason));
    throw new GuardRejectedError(verdict.reason);
  }
  const result = await mainPromise;
  await options.commit?.(result);
  return result;
}
