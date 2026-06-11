-- 0009_restaurant_components.sql — a reusable, editable menu of build-your-own parts per
-- restaurant (Chipotle: white rice, chicken, beans, guac…). The AI populates it when it parses an
-- order; she can edit values or add her own. Orders are assembled from these with a portion level.

CREATE TABLE restaurant_components (
  id INTEGER PRIMARY KEY,
  restaurant TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,                  -- base | protein | beans | topping | salsa | cheese | side | sauce | other
  grams REAL NOT NULL DEFAULT 0,
  kcal REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carb_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  default_on INTEGER NOT NULL DEFAULT 1,   -- typically included in a standard order
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (restaurant, name)
);
CREATE INDEX idx_restaurant_components ON restaurant_components(restaurant);
