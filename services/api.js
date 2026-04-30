/**
 * Summit Staffing – API client for the backend
 * Uses base URL from ApiConfig; supports auth token and consistent error handling.
 */

import { Platform } from 'react-native';
import { getState, logout } from '../store/authStore.js';

function readViteEnv(key) {
  try {
    // Keep import.meta access inside Function string so Metro/Hermes parsing does not fail.
    const getter = new Function('k', 'try { return import.meta?.env?.[k]; } catch (_) { return undefined; }');
    return getter(key);
  } catch (_) {
    return undefined;
  }
}

function resolveBaseURL() {
  // Web dev: prefer same-origin /api so Vite proxy handles CORS.
  // Avoid eval() because some environments block it.
  if (Platform.OS === 'web') {
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (host === 'localhost' || host === '127.0.0.1') return '';
    } catch (_) {}
  }

  // Vite web builds
  const viteApiUrl = readViteEnv('VITE_API_URL');
  if (viteApiUrl) return String(viteApiUrl);

  // Expo / React Native env
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Mobile builds
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    return 'https://athletic-heart-backend-production.up.railway.app';
  }

  return 'https://athletic-heart-backend-production.up.railway.app';
}
const defaultBaseURL = resolveBaseURL();

export const ApiConfig = {
  baseURL: defaultBaseURL,
  timeout: 30000,
};

export function getAuthToken() {
  try {
    const state = getState();
    return state?.token ?? null;
  } catch {
    return null;
  }
}

export function getHeaders(customHeaders = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Low-level request helper. Returns { data, error, status }.
 * Does not throw; parse response and surface errors for callers.
 */
export async function request(method, path, body = null, options = {}) {
  const url = path.startsWith('http') ? path : `${ApiConfig.baseURL.replace(/\/$/, '')}${path}`;;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ApiConfig.timeout);
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  try {
    const res = await fetch(url, {
      method,
      headers: (() => {
        const h = getHeaders(options.headers);
        // For multipart uploads, browser/React Native sets boundary automatically.
        if (isFormData) {
          delete h['Content-Type'];
          delete h['content-type'];
        }
        return h;
      })(),
      body: body != null ? (isFormData ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timeoutId);

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        try { logout(); } catch (_) {}
      }
      const errorMsg = data?.error || data?.errors?.[0]?.msg || data?.message || `Request failed: ${res.status}`;
      const error = new Error(errorMsg);
      error.status = res.status;
      error.response = data;
      return { data: null, error, status: res.status };
    }

    return { data, error: null, status: res.status };
  } catch (err) {
    clearTimeout(timeoutId);
    const error = err.name === 'AbortError'
      ? Object.assign(new Error('Request timed out'), { status: 408 })
      : Object.assign(err, { status: err.status || 0 });
    return { data: null, error, status: error.status };
  }
}

/**
 * Convenience: api.get/post/put/delete
 */
export const api = {
  get: (path, options) => request('GET', path, null, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  delete: (path, options) => request('DELETE', path, null, options),
};

/**
 * Safe wrapper: returns { data, error }. Throws only on programmer error.
 * Use when you want a simple data/error pattern (e.g. in screens).
 */
export async function safeRequest(method, path, body = null) {
  const { data, error } = await request(method, path, body);
  return { data, error };
}

export default api;
