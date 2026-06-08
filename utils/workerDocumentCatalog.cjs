/**
 * Full worker compliance document checklist (Summit Staffing).
 * Shared by API validation and frontend via workerDocumentCatalog.js re-export.
 */
const WORKER_DOCUMENT_CATALOG = [
  { key: 'aged_care_cert', label: 'Aged Care Certificate III, IV, or V' },
  { key: 'aged_care_transcript', label: 'Aged Care Course Transcript' },
  { key: 'assistant_in_nursing', label: 'Assistant In Nursing Certification' },
  { key: 'wwcc', label: 'Blue Card - Working With Children' },
  { key: 'covid_vaccine_1', label: 'Covid Vaccine 1' },
  { key: 'covid_vaccine_2', label: 'Covid Vaccine 2' },
  { key: 'covid_vaccine_3', label: 'Covid Vaccine 3' },
  { key: 'cpr_qualification', label: 'CPR qualification' },
  { key: 'disability_care_cert', label: 'Disability Care Certificate III, IV, or V' },
  { key: 'disability_care_transcript', label: 'Disability Care Course Transcript' },
  { key: 'drivers_license', label: 'Drivers License' },
  { key: 'first_aid', label: 'First Aid Qualification', hint: 'Valid first aid training is a requirement to work in Aged Care.' },
  { key: 'flu_vaccination', label: 'Flu Vaccination' },
  { key: 'ndis_orientation', label: 'NDIS Orientation Module' },
  { key: 'ndis_screening', label: 'NDIS Worker Screening Check' },
  { key: 'passport', label: 'Passport', hint: 'Upload Passport for VEVO' },
  {
    key: 'police_check',
    label: 'Police Clearance',
    hint: 'Please upload a Police Clearance valid within the past 3 years.',
  },
  { key: 'specialised_support_dementia', label: 'Specialised Support Qualification', subtitle: 'Dementia care' },
  { key: 'manual_handling', label: 'Specialised Support Qualification', subtitle: 'Manual handling' },
  {
    key: 'statutory_declaration_aged_care',
    label: 'Statutory Declaration Aged Care',
    hint: 'A requirement for Aged Care. Check your email for more info.',
  },
  { key: 'vehicle_insurance', label: 'Vehicle Comprehensive Insurance Form' },
  { key: 'insurance', label: 'Public Liability Insurance' },
  { key: 'yellow_card', label: 'Yellow Card (QLD)' },
  { key: 'other', label: 'Other' },
];

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
