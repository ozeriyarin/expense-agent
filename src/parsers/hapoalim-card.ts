import { findColumn, headerKey, isBlank, isoDate, lastFourDigits, num, str, type Row } from "./sheet.js";
import type { ParseResult, Transaction, TxnKind } from "./types.js";

/** Bank Hapoalim "previous charges" export for the bank-issued card: several sections (ILS, ILS variant, USD, EUR). */
export function isHapoalimCard(rows: Row[]): boolean {
  const titled = rows.slice(0, 5).some((r) => r.some((c) => typeof c === "string" && c.includes("חיובים קודמים")));
  return titled && rows.some((r) => headerKey(r[0] ?? null) === "שם כרטיס" && r.map(headerKey).includes("שם בית עסק"));
}

function kindOf(creditType: string | null, amount: number): TxnKind {
  if (amount < 0) return "refund";
  if (!creditType) return "purchase";
  if (creditType.includes("הוראת קבע")) return "standing_order";
  if (creditType.includes("תשלומים")) return "installment";
  return "purchase";
}

const CURRENCY_BY_HEADER: Array<[string, string]> = [["סכום חיוב בשח", "ILS"], ["סכום חיוב בדולר", "USD"], ["סכום חיוב ביורו", "EUR"]];

export function parseHapoalimCard(rows: Row[]): ParseResult {
  const warnings: string[] = [];
  const headerIdxs = rows
    .map((r, i) => (headerKey(r[0] ?? null) === "שם כרטיס" && r.map(headerKey).includes("שם בית עסק") ? i : -1))
    .filter((i) => i >= 0);
  if (headerIdxs.length === 0) throw new Error("hapoalim-card: no transaction section found");

  const transactions: Transaction[] = [];
  let account = "card";
  for (const h of headerIdxs) {
    const header = rows[h]!;
    const cCard = findColumn(header, "שם כרטיס");
    const cBilling = findColumn(header, "חיוב לתאריך");
    const cDate = header.map(headerKey).indexOf("תאריך");
    const cMerchant = findColumn(header, "שם בית עסק");
    const cPurchase = findColumn(header, "סכום קנייה");
    const chargeCol = CURRENCY_BY_HEADER.map(([name, cur]) => [findColumn(header, name), cur] as const).find(([i]) => i >= 0);
    const cCharge = chargeCol ? chargeCol[0] : -1;
    const currency = chargeCol ? chargeCol[1] : "ILS";
    const cOrigCurrency = findColumn(header, "מטבע מקורי", "מטבע");
    const cRef = findColumn(header, "אסמכתא");
    const cType = findColumn(header, "תאור סוג עסקת אשראי");
    const cNotes = findColumn(header, "הערות לעסקה");
    if (cDate < 0 || cMerchant < 0 || (cCharge < 0 && cPurchase < 0)) {
      warnings.push(`section at row ${h + 1}: skipped (columns not recognized)`);
      continue;
    }

    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i]!;
      if (isBlank(row)) break;
      const merchant = str(row, cMerchant);
      const date = isoDate(row[cDate] ?? null);
      if (!merchant || !date) {
        if (str(row, 0) && !date) break; // next section title
        warnings.push(`row ${i + 1}: skipped (missing merchant or date)`);
        continue;
      }
      const charge = cCharge >= 0 ? num(row, cCharge) : null;
      const purchase = cPurchase >= 0 ? num(row, cPurchase) : null;
      const amount = charge ?? purchase;
      if (amount === null) {
        warnings.push(`row ${i + 1}: skipped (no amount)`);
        continue;
      }
      const card = lastFourDigits(cCard >= 0 ? str(row, cCard) : null);
      if (card) account = card;
      const origCur = cOrigCurrency >= 0 ? str(row, cOrigCurrency) : null;
      const foreign = purchase !== null && (purchase !== amount || (origCur !== null && origCur !== "ILS"));
      transactions.push({
        source: "hapoalim_card",
        account: card ?? account,
        date,
        billingDate: cBilling >= 0 ? isoDate(row[cBilling] ?? null) : null,
        merchant,
        amount,
        currency,
        originalAmount: foreign ? purchase : null,
        originalCurrency: foreign ? origCur ?? currency : null,
        kind: kindOf(cType >= 0 ? str(row, cType) : null, amount),
        reference: cRef >= 0 ? str(row, cRef) : null,
        notes: cNotes >= 0 ? str(row, cNotes) : null,
        provisional: false,
        row: i + 1,
      });
    }
  }
  return { source: "hapoalim_card", account, transactions, warnings };
}
