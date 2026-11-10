import type { Transaction } from "../parsers/types.js";

export type ExclusionReason = "card_settlement" | "pending_duplicate";

/** A transaction after validation and dedup. Nothing is deleted: excluded rows carry a reason, duplicates a group id. */
export interface DedupedTransaction extends Transaction {
  excluded: boolean;
  excludedReason: ExclusionReason | null;
  /** Shared by rows that look like true duplicates (same source, account, date, amount, merchant). Kept, never dropped. */
  duplicateGroup: string | null;
}

export interface DedupResult {
  rows: DedupedTransaction[];
  /** Row-level validation problems; the row is still returned. Row numbers and reasons only. */
  problems: string[];
  stats: { total: number; pendingDropped: number; settlements: number; duplicateGroups: number };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * Decisions 2026-11-10: card settlements in the bank export are transfers; pending rows that match a posted row are
 * dropped (the rest stay, provisional); same-day same-amount duplicates are kept and flagged, never dropped silently.
 */
export function dedup(transactions: readonly Transaction[]): DedupResult {
  const problems: string[] = [];
  const posted = new Set<string>();
  for (const t of transactions) if (t.kind !== "pending") posted.add(key(t));

  const groups = new Map<string, number>();
  const rows: DedupedTransaction[] = [];
  let pendingDropped = 0;
  let settlements = 0;

  for (const t of transactions) {
    for (const p of validate(t)) problems.push(`${t.source} row ${t.row}: ${p}`);
    const k = key(t);
    let excludedReason: ExclusionReason | null = null;
    if (t.kind === "card_settlement") {
      excludedReason = "card_settlement";
      settlements++;
    } else if (t.kind === "pending" && posted.has(k)) {
      excludedReason = "pending_duplicate";
      pendingDropped++;
    }
    if (!excludedReason && t.kind !== "pending") groups.set(k, (groups.get(k) ?? 0) + 1);
    rows.push({ ...t, excluded: excludedReason !== null, excludedReason, duplicateGroup: null });
  }

  let duplicateGroups = 0;
  for (const [k, n] of groups) {
    if (n < 2) continue;
    duplicateGroups++;
    for (const r of rows) if (!r.excluded && r.kind !== "pending" && key(r) === k) r.duplicateGroup = k;
  }

  return { rows, problems, stats: { total: transactions.length, pendingDropped, settlements, duplicateGroups } };
}

/** Rows that count as money movement for the month: not excluded. Zero-amount rows stay in the DB but never reach the sheet. */
export function active(result: DedupResult): DedupedTransaction[] {
  return result.rows.filter((r) => !r.excluded);
}
