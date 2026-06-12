require('dotenv').config();
const pool = require('../config/database');
const { REQUIRED_WORKER_COMPLIANCE_DOCS } = require('../utils/workerDocumentCatalog.cjs');
const { getComplianceProgress } = require('../constants/complianceDocuments');

(async () => {
  const r = await pool.query(
    `SELECT id, document_type, compliance_item_key, file_url, status, created_at
     FROM worker_documents WHERE worker_id = 'a3612868-b6a1-4cf1-a3b6-3d8883291920' ORDER BY created_at`
  );
  const progress = getComplianceProgress(r.rows, REQUIRED_WORKER_COMPLIANCE_DOCS);
  console.log('Luke app progress:', `${progress.uploadedCount}/${progress.total}`);
  console.log('Missing:', progress.missing);
  await pool.end();
})();
