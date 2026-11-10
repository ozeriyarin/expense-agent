import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  Budget,
  BudgetExceededError,
  GuardRejectedError,
  LadderExhaustedError,
  createCore,
  orderRungs,
  type CallLogEntry,
  type Ladder,
  type Rung,
  type Step,
} from "../../src/core/index.js";
import { FakeProvider, type FakeScriptItem } from "../../src/providers/fake.js";

const strong: Rung = { provider: "fake", model: "fake-strong", maxRetries: 2, timeoutMs: 1000, backoffMs: 1 };
const cheap: Rung = { provider: "fake", model: "fake-cheap", maxRetries: 1, timeoutMs: 1000, backoffMs: 1 };
const gem: Rung = { provider: "gemini", model: "gemini-flash", maxRetries: 0, timeoutMs: 1000, backoffMs: 1 };
const ladder: Ladder = [strong, cheap, gem];
const ladders = Object.fromEntries((["guard", "categorize", "escalate", "ask", "report"] as Step[]).map((s) => [s, ladder])) as Record<Step, Ladder>;

function setup(fakeScript: FakeScriptItem[], geminiScript: FakeScriptItem[] = [{ text: "from gemini" }], extra: Parameters<typeof createCore>[0]["hooks"] = {}, budget?: Budget) {
  const fake = new FakeProvider("fake", fakeScript);
  const gemini = new FakeProvider("gemini", geminiScript);
  const log: CallLogEntry[] = [];
  const sleeps: number[] = [];
  const core = createCore({
    providers: { fake, gemini },
    budget: budget ?? { softUsd: 2, hardUsd: 3 },
    ladders,
    hooks: extra,
    log: (e) => log.push(e),
    sleep: async (ms) => { sleeps.push(ms); },
  });
  return { core, fake, gemini, log, sleeps };
}

