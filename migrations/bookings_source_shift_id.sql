-- Link bookings back to the posted shift (accept flow + repair sync).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'source_shift_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN source_shift_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bookings_source_shift_fk'
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_source_shift_fk
      FOREIGN KEY (source_shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS bookings_source_shift_id_idx
  ON bookings (source_shift_id)
  WHERE source_shift_id IS NOT NULL;
