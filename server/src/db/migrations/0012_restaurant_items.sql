-- 0012_restaurant_items.sql — items-first dining. A restaurant's menu is now a list of whole
-- ITEMS (Big Mac, ShackBurger, a Burrito Bowl), each with its standard parts + common add-ons as
-- "modifiers" so an order is: pick item(s) → customize each → log. Nutrition is grounded in the
-- chain's OFFICIAL published numbers (pulled from the web once and cached), with a source link.

CREATE TABLE restaurant_items (
  id INTEGER PRIMARY KEY,
  restaurant TEXT NOT NULL,
  name TEXT NOT NULL,              -- item as it reads on the menu, no brand prefix
  category TEXT,                   -- burger | chicken | sandwich | nuggets | side | drink | breakfast | dessert | bowl | salad | other
  grams REAL NOT NULL DEFAULT 0,   -- base portion
  kcal REAL NOT NULL DEFAULT 0,    -- base item nutrition (with default modifiers on)
  protein_g REAL NOT NULL DEFAULT 0,
  carb_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  -- the item's parts + add-ons: [{name, kind:'part'|'addon', grams, kcal, protein_g, carb_g, fat_g, default_on}]
  modifiers_json TEXT NOT NULL DEFAULT '[]',
  confidence TEXT NOT NULL DEFAULT 'estimated',  -- official | published | estimated
  source_url TEXT,                 -- the official nutrition page/PDF it came from
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (restaurant, name)
);
CREATE INDEX idx_restaurant_items ON restaurant_items(restaurant, sort_order);

-- the build-your-own parts pool can also remember where its numbers came from
ALTER TABLE restaurant_components ADD COLUMN source_url TEXT;
