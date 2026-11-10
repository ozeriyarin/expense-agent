# Mission

expense-agent is a personal household expense assistant for one family. It takes card and bank exports (CSV/XLSX)
and a chat line, categorizes every transaction into the owner's fixed 10-category Excel taxonomy (plus income and
investments), keeps SQLite as the source of truth, exports each month into the owner's Excel template with formulas
preserved, and sends weekly and monthly summaries to Telegram.

Done for v1 = one full month imported, categorized with measured accuracy against the owner's hand-filled sheets,
and two reports delivered.

Secondary goal: a portfolio-grade, reusable LLM core (hooks, budget, fallback ladders, parallelism, tracing, evals)
under a small monthly API cap.
