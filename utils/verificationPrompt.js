import { Alert, Linking, Platform } from 'react-native';

export const SUPPORT_EMAIL = 'support@summitstaffing.com.au';

const TITLE = 'Documents required';
const MESSAGE =
  `Please upload your documents to get access. Go to Profile > Upload documents, then submit for verification.\n\nOr email them to ${SUPPORT_EMAIL}.`;

function buildSupportMailtoUrl() {
  const subject = encodeURIComponent('Compliance documents - Summit Staffing');
  const body = encodeURIComponent(
    'Hi Summit Staffing,\n\nPlease find my compliance documents attached.\n\nName:\nPhone:\n\nThank you.',
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

/** Web: hidden <a> click avoids blank "Untitled" tab from Linking.openURL(mailto:). */
function openMailtoOnWeb(url) {
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  } catch (_) {
    return false;
  }
}

export async function openSupportDocumentsEmail() {
  const url = buildSupportMailtoUrl();

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    if (openMailtoOnWeb(url)) return;
    if (typeof window !== 'undefined') {
      window.location.href = url;
      return;
    }
  }

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return;
    }
  } catch (_) {}

  Alert.alert('Email support', `Send your documents to ${SUPPORT_EMAIL}`);
}

export function showVerificationRequiredAlert() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${TITLE}\n\n${MESSAGE}`);
  } else {
    Alert.alert(TITLE, MESSAGE);
  }
}

const EXPIRED_TITLE = 'Documents expired';
const EXPIRED_MESSAGE =
  'One or more compliance documents have expired. Go to Profile → Manage Worker Profile to upload renewed copies.';

export function showExpiredDocumentsAlert() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${EXPIRED_TITLE}\n\n${EXPIRED_MESSAGE}`);
  } else {
    Alert.alert(EXPIRED_TITLE, EXPIRED_MESSAGE);
  }
}
