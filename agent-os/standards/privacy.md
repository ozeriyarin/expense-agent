# Privacy

- Private data lives in `EXPENSE_DATA_DIR`, never in the repo. `.gitignore` + `scripts/guard-staged.mjs` enforce it.
- Traces and logs pass through `redact()`: amounts become `<amt>`, merchant names `<merchant:hash6>`, account and
  card identifiers `<acct>`. Only categories, counts, latencies, token usage and cost stay in clear text.
- Tests use synthetic fixtures with invented merchants and amounts.
