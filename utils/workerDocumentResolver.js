/**
 * Map worker_documents rows to catalog keys (handles legacy admin uploads saved as document_type "other").
 */

const IMMUNISATION_KEYS = ['flu_vaccination', 'covid_vaccine_1', 'covid_vaccine_2', 'covid_vaccine_3'];

const ORPHAN_FALLBACK_KEYS = [
  'cpr_qualification',
  'aged_care_transcript',
  'assistant_in_nursing',
  'disability_care_cert',
  'disability_care_transcript',
  'specialised_support_dementia',
  'statutory_declaration_aged_care',
  'covid_vaccine_2',
  'covid_vaccine_3',
];

export function isImmunisationHistoryDocument(doc) {
  return /immunisation|ihsall/i.test(String(doc?.file_url || ''));
}

function inferKeyFromFileUrl(fileUrl = '') {
  const url = String(fileUrl).toLowerCase();
  if (!url) return null;
  if (/cert_iii|cert iii|certificate.?iii/.test(url)) return 'aged_care_cert';
  if (/aged_care_transcript|course transcript/.test(url)) return 'aged_care_transcript';
  if (/assistant.in.nursing|ain.cert/.test(url)) return 'assistant_in_nursing';
  if (/ndis_worker_orientation|ndis orientation/.test(url)) return 'ndis_orientation';
  if (/paspport|passport|vevo/.test(url)) return 'passport';
  if (/driving.?licen|driver.?licen/.test(url)) return 'drivers_license';
  if (/disability.care.cert/.test(url)) return 'disability_care_cert';
  if (/disability.care.transcript/.test(url)) return 'disability_care_transcript';
  if (/cpr|cardiopulmonary/.test(url)) return 'cpr_qualification';
  if (/manual.handling/.test(url)) return 'manual_handling';
  if (/dementia/.test(url)) return 'specialised_support_dementia';
  if (/statutory.declaration/.test(url)) return 'statutory_declaration_aged_care';
  if (/public.liability|liability.insurance/.test(url)) return 'insurance';
  if (/vehicle|car.new.policy|comprehensive.insurance|suncorp/.test(url)) return 'vehicle_insurance';
  if (/immunisation|ihsall|vaccine|covid/.test(url)) return '__immunisation__';
  if (/first.aid/.test(url)) return 'first_aid';
  if (/police|checkresult/.test(url)) return 'police_check';
  if (/ndis.screening|worker.screening/.test(url)) return 'ndis_screening';
  if (/wwcc|blue.card|working.with.children/.test(url)) return 'wwcc';
  if (/yellow.card/.test(url)) return 'yellow_card';
  return null;
}

/**
 * Assign catalog keys to all documents for a worker (stable per worker document set).
 */
export function buildDocumentCatalogKeyMap(documents = []) {
  const map = new Map();
  const others = [...(documents || [])]
    .filter((d) => d.document_type === 'other' || d.compliance_item_key)
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  let immunisationSlot = 0;

  for (const doc of documents || []) {
    if (doc.compliance_item_key) {
      map.set(doc.id, doc.compliance_item_key);
      continue;
    }
    if (doc.document_type && doc.document_type !== 'other') {
      const urlKey = inferKeyFromFileUrl(doc.file_url);
      if (doc.document_type === 'insurance' && urlKey === 'vehicle_insurance') {
        map.set(doc.id, 'vehicle_insurance');
      } else {
        map.set(doc.id, doc.document_type);
      }
      continue;
    }
  }

  for (const doc of others) {
    if (map.has(doc.id)) continue;
    let key = inferKeyFromFileUrl(doc.file_url);
    if (key === '__immunisation__') {
      key = IMMUNISATION_KEYS[immunisationSlot] || 'covid_vaccine_3';
      immunisationSlot += 1;
    }
    if (key) map.set(doc.id, key);
  }

  const claimed = new Set(map.values());
  const orphans = [...(documents || [])]
    .filter((d) => d.document_type === 'other' && !map.has(d.id))
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  for (const doc of orphans) {
    const fallback = ORPHAN_FALLBACK_KEYS.find((k) => !claimed.has(k));
    if (fallback) {
      map.set(doc.id, fallback);
      claimed.add(fallback);
    }
  }

  return map;
}

export function resolveDocumentCatalogKey(doc, keyMap) {
  if (!doc) return null;
  if (keyMap?.has(doc.id)) return keyMap.get(doc.id);
  if (doc.compliance_item_key) return doc.compliance_item_key;
  if (doc.document_type && doc.document_type !== 'other') return doc.document_type;
  return inferKeyFromFileUrl(doc.file_url);
}
