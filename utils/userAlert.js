/**
 * Consistent user-facing alerts for API and action errors (native + web).
 */
import { Alert, Platform } from 'react-native';
import { handleApiError } from './errorHandler.js';

export function showUserAlert(title, message, buttons) {
  const body = message ? String(message) : '';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(body ? `${title}\n\n${body}` : title);
    return;
  }
  Alert.alert(title, body || undefined, buttons);
}

/** Native Alert with buttons often fails on web — use window.confirm there. */
export function confirmUserAction(title, message, onConfirm, { confirmLabel = 'OK' } = {}) {
  const body = message ? String(message) : '';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    const ok = window.confirm(body ? `${title}\n\n${body}` : title);
    if (ok && typeof onConfirm === 'function') onConfirm();
    return;
  }
  Alert.alert(title, body || undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, onPress: onConfirm },
  ]);
}

export function alertApiError(error, fallbackTitle = 'Something went wrong') {
  const normalized = handleApiError(error);
  showUserAlert(normalized.title || fallbackTitle, normalized.message);
  return normalized;
}
