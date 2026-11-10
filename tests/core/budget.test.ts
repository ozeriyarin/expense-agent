import { describe, expect, it } from "vitest";
import { Budget, costOf } from "../../src/core/index.js";

describe("pricing", () => {
  it("prices usage per model", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(costOf(usage, "claude-haiku-5-5")).toBeCloseTo(0.1, 6);
    expect(costOf({ ...usage, inputTokens: 0, outputTokens: 1_000_000 }, "claude-sonnet-5-5")).toBeCloseTo(10, 6);
    expect(() => costOf(usage, "unknown")).toThrow(/no price/);
  });
});

describe("budget (criterion 7)", () => {
  it("moves ok -> degraded -> exhausted across the caps", () => {
    const states: string[] = [];
    const b = new Budget({ softUsd: 2, hardUsd: 3, onChange: (_s, st) => states.push(st) });
    expect(b.state()).toBe("ok");
    b.record(1.5);
    expect(b.state()).toBe("ok");
    b.record(0.5);
    expect(b.state()).toBe("degraded");
    b.record(1);
    expect(b.state()).toBe("exhausted");
    expect(states).toEqual(["ok", "degraded", "exhausted"]);
    expect(b.spentUsd).toBeCloseTo(3);
  });

  it("rejects invalid configuration and costs", () => {
    expect(() => new Budget({ softUsd: 5, hardUsd: 3 })).toThrow();
    expect(() => new Budget({ softUsd: 2, hardUsd: 3 }).record(-1)).toThrow();
  });
});
