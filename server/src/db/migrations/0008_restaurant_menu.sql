-- 0008_restaurant_menu.sql — local cache of parsed restaurant orders. The AI fetches a chain's
-- published nutrition once; we store the broken-down components here so re-building the same order
-- is instant + offline, and the numbers become your own editable dataset.

CREATE TABLE restaurant_menu (
  id INTEGER PRIMARY KEY,
  restaurant TEXT NOT NULL,
  query TEXT NOT NULL,            -- normalized (lowercased) order text she searched
  name TEXT NOT NULL,            -- nice display name from the parse
  components_json TEXT NOT NULL, -- [{name,grams,kcal,protein_g,carb_g,fat_g,default_on}]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (restaurant, query)
);
CREATE INDEX idx_restaurant_menu ON restaurant_menu(restaurant, updated_at);
