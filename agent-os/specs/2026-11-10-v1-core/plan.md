# Plan

1. Guards before code: `.gitignore`, `scripts/guard-staged.mjs`, `.githooks/pre-commit`, `.claude/settings.json`.
2. Repo docs: `CLAUDE.md`, `README.md`, `docs/decisions.md`, `agent-os/product`, `agent-os/standards`.
3. Core types and pricing, then budget, then ladders as data.
4. Fake provider, then the walker with retry-then-drop, then default hooks wired through the walker.
5. Concurrency helper and speculative guard, both provider-agnostic.
6. Tracing: redaction first (pure function, tested), then OTel tracer with in-memory and JSONL exporters,
   then spans added to hooks, walker and batches.
7. Thin Anthropic and Gemini adapters (compile, no network test).
8. Tests per acceptance criterion; typecheck; first commit; then ask about the GitHub remote.
