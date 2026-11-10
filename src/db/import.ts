import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { dedup, type DedupedTransaction } from "../dedup/index.js";
import { parseExport, type ParseResult } from "../parsers/index.js";
import type { Db } from "./client.js";

export interface ImportSummary {
  files: Array<{ file: string; source: string; account: string; rows: number; skipped: boolean }>;
  inserted: number;
  alreadyPresent: number;
  problems: string[];
  stats: ReturnType<typeof dedup>["stats"];
}

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Stable identity of a row across re-imports; `n` separates flagged same-day repeats instead of collapsing them. */
export function txnHash(t: DedupedTransaction, n: number): string {
  return sha([t.source, t.account, t.date, t.amount.toFixed(2), t.merchant.trim().toLowerCase(), t.reference ?? "", String(n)].join("|")).slice(0, 32);
}

/** Parses the files, dedups across all of them, and inserts what is new. Re-running on the same files inserts nothing. */
export async function importFiles(db: Db, paths: string[]): Promise<ImportSummary> {
  const parsed: Array<{ path: string; hash: string; result: ParseResult; skipped: boolean }> = [];
  for (const path of paths) {
    const buf = readFileSync(path);
    const hash = sha(buf);
    const existing = await db.execute({ sql: "SELECT id FROM imports WHERE file_hash = ?", args: [hash] });
    parsed.push({ path, hash, result: parseExport(buf), skipped: existing.rows.length > 0 });
  }

  const statementTotals = parsed.flatMap((p) => (p.result.statementTotal === null ? [] : [{ source: p.result.source, total: p.result.statementTotal }]));
  const deduped = dedup(parsed.flatMap((p) => p.result.transactions.map((t) => ({ ...t, _path: p.path }))), { statementTotals });
  let inserted = 0;
  let alreadyPresent = 0;
  const importIds = new Map<string, number>();

  for (const p of parsed) {
    if (p.skipped) continue;
    const r = await db.execute({
      sql: "INSERT INTO imports (file_hash, file_name, source, account, rows) VALUES (?, ?, ?, ?, ?)",
      args: [p.hash, basename(p.path), p.result.source, p.result.account, p.result.transactions.length],
    });
    importIds.set(p.path, Number(r.lastInsertRowid));
  }

  const seen = new Map<string, number>();
  for (const row of deduped.rows as Array<DedupedTransaction & { _path: string }>) {
    const base = txnHash(row, 0);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const hash = n === 0 ? base : txnHash(row, n);
    const importId = importIds.get(row._path) ?? null;
    const r = await db.execute({
      sql: `INSERT OR IGNORE INTO transactions
        (txn_hash, import_id, source, account, date, billing_date, merchant, amount, currency, original_amount, original_currency,
         kind, reference, notes, provisional, excluded, excluded_reason, duplicate_group)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        hash, importId, row.source, row.account, row.date, row.billingDate, row.merchant, row.amount, row.currency,
        row.originalAmount, row.originalCurrency, row.kind, row.reference, row.notes, row.provisional ? 1 : 0,
        row.excluded ? 1 : 0, row.excludedReason, row.duplicateGroup,
      ],
    });
    if (r.rowsAffected > 0) inserted++;
    else alreadyPresent++;
    if (row.question) {
      const txn = await db.execute({ sql: "SELECT id FROM transactions WHERE txn_hash = ?", args: [hash] });
      const txnId = txn.rows[0]?.["id"];
      if (txnId !== undefined) {
        await db.execute({
          sql: "INSERT OR IGNORE INTO questions (txn_id, type, text, options) VALUES (?, ?, ?, ?)",
          args: [txnId as number, row.question.type, row.question.text, JSON.stringify(row.question.options)],
        });
      }
    }
  }

  return {
    files: parsed.map((p) => ({ file: basename(p.path), source: p.result.source, account: p.result.account, rows: p.result.transactions.length, skipped: p.skipped })),
    inserted,
    alreadyPresent,
    problems: deduped.problems,
    stats: deduped.stats,
  };
}
