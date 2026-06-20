import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { api } from '../services/api';

const TERMS_VERSION = '1.0';

const storageKey = (userId) => `summitstaffing.termsAcceptance.${userId || 'unknown'}`;

const getDeviceInfo = () => {
  try {
    const DeviceInfo = require('react-native-device-info');
    if (DeviceInfo) {
      const brand = DeviceInfo.getBrand?.() || '';
      const model = DeviceInfo.getModel?.() || '';
      const systemVersion = DeviceInfo.getSystemVersion?.() || '';
      const appVersion = DeviceInfo.getVersion?.() || '';
      const buildNumber = DeviceInfo.getBuildNumber?.() || '';
      return `${brand} ${model} (${Platform.OS} ${systemVersion}) app ${appVersion} (${buildNumber})`.trim();
    }
  } catch (_) {
    // ignore
  }

  if (Platform.OS === 'android') return 'Summit Staffing Android App';
  if (Platform.OS === 'ios') return 'Summit Staffing iOS App';
  return `Summit Staffing ${Platform.OS} App`;
};

export const getCurrentTermsVersion = () => TERMS_VERSION;

export const hasAcceptedTerms = async (userId) => {
  if (!userId) return false;

  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.acceptedAt) && parsed?.termsVersion === TERMS_VERSION;
  } catch (_) {
    return false;
  }
};

export const requiresReacceptance = async (userId) => {
  if (!userId) return true;

  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    return parsed?.termsVersion !== TERMS_VERSION;
  } catch (_) {
    return true;
  }
};

async function saveLocalAcceptance(userId, acceptance) {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify({ ...acceptance, userId }));
  } catch (_) {
    // ignore
  }
}

function isTransientError(message) {
  return /timeout|connect|network|502|503|504|408|too long|offline/i.test(String(message || ''));
}

export const acceptTerms = async (userId) => {
  if (!userId) return { ok: false, error: 'Not signed in' };

  const acceptance = {
    termsVersion: TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
    deviceInfo: getDeviceInfo(),
  };

  await saveLocalAcceptance(userId, acceptance);

  const { data, error } = await api.post('/api/legal/terms-acceptance', acceptance, {
    retries: 2,
    timeoutMs: 60000,
  });

  if (!error && data?.ok) {
    return { ok: true, synced: true };
  }

  if (error && isTransientError(error.message)) {
    return {
      ok: true,
      synced: false,
      warning: 'Saved on this device. We will sync your acceptance when the connection is stable.',
    };
  }

  return {
    ok: false,
    error: error?.message || 'Could not save terms acceptance',
    hint: error?.response?.hint,
  };
};
