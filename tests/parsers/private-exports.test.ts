// Runs only on the owner's machine where the real exports exist. Asserts counts and shapes, prints no row content.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inMonth, parseExport, type ParseResult } from "../../src/parsers/index.js";

const dataDir = process.env["EXPENSE_DATA_DIR"] ?? "C:\\expense-data";
const dir = join(dataDir, "exports", "2026-10");
const available = existsSync(dir);

describe.skipIf(!available)("real October 2026 exports (private, local only)", () => {
  const files = available ? readdirSync(dir).filter((f) => f.endsWith(".xlsx") && !f.includes("(1)")) : [];
  const parsed = new Map<string, ParseResult>();
  for (const f of files) parsed.set(f, parseExport(join(dir, f)));

  it("recognizes and parses every file without unexplained warnings", () => {
    expect(files.length).toBe(6);
    for (const [f, r] of parsed) {
      expect(r.transactions.length, f).toBeGreaterThan(0);
      expect(r.warnings, f).toEqual([]);
    }
  });

  it("matches the row counts recorded in the project note", () => {
    const bySource = (s: string) => [...parsed.values()].filter((r) => r.source === s);
    expect(bySource("cal")[0]?.transactions).toHaveLength(181);
    expect(bySource("hapoalim_account")[0]?.transactions).toHaveLength(15);
    expect(bySource("hapoalim_card")[0]?.transactions).toHaveLength(80);
    expect(bySource("isracard").map((r) => r.transactions.length).sort((a, b) => a - b)).toEqual([2, 8, 14]); // reconciliation counted 1, 7, 12 without the undated fee rows
  });

  it("Cal pending rows duplicate posted rows and are flagged", () => {
    const cal = [...parsed.values()].find((r) => r.source === "cal")!;
    const pending = cal.transactions.filter((t) => t.kind === "pending");
    expect(pending).toHaveLength(3);
    const duplicated = pending.filter((p) => cal.transactions.some((t) => t.kind !== "pending" && t.date === p.date && t.amount === p.amount && t.merchant === p.merchant));
    expect(duplicated.length).toBeGreaterThanOrEqual(1); // the rest are genuinely still pending
  });

  it("card rows dated in October add up to the reconciled 166 per source (fees excluded, pending included as the report did)", () => {
    // Isracard's undated fee rows (dated here by billing date) were not rows in the reconciliation; Cal's dated fee row was.
    const octoberOf = (r: ParseResult) => r.transactions.filter((t) => inMonth(t, "2026-10") && !(t.kind === "fee" && t.source === "isracard")).length;
    const bySource = (s: string) => [...parsed.values()].filter((r) => r.source === s);
    expect(octoberOf(bySource("cal")[0]!)).toBe(76);
    expect(octoberOf(bySource("hapoalim_card")[0]!)).toBe(78);
    expect(bySource("isracard").map(octoberOf).sort((a, b) => a - b)).toEqual([1, 5, 6]);
    const total = [...parsed.values()].filter((r) => r.source !== "hapoalim_account").reduce((n, r) => n + octoberOf(r), 0);
    expect(total).toBe(166);
  });

  it("every settlement in the account export is marked as a transfer", () => {
    const acct = [...parsed.values()].find((r) => r.source === "hapoalim_account")!;
    expect(acct.transactions.filter((t) => t.kind === "card_settlement")).toHaveLength(5);
    expect(acct.transactions.filter((t) => t.amount < 0)).toHaveLength(4);
  });
});
