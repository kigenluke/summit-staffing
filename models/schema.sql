BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS postgis; -- Not available on Railway

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('worker', 'participant', 'admin', 'coordinator');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_verification_status') THEN
    CREATE TYPE worker_verification_status AS ENUM ('pending', 'verified', 'rejected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_document_type') THEN
    CREATE TYPE worker_document_type AS ENUM ('ndis_screening', 'wwcc', 'yellow_card', 'police_check', 'first_aid', 'manual_handling', 'insurance', 'other');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_document_status') THEN
    CREATE TYPE worker_document_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_management_type') THEN
    CREATE TYPE participant_management_type AS ENUM ('self', 'plan_managed', 'ndia');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status') THEN
    CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'coordinator';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_document_type') THEN
    ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'yellow_card';
    ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'manual_handling';
    ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'other';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'bookings'
  ) THEN
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS decline_reason TEXT;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_reason TEXT,
  suspended_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format_chk CHECK (position('@' in email) > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_last_login_at_idx ON users (last_login_at);
CREATE INDEX IF NOT EXISTS users_is_suspended_idx ON users (is_suspended);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_suspended'
  ) THEN
    ALTER TABLE users ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'suspended_reason'
  ) THEN
    ALTER TABLE users ADD COLUMN suspended_reason TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'suspended_at'
  ) THEN
    ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_push_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_push_tokens_token_uq UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx ON user_push_tokens (user_id);

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  terms_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT terms_acceptances_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT terms_acceptances_user_version_uq UNIQUE (user_id, terms_version)
);

CREATE INDEX IF NOT EXISTS terms_acceptances_user_id_idx ON terms_acceptances (user_id);

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id UUID PRIMARY KEY,
  onboarding_completed_at TIMESTAMPTZ,
  profile_setup_completed_at TIMESTAMPTZ,
  profile_setup_skipped_at TIMESTAMPTZ,
  permissions_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_onboarding_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_onboarding_completed_idx ON user_onboarding (onboarding_completed_at);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_verification_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT email_verification_tokens_token_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx ON email_verification_tokens (user_id);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_at_idx ON email_verification_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT password_reset_tokens_token_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  abn CHAR(11) NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  hourly_rate NUMERIC(10,2),
  weekly_earnings_goal NUMERIC(10,2),
  monthly_earnings_target NUMERIC(10,2),
  max_travel_km NUMERIC(6,2),
  bio TEXT,
  profile_image_url TEXT,
  verification_status worker_verification_status NOT NULL DEFAULT 'pending',
  rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  stripe_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workers_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT workers_abn_digits_chk CHECK (abn ~ '^[0-9]{11}$'),
  CONSTRAINT workers_hourly_rate_nonneg_chk CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  CONSTRAINT workers_weekly_earnings_goal_nonneg_chk CHECK (weekly_earnings_goal IS NULL OR weekly_earnings_goal >= 0),
  CONSTRAINT workers_monthly_earnings_target_nonneg_chk CHECK (monthly_earnings_target IS NULL OR monthly_earnings_target >= 0),
  CONSTRAINT workers_max_travel_km_nonneg_chk CHECK (max_travel_km IS NULL OR max_travel_km >= 0),
  CONSTRAINT workers_latitude_range_chk CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT workers_longitude_range_chk CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT workers_rating_range_chk CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT workers_total_reviews_nonneg_chk CHECK (total_reviews >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS workers_abn_uq_idx ON workers (abn);
CREATE INDEX IF NOT EXISTS workers_user_id_idx ON workers (user_id);
CREATE INDEX IF NOT EXISTS workers_location_idx ON workers (latitude, longitude);
CREATE INDEX IF NOT EXISTS workers_hourly_rate_idx ON workers (hourly_rate);
-- PostGIS GIST index skipped (postgis not available on Railway)
-- CREATE INDEX IF NOT EXISTS workers_location_geog_gist_idx
--   ON workers
--   USING GIST ((ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography))
--   WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS worker_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  document_type worker_document_type NOT NULL,
  file_url TEXT NOT NULL,
  issue_date DATE,
  expiry_date DATE,
  status worker_document_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_documents_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  CONSTRAINT worker_documents_expiry_after_issue_chk CHECK (issue_date IS NULL OR expiry_date IS NULL OR expiry_date >= issue_date)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_documents' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE worker_documents ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workers' AND column_name = 'weekly_earnings_goal'
  ) THEN
    ALTER TABLE workers ADD COLUMN weekly_earnings_goal NUMERIC(10,2);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workers' AND column_name = 'monthly_earnings_target'
  ) THEN
    ALTER TABLE workers ADD COLUMN monthly_earnings_target NUMERIC(10,2);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workers' AND column_name = 'max_travel_km'
  ) THEN
    ALTER TABLE workers ADD COLUMN max_travel_km NUMERIC(6,2);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS worker_documents_worker_id_idx ON worker_documents (worker_id);
