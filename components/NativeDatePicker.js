import { Platform } from 'react-native';

let NativeDatePicker = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line global-require
  NativeDatePicker = require('react-native-date-picker').default;
}

export default NativeDatePicker;
