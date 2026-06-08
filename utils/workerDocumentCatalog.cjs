/**
 * Worker document catalog — CJS entry for Node/Express.
 */
const WORKER_DOCUMENT_CATALOG = require('./workerDocumentCatalog.json');

const REQUIRED_WORKER_COMPLIANCE_DOCS = WORKER_DOCUMENT_CATALOG.filter((d) => d.key !== 'other').map((d) => d.key);

const DOC_TYPE_LABELS = Object.fromEntries(
  WORKER_DOCUMENT_CATALOG.map((d) => [d.key, d.subtitle ? `${d.label} (${d.subtitle})` : d.label])
);

const VALID_WORKER_DOCUMENT_TYPES = WORKER_DOCUMENT_CATALOG.map((d) => d.key);

module.exports = {
  WORKER_DOCUMENT_CATALOG,
  REQUIRED_WORKER_COMPLIANCE_DOCS,
  DOC_TYPE_LABELS,
  VALID_WORKER_DOCUMENT_TYPES,
};
