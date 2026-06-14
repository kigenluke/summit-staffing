import { Platform } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';

export async function copyToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    return false;
  }

  Clipboard.setString(value);
  return true;
}
