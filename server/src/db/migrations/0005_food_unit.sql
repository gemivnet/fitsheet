-- 0005_food_unit.sql — let a food define a named piece ("sausage", "slice", "cookie") so she
-- can log a count ("3 sausages") instead of grams. serving_g doubles as grams-per-piece.

ALTER TABLE foods ADD COLUMN unit_name TEXT;
