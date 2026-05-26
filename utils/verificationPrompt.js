import { Alert, Platform } from 'react-native';

const TITLE = 'Documents required';
const MESSAGE =
  'Please upload your documents to get access. Go to Profile > Upload documents, then submit for verification.';

export function showVerificationRequiredAlert() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${TITLE}\n\n${MESSAGE}`);
  } else {
    Alert.alert(TITLE, MESSAGE);
  }
}
