/**
 * Worker document catalog — ESM entry for Metro/Vite.
 */
import WORKER_DOCUMENT_CATALOG_JSON from './workerDocumentCatalog.json';

export const WORKER_DOCUMENT_CATALOG = WORKER_DOCUMENT_CATALOG_JSON;

export const REQUIRED_WORKER_COMPLIANCE_DOCS = WORKER_DOCUMENT_CATALOG.filter((d) => d.key !== 'other').map(
  (d) => d.key
);

export const DOC_TYPE_LABELS = Object.fromEntries(
  WORKER_DOCUMENT_CATALOG.map((d) => [d.key, d.subtitle ? `${d.label} (${d.subtitle})` : d.label])
);

export const VALID_WORKER_DOCUMENT_TYPES = WORKER_DOCUMENT_CATALOG.map((d) => d.key);
