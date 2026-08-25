-- Per-call ledger for metered Anthropic usage.
--
-- There was no accounting at all: ~20 endpoints, several with web_search and web_fetch
-- enabled, and no way to answer "what has this cost me this month" or to stop a loop
-- from running up a bill unattended.
--
-- One row per API call. Cost is stored as micro-dollars (integer) rather than a float,
-- so summing a month of rows cannot drift.
CREATE TABLE IF NOT EXISTS ai_usage (
  id            INTEGER PRIMARY KEY,
  day_date      TEXT    NOT NULL,          -- local YYYY-MM-DD, for the monthly rollup
  feature       TEXT    NOT NULL,          -- which call site: 'chat', 'mealplan', ...
  model         TEXT    NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micros   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
);

-- The hot query is "sum cost_micros for the current month".
CREATE INDEX IF NOT EXISTS idx_ai_usage_day ON ai_usage (day_date);
