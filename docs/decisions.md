# Decisions

Mirror of the Decisions table in the project note (`C:\second-brain\01 Projects\expense-agent\expense-agent.md`).
The note is the source of truth; when they differ, fix this file.

| Date | Decision | Why |
|------|----------|-----|
| 2026-11-10 | CSV + chat input, no bank scraping | No public API, credentials must never be handled by the agent |
| 2026-11-10 | Reuse guard/budget/fallback/retry/eval from the take-homes (hubrisk, airportiq) | Already proven, goal is to polish them into a reusable core |
| 2026-11-10 | Budget: 3 USD hard cap at the Anthropic console, 2 USD in-app soft cap that degrades to a cheaper path | 10 USD would never be touched; a cap you brush against exercises the fallback logic |
| 2026-11-10 | Latency targets: chat line < 1.5 s, CSV of 200 rows < 10 s with progress, reports non-interactive | Three paths, three targets; the CSV path is where parallelism pays |
| 2026-11-10 | Speculative guard: rules guard first (free), then LLM guard and main call in parallel; no side effects until guard passes; abort main on guard fail | Hides guard latency on the chat path at negligible cost |
| 2026-11-10 | Stack: TypeScript, Anthropic SDK directly, own core module; no LangGraph | Flow is short and linear; the learning goal is the mechanics underneath |
| 2026-11-10 | Storage: SQLite as truth, monthly export into the Excel template (exceljs, formulas preserved) | Fast and testable store, spreadsheet stays the human view |
| 2026-11-10 | Hooks: agent lifecycle hooks in code (pre-call guard+budget, post-call cost+log, on-failure retry+fallback) AND Claude Code dev hooks (tests before commit) | First is the product, second is the dev discipline |
| 2026-11-10 | SDD framework: Agent OS (spec > plan > tasks > verify) plus this decisions.md mirroring the note | Known from the take-homes; keeps repo and vault in sync |
| 2026-11-10 | Working style: Yarin involved in every decision; Claude explains, recommends, asks, then acts | His call on his project |
| 2026-11-10 | Month attribution = calendar month of the transaction date; billing cycle (10th to 10th) and settlement date are ignored | The sheet is calendar months; simplest rule that matches how the sheet is filled |
| 2026-11-10 | Installments: each payment counted in the month it is charged; refunds as negative rows in the credited month, same category | Matches the money that actually left the account; keeps the savings-rate line honest |
| 2026-11-10 | Model map: Haiku 5.5 for guard+categorizer, Sonnet 5.5 for escalation/reports/questions, Gemini Flash as second-provider fallback, Jev only as guard A/B; Voyage embeddings for merchants and tracing both in v1 | Cheapest model that passes per step; fallback must be another provider; latency work needs traces |
| 2026-11-10 | Fallback ladders on every step (Sonnet > Haiku > Gemini; Haiku > Gemini), declared as data, walked by one generic walker; eval matrix runs every step against every rung | Know the quality drop of each rung instead of hoping; one tested place for retry/fallback logic |
| 2026-11-10 | Public repo, zero financial data in it: data folder outside the repo (`EXPENSE_DATA_DIR`), .gitignore before any code, synthetic fixtures in the repo, real eval set outside, pre-commit guard + secret scanner, traces redacted | Portfolio-grade code, private money |
| 2026-11-10 | Production: Cloud Run + Turso (libSQL driver, same schema as local SQLite), uploads in a private GCS bucket deleted after parsing, Excel generated on demand, Google sign-in with a two-email allow-list | Zero idle cost, reachable anywhere, SQLite semantics everywhere |
| 2026-11-10 | Zero-amount rows (fees discounted to 0, club refunds of 0) never reach the sheet; kept in the DB only | Noise the owner does not want to see |
| 2026-11-10 | Bank checks default to אחרות/מתנות except the recurring rent amount (דיור/שכר דירה); HMO, pension and bank-fee debits map to named sub-rows; Harel standing order = ביטוח בריאות; ~1 ILS cycle differences acceptable | From the October reconciliation review |
| 2026-11-10 | Bit withdrawals into the bank account count as income (sub-row ביט), not transfers | Owner's call; the money arrives from others via Bit |
| 2026-11-10 | Ask-when-unsure: low confidence, new merchant, unusual amount, or model/merchant-map disagreement puts the row in a question queue answered in the UI; every answer feeds corrections, the merchant map and the eval set; export never runs with open questions | Align every unclear line and improve over time |
| 2026-11-10 | Teachers' union vouchers: union store charges map to אחרות/שוברי הסתדרות המורים; the fixed voucher purchases are the expense; voucher-paid supermarket purchases are not synthesized | Avoid double counting and misfiling |
| 2026-11-10 | Dedup: card settlement rows in the bank export are transfers; chat rows merge with matching export rows (date+amount+merchant); true same-day same-amount duplicates are kept and flagged, never dropped silently | No phantom expenses or income; real double charges must surface |
| 2026-11-10 | Package manager npm, test runner vitest, tracing via OpenTelemetry API + a local redacting JSONL exporter | Already installed, zero cost; OTel keeps the door open for Logfire later |
