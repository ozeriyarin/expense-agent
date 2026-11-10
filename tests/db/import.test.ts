import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openDb } from "../../src/db/client.js";
import { importFiles } from "../../src/db/import.js";
import { rowsToXlsx } from "../../src/parsers/index.js";
import { calRows, hapoalimAccountRows } from "../fixtures/synthetic-exports.js";

const dir = mkdtempSync(join(tmpdir(), "expense-import-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("import into SQLite", () => {
  const cal = join(dir, "cal.xlsx");
  const acct = join(dir, "account.xlsx");
  writeFileSync(cal, rowsToXlsx(calRows()));
  writeFileSync(acct, rowsToXlsx(hapoalimAccountRows()));

  it("creates the schema, inserts every row with dedup flags, and is idempotent", async () => {
    const db = await openDb(":memory:");
    const first = await importFiles(db, [cal, acct]);
    expect(first.files.map((f) => f.skipped)).toEqual([false, false]);
    expect(first.inserted).toBe(19);
    expect(first.stats).toMatchObject({ pendingDropped: 1, settlements: 3 });

    const again = await importFiles(db, [cal, acct]);
    expect(again.files.map((f) => f.skipped)).toEqual([true, true]);
    expect(again.inserted).toBe(0);
    expect(again.alreadyPresent).toBe(19);

    const counts = await db.execute("SELECT COUNT(*) AS n, SUM(excluded) AS ex, SUM(provisional) AS prov FROM transactions");
    expect(counts.rows[0]).toMatchObject({ n: 19, ex: 4, prov: 1 });
    const imports = await db.execute("SELECT source, rows FROM imports ORDER BY id");
    expect(imports.rows.map((r) => [r["source"], r["rows"]])).toEqual([["cal", 9], ["hapoalim_account", 10]]);
  });

  it("keeps flagged same-day repeats as separate rows", async () => {
    const db = await openDb(":memory:");
    const rows = calRows();
    rows.push([...rows[2]!]); // exact repeat of the first purchase
    const file = join(dir, "cal-repeat.xlsx");
    writeFileSync(file, rowsToXlsx(rows));
    const s = await importFiles(db, [file]);
    expect(s.stats.duplicateGroups).toBe(1);
    expect(s.inserted).toBe(10);
    const flagged = await db.execute("SELECT COUNT(*) AS n FROM transactions WHERE duplicate_group IS NOT NULL");
    expect(flagged.rows[0]?.["n"]).toBe(2);
  });
});
