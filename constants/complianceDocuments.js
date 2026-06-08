/** Required compliance document types before a user can submit for admin verification. */
const {
  REQUIRED_WORKER_COMPLIANCE_DOCS,
  DOC_TYPE_LABELS,
} = require('../utils/workerDocumentCatalog.cjs');

const REQUIRED_PARTICIPANT_COMPLIANCE_DOCS = [
  'ndis_screening',
  'wwcc',
  'police_check',
  'first_aid',
  'insurance',
];

const getUploadedTypes = (documents = []) => {
  return new Set((documents || []).map((d) => d.document_type).filter(Boolean));
};

const getComplianceProgress = (documents = [], requiredTypes = []) => {
  const uploaded = getUploadedTypes(documents);
  const missing = requiredTypes.filter((t) => !uploaded.has(t));
  return {
    required: requiredTypes,
    uploadedCount: requiredTypes.length - missing.length,
    total: requiredTypes.length,
    missing,
    allUploaded: missing.length === 0,
  };
};

module.exports = {
  REQUIRED_WORKER_COMPLIANCE_DOCS,
  REQUIRED_PARTICIPANT_COMPLIANCE_DOCS,
  DOC_TYPE_LABELS,
  getUploadedTypes,
  getComplianceProgress,
};