CREATE INDEX IF NOT EXISTS worker_documents_status_idx ON worker_documents (status);
CREATE INDEX IF NOT EXISTS worker_documents_type_idx ON worker_documents (document_type);

CREATE TABLE IF NOT EXISTS worker_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  skill_name VARCHAR(100) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT worker_skills_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  CONSTRAINT worker_skills_unique_skill_per_worker_uq UNIQUE (worker_id, skill_name)
);

CREATE INDEX IF NOT EXISTS worker_skills_worker_id_idx ON worker_skills (worker_id);

CREATE TABLE IF NOT EXISTS worker_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL,
  start_time TIME,
  end_time TIME,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT worker_availability_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  CONSTRAINT worker_availability_day_of_week_chk CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT worker_availability_time_range_chk CHECK (start_time IS NULL OR end_time IS NULL OR end_time <> start_time)
);

CREATE INDEX IF NOT EXISTS worker_availability_worker_id_idx ON worker_availability (worker_id);
CREATE INDEX IF NOT EXISTS worker_availability_day_idx ON worker_availability (day_of_week);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'worker_availability'
      AND constraint_name = 'worker_availability_time_range_chk'
  ) THEN
    ALTER TABLE worker_availability DROP CONSTRAINT worker_availability_time_range_chk;
  END IF;

  ALTER TABLE worker_availability
    ADD CONSTRAINT worker_availability_time_range_chk
    CHECK (start_time IS NULL OR end_time IS NULL OR end_time <> start_time);
END $$;

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  ndis_number CHAR(10),
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  profile_image_url TEXT,
  plan_manager_name TEXT,
  plan_manager_email TEXT,
  plan_manager_phone TEXT,
  monthly_budget NUMERIC(10,2),
  management_type participant_management_type NOT NULL DEFAULT 'self',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participants_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT participants_ndis_digits_chk CHECK (ndis_number IS NULL OR ndis_number ~ '^[0-9]{10}$'),
  CONSTRAINT participants_latitude_range_chk CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT participants_longitude_range_chk CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT participants_plan_manager_email_format_chk CHECK (plan_manager_email IS NULL OR position('@' in plan_manager_email) > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS participants_ndis_number_uq_idx ON participants (ndis_number);
CREATE INDEX IF NOT EXISTS participants_user_id_idx ON participants (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'profile_image_url'
  ) THEN
    ALTER TABLE participants ADD COLUMN profile_image_url TEXT;
  END IF;
END $$;

-- Participant sign-up onboarding (client sign-up flow)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participants' AND column_name = 'who_needs_support') THEN
    ALTER TABLE participants ADD COLUMN who_needs_support TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participants' AND column_name = 'when_start_looking') THEN
    ALTER TABLE participants ADD COLUMN when_start_looking TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participants' AND column_name = 'over_18') THEN
    ALTER TABLE participants ADD COLUMN over_18 BOOLEAN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participants' AND column_name = 'funding_type') THEN
    ALTER TABLE participants ADD COLUMN funding_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participants' AND column_name = 'monthly_budget') THEN
    ALTER TABLE participants ADD COLUMN monthly_budget NUMERIC(10,2);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL,
  worker_id UUID NOT NULL,
  service_type VARCHAR(100) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending',
  location_address TEXT,
  location_lat NUMERIC(9,6),
  location_lng NUMERIC(9,6),
  special_instructions TEXT,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_participant_fk FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE RESTRICT,
  CONSTRAINT bookings_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE RESTRICT,
  CONSTRAINT bookings_time_range_chk CHECK (end_time > start_time),
  CONSTRAINT bookings_total_amount_nonneg_chk CHECK (total_amount >= 0),
  CONSTRAINT bookings_commission_amount_nonneg_chk CHECK (commission_amount >= 0),
  CONSTRAINT bookings_location_latitude_range_chk CHECK (location_lat IS NULL OR (location_lat >= -90 AND location_lat <= 90)),
  CONSTRAINT bookings_location_longitude_range_chk CHECK (location_lng IS NULL OR (location_lng >= -180 AND location_lng <= 180))
);

