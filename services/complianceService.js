const pool = require('../config/database');
const {
  REQUIRED_WORKER_COMPLIANCE_DOCS,
  REQUIRED_PARTICIPANT_COMPLIANCE_DOCS,
  getComplianceProgress,
} = require('../constants/complianceDocuments');

const loadWorkerDocuments = async (workerId) => {
  const res = await pool.query(
    'SELECT id, document_type, file_url, compliance_item_key, created_at FROM worker_documents WHERE worker_id = $1',
    [workerId]
  );
  return res.rows;
};

const loadParticipantDocuments = async (participantId) => {
  const res = await pool.query(
    'SELECT document_type, status FROM participant_documents WHERE participant_id = $1',
    [participantId]
  );
  return res.rows;
};

const submitWorkerVerification = async (workerId) => {
  const docs = await loadWorkerDocuments(workerId);
  const progress = getComplianceProgress(docs, REQUIRED_WORKER_COMPLIANCE_DOCS);
  if (!progress.allUploaded) {
    return {
      ok: false,
      status: 400,
      error: `Upload all required documents first (${progress.uploadedCount}/${progress.total} complete). Missing: ${progress.missing.join(', ')}`,
      progress,
    };
  }

  await pool.query(
    `UPDATE workers
     SET verification_status = 'pending',
         verification_submitted_at = COALESCE(verification_submitted_at, now()),
         updated_at = now()
     WHERE id = $1`,
    [workerId]
  );

  return {
    ok: true,
    status: 200,
    message: 'Submitted for verification. Please await admin approval.',
    progress,
  };
};

const submitParticipantVerification = async (participantId) => {
  const docs = await loadParticipantDocuments(participantId);
  const progress = getComplianceProgress(docs, REQUIRED_PARTICIPANT_COMPLIANCE_DOCS);
  if (!progress.allUploaded) {
    return {
      ok: false,
      status: 400,
      error: `Upload all required documents first (${progress.uploadedCount}/${progress.total} complete). Missing: ${progress.missing.join(', ')}`,
      progress,
    };
  }

  await pool.query(
    `UPDATE participants
     SET verification_status = 'pending',
         verification_submitted_at = COALESCE(verification_submitted_at, now()),
         updated_at = now()
     WHERE id = $1`,
    [participantId]
  );

  return {
    ok: true,
    status: 200,
    message: 'Submitted for verification. Please await admin approval.',
    progress,
  };
};

module.exports = {
  REQUIRED_WORKER_COMPLIANCE_DOCS,
  REQUIRED_PARTICIPANT_COMPLIANCE_DOCS,
  getComplianceProgress,
  submitWorkerVerification,
  submitParticipantVerification,
};
