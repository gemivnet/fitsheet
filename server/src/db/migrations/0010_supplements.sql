-- 0010_supplements.sql — vitamins & medications she manages in Settings, with a per-day "taken"
-- check. supplement_log holds one row per (supplement, day) when taken.

CREATE TABLE supplements (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE supplement_log (
  supplement_id INTEGER NOT NULL,
  day_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (supplement_id, day_date)
);
