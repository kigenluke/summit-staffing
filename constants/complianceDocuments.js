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

const {
  buildDocumentCatalogKeyMap,
  resolveDocumentCatalogKey,
  isImmunisationHistoryDocument,
} = require('../utils/workerDocumentResolver.cjs');

const IMMUNISATION_DOC_TYPES = ['flu_vaccination', 'covid_vaccine_1', 'covid_vaccine_2', 'covid_vaccine_3'];

const getUploadedTypes = (documents = []) => {
  const keyMap = buildDocumentCatalogKeyMap(documents);
  const uploaded = new Set();
  for (const d of documents || []) {
    const key = resolveDocumentCatalogKey(d, keyMap);
    if (key && key !== 'other') uploaded.add(key);
  }
  if ((documents || []).some(isImmunisationHistoryDocument)) {
    IMMUNISATION_DOC_TYPES.forEach((k) => uploaded.add(k));
  }
  return uploaded;
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
