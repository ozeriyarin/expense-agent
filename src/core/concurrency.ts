import pLimit from "p-limit";
import type { Tracer } from "./types.js";
import { noopTracer } from "./tracing.js";

export interface BatchOptions {
  batchSize: number;
  concurrency: number;
  signal?: AbortSignal;
  tracer?: Tracer;
  onProgress?: (done: number, total: number) => void;
}

export interface BatchOutcome<R> {
  results: Array<R | undefined>;
  errors: Array<{ index: number; error: unknown }>;
  batches: number;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("batch size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `fn` over batches under a concurrency limit. One failing batch is recorded, the others continue. */
export async function runBatches<T, R>(
  items: readonly T[],
  options: BatchOptions,
  fn: (batch: T[], index: number, signal: AbortSignal) => Promise<R>,
): Promise<BatchOutcome<R>> {
  const tracer = options.tracer ?? noopTracer;
  const batches = chunk(items, options.batchSize);
  const limit = pLimit(options.concurrency);
  const controller = new AbortController();
  options.signal?.addEventListener("abort", () => controller.abort(options.signal?.reason), { once: true });
  const results: Array<R | undefined> = new Array(batches.length).fill(undefined);
  const errors: Array<{ index: number; error: unknown }> = [];
  let done = 0;

  await Promise.all(
    batches.map((batch, index) =>
      limit(async () => {
        if (controller.signal.aborted) {
          errors.push({ index, error: controller.signal.reason ?? new Error("aborted") });
          return;
        }
        await tracer.span("batch", { "batch.index": index, "batch.size": batch.length }, async () => {
          try {
            results[index] = await fn(batch, index, controller.signal);
          } catch (error) {
            errors.push({ index, error });
          } finally {
            done += 1;
            options.onProgress?.(done, batches.length);
          }
        });
      }),
    ),
  );
  errors.sort((a, b) => a.index - b.index);
  return { results, errors, batches: batches.length };
}
