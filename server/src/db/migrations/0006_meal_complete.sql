-- 0006_meal_complete.sql — let her tick a meal "complete" for the day (Breakfast/Lunch/Dinner/
-- Snacks). Purely an organizational/satisfaction flag; doesn't change calorie math.

CREATE TABLE meal_complete (
  day_date TEXT NOT NULL,
  meal_slot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (day_date, meal_slot)
);
