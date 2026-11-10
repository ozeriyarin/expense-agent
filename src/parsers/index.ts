import { isCal, parseCal } from "./cal.js";
import { isHapoalimAccount, parseHapoalimAccount } from "./hapoalim-account.js";
import { isHapoalimCard, parseHapoalimCard } from "./hapoalim-card.js";
import { isIsracard, parseIsracard } from "./isracard.js";
import { readRows, type Row } from "./sheet.js";
import type { ParseResult, Source, Transaction } from "./types.js";

export function detectSource(rows: Row[]): Source | null {
  if (isCal(rows)) return "cal";
  if (isIsracard(rows)) return "isracard";
  if (isHapoalimCard(rows)) return "hapoalim_card";
  if (isHapoalimAccount(rows)) return "hapoalim_account";
  return null;
}

const PARSERS: Record<Source, (rows: Row[]) => ParseResult> = {
  cal: parseCal,
  isracard: parseIsracard,
  hapoalim_card: parseHapoalimCard,
  hapoalim_account: parseHapoalimAccount,
};

/** Detects the export format from its header rows and parses it. Pure: no I/O besides reading the workbook. */
export function parseExport(input: string | Buffer | Uint8Array, source?: Source): ParseResult {
  const rows = readRows(input);
  const detected = source ?? detectSource(rows);
  if (!detected) throw new Error("unrecognized export format");
  return PARSERS[detected](rows);
}

/** Month attribution = calendar month of the transaction date (decision 2026-11-10). `month` is yyyy-mm. */
export function inMonth(txn: Transaction, month: string): boolean {
  return txn.date.startsWith(month);
}

export * from "./types.js";
export { readRows, rowsToXlsx } from "./sheet.js";
export { parseCal, isCal } from "./cal.js";
export { parseIsracard, isIsracard } from "./isracard.js";
export { parseHapoalimCard, isHapoalimCard } from "./hapoalim-card.js";
export { parseHapoalimAccount, isHapoalimAccount, kindOfAction, CARD_SETTLEMENT } from "./hapoalim-account.js";
