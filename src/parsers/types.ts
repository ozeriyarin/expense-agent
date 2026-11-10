export type Source = "cal" | "isracard" | "hapoalim_card" | "hapoalim_account";

export type Currency = "ILS" | "USD" | "EUR" | string;

export type TxnKind =
  | "purchase"
  | "standing_order"
  | "installment"
  | "refund"
  | "fee"
  | "club"
  | "pending"
  | "card_settlement"
  | "check"
  | "bit"
  | "transfer"
  | "salary"
  | "direct_debit"
  | "cash_withdrawal"
  | "unknown";

/** One normalized row. `amount` > 0 is money out, < 0 is money in. Parsers never log rows. */
export interface Transaction {
  source: Source;
  /** Card last-4 or "account". */
  account: string;
  /** ISO yyyy-mm-dd, the transaction (purchase) date. Month attribution uses this date only. */
  date: string;
  billingDate: string | null;
  merchant: string;
  amount: number;
  currency: Currency;
  originalAmount: number | null;
  originalCurrency: Currency | null;
  kind: TxnKind;
  reference: string | null;
  notes: string | null;
  /** True when the export says the charge is not final yet. */
  provisional: boolean;
  /** 1-based row number in the sheet, for traceability. */
  row: number;
}

export interface ParseResult {
  source: Source;
  account: string;
  transactions: Transaction[];
  /** Total printed on the statement (Isracard title block); used to recognize the bank settlement row. */
  statementTotal: number | null;
  /** Row numbers and reasons only; never merchant or amount text. */
  warnings: string[];
}