CREATE INDEX IF NOT EXISTS bookings_participant_id_idx ON bookings (participant_id);
CREATE INDEX IF NOT EXISTS bookings_worker_id_idx ON bookings (worker_id);
CREATE INDEX IF NOT EXISTS bookings_start_time_status_idx ON bookings (start_time, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'hourly_rate'
  ) THEN
    ALTER TABLE bookings ADD COLUMN hourly_rate NUMERIC(10,2);
    ALTER TABLE bookings ADD CONSTRAINT bookings_hourly_rate_nonneg_chk
      CHECK (hourly_rate IS NULL OR hourly_rate >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS booking_timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE,
  clock_in_time TIMESTAMPTZ,
  clock_out_time TIMESTAMPTZ,
  clock_in_lat NUMERIC(9,6),
  clock_in_lng NUMERIC(9,6),
  clock_out_lat NUMERIC(9,6),
  clock_out_lng NUMERIC(9,6),
  actual_hours NUMERIC(10,2),
  notes TEXT,
  CONSTRAINT booking_timesheets_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT booking_timesheets_clock_out_after_in_chk CHECK (clock_in_time IS NULL OR clock_out_time IS NULL OR clock_out_time >= clock_in_time),
  CONSTRAINT booking_timesheets_actual_hours_nonneg_chk CHECK (actual_hours IS NULL OR actual_hours >= 0),
  CONSTRAINT booking_timesheets_clock_in_latitude_range_chk CHECK (clock_in_lat IS NULL OR (clock_in_lat >= -90 AND clock_in_lat <= 90)),
  CONSTRAINT booking_timesheets_clock_in_longitude_range_chk CHECK (clock_in_lng IS NULL OR (clock_in_lng >= -180 AND clock_in_lng <= 180)),
  CONSTRAINT booking_timesheets_clock_out_latitude_range_chk CHECK (clock_out_lat IS NULL OR (clock_out_lat >= -90 AND clock_out_lat <= 90)),
  CONSTRAINT booking_timesheets_clock_out_longitude_range_chk CHECK (clock_out_lng IS NULL OR (clock_out_lng >= -180 AND clock_out_lng <= 180))
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE,
  invoice_number VARCHAR(50) NOT NULL,
  worker_abn VARCHAR(11),
  participant_ndis VARCHAR(10),
  service_date DATE,
  service_description TEXT,
  ndis_support_item_code VARCHAR(20),
  hours NUMERIC(10,2),
  rate NUMERIC(10,2),
  subtotal NUMERIC(10,2),
  gst NUMERIC(10,2),
  total NUMERIC(10,2),
  status invoice_status NOT NULL DEFAULT 'draft',
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoices_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT invoices_invoice_number_uq UNIQUE (invoice_number),
  CONSTRAINT invoices_worker_abn_digits_chk CHECK (worker_abn IS NULL OR worker_abn ~ '^[0-9]{11}$'),
  CONSTRAINT invoices_participant_ndis_digits_chk CHECK (participant_ndis IS NULL OR participant_ndis ~ '^[0-9]{10}$'),
  CONSTRAINT invoices_hours_nonneg_chk CHECK (hours IS NULL OR hours >= 0),
  CONSTRAINT invoices_rate_nonneg_chk CHECK (rate IS NULL OR rate >= 0),
  CONSTRAINT invoices_subtotal_nonneg_chk CHECK (subtotal IS NULL OR subtotal >= 0),
  CONSTRAINT invoices_gst_nonneg_chk CHECK (gst IS NULL OR gst >= 0),
  CONSTRAINT invoices_total_nonneg_chk CHECK (total IS NULL OR total >= 0)
);

CREATE INDEX IF NOT EXISTS invoices_booking_id_idx ON invoices (booking_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_transfer_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  commission NUMERIC(10,2) NOT NULL DEFAULT 0,
  worker_payout NUMERIC(10,2) NOT NULL DEFAULT 0,
  status payment_status NOT NULL DEFAULT 'pending',
  payment_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT payments_stripe_payment_intent_uq UNIQUE (stripe_payment_intent_id),
  CONSTRAINT payments_stripe_transfer_id_uq UNIQUE (stripe_transfer_id),
  CONSTRAINT payments_amount_nonneg_chk CHECK (amount >= 0),
  CONSTRAINT payments_commission_nonneg_chk CHECK (commission >= 0),
  CONSTRAINT payments_worker_payout_nonneg_chk CHECK (worker_payout >= 0)
);

