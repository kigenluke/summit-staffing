import { Alert, Platform } from 'react-native';

const TITLE = 'Verification required';
const MESSAGE =
  'Upload your documents and complete verification. Until your account is verified, you can use Edit Profile and Documents in the Profile tab.';

export function showVerificationRequiredAlert() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${TITLE}\n\n${MESSAGE}`);
  } else {
    Alert.alert(TITLE, MESSAGE);
  }
}
