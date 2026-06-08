-- Expand worker_document_type enum for full compliance checklist.
-- Safe to run multiple times (IF NOT EXISTS).

DO $$ BEGIN
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'aged_care_cert';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'aged_care_transcript';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'assistant_in_nursing';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'covid_vaccine_1';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'covid_vaccine_2';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'covid_vaccine_3';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'cpr_qualification';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'disability_care_cert';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'disability_care_transcript';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'drivers_license';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'flu_vaccination';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'ndis_orientation';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'passport';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'specialised_support_dementia';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'statutory_declaration_aged_care';
  ALTER TYPE worker_document_type ADD VALUE IF NOT EXISTS 'vehicle_insurance';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'worker_document_type enum does not exist yet — run models/schema.sql first';
END $$;
