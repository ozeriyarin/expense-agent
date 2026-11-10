// Usage: npx tsx src/cli/import.ts <file.xlsx ...>   (DATABASE_URL from .env or the environment)
import { openDb } from "../db/client.js";
import { importFiles } from "../db/import.js";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: import <file.xlsx ...>");
  process.exit(1);
}
const db = await openDb();
const s = await importFiles(db, files);
for (const f of s.files) console.log(`${f.skipped ? "skip" : "read"}  ${f.source.padEnd(17)} card ${f.account.replace(/\d(?=\d{2})/g, "*")}  ${f.rows} rows  ${f.file}`);
console.log(`inserted ${s.inserted}, already present ${s.alreadyPresent}; pending dropped ${s.stats.pendingDropped}, settlements ${s.stats.settlements}, repeat groups ${s.stats.duplicateGroups}`);
if (s.problems.length) console.log(`problems:\n  ${s.problems.join("\n  ")}`);
const total = await db.execute("SELECT COUNT(*) AS n, SUM(excluded) AS excluded FROM transactions");
console.log(`db now holds ${total.rows[0]?.["n"]} rows (${total.rows[0]?.["excluded"]} excluded)`);
