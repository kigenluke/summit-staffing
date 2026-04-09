import * as Keychain from 'react-native-keychain';

import { api, safeRequest } from './api';
import { AUTH_ENDPOINTS } from '../constants/api';

const TOKEN_SERVICE = 'summitstaffing.jwt';

export const tokenStorage = {
  /** @returns {Promise<string|null>} */
  async get() {
    try {
      const creds = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
      return creds?.password || null;
    } catch (e) {
      return null;
    }
  },

  /** @param {string} token */
  async set(token) {
    await Keychain.setGenericPassword('jwt', token, { service: TOKEN_SERVICE });
  },

  async clear() {
    try {
      await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
    } catch (e) {
      // ignore
    }
  },
};

export const login = async (email, password) => {
  const result = await safeRequest(() => api.post(AUTH_ENDPOINTS.LOGIN, { email, password }));
  if (result.success) {
    const token = result.data?.token;
    if (token) {
      await tokenStorage.set(token);
    }
  }
  return result;
};

export const register = async (userData) => {
  const result = await safeRequest(() => api.post(AUTH_ENDPOINTS.REGISTER, userData));
  if (result.success) {
    const token = result.data?.token;
    if (token) {
      await tokenStorage.set(token);
    }
  }
  return result;
};

export const logout = async () => {
  await tokenStorage.clear();
  return { success: true, data: true };
};

export const forgotPassword = async (email) => {
  return safeRequest(() => api.post(AUTH_ENDPOINTS.FORGOT_PASSWORD, { email }));
};

export const resetPassword = async (token, newPassword) => {
  return safeRequest(() => api.post(AUTH_ENDPOINTS.RESET_PASSWORD, { token, newPassword }));
};

export const refreshToken = async () => {
  // Backend refresh is protected in this project; if token is expired, refresh will fail.
  return safeRequest(() => api.post(AUTH_ENDPOINTS.REFRESH));
};
