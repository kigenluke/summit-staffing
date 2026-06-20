/**
 * Device GPS for native (Android/iOS permissions + community geolocation).
 * Web builds use deviceGeolocation.web.js via Vite platform resolution.
 */
import { Platform, Alert, Linking } from 'react-native';

function getGeolocationModule() {
  try {
    return require('@react-native-community/geolocation').default;
  } catch (_) {
    return null;
  }
}

export async function requestLocationPermission() {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
  }

  if (Platform.OS === 'android') {
    let PermissionsAndroid;
    try {
      PermissionsAndroid = require('react-native').PermissionsAndroid;
    } catch (_) {
      return false;
    }
    if (!PermissionsAndroid?.request) return false;

    const fine = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location access',
        message: 'Summit Staffing needs your location to verify clock-in at the shift site.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    if (fine === PermissionsAndroid.RESULTS.GRANTED) return true;
    const coarse = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    );
    return coarse === PermissionsAndroid.RESULTS.GRANTED;
  }

  return true;
}

function normalizeGeolocationError(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  if (code === 1 || /denied|permission/i.test(msg)) {
    return new Error('Location permission denied. Enable location in Settings to clock in.');
  }
  if (code === 2 || /unavailable|disabled/i.test(msg)) {
    return new Error('Location is unavailable. Turn on GPS/location in your device Settings.');
  }
  if (code === 3 || /timeout/i.test(msg)) {
    return new Error('Location request timed out');
  }
  return new Error(msg || 'Could not fetch GPS location.');
}

function readCoords(pos) {
  const lat = pos?.coords?.latitude;
  const lng = pos?.coords?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('Could not read GPS coordinates.');
  }
  return { lat, lng };
}

function getNativePosition(options = {}) {
  const GeolocationModule = getGeolocationModule();
  return new Promise((resolve, reject) => {
    if (!GeolocationModule?.getCurrentPosition) {
      reject(new Error('Location is not available on this device.'));
      return;
    }
    GeolocationModule.getCurrentPosition(
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
        enableHighAccuracy: options.enableHighAccuracy !== false,
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

async function fetchNativePositionWithFallback(maxCacheAgeMs) {
  const attempts = [
    { enableHighAccuracy: true, timeout: 35000, maximumAge: maxCacheAgeMs },
    { enableHighAccuracy: false, timeout: 25000, maximumAge: 120000 },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await getNativePosition(attempt);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Could not fetch GPS location.');
}

async function fetchWebPositionWithFallback(maxCacheAgeMs) {
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

  throw lastError || new Error('Could not fetch GPS location.');
}

export async function getDeviceLocation({
  requestPermission = true,
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

  if (requestPermission) {
    const ok = await requestLocationPermission();
    if (!ok && Platform.OS === 'android') {
      throw new Error('Location permission denied. Enable location in Settings to clock in.');
    }
  }

  try {
    if (Platform.OS === 'web') {
      return await fetchWebPositionWithFallback(maxCacheAgeMs);
    }
    return await fetchNativePositionWithFallback(maxCacheAgeMs);
  } catch (err) {
    const staleLimit = staleCacheMaxAgeMs ?? maxCacheAgeMs;
    if (isValidCachedCoords(cached) && cacheAgeMs(cached) <= staleLimit) {
      return { lat: cached.lat, lng: cached.lng, usedStaleCache: true };
    }
    throw err;
  }
}

/** Clock actions allow a longer stale cache — worker is usually still at the shift site. */
export async function getDeviceLocationForClock({
  cached = null,
  forClockOut = false,
} = {}) {
  return getDeviceLocation({
    requestPermission: true,
    cached,
    maxCacheAgeMs: forClockOut ? 600000 : 300000,
    staleCacheMaxAgeMs: forClockOut ? 1800000 : 900000,
  });
}

export function startLocationWatch(onUpdate, onError) {
  if (Platform.OS === 'web') return null;

  const GeolocationModule = getGeolocationModule();
  if (!GeolocationModule?.watchPosition) return null;

  return GeolocationModule.watchPosition(
    (pos) => {
      try {
        onUpdate(readCoords(pos));
      } catch (e) {
        onError?.(e);
      }
    },
    (err) => onError?.(normalizeGeolocationError(err)),
    {
      enableHighAccuracy: false,
      distanceFilter: 25,
      interval: 10000,
      fastestInterval: 5000,
      timeout: 30000,
      maximumAge: 120000,
    },
  );
}

export function stopLocationWatch(watchId) {
  if (watchId == null || Platform.OS === 'web') return;
  const GeolocationModule = getGeolocationModule();
  try {
    GeolocationModule?.clearWatch?.(watchId);
  } catch (_) {}
}

export function promptOpenLocationSettings() {
  Alert.alert(
    'Location required',
    'Enable location access in your device Settings so you can clock in at the shift site.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => { try { Linking.openSettings(); } catch (_) {} } },
    ],
  );
}
