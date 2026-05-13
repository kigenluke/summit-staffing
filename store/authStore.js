/**
 * Summit Staffing – auth state for the mobile app
 * Web: persists to localStorage. Mobile: persists to AsyncStorage (rehydrate on app start).
 */

import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

const AUTH_KEY = 'summit_auth';
const IMPERSONATION_STASH_KEY = 'summit_coordinator_impersonation_stash';

/** In-memory copy of coordinator stash (participant session); web also mirrors to sessionStorage. */
let impersonationStashMemory = null;

function readImpersonationStashFromWebSession() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(IMPERSONATION_STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.coordinatorToken || !parsed?.coordinatorUser || !parsed?.participantUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Clear coordinator→participant impersonation stash (call on logout and before a fresh email login). */
export function clearCoordinatorImpersonationStashSync() {
  impersonationStashMemory = null;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(IMPERSONATION_STASH_KEY);
    } catch (_) {}
  }
  if (Platform.OS !== 'web') {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.removeItem(IMPERSONATION_STASH_KEY);
    } catch (_) {}
  }
}

/**
 * While signed in as coordinator: save coordinator session, then switch auth to participant (same JWT shape as login).
 */
export async function stashCoordinatorAndEnterParticipantSession(participantToken, participantUser) {
  const curToken = state.token;
  const curUser = state.user;
  if (!curToken || !curUser || curUser.role !== 'coordinator') {
    throw new Error('You must be signed in as a coordinator.');
  }
  const stash = {
    coordinatorToken: curToken,
    coordinatorUser: {
      id: curUser.id,
      email: curUser.email,
      role: curUser.role,
      email_verified: curUser.email_verified,
    },
    participantUserId: participantUser.id,
  };
  impersonationStashMemory = stash;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.setItem(IMPERSONATION_STASH_KEY, JSON.stringify(stash));
  } else {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(IMPERSONATION_STASH_KEY, JSON.stringify(stash));
    } catch (_) {}
  }
  setState({ token: participantToken, user: participantUser });
}

/** Restore coordinator session after viewing a managed participant account. */
export async function restoreCoordinatorFromImpersonationStash() {
  let stash = impersonationStashMemory || readImpersonationStashFromWebSession();
  if (!stash && Platform.OS !== 'web') {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const raw = await AsyncStorage.getItem(IMPERSONATION_STASH_KEY);
      if (raw) stash = JSON.parse(raw);
    } catch (_) {}
  }
  if (!stash?.coordinatorToken || !stash?.coordinatorUser) return false;
  impersonationStashMemory = null;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(IMPERSONATION_STASH_KEY);
    } catch (_) {}
  } else {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem(IMPERSONATION_STASH_KEY);
    } catch (_) {}
  }
  setState({ token: stash.coordinatorToken, user: stash.coordinatorUser });
  return true;
}

/** If current user is this participant and a coordinator stash exists, return stash (syncs memory from storage). */
export async function getActiveCoordinatorImpersonationStash(participantUserId) {
  let stash = impersonationStashMemory || readImpersonationStashFromWebSession();
  if (!stash && Platform.OS !== 'web') {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const raw = await AsyncStorage.getItem(IMPERSONATION_STASH_KEY);
      if (raw) stash = JSON.parse(raw);
    } catch (_) {}
  }
  if (!stash?.participantUserId || stash.participantUserId !== participantUserId) return null;
  impersonationStashMemory = stash;
  return stash;
}

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
  clearCoordinatorImpersonationStashSync();
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