CREATE INDEX IF NOT EXISTS payments_booking_id_idx ON payments (booking_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_payment_intent_idx ON payments (stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS payments_transfer_id_idx ON payments (stripe_transfer_id);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE,
  reviewer_id UUID NOT NULL,
  reviewee_id UUID NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason TEXT,
  flagged_by UUID,
  flagged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reviews_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT reviews_reviewer_fk FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT reviews_reviewee_fk FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT reviews_flagged_by_fk FOREIGN KEY (flagged_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reviews_rating_range_chk CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX IF NOT EXISTS reviews_reviewee_id_idx ON reviews (reviewee_id);
CREATE INDEX IF NOT EXISTS reviews_reviewer_id_idx ON reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS reviews_is_flagged_idx ON reviews (is_flagged);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'reviews'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'reviews_booking_id_key'
  ) THEN
    ALTER TABLE reviews DROP CONSTRAINT reviews_booking_id_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'reviews'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'reviews_booking_reviewer_uq'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_booking_reviewer_uq UNIQUE (booking_id, reviewer_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'incident_reported'
  ) THEN
    ALTER TABLE reviews ADD COLUMN incident_reported BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reviews' AND column_name = 'incident_details'
  ) THEN
    ALTER TABLE reviews ADD COLUMN incident_details TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'messages'
      AND column_name = 'conversation_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE messages
      ALTER COLUMN conversation_id TYPE TEXT USING conversation_id::text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  message_text TEXT,
  read_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_sender_fk FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT messages_receiver_fk FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages (sender_id);
CREATE INDEX IF NOT EXISTS messages_receiver_id_idx ON messages (receiver_id);

-- ============================================================
-- Shifts & Shift Applications
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_status') THEN
    CREATE TYPE shift_status AS ENUM ('open', 'filled', 'in_progress', 'completed', 'cancelled');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  service_type VARCHAR(100) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  hourly_rate NUMERIC(10,2) NOT NULL,
  location TEXT,
  required_skills TEXT[] DEFAULT '{}',
  status shift_status NOT NULL DEFAULT 'open',
  filled_by_worker_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shifts_participant_fk FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT shifts_filled_by_worker_fk FOREIGN KEY (filled_by_worker_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT shifts_time_range_chk CHECK (end_time > start_time),
  CONSTRAINT shifts_hourly_rate_nonneg_chk CHECK (hourly_rate >= 0)
);

CREATE INDEX IF NOT EXISTS shifts_participant_id_idx ON shifts (participant_id);
CREATE INDEX IF NOT EXISTS shifts_filled_by_worker_id_idx ON shifts (filled_by_worker_id);
CREATE INDEX IF NOT EXISTS shifts_status_idx ON shifts (status);
CREATE INDEX IF NOT EXISTS shifts_start_time_idx ON shifts (start_time);

CREATE TABLE IF NOT EXISTS shift_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL,
  worker_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shift_applications_shift_fk FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  CONSTRAINT shift_applications_worker_fk FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT shift_applications_unique_per_shift UNIQUE (shift_id, worker_id)
);

CREATE INDEX IF NOT EXISTS shift_applications_shift_id_idx ON shift_applications (shift_id);
CREATE INDEX IF NOT EXISTS shift_applications_worker_id_idx ON shift_applications (worker_id);

-- ============================================================
-- Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type VARCHAR(50),
  data JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC);

-- ============================================================
-- Coordinator <-> Participant Access Requests
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coordinator_access_status') THEN
    CREATE TYPE coordinator_access_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS coordinator_participant_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_user_id UUID NOT NULL,
  participant_user_id UUID NOT NULL,
  status coordinator_access_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  CONSTRAINT coordinator_access_coordinator_fk FOREIGN KEY (coordinator_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT coordinator_access_participant_fk FOREIGN KEY (participant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT coordinator_access_unique_pair UNIQUE (coordinator_user_id, participant_user_id)
);

CREATE INDEX IF NOT EXISTS coordinator_access_coordinator_idx ON coordinator_participant_access (coordinator_user_id, status);
CREATE INDEX IF NOT EXISTS coordinator_access_participant_idx ON coordinator_participant_access (participant_user_id, status);

-- ============================================================
-- Worker Incidents & Complaints
-- ============================================================
CREATE TABLE IF NOT EXISTS worker_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  incident_name TEXT NOT NULL,
  incident_details TEXT,
  image_urls TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_incidents_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

-- Triage / IMS fields (added for 2026 audit-ready incident handling)
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS triage_category TEXT;
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS called_000 BOOLEAN DEFAULT FALSE;
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS is_reportable BOOLEAN DEFAULT FALSE;
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS incident_status TEXT DEFAULT 'received';
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS admin_handover_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS worker_incidents_worker_id_idx ON worker_incidents (worker_id);
CREATE INDEX IF NOT EXISTS worker_incidents_created_at_idx ON worker_incidents (created_at DESC);

CREATE TABLE IF NOT EXISTS worker_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  complaint_details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_complaints_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS worker_complaints_worker_id_idx ON worker_complaints (worker_id);
CREATE INDEX IF NOT EXISTS worker_complaints_created_at_idx ON worker_complaints (created_at DESC);

COMMIT;
