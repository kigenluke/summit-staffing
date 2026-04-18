/**
 * Summit Staffing – auth state for the mobile app
 * Web: persists to localStorage. Mobile: persists to AsyncStorage (rehydrate on app start).
 */

import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

const AUTH_KEY = 'summit_auth';

function loadPersisted() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(AUTH_KEY);
      if (!raw) return { token: null, user: null };
      const { token, user } = JSON.parse(raw);
      return { token: token || null, user: user || null };
    } catch {
      return { token: null, user: null };
    }
  }
  return { token: null, user: null };
}

let state = loadPersisted();
const listeners = new Set();

function getState() {
  return { ...state, logout };
}

function persistToStorage(token, user) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    if (token && user) window.localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
    else window.localStorage.removeItem(AUTH_KEY);
    return;
  }
  if (Platform.OS !== 'web') {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      if (token && user) AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
      else AsyncStorage.removeItem(AUTH_KEY);
    } catch (_) {}
  }
}

function setState(next) {
  const nextState = typeof next === 'function' ? next(state) : next;
  if (nextState === state) return;
  state = { ...state, ...nextState };
  persistToStorage(state.token, state.user);
  listeners.forEach((listener) => listener(state));
}

/** Call once on app mount (e.g. from App.jsx) to restore auth from AsyncStorage on mobile. */
export async function rehydrateAuth() {
  if (Platform.OS === 'web') return;
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await AsyncStorage.getItem(AUTH_KEY);
    if (!raw) return;
    const { token, user } = JSON.parse(raw);
    if (token && user) setState({ token, user });
  } catch (_) {}
}

export function setAuth(token, user) {
  setState({ token: token ?? null, user: user ?? null });
}

export function logout() {
  setState({ token: null, user: null });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Hook: { token, user, setAuth, logout, isAuthenticated }
 */
export function useAuthStore() {
  const [snapshot, setSnapshot] = useState(getState);

  useEffect(() => {
    return subscribe(setSnapshot);
  }, []);

  return {
    token: snapshot.token,
    user: snapshot.user,
    setAuth,
    logout,
    isAuthenticated: Boolean(snapshot.token),
  };
}

// Attach getState to the hook so useAuthStore.getState() works (for errorHandler)
useAuthStore.getState = getState;

export { getState };
