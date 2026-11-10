import { describe, expect, it } from "vitest";
import { detectSource, inMonth, parseExport, readRows, rowsToXlsx } from "../../src/parsers/index.js";
import { SYNTH_ACCOUNT, calRows, hapoalimAccountRows, hapoalimCardRows, isracardRows } from "../fixtures/synthetic-exports.js";

const load = (rows: ReturnType<typeof calRows>) => readRows(rowsToXlsx(rows));

describe("format detection", () => {
  it("recognizes each export by its headers", () => {
    expect(detectSource(load(calRows()))).toBe("cal");
    expect(detectSource(load(isracardRows()))).toBe("isracard");
    expect(detectSource(load(isracardRows({ creditFrame: true })))).toBe("isracard");
    expect(detectSource(load(hapoalimCardRows()))).toBe("hapoalim_card");
    expect(detectSource(load(hapoalimAccountRows()))).toBe("hapoalim_account");
    expect(detectSource([["תאריך", "משהו"], [1, 2]])).toBeNull();
  });
});

describe("cal", () => {
  const result = parseExport(rowsToXlsx(calRows()));

  it("reads every row with local calendar dates and the card last-4 from the title", () => {
    expect(result.account).toBe("1234");
    expect(result.transactions).toHaveLength(9);
    expect(result.transactions[0]).toMatchObject({ date: "2026-10-03", amount: 18, currency: "ILS", kind: "purchase", billingDate: "2026-11-10" });
    expect(result.warnings).toEqual([]);
  });

  it("flags pending rows, standing orders, installments, refunds, club rows and foreign amounts", () => {
    const kinds = result.transactions.map((t) => t.kind);
    expect(kinds).toEqual(["purchase", "pending", "standing_order", "installment", "purchase", "refund", "purchase", "purchase", "club"]);
    expect(result.transactions[1]?.provisional).toBe(true);
    expect(result.transactions[4]).toMatchObject({ originalAmount: 10.5, originalCurrency: "EUR" });
  });

  it("keeps future-billed and previous-month rows so the month filter can decide", () => {
    const october = result.transactions.filter((t) => inMonth(t, "2026-10"));
    expect(october).toHaveLength(7);
    expect(result.transactions.filter((t) => inMonth(t, "2026-09"))).toHaveLength(1);
    expect(result.transactions.filter((t) => inMonth(t, "2026-11"))).toHaveLength(1);
  });
});

describe("isracard", () => {
  it("finds the header wherever it sits and reads the billing date from the title block", () => {
    for (const creditFrame of [false, true]) {
      const r = parseExport(rowsToXlsx(isracardRows({ creditFrame })));
      expect(r.account).toBe("5678");
      expect(r.transactions).toHaveLength(5);
      expect(r.transactions[0]).toMatchObject({ date: "2026-10-02", amount: 36, billingDate: "2026-11-10", kind: "purchase", reference: "100000001" });
      expect(r.transactions.every((t) => t.provisional === creditFrame)).toBe(true);
    }
  });

  it("maps standing orders, foreign purchases, undated fee rows and refunds", () => {
    const r = parseExport(rowsToXlsx(isracardRows()));
    expect(r.transactions[1]?.kind).toBe("standing_order");
    expect(r.transactions[2]).toMatchObject({ amount: 46.3, currency: "ILS", originalAmount: 12.5, originalCurrency: "USD" });
    expect(r.transactions[3]).toMatchObject({ kind: "fee", amount: 15, date: "2026-11-10" });
    expect(r.transactions[4]).toMatchObject({ kind: "refund", amount: -20 });
  });

  it("includes the off-cycle section with its own bank charge date", () => {
    const r = parseExport(rowsToXlsx(isracardRows({ offCycle: true })));
    expect(r.transactions).toHaveLength(6);
    expect(r.transactions[5]).toMatchObject({ date: "2026-10-26", billingDate: "2026-10-26", kind: "standing_order", amount: 179.59 });
  });
});

describe("hapoalim card", () => {
  const r = parseExport(rowsToXlsx(hapoalimCardRows()));

  it("reads all sections and takes the card from the row", () => {
    expect(r.account).toBe("4321");
    expect(r.transactions).toHaveLength(6);
    expect(r.transactions.map((t) => t.currency)).toEqual(["ILS", "ILS", "ILS", "ILS", "ILS", "USD"]);
  });

  it("uses the ILS charge amount, keeps the sign, and records foreign originals", () => {
    expect(r.transactions[0]).toMatchObject({ date: "2026-10-30", amount: 15, kind: "purchase", reference: "110218", billingDate: "2026-11-02" });
    expect(r.transactions[1]).toMatchObject({ amount: -48, kind: "refund" });
    expect(r.transactions[2]?.kind).toBe("standing_order");
    expect(r.transactions[3]?.kind).toBe("installment");
    expect(r.transactions[4]).toMatchObject({ amount: 37.1, originalAmount: 10, originalCurrency: "USD" });
    expect(r.transactions[5]).toMatchObject({ amount: 120, currency: "USD" });
  });
});

describe("hapoalim account", () => {
  const r = parseExport(rowsToXlsx(hapoalimAccountRows()));

  it("signs debits positive and credits negative", () => {
    expect(r.transactions).toHaveLength(10);
    expect(r.transactions[0]).toMatchObject({ date: "2026-10-16", amount: 4500, kind: "check" });
    expect(r.transactions[1]).toMatchObject({ amount: -250, kind: "bit" });
    expect(r.transactions[5]).toMatchObject({ amount: -12000, kind: "salary" });
  });

  it("marks every card settlement as a transfer and the rest as direct debits", () => {
    expect(r.transactions.slice(2, 5).map((t) => t.kind)).toEqual(["card_settlement", "card_settlement", "card_settlement"]);
    expect(r.transactions[6]?.kind).toBe("direct_debit");
    expect(r.transactions[8]?.kind).toBe("direct_debit");
    expect(r.transactions[9]).toMatchObject({ kind: "bit", amount: 80 });
  });

  it("never puts the account number in a merchant or warning", () => {
    const text = JSON.stringify(r);
    expect(text).not.toContain(SYNTH_ACCOUNT);
  });
});
