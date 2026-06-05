import { Alert, Linking, Platform } from 'react-native';

export const SUPPORT_EMAIL = 'support@summitstaffing.com.au';

const TITLE = 'Documents required';
const MESSAGE =
  `Please upload your documents to get access. Go to Profile > Upload documents, then submit for verification.\n\nOr email them to ${SUPPORT_EMAIL}.`;

export function openSupportDocumentsEmail() {
  const subject = encodeURIComponent('Compliance documents – Summit Staffing');
  const body = encodeURIComponent(
    'Hi Summit Staffing,\n\nPlease find my compliance documents attached.\n\nName:\nPhone:\n\nThank you.',
  );
  const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  return Linking.openURL(url).catch(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = url;
      return Promise.resolve();
    }
    Alert.alert('Email support', `Send your documents to ${SUPPORT_EMAIL}`);
  });
}

export function showVerificationRequiredAlert() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${TITLE}\n\n${MESSAGE}`);
  } else {
    Alert.alert(TITLE, MESSAGE);
  }
}
