import { api } from './api.js';

/** In-memory GET cache — cuts duplicate slow Railway round-trips on APK. */
const store = new Map();
const DEFAULT_TTL_MS = 25000;

/**
 * @param {string} path - e.g. `/api/bookings?limit=100`
 * @param {number} ttlMs
 * @param {{ force?: boolean }} options
 */
/** Synchronous read of a fresh cached GET (for instant UI before network returns). */
export function peekCachedApiGet(path, ttlMs = DEFAULT_TTL_MS) {
  const entry = store.get(path);
  if (!entry?.result) return null;
  if (Date.now() - entry.time >= ttlMs) return null;
  return entry.result;
}

export async function cachedApiGet(path, ttlMs = DEFAULT_TTL_MS, { force = false } = {}) {
  const key = path;
  const now = Date.now();
  const entry = store.get(key);

  if (!force && entry?.result && now - entry.time < ttlMs) {
    return entry.result;
  }

  if (!force && entry?.inflight) {
    return entry.inflight;
  }

  const inflight = api.get(path).then((result) => {
    store.set(key, { time: Date.now(), result, inflight: null });
    return result;
  }).catch((err) => {
    const current = store.get(key);
    if (current?.inflight === inflight) store.delete(key);
    throw err;
  });

  store.set(key, { time: entry?.time || 0, result: entry?.result, inflight });
  return inflight;
}

export function invalidateCachedGet(pathPrefix) {
  for (const key of store.keys()) {
    if (key === pathPrefix || key.startsWith(pathPrefix)) {
      store.delete(key);
    }
  }
}

export function clearApiGetCache() {
  store.clear();
}
