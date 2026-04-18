import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';

import {api, safeRequest} from '../services/api';

const TERMS_VERSION = '1.0';

const storageKey = (userId) => `summitstaffing.termsAcceptance.${userId || 'unknown'}`;

const getDeviceInfo = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const DeviceInfo = require('react-native-device-info');
    if (DeviceInfo) {
      const brand = DeviceInfo.getBrand?.() || '';
      const model = DeviceInfo.getModel?.() || '';
      const systemVersion = DeviceInfo.getSystemVersion?.() || '';
      const appVersion = DeviceInfo.getVersion?.() || '';
      const buildNumber = DeviceInfo.getBuildNumber?.() || '';
      return `${brand} ${model} (${Platform.OS} ${systemVersion}) app ${appVersion} (${buildNumber})`;
    }
  } catch (e) {
    // ignore
  }

  return `${Platform.OS}`;
};

const getIPAddress = async () => {
  return null;
};

export const getCurrentTermsVersion = () => TERMS_VERSION;

export const hasAcceptedTerms = async (userId) => {
  if (!userId) return false;

  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.acceptedAt) && parsed?.termsVersion === TERMS_VERSION;
  } catch (e) {
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
  } catch (e) {
    return true;
  }
};

export const acceptTerms = async (userId) => {
  if (!userId) return false;

  const acceptance = {
    userId,
    termsVersion: TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
    ipAddress: await getIPAddress(),
    deviceInfo: getDeviceInfo(),
  };

  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(acceptance));
  } catch (e) {
    // ignore
  }

  const res = await safeRequest('POST', '/api/legal/terms-acceptance', acceptance);
  if (!res.success) {
    return false;
  }

  return true;
};
