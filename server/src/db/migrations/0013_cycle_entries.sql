-- Period tracking. One row per period; end_date NULL while in progress.
-- estimated = 1 marks a period penciled in for an untracked month ("skip"): it anchors the
-- next prediction but is excluded from the cycle-length / duration averages.
-- History is imported at runtime via POST /api/cycle/import — never seeded here.
CREATE TABLE cycle_entries (
  id INTEGER PRIMARY KEY,
  start_date TEXT NOT NULL UNIQUE,
  end_date TEXT,
  estimated INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
