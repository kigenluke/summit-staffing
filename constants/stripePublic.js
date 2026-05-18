/**
 * Stripe publishable key (pk_...) — safe to ship in the app.
 *
 * Web (Vite): VITE_STRIPE_PUBLISHABLE_KEY
 * Native: STRIPE_PUBLISHABLE_KEY via react-native-config (.env at build time)
 *
 * Do NOT `require('react-native-config')` directly — v1.6+ calls getConfig() at import
 * and crashes when the native module is missing (common in release APK if not linked).
 */

import { NativeModules, TurboModuleRegistry } from 'react-native';

function readVite() {
  try {
    const getter = new Function('try { return import.meta?.env?.VITE_STRIPE_PUBLISHABLE_KEY; } catch (_) { return ""; }');
    const key = getter();
    if (key) return String(key);
  } catch (_) {}
  return '';
}

export function getStripePublishableKeyFromEnv() {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return String(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  }
  return readVite();
}

/** Read react-native-config without importing its package entry (avoids startup crash). */
function readNativeConfigMap() {
  try {
    const turbo = TurboModuleRegistry.get('RNCConfigModule');
    if (turbo && typeof turbo.getConfig === 'function') {
      return turbo.getConfig()?.config || null;
    }
  } catch (_) {
    /* not available */
  }

  try {
    const legacy = NativeModules.RNCConfigModule || NativeModules.ReactNativeConfig;
    if (legacy?.getConstants) {
      return legacy.getConstants();
    }
    if (legacy?.getConfig) {
      return legacy.getConfig()?.config || legacy.getConfig();
    }
  } catch (_) {
    /* not available */
  }

  return null;
}

/** Native (CLI) builds: STRIPE_PUBLISHABLE_KEY from `.env` when react-native-config is linked. */
export function getStripePublishableKeyForNative() {
  try {
    const config = readNativeConfigMap();
    const k = config?.STRIPE_PUBLISHABLE_KEY;
    if (k) return String(k).trim();
  } catch (_) {
    /* ignore */
  }
  return getStripePublishableKeyFromEnv();
}
