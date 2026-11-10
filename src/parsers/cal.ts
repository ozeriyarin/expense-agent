import { findColumn, headerKey, isBlank, isoDate, lastFourDigits, num, str, type Row } from "./sheet.js";
import type { ParseResult, Transaction, TxnKind } from "./types.js";

/** Cal (Diners / Mastercard) export: title row, then one table with a type column and free-text notes. */
export function isCal(rows: Row[]): boolean {
  return rows.slice(0, 5).some((r) => {
    const keys = r.map(headerKey);
    return keys.some((k) => k.startsWith("תאריך עסקה")) && keys.some((k) => k === "שם בית עסק") && keys.some((k) => k.startsWith("סוג עסקה"));
  });
}

function kindOf(type: string | null, notes: string | null, amount: number): TxnKind {
  if (notes?.includes("עסקה בקליטה")) return "pending";
  if (amount < 0) return "refund";
  if (!type) return "unknown";
  if (type.includes("הוראת קבע")) return "standing_order";
  if (type.includes("תשלומים")) return "installment";
  if (type.includes("צבירה")) return "club";
  if (type.includes("שרותים") || type.includes("שירותים")) return "fee";
  if (type.includes("רגילה")) return "purchase";
  return "unknown";
}

const FOREIGN = /סכום העסקה הוא\s*([\d.,]+)\s*([€$£])/;
const CURRENCY_SYMBOL: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };

export function parseCal(rows: Row[]): ParseResult {
  const warnings: string[] = [];
  const headerIdx = rows.findIndex((r) => r.map(headerKey).some((k) => k.startsWith("תאריך עסקה")));
  if (headerIdx < 0) throw new Error("cal: header row not found");
  const header = rows[headerIdx]!;
  const title = rows.slice(0, headerIdx).map((r) => str(r, 0)).find(Boolean) ?? null;
  const account = lastFourDigits(title) ?? "cal";

  const cDate = findColumn(header, "תאריך עסקה");
  const cMerchant = findColumn(header, "שם בית עסק");
  const cAmount = findColumn(header, "סכום בשח", "סכום");
  const cBilling = findColumn(header, "מועד חיוב");
  const cType = findColumn(header, "סוג עסקה");
  const cNotes = findColumn(header, "הערות");
  if (cDate < 0 || cMerchant < 0 || cAmount < 0) throw new Error("cal: required columns missing");

  const transactions: Transaction[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (isBlank(row)) continue;
    const date = isoDate(row[cDate] ?? null);
    const amount = num(row, cAmount);
    const merchant = str(row, cMerchant);
    if (!date) continue; // footer, total or legal line: data rows always carry a date
    if (amount === null || !merchant) {
      warnings.push(`row ${i + 1}: skipped (missing date, amount or merchant)`);
      continue;
    }
    const notes = cNotes >= 0 ? str(row, cNotes) : null;
    const type = cType >= 0 ? str(row, cType) : null;
    const foreign = notes ? FOREIGN.exec(notes) : null;
    transactions.push({
      source: "cal",
      account,
      date,
      billingDate: cBilling >= 0 ? isoDate(row[cBilling] ?? null) : null,
      merchant,
      amount,
      currency: "ILS",
      originalAmount: foreign ? Number(foreign[1]!.replace(/,/g, "")) : null,
      originalCurrency: foreign ? CURRENCY_SYMBOL[foreign[2]!] ?? foreign[2]! : null,
      kind: kindOf(type, notes, amount),
      reference: null,
      notes: notes ?? (type && !type.includes("רגילה") ? type : null),
      provisional: notes?.includes("עסקה בקליטה") ?? false,
      row: i + 1,
    });
  }
  return { source: "cal", account, transactions, warnings };
}
