# expense-agent

Personal household expense assistant. Drop a card/bank export or type "coffee 18" in a chat line; the agent
categorizes every row into a fixed 10-category Excel taxonomy, stores it in SQLite, exports the month into the
owner's Excel template with formulas preserved, and sends weekly and monthly summaries to Telegram.

Built as a portfolio project with a deliberate focus on the mechanics under an LLM app:

- **Lifecycle hooks**: pre-call guard + budget, post-call cost + log, on-failure retry + fallback.
- **Fallback ladders** declared as data (Sonnet > Haiku > Gemini Flash; Haiku > Gemini Flash), walked by one generic walker, every rung evaluated.
- **Budget**: 3 USD hard cap, 2 USD soft cap that degrades to the cheaper path.
- **Parallelism**: batched categorization under `p-limit`; speculative LLM guard with `AbortController`.
- **Tracing**: one span per hook, call and batch; local collector; amounts and merchants redacted.
- **Evals**: step x model matrix (accuracy, latency, cost) for every rung of every ladder.

No bank scraping, no credentials: Israeli banks have no public API, CSV export is the input.

## Privacy

This repo contains **no financial data**. Real exports, the merchant seed map, the eval set, the database and traces
live outside the repo in `EXPENSE_DATA_DIR`. A pre-commit guard (`scripts/guard-staged.mjs`) blocks spreadsheets,
databases, env files, API keys and anything that looks like real transactions. Fixtures in `tests/fixtures/` are
synthetic.

## Stack

TypeScript (Node 22), `@anthropic-ai/sdk`, `@google/genai`, `@libsql/client` (SQLite locally, Turso in production),
`p-limit`, `zod`, OpenTelemetry tracing, `vitest`. No agent framework.

## Commands

```bash
npm install
npm run hooks:install   # git pre-commit: guard + tests
npm run typecheck
npm test
```

## Status

v1 in progress. See `agent-os/product/roadmap.md`.
