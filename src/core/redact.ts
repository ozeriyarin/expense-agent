import { createHash } from "node:crypto";

const AMOUNT_KEY = /(amount|amt|sum|total|balance|price|debit|credit|cost_ils|ils)/i;
const MERCHANT_KEY = /(merchant|description|payee|beneficiary|details|note|text|prompt|user|system|cached)/i;
const ACCOUNT_KEY = /(account|card|iban|acct)/i;

const MONEY_IN_TEXT = /(₪\s*-?\d[\d,]*(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?\s*(?:₪|ILS|USD|EUR|\$|€))/g;
const ACCOUNT_IN_TEXT = /\b\d{2}-\d{3}-\d{5,7}\b/g;
const CARD_IN_TEXT = /\b(?:\d[ -]?){15}\d\b/g;

export function merchantHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 6);
}

/** Scrubs money and identifiers from free text. Keeps structure (lengths, counts) readable. */
export function redactText(text: string): string {
  return text.replace(ACCOUNT_IN_TEXT, "<acct>").replace(CARD_IN_TEXT, "<acct>").replace(MONEY_IN_TEXT, "<amt>");
}

/** Redacts a flat attribute map for traces and logs. Safe keys (cost, tokens, latency, category) pass through. */
export function redact(attrs: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(attrs)) {
    if (raw === undefined || raw === null) continue;
    if (ACCOUNT_KEY.test(key)) {
      out[key] = "<acct>";
    } else if (AMOUNT_KEY.test(key) && !/cost|usd|tokens/i.test(key)) {
      out[key] = "<amt>";
    } else if (MERCHANT_KEY.test(key)) {
      const s = typeof raw === "string" ? raw : JSON.stringify(raw);
      out[key] = `<merchant:${merchantHash(s)}>`;
      out[`${key}.length`] = s.length;
    } else if (typeof raw === "string") {
      out[key] = redactText(raw);
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      out[key] = raw;
    } else {
      out[key] = redactText(JSON.stringify(raw));
    }
  }
  return out;
}
