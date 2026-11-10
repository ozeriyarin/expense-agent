# Tech stack

- Runtime: Node 22, TypeScript (strict, ESM, NodeNext). npm, vitest, tsx.
- LLM: `@anthropic-ai/sdk` (Haiku 5.5 primary, Sonnet 5.5 escalation/reports/questions), `@google/genai`
  (Gemini Flash, second-provider fallback). Voyage embeddings for merchant matching (milestone 7).
- No agent framework. `src/core` owns hooks, budget, fallback ladders, retries, p-limit concurrency,
  AbortController, prompt caching, structured output (zod).
- Storage: `@libsql/client` over a local SQLite file; Turso in production with the same schema.
- Excel: exceljs, formulas preserved (milestone 5).
- Tracing: OpenTelemetry API + sdk-trace-base, local redacting JSONL exporter (amounts and merchants redacted).
- Web UI + Telegram: later milestones. Production: Cloud Run + Turso + GCS + Google sign-in allow-list.
- Private data: everything under `EXPENSE_DATA_DIR` (default `C:\expense-data`), never in the repo.

## Model prices (USD per 1M tokens, cached 2026-11-10, edit in `src/core/pricing.ts`)

| Model | Input | Output | Cache read |
|---|---|---|---|
| claude-haiku-5-5 | 0.10 | 0.50 | 0.01 |
| claude-sonnet-5-5 | 2.00 | 10.00 | 0.20 |
| gemini flash (placeholder, verify before first real call) | 0.30 | 2.50 | 0.075 |
