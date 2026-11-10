# Testing

- vitest, offline. Every provider has a fake (`src/providers/fake.ts`) driven by a script of responses.
- Every acceptance criterion in a spec maps to a named test (`criterion N` in the test title).
- Pre-commit: guard then tests, via `.githooks/pre-commit` and the Claude Code PreToolUse hook.
