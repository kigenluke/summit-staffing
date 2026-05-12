/**
 * @format
 */

import 'react-native-get-random-values';

// uuid v10 (via react-native-google-places-autocomplete) reads bare `crypto`, which Hermes resolves
// from globalThis — react-native-get-random-values only attaches to `global.crypto` today.
try {
  const c = typeof global !== 'undefined' ? global.crypto : undefined;
  if (c && typeof c.getRandomValues === 'function' && typeof globalThis !== 'undefined') {
    globalThis.crypto = c;
  }
} catch (_) {
  /* ignore */
}

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
