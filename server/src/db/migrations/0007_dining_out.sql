-- 0007_dining_out.sql — "Dining Out": foods can belong to a restaurant and be flagged as eating
-- out; logged entries carry the flag (denormalized) so we can gently count meals eaten out.

ALTER TABLE foods ADD COLUMN restaurant TEXT;
ALTER TABLE foods ADD COLUMN eating_out INTEGER NOT NULL DEFAULT 0;
ALTER TABLE food_log ADD COLUMN eating_out INTEGER NOT NULL DEFAULT 0;
