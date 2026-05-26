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

/** Turn JSON `{ error }` into a readable string (avoids `[object Object]` in alerts). */
function coerceBodyErrorMessage(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === 'object' && typeof value.message === 'string') {
    const t = String(value.message).trim();
    return t.length ? t : null;
  }
  return null;
}

/**
 * Low-level request helper. Returns { data, error, status }.
 * Does not throw; parse response and surface errors for callers.
 */
export async function request(method, path, body = null, options = {}) {
  const url = path.startsWith('http') ? path : `${ApiConfig.baseURL.replace(/\/$/, '')}${path}`;
  const controller = new AbortController();
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const timeoutMs = isFormData ? Math.max(ApiConfig.timeout, 120000) : ApiConfig.timeout;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const { headers: headerOverrides, signal: callerSignal, ...restFetchOptions } = options;
  const mergedHeaders = (() => {
    const h = getHeaders(headerOverrides);
    // For multipart uploads, browser/React Native sets boundary automatically.
    if (isFormData) {
      delete h['Content-Type'];
      delete h['content-type'];
    }
    return h;
  })();

  let fetchSignal = controller.signal;
  let onCallerAbort;
  if (callerSignal) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      fetchSignal = AbortSignal.any([controller.signal, callerSignal]);
    } else if (callerSignal.aborted) {
      controller.abort();
    } else {
      onCallerAbort = () => controller.abort();
      callerSignal.addEventListener('abort', onCallerAbort);
    }
  }

  try {
    // Important: do not `...options` after `headers` — callers often pass `headers: { 'Content-Type': ... }`
    // which would replace merged headers and drop Authorization / break multipart boundaries.
    const res = await fetch(url, {
      method,
      ...restFetchOptions,
      headers: mergedHeaders,
      body: body != null ? (isFormData ? body : JSON.stringify(body)) : undefined,
      signal: fetchSignal,
    });

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
      let errorMsg =
        coerceBodyErrorMessage(data?.error)
        || (Array.isArray(data?.errors) && data.errors.length
          ? data.errors.map((e) => e?.msg || e?.message).filter(Boolean).join(' ')
          : null)
        || data?.message
        || (res.status === 429 ? 'Too many requests. Please try again shortly.' : null)
        || `Something went wrong (${res.status}). Please try again.`;
      if (data?.details && typeof data.details === 'string') {
        errorMsg = `${errorMsg} (${data.details})`;
      }
      if (data?.hint && typeof data.hint === 'string' && data.hint.trim()) {
        errorMsg = `${errorMsg}\n\n${data.hint.trim()}`;
      }
      if (res.status === 404 && /route not found/i.test(String(errorMsg))) {
        errorMsg =
          'API route not found. Run the local API with `npm run dev` (port 3000) and ensure VITE_PROXY_TARGET is not pointing at old Railway code.';
      }
      const error = new Error(errorMsg);
      error.status = res.status;
      error.response = data;
      return { data: null, error, status: res.status };
    }

    return { data, error: null, status: res.status };
  } catch (err) {
    const isNetwork =
      err?.name === 'TypeError'
      || /failed to fetch|network|econnrefused|proxy/i.test(String(err?.message || ''));
    const error = err.name === 'AbortError'
      ? Object.assign(new Error('Request timed out'), { status: 408 })
      : isNetwork
        ? Object.assign(
            new Error(
              'Cannot reach the API server. Run npm run dev (port 3000) if testing on localhost:5173.',
            ),
            { status: 0 },
          )
        : Object.assign(err, { status: err.status || 0 });
    return { data: null, error, status: error.status };
  } finally {
    clearTimeout(timeoutId);
    if (onCallerAbort && callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
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
