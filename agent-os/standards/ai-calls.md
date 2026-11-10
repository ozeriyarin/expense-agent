# AI calls

- Every call goes through `core.call(step, request)`; no vendor SDK outside `src/providers/`.
- A step names a ladder (`LADDERS[step]`); the walker tries rungs in order with retry-then-drop semantics.
- Hooks run in a fixed order: `preCall` (rules guard, budget) -> provider -> `postCall` (cost, log, trace) or
  `onFailure` (classify, retry or drop to the next rung).
- Structured output via zod schema; the schema is declared once and adapted per provider.
- Prompt caching: stable system prompt + few-shot block first, volatile content last. Verify with
  `cache_read_input_tokens` in traces.
- The model never computes a number.
