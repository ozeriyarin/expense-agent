# Budget

- Hard cap 3 USD (also set at the Anthropic console). Soft cap 2 USD.
- Below soft: normal ladders. Between soft and hard: the walker starts at the cheapest rung of each ladder
  (degraded mode) and the status panel shows it. At hard: calls are refused with `BudgetExceededError`;
  parsing, dedup and export still work (they are deterministic).
- Cost is computed from usage x `PRICING` in `postCall` and persisted per month.
