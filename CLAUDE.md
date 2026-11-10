# CLAUDE.md

## What this is

expense-agent: a personal household expense assistant. CSV exports (Cal, Isracard, Bank Hapoalim) and a chat line go
in; categorized rows land in SQLite (libSQL), get exported monthly into Yarin's Excel template, and weekly/monthly
summaries go to Telegram. TypeScript, Anthropic SDK + Gemini client directly, no agent framework. Owner: Yarin Ozeri.
Public repo `ozeriyarin/expense-agent`, solo, commit straight to `main`.

**Project note (source of truth for status, decisions, lessons):** `C:\second-brain\01 Projects\expense-agent\expense-agent.md`.
Read it first in every session, update Status / Next / Decisions as they change, and mirror new decisions into
`docs/decisions.md`.

## Rules for Claude here

- Open every reply with "ירין," and answer in English unless told to use Hebrew.
- Yarin is involved in every decision: explain in a few lines, recommend with the reason, ask, then act. Keep working
  on what does not depend on the open question. Say the cost when a choice affects the API budget.
- Zero financial data in the repo. Real exports, the seed merchant map, the eval set, the DB and traces live in
  `EXPENSE_DATA_DIR` (default `C:\expense-data`). Synthetic fixtures only under `tests/fixtures/`. Never copy, print
  or quote rows from real files into code, tests, docs or commit messages.
- Secrets only via `.env` (git-ignored). `scripts/guard-staged.mjs` runs before every commit (git hook and Claude Code
  hook); if it blocks, fix the cause, never bypass it.
- Every model call goes through `src/core` (hooks, budget, fallback ladder, tracing). No vendor SDK import outside
  `src/providers/`.
- The LLM never computes a number; every figure in reports and answers comes from a typed query over the DB.
- Tests run offline. Every provider has a fake. Never hit the network in tests.
- Comments: one line, only when intent is not obvious. Design rationale lives in `agent-os/` and `docs/`.
- Commit messages: `<type>: <what it does>`; tests green first.

## Workflow (Agent OS)

- `agent-os/product/` (mission, roadmap, tech-stack) and `agent-os/standards/` set the frame.
- One spec per milestone in `agent-os/specs/<date>-<slug>/`: `spec.md` (goal, scope, numbered acceptance criteria,
  design), `plan.md`, `tasks.md`. Build order and decisions come from the project note; do not re-decide them.
- Order: spec -> code + tests -> `npm run typecheck` -> `npm test` -> eval report if prompts/models changed -> notes -> commit.

## Commands

```bash
npm install
npm run hooks:install        # once per clone: git pre-commit guard + tests
npm run typecheck
npm test
npm run guard -- --all       # scan the whole tree for data/secrets
```