describe("walker (criterion 6)", () => {
  it("returns the first rung's result and records cost", async () => {
    const { core, log } = setup([{ text: "ok" }]);
    const r = await core.call("escalate", { user: "hi" });
    expect(r.output).toBe("ok");
    expect(r.model).toBe("fake-strong");
    expect(core.budget.spentUsd).toBeGreaterThan(0);
    expect(log).toHaveLength(1);
    expect(log[0]?.model).toBe("fake-strong");
  });

  it("retries a retryable error on the same rung with backoff, then succeeds", async () => {
    const { core, fake, sleeps } = setup([{ fail: "retryable" }, { fail: "retryable" }, { text: "third time" }]);
    const r = await core.call("escalate", { user: "hi" });
    expect(r.output).toBe("third time");
    expect(fake.calls.map((c) => c.model)).toEqual(["fake-strong", "fake-strong", "fake-strong"]);
    expect(sleeps).toEqual([1, 2]);
  });

  it("drops to the next rung on a fatal error without retrying", async () => {
    const { core, fake } = setup([{ fail: "fatal" }, { text: "cheap answer" }]);
    const r = await core.call("escalate", { user: "hi" });
    expect(r.model).toBe("fake-cheap");
    expect(fake.calls.map((c) => c.model)).toEqual(["fake-strong", "fake-cheap"]);
  });

  it("falls through providers and throws LadderExhaustedError with every attempt", async () => {
    const { core } = setup([{ fail: "fatal" }], [{ fail: "retryable" }]);
    const err = await core.call("escalate", { user: "hi" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LadderExhaustedError);
    const attempts = (err as LadderExhaustedError).attempts;
    expect(attempts.map((a) => [a.rung.model, a.tries])).toEqual([["fake-strong", 1], ["fake-cheap", 1], ["gemini-flash", 1]]);
  });

  it("propagates an external abort instead of falling through", async () => {
    const { core, fake } = setup([{ text: "slow", delayMs: 200 }]);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 10);
    await expect(core.call("escalate", { user: "hi" }, ac.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.calls).toHaveLength(1);
  });

  it("treats a rung timeout as retryable", async () => {
    const fast: Rung = { ...strong, timeoutMs: 20, maxRetries: 1 };
    const fake = new FakeProvider("fake", [{ text: "slow", delayMs: 500 }, { text: "quick" }]);
    const core = createCore({ providers: { fake }, budget: { softUsd: 2, hardUsd: 3 }, ladders: { ...ladders, escalate: [fast] }, sleep: async () => {} });
    const r = await core.call("escalate", { user: "hi" });
    expect(r.output).toBe("quick");
    expect(fake.calls).toHaveLength(2);
  });

  it("parses structured output through the schema", async () => {
    const schema = z.object({ category: z.string(), confidence: z.number() });
    const { core } = setup([{ text: JSON.stringify({ category: "דיור", confidence: 0.9 }) }]);
    const r = await core.call("categorize", { user: "x", schema });
    expect(r.output.category).toBe("דיור");
  });

  it("an onFailure hook can override the default decision", async () => {
    const { core, fake } = setup([{ fail: "retryable" }, { text: "never" }], undefined, { onFailure: [() => "next"] });
    await core.call("escalate", { user: "hi" });
    expect(fake.calls.map((c) => c.model)).toEqual(["fake-strong", "fake-cheap"]);
  });
});

describe("hooks (criterion 5)", () => {
  it("a rules guard vetoes before any provider call", async () => {
    const fake = new FakeProvider("fake", [{ text: "x" }]);
    const core = createCore({ providers: { fake }, budget: { softUsd: 2, hardUsd: 3 }, ladders, rules: (req) => (req.user.includes("drop table") ? "sql in input" : null) });
    await expect(core.call("guard", { user: "drop table x" })).rejects.toBeInstanceOf(GuardRejectedError);
    expect(fake.calls).toHaveLength(0);
    await core.call("guard", { user: "coffee 18" });
    expect(fake.calls).toHaveLength(1);
  });

  it("postCall log carries usage, cost, latency and redacted meta", async () => {
    const { core, log } = setup([{ text: "ok", usage: { inputTokens: 1000, outputTokens: 100 } }]);
    await core.call("escalate", { user: "hi", meta: { merchant: "Cafe Noir", amount: 18, category: "food" } });
    const e = log[0]!;
    expect(e.usage.inputTokens).toBe(1000);
    expect(e.costUsd).toBeCloseTo(1000 * 2 / 1e6 + 100 * 10 / 1e6, 9);
    expect(e.latencyMs).toBeGreaterThanOrEqual(0);
    expect(e.meta["merchant"]).toMatch(/^<merchant:[0-9a-f]{6}>$/);
    expect(e.meta["amount"]).toBe("<amt>");
    expect(e.meta["category"]).toBe("food");
  });
});

describe("budget in the walker (criterion 7)", () => {
  it("starts at the cheapest rung when degraded", () => {
    expect(orderRungs(ladder, false).map((r) => r.model)).toEqual(["fake-strong", "fake-cheap", "gemini-flash"]);
    expect(orderRungs(ladder, true).map((r) => r.model)).toEqual(["fake-cheap", "fake-strong", "gemini-flash"]);
  });

  it("walks the cheapest rung first between soft and hard cap", async () => {
    const { core, fake } = setup([{ text: "cheap first" }], undefined, {}, new Budget({ softUsd: 2, hardUsd: 3, spentUsd: 2.5 }));
    const r = await core.call("escalate", { user: "hi" });
    expect(r.model).toBe("fake-cheap");
    expect(fake.calls[0]?.model).toBe("fake-cheap");
  });

  it("refuses every call at the hard cap before touching a provider", async () => {
    const { core, fake } = setup([{ text: "never" }], undefined, {}, new Budget({ softUsd: 2, hardUsd: 3, spentUsd: 3 }));
    await expect(core.call("categorize", { user: "hi" })).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fake.calls).toHaveLength(0);
  });
});
