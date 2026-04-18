import AsyncStorage from '@react-native-async-storage/async-storage';

import {api, safeRequest} from '../services/api';

const key = (userId, suffix) => `summitstaffing.onboarding.${suffix}.${userId || 'unknown'}`;

export const hasCompletedOnboarding = async (userId) => {
  if (!userId) return false;
  try {
    const v = await AsyncStorage.getItem(key(userId, 'welcome'));
    return v === 'completed';
  } catch (e) {
    return false;
  }
};

export const completeOnboarding = async (userId) => {
  if (!userId) return false;
  try {
    await AsyncStorage.setItem(key(userId, 'welcome'), 'completed');
  } catch (e) {
    // ignore
  }

  const res = await safeRequest('POST', '/api/users/onboarding-complete', { step: 'welcome' });
  return res.success;
};

export const hasCompletedProfileSetup = async (userId) => {
  if (!userId) return false;
  try {
    const v = await AsyncStorage.getItem(key(userId, 'profileSetup'));
    return v === 'completed';
  } catch (e) {
    return false;
  }
};

export const completeProfileSetup = async (userId) => {
  if (!userId) return false;
  try {
    await AsyncStorage.setItem(key(userId, 'profileSetup'), 'completed');
  } catch (e) {
    // ignore
  }

  const res = await safeRequest('POST', '/api/users/profile-setup-complete', { completed: true });
  return res.success;
};

export const skipProfileSetup = async (userId) => {
  if (!userId) return false;
  try {
    await AsyncStorage.setItem(key(userId, 'profileSetup'), 'skipped');
  } catch (e) {
    // ignore
  }

  const res = await safeRequest('POST', '/api/users/profile-setup-skip', { skipped: true });
  return res.success;
};

export const hasSkippedProfileSetup = async (userId) => {
  if (!userId) return false;
  try {
    const v = await AsyncStorage.getItem(key(userId, 'profileSetup'));
    return v === 'skipped';
  } catch (e) {
    return false;
  }
};

export const hasCompletedPermissions = async (userId) => {
  if (!userId) return false;
  try {
    const v = await AsyncStorage.getItem(key(userId, 'permissions'));
    return v === 'completed';
  } catch (e) {
    return false;
  }
};

export const completePermissions = async (userId, payload) => {
  if (!userId) return false;
  try {
    await AsyncStorage.setItem(key(userId, 'permissions'), 'completed');
  } catch (e) {
    // ignore
  }

  const res = await safeRequest('POST', '/api/users/permissions-complete', payload || {});
  return res.success;
};
