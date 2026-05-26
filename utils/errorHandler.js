import {useAuthStore} from '../store/authStore.js';
import {showToast} from '../components/Toast';

const normalize = (err) => {
  if (!err) return {type: 'generic', title: 'Error', message: 'Something went wrong'};

  const status = err?.status || err?.response?.status;
  const responseData = err?.response?.data || err?.response;
  const msg =
    err?.error
    || err?.message
    || responseData?.error
    || responseData?.message;
  const hint = responseData?.hint;
  const raw = [msg, hint].filter(Boolean).join('\n\n') || String(err || '');

  if (raw.toLowerCase().includes('network') || raw.toLowerCase().includes('internet') || raw.toLowerCase().includes('offline')) {
    return {type: 'network', title: 'No internet connection', message: 'Check your internet connection and try again.'};
  }

  if (raw.toLowerCase().includes('timeout')) {
    return {type: 'timeout', title: 'Request timed out', message: 'Please try again.'};
  }

  if (status === 400) {
    return {type: 'bad_request', title: 'Invalid request', message: raw || 'Please check your input.'};
  }

  if (status === 401) {
    return {type: 'unauthorized', title: 'Session expired', message: 'Please log in again.'};
  }

  if (status === 403) {
    return {type: 'forbidden', title: "You don't have permission", message: raw || 'Forbidden'};
  }

  if (status === 404) {
    return {type: 'not_found', title: 'Not found', message: raw || 'Not found'};
  }

  if (status === 503 && raw.trim()) {
    return {
      type: 'service_unavailable',
      title: 'Unavailable',
      message: raw.trim().slice(0, 900),
    };
  }

  if (status === 0 || !status) {
    return {
      type: 'network',
      title: 'Cannot reach API',
      message:
        'Could not connect to the API server. For local dev: run npm run dev (port 3000) in another terminal, keep VITE_PROXY_TARGET=http://localhost:3000, then restart npm run web.',
    };
  }

  if (status >= 500) {
    return {
      type: 'server',
      title: 'Server error',
      message: raw.trim() || 'Server error, please try again.',
    };
  }

  return {type: 'generic', title: 'Error', message: raw || 'Something went wrong'};
};

export const handleApiError = (error) => {
  const n = normalize(error);

  if (n.type === 'unauthorized') {
    // logout and let AppNavigator show AuthStack
    try {
      useAuthStore.getState().logout();
    } catch (e) {
      void e;
    }
  }

  return n;
};

export const showError = (error) => {
  const n = normalize(error);
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('showError', error);
  }
  showToast(n.message, 'error');
  return n;
};

export const showSuccess = (message) => {
  showToast(message, 'success');
};

export const showWarning = (message) => {
  showToast(message, 'warning');
};

export const showInfo = (message) => {
  showToast(message, 'info');
};
