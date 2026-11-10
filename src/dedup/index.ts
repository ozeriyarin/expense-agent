import type { Source, Transaction } from "../parsers/types.js";

export type ExclusionReason = "card_settlement" | "pending_duplicate";

/** Why the agent wants Yarin's answer before a row is trusted (decision 2026-11-10, ask-when-unsure). */
export type QuestionType = "unmatched_settlement";

export interface Question {
  type: QuestionType;
  /** Short, factual, in Yarin's terms. May name the merchant and amount: it is shown to him, never logged. */
  text: string;
  options: string[];
}

/** A transaction after validation and dedup. Nothing is deleted: excluded rows carry a reason, duplicates a group id. */
export interface DedupedTransaction extends Transaction {
  excluded: boolean;
  excludedReason: ExclusionReason | null;
  /** Shared by rows that look like true duplicates (same source, account, date, amount, merchant). Kept, never dropped. */
  duplicateGroup: string | null;
  question: Question | null;
}

export interface StatementTotal {
  source: Source;
  total: number;
}

export interface DedupOptions {
  /** Statement totals parsed from the card exports; a settlement row is trusted only when its amount matches one of its own card's. */
  statementTotals?: StatementTotal[];
}

/** Which card export a bank settlement payee belongs to. Cal (Diners) exports carry no total, so Diners is never questioned. */
export function settlementSource(payee: string): Source | null {
  if (/ישראכרט|כרטיסי אשראי/.test(payee)) return "isracard";
  if (/מסטרקרד|ויזה/.test(payee)) return "hapoalim_card";
  if (/דיינרס|כאל/.test(payee)) return "cal";
  return null;
}

export interface DedupResult {
  rows: DedupedTransaction[];
  /** Row-level validation problems; the row is still returned. Row numbers and reasons only. */
  problems: string[];
  stats: { total: number; pendingDropped: number; settlements: number; duplicateGroups: number; questions: number };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SETTLEMENT_TOLERANCE = 1.5; // ILS; cycle differences of ~1 ILS are acceptable (decision 2026-11-10)

export function validate(t: Transaction): string[] {
  const out: string[] = [];
  if (!ISO.test(t.date)) out.push("invalid date");
  if (!Number.isFinite(t.amount)) out.push("invalid amount");
  if (!t.merchant.trim()) out.push("empty merchant");
  if (!t.currency) out.push("missing currency");
  return out;
}

function key(t: Transaction): string {
  return [t.source, t.account, t.date, t.amount.toFixed(2), t.merchant.trim().toLowerCase()].join("|");
}

function settlementQuestion(t: Transaction, totals: StatementTotal[]): Question | null {
  const source = settlementSource(t.merchant);
  const own = totals.filter((s) => s.source === source);
  if (own.length === 0) return null; // no statement of that card to compare with: accept silently
  if (own.some((s) => Math.abs(s.total - t.amount) <= SETTLEMENT_TOLERANCE)) return null;
  return {
    type: "unmatched_settlement",
    text: `${t.date}: debit of ${t.amount} to ${t.merchant} matches no card statement total. Cash withdrawal, another card, or a settlement?`,
    options: ["cash_withdrawal", "settlement", "other"],
  };
}

/**
 * Decisions 2026-11-10: card settlements in the bank export are transfers; pending rows that match a posted row are
 * dropped (the rest stay, provisional); same-day same-amount duplicates are kept and flagged, never dropped silently.
 * A settlement-looking debit that matches no statement total stays excluded and raises a question for Yarin.
 */
export function dedup(transactions: readonly Transaction[], options: DedupOptions = {}): DedupResult {
  const totals = options.statementTotals ?? [];
  const problems: string[] = [];
  const posted = new Set<string>();
  for (const t of transactions) if (t.kind !== "pending") posted.add(key(t));

  const groups = new Map<string, number>();
  const rows: DedupedTransaction[] = [];
  let pendingDropped = 0;
  let settlements = 0;
  let questions = 0;

  for (const t of transactions) {
    for (const p of validate(t)) problems.push(`${t.source} row ${t.row}: ${p}`);
    const k = key(t);
    let excludedReason: ExclusionReason | null = null;
    let question: Question | null = null;
    if (t.kind === "card_settlement") {
      excludedReason = "card_settlement";
      settlements++;
      question = settlementQuestion(t, totals);
      if (question) questions++;
    } else if (t.kind === "pending" && posted.has(k)) {
      excludedReason = "pending_duplicate";
      pendingDropped++;
    }
    if (!excludedReason && t.kind !== "pending") groups.set(k, (groups.get(k) ?? 0) + 1);
    rows.push({ ...t, excluded: excludedReason !== null, excludedReason, duplicateGroup: null, question });
  }

  let duplicateGroups = 0;
  for (const [k, n] of groups) {
    if (n < 2) continue;
    duplicateGroups++;
    for (const r of rows) if (!r.excluded && r.kind !== "pending" && key(r) === k) r.duplicateGroup = k;
  }

  return { rows, problems, stats: { total: transactions.length, pendingDropped, settlements, duplicateGroups, questions } };
}

/** Rows that count as money movement for the month: not excluded. Zero-amount rows stay in the DB but never reach the sheet. */
export function active(result: DedupResult): DedupedTransaction[] {
  return result.rows.filter((r) => !r.excluded);
}
