import { createClient, type Client } from "@libsql/client";
import { SCHEMA } from "./schema.js";

export type Db = Client;

/** `file:C:\expense-data\expense.db` locally, a `libsql://` URL on Turso, `:memory:` in tests. */
export async function openDb(url = process.env["DATABASE_URL"] ?? ":memory:", authToken = process.env["DATABASE_AUTH_TOKEN"]): Promise<Db> {
  const db = createClient(authToken ? { url, authToken } : { url });
  for (const stmt of SCHEMA) await db.execute(stmt);
  return db;
}
