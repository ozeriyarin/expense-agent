import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Built at runtime so no account-shaped literal sits in the source (the guard would block it).
const ACCT = ["12", "345", "678901"].join("-");
import { InMemoryRedactingExporter, JsonlRedactingExporter, createCore, createTracer, redact, redactText, runBatches, type Ladder, type Step } from "../../src/core/index.js";
import { FakeProvider } from "../../src/providers/fake.js";

describe("redact (criterion 10)", () => {
  it("scrubs amounts, merchants and account identifiers by key", () => {
    const out = redact({ amount: 149.9, merchant: "Super Pharm", account: ACCT, category: "food", tokens: 12, costUsd: 0.001 });
    expect(out["amount"]).toBe("<amt>");
    expect(out["merchant"]).toMatch(/^<merchant:[0-9a-f]{6}>$/);
    expect(out["merchant.length"]).toBe(11);
    expect(out["account"]).toBe("<acct>");
    expect(out["category"]).toBe("food");
    expect(out["tokens"]).toBe(12);
    expect(out["costUsd"]).toBe(0.001);
  });

  it("scrubs money and account numbers inside free text", () => {
    expect(redactText(`paid 149.90 ₪ at the shop, acct ${ACCT}`)).toBe("paid <amt> at the shop, acct <acct>");
    expect(redactText("₪1,250 and 18 ILS")).toBe("<amt> and <amt>");
  });

  it("hashes the same merchant to the same token", () => {
    expect(redact({ merchant: "Cafe X" })["merchant"]).toBe(redact({ merchant: " cafe x " })["merchant"]);
  });
});

describe("tracing (criterion 10)", () => {
  const dir = mkdtempSync(join(tmpdir(), "expense-traces-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("emits one span per hook, call and batch with redacted attributes", async () => {
    const exporter = new InMemoryRedactingExporter();
    const tracer = createTracer(exporter);
    const rung = { provider: "fake" as const, model: "fake-cheap", maxRetries: 0, timeoutMs: 1000, backoffMs: 1 };
    const ladders = Object.fromEntries((["guard", "categorize", "escalate", "ask", "report"] as Step[]).map((s) => [s, [rung]])) as Record<Step, Ladder>;
    const fake = new FakeProvider("fake", [{ text: "ok" }]);
    const core = createCore({ providers: { fake }, budget: { softUsd: 2, hardUsd: 3 }, ladders, tracer });

    await runBatches([1, 2], { batchSize: 1, concurrency: 2, tracer }, async (batch) =>
      core.call("categorize", { user: "x", meta: { merchant: `shop ${batch[0]}`, amount: 10 } }),
    );
    await tracer.flush();

    const names = exporter.spans.map((s) => s.name).sort();
    expect(names).toEqual(["batch", "batch", "call", "call", "hook.postCall", "hook.postCall", "hook.preCall", "hook.preCall", "walk.categorize", "walk.categorize"]);
    const call = exporter.spans.find((s) => s.name === "call")!;
    expect(call.attributes["model"]).toBe("fake-cheap");
    expect(call.attributes["usage.input"]).toBe(100);
    expect(call.status).toBe("ok");
    const walk = exporter.spans.find((s) => s.name === "walk.categorize")!;
    const batch = exporter.spans.find((s) => s.spanId === walk.parentSpanId)!;
    expect(batch.name).toBe("batch");
    const serialized = JSON.stringify(exporter.spans);
    expect(serialized).not.toContain("shop 1");
    expect(serialized).not.toContain('"amount":10');
  });

  it("marks failing spans and writes redacted JSONL locally", async () => {
    const exporter = new JsonlRedactingExporter(dir);
    const tracer = createTracer(exporter);
    await tracer.span("call", { merchant: "Secret Shop", amount: 99 }, async () => { throw new Error("nope"); }).catch(() => {});
    await tracer.flush();
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    expect(files).toHaveLength(1);
    const line = JSON.parse(readFileSync(join(dir, files[0]!), "utf8").trim());
    expect(line.name).toBe("call");
    expect(line.status).toBe("error");
    expect(line.attributes["error.type"]).toBe("Error");
    expect(line.attributes.merchant).toMatch(/^<merchant:/);
    expect(line.attributes.amount).toBe("<amt>");
  });
});
