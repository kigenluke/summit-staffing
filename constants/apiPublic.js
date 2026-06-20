/**
 * Public API base URL for web + native app builds.
 */
import { Platform } from 'react-native';
import { pickFirstUrl, readNativeConfigMap } from '../utils/nativeEnv.js';

export const PRODUCTION_API_URL = 'https://athletic-heart-backend-production.up.railway.app';

function readViteEnv(key) {
  try {
    const getter = new Function('k', 'try { return import.meta?.env?.[k]; } catch (_) { return undefined; }');
    return getter(key);
  } catch (_) {
    return undefined;
  }
}

export const PUBLIC_WEB_BASE = 'https://summitstaffing.com.au';

let cachedApiBaseUrl = null;

export function resolveApiBaseUrl() {
  if (cachedApiBaseUrl) return cachedApiBaseUrl;

  const isNative = Platform.OS === 'android' || Platform.OS === 'ios';

  if (Platform.OS === 'web') {
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (host === 'localhost' || host === '127.0.0.1') {
        // When set, web dev calls Railway (or another API) directly — shows in Network tab.
        const directApi = pickFirstUrl(
          readViteEnv('VITE_API_URL'),
          readViteEnv('VITE_PROXY_TARGET'),
        );
        if (directApi) {
          cachedApiBaseUrl = directApi.replace(/\/$/, '');
          return cachedApiBaseUrl;
        }
        // Fallback: relative /api → Vite dev-server proxy (see vite.config.js).
        cachedApiBaseUrl = '';
        return cachedApiBaseUrl;
      }
    } catch (_) {}
  }

  const native = readNativeConfigMap();
  const fromNativeConfig = pickFirstUrl(
    native?.API_URL,
    native?.EXPO_PUBLIC_API_URL,
    native?.APP_URL,
  );
  if (fromNativeConfig) {
    cachedApiBaseUrl = fromNativeConfig;
    return cachedApiBaseUrl;
  }

  if (isNative) {
    cachedApiBaseUrl = PRODUCTION_API_URL;
    return cachedApiBaseUrl;
  }

  cachedApiBaseUrl = pickFirstUrl(
    readViteEnv('VITE_API_URL'),
    typeof process !== 'undefined' ? process.env?.API_URL : '',
    typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_URL : '',
    PRODUCTION_API_URL,
  ) || PRODUCTION_API_URL;
  return cachedApiBaseUrl;
}

export function getNetworkErrorMessage() {
  if (__DEV__ && Platform.OS === 'web') {
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (host === 'localhost' || host === '127.0.0.1') {
        return 'Cannot reach the server. Run npm run dev (port 3000) for local testing.';
      }
    } catch (_) {}
  }
  return 'Cannot connect to Summit Staffing. Check your internet connection and try again.';
}

/** Strip localhost / dev-only hints from messages shown on live builds. */
export function sanitizeUserFacingMessage(message) {
  const msg = String(message || '').trim();
  if (!msg) return getNetworkErrorMessage();
  if (__DEV__) return msg;
  if (/localhost|127\.0\.0\.1|npm run dev|5173|vite_proxy/i.test(msg)) {
    if (/route not found/i.test(msg)) return getRouteNotFoundMessage();
    return getNetworkErrorMessage();
  }
  return msg;
}

export function getRouteNotFoundMessage() {
  return 'This feature is not available on the server yet. Please update the app or contact support@summitstaffing.com.au.';
}
