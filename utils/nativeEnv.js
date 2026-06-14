/**
 * Read react-native-config at runtime without importing its package entry (avoids startup crash).
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';

export function readNativeConfigMap() {
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

export function pickFirstUrl(...candidates) {
  for (const c of candidates) {
    const t = String(c || '').trim().replace(/\/$/, '');
    if (!t) continue;
    if (/localhost|127\.0\.0\.1/i.test(t)) continue;
    if (t.includes(',')) continue;
    if (!/^https?:\/\//i.test(t)) continue;
    return t;
  }
  return '';
}
