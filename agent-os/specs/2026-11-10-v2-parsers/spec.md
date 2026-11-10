# Spec: v1 milestone 2, parsers + validation + dedup

Date: 2026-11-10. Source: project note (data sources, real exports on disk, reconciliation lessons, dedup decision).

## Goal

Turn the four real export formats into one normalized `Transaction` stream, deterministically, with calendar-month
attribution and the dedup rules from the project note. No LLM in this milestone.

## Scope

In: `src/parsers/*` (Cal, Isracard, Hapoalim card, Hapoalim account, detection, month filter), synthetic fixtures
in the real layouts, a private test that runs only where the real exports exist, validation and dedup (`src/dedup`).
Out: categorization, DB writes, UI.

## Acceptance criteria

1. `parseExport(file)` detects the format from the header rows and returns `{ source, account, transactions, warnings }`;
   warnings carry row numbers and reasons only, never merchant or amount text.
2. Dates are read from raw Excel serials (never SheetJS `cellDates`, which shifts a day under Israel DST) and from
   Isracard `dd.mm.yy` strings; every date is the local calendar day of the sheet.
3. Cal: pending rows (`עסקה בקליטה`) are kept and flagged `pending`/`provisional`; standing orders, installments,
   club rows, fees, refunds (negative) and foreign originals (from the notes) are typed; footer rows are ignored.
4. Isracard: the header row is found wherever it sits (credit-frame block or not); the off-cycle section is included
   with its own bank charge date; undated fee rows get the statement billing date; `provisional` reflects the
   "charge not final" marker; the card last-4 and billing date come from the title block.
5. Hapoalim card: every section (ILS, ILS variant with original currency, USD, EUR) is read by header names; the ILS
   charge is the amount, the original purchase amount and currency are kept.
6. Hapoalim account: debits positive, credits negative; card settlements (`ישראכרט`, `דיינרס`, `כרטיסי אשראי`,
   `מסטרקרד`) are `card_settlement`; checks, Bit, salary, transfers and direct debits are typed.
7. Against the real October 2026 exports (private test): Cal 181 rows / 76 in October, Isracard 14+8+2 rows
   (fees included) / 5+6+1 in October, Hapoalim card 80 / 78, account 15; total card rows in October 166 as reconciled.
8. Dedup (next session): pending rows that match a posted row (date, amount, merchant) are dropped; bank settlement
   rows are transfers; chat rows merge with export rows by date+amount+merchant; same-day same-amount duplicates are
   kept and flagged.

## Status

Criteria 1 to 7 done 2026-11-10 (session 1). Criterion 8 open.
