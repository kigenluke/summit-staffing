-- Optional explicit catalog key when document_type is legacy "other" (admin uploads).
ALTER TABLE worker_documents
  ADD COLUMN IF NOT EXISTS compliance_item_key TEXT;

CREATE INDEX IF NOT EXISTS worker_documents_compliance_item_key_idx
  ON worker_documents (compliance_item_key)
  WHERE compliance_item_key IS NOT NULL;
