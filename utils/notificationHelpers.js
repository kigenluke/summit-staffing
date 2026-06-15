/** Shared notification grouping key (duplicates in DB show once in UI). */
export function getNotificationData(n) {
  let d = n?.data;
  if (d == null) return {};
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      return {};
    }
  }
  return typeof d === 'object' && d !== null ? d : {};
}

export function getNotificationKey(n) {
  const d = getNotificationData(n);
  return [
    n?.type || '',
    n?.title || '',
    n?.body || '',
    d?.requestId || '',
    d?.participantId || '',
    d?.coordinatorUserId || '',
    d?.bookingId || '',
  ].join('|');
}

export function dedupeNotifications(list) {
  const seen = new Set();
  const out = [];
  for (const n of list || []) {
    const key = getNotificationKey(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function isNotificationUnread(n) {
  return n?.read !== true && n?.read !== 't';
}
