import * as XLSX from "xlsx";

export type Cell = string | number | Date | null;
export type Row = Cell[];

const RTL_MARKS = /[‎‏‪-‮⁦-⁩]/g;

/** Strips RTL marks, collapses whitespace and newlines; keeps numbers and dates as they are. */
export function normalizeCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).replace(RTL_MARKS, "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Reads the first sheet (or a named one) into normalized rows. Dates stay raw Excel serials: SheetJS cellDates shifts days under DST. */
export function readRows(input: string | Buffer | Uint8Array, sheetName?: string): Row[] {
  const wb = typeof input === "string" ? XLSX.readFile(input, { cellDates: false }) : XLSX.read(input, { type: "buffer", cellDates: false });
  const name = sheetName ?? wb.SheetNames[0];
  if (!name) return [];
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`sheet ${sheetName} not found`);
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  return aoa.map((r) => r.map(normalizeCell));
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/** Excel serial for a local calendar date, computed from components so no timezone can shift the day. */
export function toSerial(d: Date): number {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EXCEL_EPOCH_UTC) / 86_400_000);
}

/** Builds an xlsx buffer from rows; tests use it to create synthetic exports. Dates are written as plain serials, like the bank files. */
export function rowsToXlsx(rows: Row[], sheetName = "Sheet1"): Buffer {
  const plain = rows.map((r) => r.map((c) => (c instanceof Date ? toSerial(c) : c)));
  const ws = XLSX.utils.aoa_to_sheet(plain);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function isBlank(row: Row | undefined): boolean {
  return !row || row.every((c) => c === null);
}

export function str(row: Row, i: number): string | null {
  const v = row[i];
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return null;
  return String(v);
}

export function num(row: Row, i: number): number | null {
  const v = row[i];
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[₪$€,\s]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar date, never UTC: a Date read from a sheet at local midnight must keep its day. */
export function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Accepts Date, "dd.mm.yy", "dd.mm.yyyy", "dd/mm/yyyy", "yyyy-mm-dd", or an Excel serial. */
export function isoDate(v: Cell): string | null {
  if (v === null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoFromDate(v);
  if (typeof v === "number") {
    if (v < 20_000 || v > 80_000) return null; // outside 1954..2119: an amount, not a date
    const parsed = XLSX.SSF.parse_date_code(v);
    return parsed ? `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}` : null;
  }
  const s = v.trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Header matching ignores quotes, apostrophes and spacing ("סכום חיוב בש''ח" == "סכום חיוב בשח"). */
export function headerKey(v: Cell): string {
  if (typeof v !== "string") return "";
  return v.replace(/['"’`]/g, "").replace(/\s+/g, " ").trim();
}

export function findColumn(header: Row, ...names: string[]): number {
  const keys = header.map(headerKey);
  for (const name of names) {
    const want = headerKey(name);
    const exact = keys.indexOf(want);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const want = headerKey(name);
    const partial = keys.findIndex((k) => k.includes(want));
    if (partial >= 0) return partial;
  }
  return -1;
}

export function lastFourDigits(s: string | null): string | null {
  if (!s) return null;
  const m = /(\d{4})(?!.*\d{4})/.exec(s);
  return m ? m[1]! : null;
}

export const HEBREW_MONTHS: Record<string, number> = {
  ינואר: 1, פברואר: 2, מרץ: 3, אפריל: 4, מאי: 5, יוני: 6, יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
};
