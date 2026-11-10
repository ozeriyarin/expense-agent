# Spec: v1 milestone 1, repo + core module

Date: 2026-11-10. Source: project note `01 Projects/expense-agent/expense-agent.md` (build order step 1, decisions table).

## Goal

A public repo that can never leak money data, and a reusable LLM core that every later milestone calls:
lifecycle hooks, budget, fallback ladders walked by one walker, bounded concurrency, speculative guard
with abort, tracing with redaction. No product feature yet; the core is exercised only by tests and fakes.

## Scope

In: repo scaffolding, guards (gitignore, staged-file scanner, git hook, Claude Code hook), CLAUDE.md,
decisions.md, Agent OS files, `src/core/*`, `src/providers/fake.ts`, provider adapters for Anthropic and
Gemini (thin, untested against the network), tests.
Out: parsers, categorizer prompts, DB schema, UI, Telegram, Excel, evals (milestones 2 to 8).

## Acceptance criteria

1. `.gitignore` excludes `.env*` (except `.env.example`), `*.csv`, `*.xlsx`, `*.db`, `data/`, `exports/`,
   `eval-private/`, `traces/`; fixtures under `tests/fixtures/` are the only allowed spreadsheets.
2. `scripts/guard-staged.mjs` blocks a staged `.env`, a `.xlsx` outside fixtures, an Anthropic/Google/Telegram
   key, a bank account number, and a file with more than 10 transaction-looking lines outside fixtures; it passes
   clean source files.
3. `.githooks/pre-commit` and `.claude/settings.json` both run the guard and the tests before a commit.
4. `CLAUDE.md` names the project note path and the rules; `docs/decisions.md` mirrors the note's table.
5. Hooks: `preCall` can veto a call (guard) or refuse it (budget); `postCall` records usage, cost and latency;
   `onFailure` classifies the error and decides retry, next rung, or give up.
6. Ladders are data (`LADDERS[step] = [rung, rung, ...]`); one `walk()` function tries each rung with
   `maxRetries` on retryable errors, drops to the next rung on non-retryable or exhausted, and throws
   `LadderExhaustedError` carrying every attempt.
7. Budget: cost accumulates per period; crossing the 2 USD soft cap flips the walker to start at the cheapest
   rung; reaching the 3 USD hard cap makes `preCall` throw `BudgetExceededError` before any provider call.
8. Concurrency: `runBatches(items, size, limit, fn)` runs batches under `p-limit`, reports progress, and one
   failing batch does not stop the others.
9. Speculative guard: `speculate(guard, main)` starts both; if the guard rejects, the main call is aborted via
   `AbortController` and no result is returned; if it passes, the main result is returned; side effects run
   only after the guard passed.
10. Tracing: one span per hook, per provider call and per batch; the local exporter writes JSONL under
    `EXPENSE_DATA_DIR/traces/` with amounts replaced by `<amt>`, merchants by `<merchant:hash>` and account
    identifiers by `<acct>`; the in-memory exporter used by tests shows the same redaction.
11. `npm run typecheck` and `npm test` pass; tests never touch the network.

## Design

```
src/core/
  types.ts       Step, Rung, Provider, CallRequest, CallResult, Usage, hook signatures, errors
  pricing.ts     PRICING per model (USD per 1M tokens) + costOf(usage, model)
  budget.ts      Budget: record(cost), state(): 'ok' | 'degraded' | 'exhausted', soft/hard caps
  ladders.ts     LADDERS: Record<Step, Rung[]>  (haiku ladder, sonnet ladder)
  hooks.ts       default hooks: guard+budget preCall, cost+log postCall, classify onFailure
  walker.ts      walk(step, request, ctx): the one place that retries and falls through rungs
  concurrency.ts runBatches with p-limit and progress callback
  speculative.ts speculate(guard, main, signal)
  redact.ts      redact(attributes) for traces and logs
  tracing.ts     tracer setup, span helper, JSONL + in-memory exporters
  index.ts       createCore(config) -> { call, budget, tracer }
src/providers/
  types.ts       Provider interface: complete(request, signal) -> CallResult
  anthropic.ts   thin adapter over @anthropic-ai/sdk (structured output via zod)
  gemini.ts      thin adapter over @google/genai
  fake.ts        scripted provider for tests (responses, errors, delays)
```

Errors are classified into `retryable` (429, 5xx, timeout, network), `fatal` (400, 401, schema), `aborted`.
A retryable error retries up to `rung.maxRetries` with backoff on the same rung, then drops; a fatal error
drops immediately; an abort propagates.
