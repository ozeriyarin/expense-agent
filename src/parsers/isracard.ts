import { HEBREW_MONTHS, findColumn, headerKey, isBlank, isoDate, lastFourDigits, num, str, type Row } from "./sheet.js";
import type { ParseResult, Transaction, TxnKind } from "./types.js";

/** Isracard export: title block (card, total, billing day), a header row at a variable position, optional second "off-cycle" section. */
export function isIsracard(rows: Row[]): boolean {
  return rows.slice(0, 20).some((r) => headerKey(r[0] ?? null) === "תאריך רכישה" && r.map(headerKey).includes("שם בית עסק"));
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Billing date from "לחיוב ב-10.10" plus the year from the title "אוקטובר 2026". */
function billingDateFrom(rows: Row[]): string | null {
  let year: number | null = null;
  let dayMonth: string | null = null;
  for (const r of rows.slice(0, 12)) {
    for (const c of r) {
      if (typeof c !== "string") continue;
      const y = /(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+(\d{4})/.exec(c);
      if (y) year = Number(y[2]);
      const b = /לחיוב ב-?\s*(\d{1,2})\.(\d{1,2})/.exec(c);
      if (b) dayMonth = `${pad(Number(b[2]))}-${pad(Number(b[1]))}`;
    }
  }
  if (!dayMonth) return null;
  if (year === null) return null;
  return `${year}-${dayMonth}`;
}

/** The title block carries the statement total next to the card name, e.g. "₪ 887.88". */
function statementTotalFrom(rows: Row[]): number | null {
  for (const r of rows) {
    if (!r.some((c) => typeof c === "string" && /\d{4}/.test(c) && /מסטר|ויזה|כרטיס/.test(c))) continue;
    for (let k = 1; k < r.length; k++) {
      const v = num(r, k);
      if (v !== null && typeof r[k] === "string" && String(r[k]).includes("₪")) return v;
    }
  }
  return null;
}

function kindOf(details: string | null, merchant: string, amount: number, hasDate: boolean): TxnKind {
  if (amount < 0) return "refund";
  if (!hasDate || /דמי כרטיס|עמלה/.test(merchant)) return "fee";
  if (details?.includes("הוראת קבע")) return "standing_order";
  if (details?.includes("תשלום")) return "installment";
  return "purchase";
}

const CURRENCY: Record<string, string> = { "₪": "ILS", $: "USD", "€": "EUR" };

export function parseIsracard(rows: Row[]): ParseResult {
  const warnings: string[] = [];
  const headerIdxs = rows.map((r, i) => (headerKey(r[0] ?? null) === "תאריך רכישה" ? i : -1)).filter((i) => i >= 0);
  if (headerIdxs.length === 0) throw new Error("isracard: header row not found");
  const first = headerIdxs[0]!;
  const titleCard = rows.slice(0, first).map((r) => str(r, 0)).find((s) => s && /\d{4}/.test(s)) ?? null;
  const account = lastFourDigits(titleCard) ?? "isracard";
  const billingDate = billingDateFrom(rows);
  const statementTotal = statementTotalFrom(rows.slice(0, first));
  const provisional = rows.slice(0, first).some((r) => r.some((c) => typeof c === "string" && c.includes("אינו סופי")));
  const monthTitle = rows.slice(0, first).flatMap((r) => r).find((c) => typeof c === "string" && /(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+\d{4}/.test(c));
  void HEBREW_MONTHS;
  void monthTitle;

  const transactions: Transaction[] = [];
  for (const h of headerIdxs) {
    const header = rows[h]!;
    const cDate = findColumn(header, "תאריך רכישה");
    const cMerchant = findColumn(header, "שם בית עסק");
    const cAmount = findColumn(header, "סכום עסקה");
    const cCurrency = findColumn(header, "מטבע עסקה");
    const cCharge = findColumn(header, "סכום חיוב");
    const cChargeCurrency = findColumn(header, "מטבע חיוב");
    const cVoucher = findColumn(header, "מס שובר");
    const cDetails = findColumn(header, "פירוט נוסף");
    const cBankCharge = findColumn(header, "חיוב בחשבון הבנק");

    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i]!;
      if (isBlank(row)) break;
      if (headerKey(row[0] ?? null) === "תאריך רכישה") break;
      const merchant = str(row, cMerchant);
      const date = isoDate(row[cDate] ?? null);
      const charge = num(row, cCharge);
      const amount = num(row, cAmount);
      if (!merchant) {
        if (typeof row[0] === "string" && !date) break; // section title or legal text
        warnings.push(`row ${i + 1}: skipped (no merchant)`);
        continue;
      }
      const value = charge ?? amount;
      if (value === null) {
        warnings.push(`row ${i + 1}: skipped (no amount)`);
        continue;
      }
      const txnDate = date ?? billingDate;
      if (!txnDate) {
        warnings.push(`row ${i + 1}: skipped (no date and no billing date)`);
        continue;
      }
      const details = cDetails >= 0 ? str(row, cDetails) : null;
      const origCur = cCurrency >= 0 ? str(row, cCurrency) : null;
      const chargeCur = cChargeCurrency >= 0 ? str(row, cChargeCurrency) : null;
      const rowBilling = cBankCharge >= 0 ? isoDate(row[cBankCharge] ?? null) : null;
      transactions.push({
        source: "isracard",
        account,
        date: txnDate,
        billingDate: rowBilling ?? billingDate,
        merchant,
        amount: value,
        currency: chargeCur ? CURRENCY[chargeCur] ?? chargeCur : "ILS",
        originalAmount: amount !== null && amount !== value ? amount : null,
        originalCurrency: origCur && amount !== null && amount !== value ? CURRENCY[origCur] ?? origCur : null,
        kind: kindOf(details, merchant, value, date !== null),
        reference: cVoucher >= 0 ? str(row, cVoucher) : null,
        notes: details,
        provisional,
        row: i + 1,
      });
    }
  }
  return { source: "isracard", account, transactions, statementTotal, warnings };
}
