-- 0004_bank_snooze.sql — let her "snooze" the weekly calorie bank for a single day, so that
-- day uses the plain goal instead of the banked target. One row per snoozed date.

CREATE TABLE bank_snooze (
  day_date TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
