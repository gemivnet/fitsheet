-- 0003_food_prefs.sql — remember how a food was last entered so re-adding is one tap.
-- pref_unit_mode: 'grams' | 'servings' (the toggle she used last time for this food).
-- last_grams: the amount (in grams) she logged last time, used to pre-fill the numpad.

ALTER TABLE foods ADD COLUMN pref_unit_mode TEXT;
ALTER TABLE foods ADD COLUMN last_grams REAL;
