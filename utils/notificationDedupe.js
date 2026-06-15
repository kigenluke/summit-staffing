export function getNotifData(n) {
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

export function getNotificationDedupeKey(n) {
  const d = getNotifData(n);
  return [
    n?.type || '',
    n?.title || '',
    n?.body || '',
    d?.requestId || '',
    d?.participantId || '',
    d?.coordinatorUserId || '',
  ].join('|');
}

export function dedupeNotifications(list) {
  const seen = new Set();
  const out = [];
  for (const n of list || []) {
    const key = getNotificationDedupeKey(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** All unread notification ids sharing the same dedupe key as `notification`. */
export function siblingUnreadIds(allNotifications, notification) {
  if (!notification) return [];
  const key = getNotificationDedupeKey(notification);
  return (allNotifications || [])
    .filter((n) => !n.read && getNotificationDedupeKey(n) === key)
    .map((n) => n.id);
}
