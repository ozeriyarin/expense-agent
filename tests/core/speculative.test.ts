import { describe, expect, it } from "vitest";
import { GuardRejectedError, speculate } from "../../src/core/index.js";

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });

describe("speculate (criterion 9)", () => {
  it("runs guard and main together and commits only after the guard passed", async () => {
    const order: string[] = [];
    const r = await speculate({
      guard: async () => { order.push("guard-start"); await wait(30); order.push("guard-ok"); return { ok: true }; },
      main: async () => { order.push("main-start"); await wait(10); order.push("main-done"); return 42; },
      commit: async () => { order.push("commit"); },
    });
    expect(r).toBe(42);
    expect(order).toEqual(["main-start", "guard-start", "main-done", "guard-ok", "commit"]);
  });

  it("aborts main and commits nothing when the guard rejects", async () => {
    let aborted = false;
    let committed = false;
    await expect(
      speculate({
        guard: async () => { await wait(5); return { ok: false, reason: "not an expense" }; },
        main: async (signal) => { await wait(200, signal).catch((e: unknown) => { aborted = true; throw e; }); return "unused"; },
        commit: () => { committed = true; },
      }),
    ).rejects.toBeInstanceOf(GuardRejectedError);
    await wait(10);
    expect(aborted).toBe(true);
    expect(committed).toBe(false);
  });

  it("surfaces a main failure when the guard passed", async () => {
    await expect(
      speculate({ guard: async () => ({ ok: true }), main: async () => { throw new Error("main broke"); } }),
    ).rejects.toThrow("main broke");
  });
});
