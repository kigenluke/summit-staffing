/**
 * Summit Staffing – API client for the backend
 * Uses base URL from ApiConfig; supports auth token and consistent error handling.
 */

const defaultBaseURL =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL
    ? process.env.EXPO_PUBLIC_API_URL
    : 'http://localhost:3000';

export const ApiConfig = {
  baseURL: defaultBaseURL,
  timeout: 30000,
};

export function getAuthToken() {
  try {
    const { getState } = require('../store/authStore.js');
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
  const url = path.startsWith('http') ? path : `${ApiConfig.baseURL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ApiConfig.timeout);

  try {
    const res = await fetch(url, {
      method,
      headers: getHeaders(options.headers),
      body: body != null ? JSON.stringify(body) : undefined,
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
      const error = new Error(data?.error || data?.message || `Request failed: ${res.status}`);
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
