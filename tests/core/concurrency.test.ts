import { describe, expect, it } from "vitest";
import { chunk, runBatches } from "../../src/core/index.js";

const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe("runBatches (criterion 8)", () => {
  it("chunks items", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunk([1], 0)).toThrow();
  });

  it("runs batches under the concurrency limit and reports progress", async () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    let running = 0;
    let peak = 0;
    const progress: number[] = [];
    const out = await runBatches(items, { batchSize: 10, concurrency: 2, onProgress: (d) => progress.push(d) }, async (batch) => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
      return batch.reduce((a, b) => a + b, 0);
    });
    expect(out.batches).toBe(5);
    expect(peak).toBe(2);
    expect(progress).toEqual([1, 2, 3, 4, 5]);
    expect(out.results.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(items.reduce((a, b) => a + b, 0));
    expect(out.errors).toHaveLength(0);
  });

  it("records a failing batch and keeps the others", async () => {
    const out = await runBatches([1, 2, 3, 4], { batchSize: 1, concurrency: 4 }, async (batch) => {
      if (batch[0] === 3) throw new Error("boom");
      return batch[0];
    });
    expect(out.results).toEqual([1, 2, undefined, 4]);
    expect(out.errors).toEqual([{ index: 2, error: expect.any(Error) }]);
  });

  it("skips remaining batches once the signal aborts", async () => {
    const ac = new AbortController();
    let started = 0;
    const out = await runBatches([1, 2, 3, 4], { batchSize: 1, concurrency: 1, signal: ac.signal }, async (batch) => {
      started += 1;
      if (batch[0] === 2) ac.abort(new Error("stop"));
      return batch[0];
    });
    expect(started).toBe(2);
    expect(out.errors.map((e) => e.index)).toEqual([2, 3]);
  });
});
