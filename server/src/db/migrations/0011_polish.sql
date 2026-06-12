-- Polish pass: index the food_log → foods join, remember the phone's local hour on each
-- log entry (so "around this time" suggestions survive travel across timezones), and record
-- whether AI restaurant nutrition came from published chain data or is an estimate.
CREATE INDEX IF NOT EXISTS idx_food_log_food ON food_log(food_id);
ALTER TABLE food_log ADD COLUMN hour_local INTEGER;
ALTER TABLE restaurant_menu ADD COLUMN confidence TEXT;
