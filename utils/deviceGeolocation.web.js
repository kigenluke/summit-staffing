/**
 * Web: browser geolocation only (no PermissionsAndroid).
 */
import { Alert } from 'react-native';

function readCoords(pos) {
  const lat = pos?.coords?.latitude;
  const lng = pos?.coords?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('Could not read GPS coordinates.');
  }
  return { lat, lng };
}

function normalizeGeolocationError(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  if (code === 1 || /denied|permission/i.test(msg)) {
    return new Error('Location permission denied. Enable location in your browser settings.');
  }
  if (code === 3 || /timeout/i.test(msg)) {
    return new Error('Location request timed out');
  }
  return new Error(msg || 'Could not fetch GPS location.');
}

function getWebPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation?.getCurrentPosition) {
      reject(new Error('Geolocation is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          resolve(readCoords(pos));
        } catch (e) {
          reject(e);
        }
      },
      (err) => reject(normalizeGeolocationError(err)),
      {
        enableHighAccuracy: true,
        timeout: 35000,
        maximumAge: 60000,
        ...options,
      },
    );
  });
}

function isValidCachedCoords(cached) {
  return cached?.lat != null
    && cached?.lng != null
    && Number.isFinite(cached.lat)
    && Number.isFinite(cached.lng);
}

function cacheAgeMs(cached) {
  return cached?.fetchedAt ? Date.now() - cached.fetchedAt : 0;
}

export async function requestLocationPermission() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

export async function getDeviceLocation({
  cached = null,
  maxCacheAgeMs = 120000,
  staleCacheMaxAgeMs = null,
} = {}) {
  if (isValidCachedCoords(cached)) {
    const ageMs = cacheAgeMs(cached);
    if (!cached.fetchedAt || ageMs <= maxCacheAgeMs) {
      return { lat: cached.lat, lng: cached.lng };
    }
  }

  const attempts = [
    { enableHighAccuracy: true, timeout: 35000, maximumAge: maxCacheAgeMs },
    { enableHighAccuracy: false, timeout: 25000, maximumAge: 120000 },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await getWebPosition(attempt);
    } catch (err) {
      lastError = err;
    }
  }

  const staleLimit = staleCacheMaxAgeMs ?? maxCacheAgeMs;
  if (isValidCachedCoords(cached) && cacheAgeMs(cached) <= staleLimit) {
    return { lat: cached.lat, lng: cached.lng, usedStaleCache: true };
  }

  throw lastError || new Error('Could not fetch GPS location.');
}

export async function getDeviceLocationForClock({
  cached = null,
  forClockOut = false,
} = {}) {
  return getDeviceLocation({
    cached,
    maxCacheAgeMs: forClockOut ? 600000 : 300000,
    staleCacheMaxAgeMs: forClockOut ? 1800000 : 900000,
  });
}

export function startLocationWatch() {
  return null;
}

export function stopLocationWatch() {}

export function promptOpenLocationSettings() {
  Alert.alert(
    'Location required',
    'Allow location access in your browser when prompted, or check site permissions in browser settings.',
    [{ text: 'OK' }],
  );
}
