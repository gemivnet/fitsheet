-- 0001_init.sql — fitsheet schema. Single implicit user; no auth in v1 (Tailscale is the boundary).
-- Dates are 'YYYY-MM-DD' TEXT; timestamps are ISO TEXT. Weights stored in lb (canonical).

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO users (id, display_name, created_at) VALUES (1, 'me', '1970-01-01T00:00:00.000Z');

-- Key/value settings + goals. JSON values for structured ones.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE foods (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  source TEXT NOT NULL,            -- 'off' | 'custom' | 'ai_label'
  off_id TEXT,
  serving_g REAL,
  serving_label TEXT,
  kcal_100g REAL NOT NULL,
  protein_100g REAL NOT NULL DEFAULT 0,
  carb_100g REAL NOT NULL DEFAULT 0,
  fat_100g REAL NOT NULL DEFAULT 0,
  label_photo TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_foods_barcode ON foods(barcode);
CREATE INDEX idx_foods_name ON foods(name);

CREATE TABLE food_log (
  id INTEGER PRIMARY KEY,
  day_date TEXT NOT NULL,
  meal_slot TEXT NOT NULL,         -- 'breakfast' | 'lunch' | 'dinner' | 'snacks'
  food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,
  name TEXT NOT NULL,              -- denormalized snapshot
  grams REAL NOT NULL,
  kcal REAL NOT NULL,
  protein REAL NOT NULL DEFAULT 0,
  carb REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_food_log_day ON food_log(day_date, meal_slot, sort_order);

CREATE TABLE weight_entries (
  id INTEGER PRIMARY KEY,
  entry_date TEXT NOT NULL UNIQUE,
  weight_lb REAL NOT NULL,
  trend_lb REAL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_weight_date ON weight_entries(entry_date);

CREATE TABLE weight_photos (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER REFERENCES weight_entries(id) ON DELETE SET NULL,
  taken_date TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  caption TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_weight_photos_date ON weight_photos(taken_date);

CREATE TABLE workouts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'planned',  -- 'planned' | 'adhoc'
  scheduled_date TEXT,
  planned_minutes INTEGER,
  external_url TEXT,
  notes TEXT,
  completed_at TEXT,
  completed_minutes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workouts_date ON workouts(scheduled_date);

CREATE TABLE walk_presets (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  default_minutes INTEGER,
  default_distance REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE walk_log (
  id INTEGER PRIMARY KEY,
  walk_date TEXT NOT NULL,
  preset_id INTEGER REFERENCES walk_presets(id) ON DELETE SET NULL,
  label TEXT,
  minutes INTEGER,
  distance REAL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_walk_log_date ON walk_log(walk_date);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  note_date TEXT NOT NULL,
  body TEXT NOT NULL,
  mood TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_notes_date ON notes(note_date);

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  approx_kcal INTEGER,
  cook_band TEXT,                  -- 'under_30' | '30_60' | 'over_60'
  photo TEXT,
  ingredients TEXT,
  steps TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE milestones (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,              -- 'weight_loss'
  threshold_lb REAL NOT NULL,
  achieved_date TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_milestones_kind_threshold ON milestones(kind, threshold_lb);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id),
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,            -- 'create' | 'update' | 'delete'
  diff_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
