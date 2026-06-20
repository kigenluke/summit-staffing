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

export function alertApiError(error, fallbackTitle = 'Something went wrong') {
  const normalized = handleApiError(error);
  showUserAlert(normalized.title || fallbackTitle, normalized.message);
  return normalized;
}
