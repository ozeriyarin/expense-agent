import { describe, expect, it } from "vitest";
import { active, dedup } from "../../src/dedup/index.js";
import type { Transaction } from "../../src/parsers/types.js";

const base: Transaction = {
  source: "cal", account: "1234", date: "2026-10-03", billingDate: null, merchant: "קפה דמיוני", amount: 18, currency: "ILS",
  originalAmount: null, originalCurrency: null, kind: "purchase", reference: null, notes: null, provisional: false, row: 1,
};
const tx = (over: Partial<Transaction>): Transaction => ({ ...base, ...over });

describe("dedup (v2-parsers criterion 8)", () => {
  it("drops a pending row that matches a posted row and keeps a pending row that does not", () => {
    const r = dedup([tx({ row: 1 }), tx({ row: 2, kind: "pending", provisional: true }), tx({ row: 3, kind: "pending", merchant: "אחר", provisional: true })]);
    expect(r.rows.map((x) => x.excludedReason)).toEqual([null, "pending_duplicate", null]);
    expect(r.stats.pendingDropped).toBe(1);
    expect(active(r)).toHaveLength(2);
  });

  it("marks bank card settlements as excluded transfers", () => {
    const r = dedup([tx({ source: "hapoalim_account", account: "account", kind: "card_settlement", merchant: "ישראכרט", amount: 887.88 })]);
    expect(r.rows[0]).toMatchObject({ excluded: true, excludedReason: "card_settlement" });
    expect(r.stats.settlements).toBe(1);
  });

  it("keeps true duplicates and flags them with a shared group", () => {
    const r = dedup([tx({ row: 1 }), tx({ row: 2 }), tx({ row: 3, amount: 19 })]);
    expect(active(r)).toHaveLength(3);
    expect(r.rows[0]?.duplicateGroup).toBe(r.rows[1]?.duplicateGroup);
    expect(r.rows[0]?.duplicateGroup).not.toBeNull();
    expect(r.rows[2]?.duplicateGroup).toBeNull();
    expect(r.stats.duplicateGroups).toBe(1);
  });

  it("does not merge rows across different cards or sources", () => {
    const r = dedup([tx({ account: "1234" }), tx({ account: "5678", source: "isracard" })]);
    expect(r.stats.duplicateGroups).toBe(0);
  });

  it("reports validation problems by row without dropping the row", () => {
    const r = dedup([tx({ date: "3/10/2026", amount: Number.NaN, merchant: " " })]);
    expect(r.rows).toHaveLength(1);
    expect(r.problems).toEqual(["cal row 1: invalid date", "cal row 1: invalid amount", "cal row 1: empty merchant"]);
  });
});
