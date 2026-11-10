import { findColumn, headerKey, isBlank, isoDate, num, str, type Row } from "./sheet.js";
import type { ParseResult, Transaction, TxnKind } from "./types.js";

/** Bank Hapoalim account movements: one table with separate debit (חובה) and credit (זכות) columns. */
export function isHapoalimAccount(rows: Row[]): boolean {
  return rows.slice(0, 10).some((r) => {
    const keys = r.map(headerKey);
    return keys[0] === "תאריך" && keys.includes("הפעולה") && keys.includes("חובה") && keys.includes("זכות");
  });
}

/** Card settlements are transfers, never expenses (decision 2026-11-10). */
export const CARD_SETTLEMENT = /ישראכרט|דיינרס|כרטיסי אשראי|מסטרקרד|ויזה|כאל\b|מקס\b/;

export function kindOfAction(action: string | null, purpose: string | null, isCredit: boolean): TxnKind {
  const a = action ?? "";
  if (CARD_SETTLEMENT.test(a)) return "card_settlement";
  if (/שיק/.test(a)) return "check";
  if (/bit/i.test(a)) return "bit";
  if (/משכורת/.test(purpose ?? "") || /משכורת/.test(a)) return "salary";
  if (/העברה|הפקדה/.test(a)) return "transfer";
  if (isCredit) return "transfer";
  return "direct_debit";
}

export function parseHapoalimAccount(rows: Row[]): ParseResult {
  const warnings: string[] = [];
  const headerIdx = rows.findIndex((r) => headerKey(r[0] ?? null) === "תאריך" && r.map(headerKey).includes("הפעולה"));
  if (headerIdx < 0) throw new Error("hapoalim-account: header row not found");
  const header = rows[headerIdx]!;
  const cDate = 0;
  const cAction = findColumn(header, "הפעולה");
  const cDetails = findColumn(header, "פרטים");
  const cRef = findColumn(header, "אסמכתא");
  const cDebit = findColumn(header, "חובה");
  const cCredit = findColumn(header, "זכות");
  const cValueDate = findColumn(header, "תאריך ערך");
  const cFor = findColumn(header, "לטובת");
  const cPurpose = findColumn(header, "עבור");

  const transactions: Transaction[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (isBlank(row)) continue;
    const date = isoDate(row[cDate] ?? null);
    const action = str(row, cAction);
    if (!date || !action) {
      warnings.push(`row ${i + 1}: skipped (missing date or action)`);
      continue;
    }
    const debit = num(row, cDebit);
    const credit = num(row, cCredit);
    if (debit === null && credit === null) {
      warnings.push(`row ${i + 1}: skipped (no debit or credit)`);
      continue;
    }
    const isCredit = debit === null;
    const amount = isCredit ? -(credit ?? 0) : debit ?? 0;
    const counterparty = cFor >= 0 ? str(row, cFor) : null;
    const purpose = cPurpose >= 0 ? str(row, cPurpose) : null;
    const details = cDetails >= 0 ? str(row, cDetails) : null;
    const merchant = [action, counterparty].filter(Boolean).join(" | ");
    transactions.push({
      source: "hapoalim_account",
      account: "account",
      date,
      billingDate: cValueDate >= 0 ? isoDate(row[cValueDate] ?? null) : null,
      merchant,
      amount,
      currency: "ILS",
      originalAmount: null,
      originalCurrency: null,
      kind: kindOfAction(action, purpose, isCredit),
      reference: cRef >= 0 ? str(row, cRef) : null,
      notes: [details, purpose].filter(Boolean).join(" | ") || null,
      provisional: false,
      row: i + 1,
    });
  }
  return { source: "hapoalim_account", account: "account", transactions, warnings };
}
