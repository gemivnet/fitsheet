-- 0002 — let recipes be favorited (pinned to the top of the gallery).
ALTER TABLE recipes ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_recipes_favorite ON recipes(is_favorite);
