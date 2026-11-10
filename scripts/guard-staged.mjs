#!/usr/bin/env node
// Pre-commit guard: blocks financial data and secrets from entering the public repo.
// Usage: node scripts/guard-staged.mjs            (staged files)
//        node scripts/guard-staged.mjs --all      (every tracked + untracked file)
//        node scripts/guard-staged.mjs --files a b (explicit paths, used by tests)
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FORBIDDEN_PATH = [
  { re: /(^|\/)\.env(\..+)?$/, why: "env file", unless: /(^|\/)\.env\.example$/ },
  { re: /(^|\/)(data|exports|eval-private|traces|uploads)\//, why: "private data folder" },
  { re: /\.(db|sqlite|sqlite3|db-journal)$/i, why: "database file" },
  { re: /\.(pem|key|p12|pfx)$/i, why: "key material" },
  { re: /\.(csv|xlsx|xls)$/i, why: "spreadsheet/CSV outside tests/fixtures", unless: /^tests\/fixtures\// },
];

const SECRET_PATTERNS = [
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/, why: "Anthropic API key" },
  { re: /AIza[0-9A-Za-z_-]{35}/, why: "Google API key" },
  { re: /\bpa-[A-Za-z0-9_-]{24,}\b/, why: "Voyage API key" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/, why: "GitHub token" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, why: "Slack token" },
  { re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/, why: "Telegram bot token" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: "private key block" },
  { re: /\b(?:api[_-]?key|secret|password|token)\b\s*[:=]\s*["'][A-Za-z0-9_\-/+]{16,}["']/i, why: "hard-coded credential" },
];

const FINANCIAL_PATTERNS = [
  { re: /\b\d{2}-\d{3}-\d{5,7}\b/, why: "bank account number" },
  { re: /\b(?:\d[ -]?){15}\d\b/, why: "16-digit card number" },
  { re: /\b(?:IL)\d{2}(?:[ -]?\d{4}){4,5}\b/, why: "IBAN" },
];
// A line that looks like an exported transaction: a date and a money amount together.
const TXN_LINE = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}).*(?:₪|\b\d{1,6}\.\d{2}\b)/;
const MAX_TXN_LINES_OUTSIDE_FIXTURES = 10;
const MAX_FIXTURE_BYTES = 200 * 1024;

const SKIP_CONTENT = /^(node_modules\/|dist\/|package-lock\.json$|.*\.(png|jpg|jpeg|gif|ico|woff2?|ttf|map)$)/;

function listFiles(argv) {
  const i = argv.indexOf("--files");
  if (i >= 0) return argv.slice(i + 1);
  const cmd = argv.includes("--all")
    ? "git ls-files --cached --others --exclude-standard"
    : "git diff --cached --name-only --diff-filter=ACMR";
  return execSync(cmd, { encoding: "utf8" }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function scanPath(file) {
  const findings = [];
  for (const rule of FORBIDDEN_PATH) {
    if (rule.re.test(file) && !(rule.unless && rule.unless.test(file))) findings.push(`${file}: ${rule.why}`);
  }
  return findings;
}

export function scanContent(file, text) {
  const findings = [];
  const isFixture = /^tests\/fixtures\//.test(file);
  const lines = text.split(/\r?\n/);
  let txnLines = 0;
  lines.forEach((line, idx) => {
    for (const p of SECRET_PATTERNS) if (p.re.test(line)) findings.push(`${file}:${idx + 1}: ${p.why}`);
    for (const p of FINANCIAL_PATTERNS) if (p.re.test(line)) findings.push(`${file}:${idx + 1}: ${p.why}`);
    if (TXN_LINE.test(line)) txnLines++;
  });
  if (!isFixture && txnLines > MAX_TXN_LINES_OUTSIDE_FIXTURES) {
    findings.push(`${file}: ${txnLines} transaction-looking lines outside tests/fixtures (real export?)`);
  }
  return findings;
}

function scanFile(file) {
  const findings = scanPath(file);
  if (SKIP_CONTENT.test(file)) return findings;
  let text;
  try {
    if (/^tests\/fixtures\//.test(file) && statSync(file).size > MAX_FIXTURE_BYTES) {
      findings.push(`${file}: fixture larger than ${MAX_FIXTURE_BYTES} bytes (real export?)`);
    }
    const buf = readFileSync(file);
    if (buf.includes(0)) return findings; // binary: path rules only
    text = buf.toString("utf8");
  } catch {
    return findings; // deleted or unreadable
  }
  return findings.concat(scanContent(file, text));
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const files = listFiles(process.argv.slice(2));
  const findings = files.flatMap(scanFile);
  if (findings.length) {
    console.error("GUARD BLOCKED THE COMMIT:\n  " + findings.join("\n  "));
    console.error("\nPrivate data belongs in EXPENSE_DATA_DIR, secrets in .env. Synthetic fixtures go in tests/fixtures/.");
    process.exit(1);
  }
  console.log(`guard: ${files.length} file(s) clean`);
}
