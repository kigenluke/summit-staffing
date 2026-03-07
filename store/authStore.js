/**
 * Summit Staffing – auth state for the mobile app
 * Minimal store (no Zustand) so it works without extra deps.
 * Used by useAuthStore hook and by errorHandler for logout on 401.
 */

import { useState, useCallback, useEffect } from 'react';

let state = { token: null, user: null };
const listeners = new Set();

function getState() {
  return { ...state, logout };
}

function setState(next) {
  const nextState = typeof next === 'function' ? next(state) : next;
  if (nextState === state) return;
  state = { ...state, ...nextState };
  listeners.forEach((listener) => listener(state));
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
