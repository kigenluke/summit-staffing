export const REQUIRED_WORKER_COMPLIANCE_DOCS = [
  'ndis_screening',
  'wwcc',
  'police_check',
  'first_aid',
  'insurance',
];

export const REQUIRED_PARTICIPANT_COMPLIANCE_DOCS = [
  'ndis_screening',
  'wwcc',
  'police_check',
  'first_aid',
  'insurance',
];

export const DOC_TYPE_LABELS = {
  ndis_screening: 'NDIS Screening',
  wwcc: 'WWCC / Blue Card',
  yellow_card: 'Yellow Card (QLD)',
  police_check: 'Police Check',
  first_aid: 'First Aid',
  manual_handling: 'Manual Handling',
  insurance: 'Insurance',
  other: 'Other',
};

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
