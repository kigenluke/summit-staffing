export {
  WORKER_DOCUMENT_CATALOG,
  REQUIRED_WORKER_COMPLIANCE_DOCS,
  DOC_TYPE_LABELS,
} from './workerDocumentCatalog.js';

export const REQUIRED_PARTICIPANT_COMPLIANCE_DOCS = [
  'ndis_screening',
  'wwcc',
  'police_check',
  'first_aid',
  'insurance',
];

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getLatestDocumentForType(documents = [], documentType) {
  return (documents || [])
    .filter((d) => d.document_type === documentType)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

export function getComplianceProgress(documents = [], requiredTypes = []) {
  const uploaded = new Set(
    requiredTypes.filter((t) => Boolean(getLatestDocumentForType(documents, t)))
  );
  const missing = requiredTypes.filter((t) => !uploaded.has(t));
  return {
    uploadedCount: requiredTypes.length - missing.length,
    total: requiredTypes.length,
    missing,
    allUploaded: missing.length === 0,
  };
}

/** True when status is expired or expiry_date is before today (local calendar day). */
export function isDocumentExpired(doc) {
  if (!doc) return false;
  const st = String(doc.status || '').toLowerCase();
  if (st === 'expired') return true;
  if (!doc.expiry_date) return false;
  const expDay = startOfDay(doc.expiry_date);
  if (Number.isNaN(expDay.getTime())) return false;
  const today = startOfDay(new Date());
  return today > expDay;
}

export function getWeeksUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const exp = startOfDay(expiryDate);
  const today = startOfDay(new Date());
  const diffMs = exp - today;
  if (diffMs <= 0) return 0;
  return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

export function getWeeksSinceExpiry(expiryDate) {
  if (!expiryDate) return null;
  const exp = startOfDay(expiryDate);
  const today = startOfDay(new Date());
  const diffMs = today - exp;
  if (diffMs <= 0) return 0;
  const weeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return weeks < 1 ? 1 : weeks;
}

/** Within N calendar days before expiry (not yet expired). */
export function isDocumentExpiringSoon(doc, withinDays = 28) {
  if (!doc || isDocumentExpired(doc) || !doc.expiry_date) return false;
  const exp = startOfDay(doc.expiry_date);
  const today = startOfDay(new Date());
  const diffMs = exp - today;
  return diffMs > 0 && diffMs <= withinDays * 24 * 60 * 60 * 1000;
}

/** Mobility-style checklist line + icon for a document row. */
export function getDocumentChecklistStatus(doc) {
  if (!doc) {
    return { visualStatus: 'missing', message: null, iconKey: 'plus' };
  }
  if (isDocumentExpired(doc)) {
    const weeks = getWeeksSinceExpiry(doc.expiry_date);
    const ago = weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    return {
      visualStatus: 'expired',
      message: `Document expired ${ago}, add a replacement`,
      iconKey: 'alert',
    };
  }
  if (isDocumentExpiringSoon(doc)) {
    const weeks = getWeeksUntilExpiry(doc.expiry_date);
    const inTxt = weeks === 1 ? '1 week' : `${weeks} weeks`;
    return {
      visualStatus: 'expiring',
      message: `Document expiring in ${inTxt}, add a replacement`,
      iconKey: 'clock',
    };
  }
  const st = String(doc.status || '').toLowerCase();
  if (st === 'approved') {
    return { visualStatus: 'verified', message: 'Verified by Summit Staffing', iconKey: 'check' };
  }
  if (st === 'rejected') {
    return {
      visualStatus: 'rejected',
      message: doc.rejection_reason || 'Rejected — upload a replacement',
      iconKey: 'alert',
    };
  }
  if (st === 'pending') {
    return { visualStatus: 'pending', message: 'Pending admin review', iconKey: 'clock' };
  }
  return { visualStatus: 'pending', message: 'Uploaded — awaiting review', iconKey: 'clock' };
}

/** Required compliance docs that exist but are past expiry (or marked expired). */
export function getExpiredComplianceDocuments(documents = [], requiredTypes = [], labels = {}) {
  const expired = [];
  for (const type of requiredTypes) {
    const doc = getLatestDocumentForType(documents, type);
    if (!doc || !isDocumentExpired(doc)) continue;
    expired.push({
      documentType: type,
      label: labels[type] || type,
      expiry_date: doc.expiry_date || null,
      status: doc.status || null,
    });
  }
  return expired;
}
