-- Store GPS for shift work location (clock-in / distance)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS location_lat NUMERIC(9,6);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS location_lng NUMERIC(9,6);
