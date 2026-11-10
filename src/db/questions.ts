import type { Db } from "./client.js";

export interface OpenQuestion {
  id: number;
  txnId: number;
  type: string;
  text: string;
  options: string[];
}

export async function listOpenQuestions(db: Db): Promise<OpenQuestion[]> {
  const r = await db.execute("SELECT id, txn_id, type, text, options FROM questions WHERE answer IS NULL ORDER BY id");
  return r.rows.map((row) => ({
    id: Number(row["id"]),
    txnId: Number(row["txn_id"]),
    type: String(row["type"]),
    text: String(row["text"]),
    options: JSON.parse(String(row["options"])) as string[],
  }));
}

export async function openQuestionCount(db: Db): Promise<number> {
  const r = await db.execute("SELECT COUNT(*) AS n FROM questions WHERE answer IS NULL");
  return Number(r.rows[0]?.["n"] ?? 0);
}

/** Yarin's answer is applied to the transaction and kept forever; export never runs with open questions. */
export async function answerQuestion(db: Db, id: number, answer: string, note?: string): Promise<void> {
  const q = await db.execute({ sql: "SELECT txn_id, type, options FROM questions WHERE id = ? AND answer IS NULL", args: [id] });
  const row = q.rows[0];
  if (!row) throw new Error(`question ${id} not found or already answered`);
  const options = JSON.parse(String(row["options"])) as string[];
  if (!options.includes(answer)) throw new Error(`answer must be one of ${options.join(", ")}`);
  const txnId = Number(row["txn_id"]);

  if (row["type"] === "unmatched_settlement") {
    if (answer === "cash_withdrawal") {
      await db.execute({ sql: "UPDATE transactions SET kind = 'cash_withdrawal', excluded = 0, excluded_reason = NULL WHERE id = ?", args: [txnId] });
    } else if (answer === "other") {
      await db.execute({ sql: "UPDATE transactions SET kind = 'unknown', excluded = 0, excluded_reason = NULL WHERE id = ?", args: [txnId] });
    } // "settlement": stays excluded as a transfer
  }
  await db.execute({
    sql: "UPDATE questions SET answer = ?, note = ?, answered_at = datetime('now') WHERE id = ?",
    args: [answer, note ?? null, id],
  });
}
