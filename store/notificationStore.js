import { useSyncExternalStore } from 'react';
import { api } from '../services/api.js';

let refreshInFlight = null;
let lastUnreadFetchAt = 0;
const UNREAD_CACHE_MS = 12000;

const listeners = new Set();

let state = {
  unreadCount: 0,
  notifications: [],
  isLoading: false,
};

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((fn) => fn());
}

function getSnapshot() {
  return state;
}

export async function refreshUnreadCount(force = false) {
  const now = Date.now();
  if (!force && refreshInFlight) return refreshInFlight;
  if (!force && now - lastUnreadFetchAt < UNREAD_CACHE_MS) {
    return state.unreadCount;
  }

  refreshInFlight = (async () => {
    try {
      const { data } = await api.get('/api/notifications/unread-count');
      if (data?.ok) {
        const count = Math.max(0, Number(data.count) || 0);
        lastUnreadFetchAt = Date.now();
        state = { ...state, unreadCount: count };
        notify();
        return count;
      }
    } catch (_) {
      /* ignore */
    } finally {
      refreshInFlight = null;
    }
    return state.unreadCount;
  })();

  return refreshInFlight;
}

export function adjustUnreadCount(delta) {
  state = { ...state, unreadCount: Math.max(0, state.unreadCount + Number(delta || 0)) };
  notify();
}

export function setUnreadCount(count) {
  lastUnreadFetchAt = Date.now();
  state = { ...state, unreadCount: Math.max(0, Number(count) || 0) };
  notify();
}

export function addNotification(notification) {
  const item = {
    ...notification,
    id: notification?.id || `${Date.now()}-${Math.random()}`,
    read: Boolean(notification?.read),
    createdAt: notification?.createdAt || new Date().toISOString(),
  };

  state = {
    ...state,
    notifications: [item, ...state.notifications],
    unreadCount: state.unreadCount + (item.read ? 0 : 1),
  };
  notify();
}

export function markAsRead(id) {
  const list = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  const unread = list.filter((n) => n.read !== true).length;
  state = { ...state, notifications: list, unreadCount: unread };
  notify();
}

export function markAllAsRead() {
  const list = state.notifications.map((n) => ({ ...n, read: true }));
  state = { ...state, notifications: list, unreadCount: 0 };
  notify();
}

export function clearNotifications() {
  state = { ...state, notifications: [], unreadCount: 0 };
  notify();
}

/** Select a slice of notification state, e.g. (s) => s.unreadCount */
export function useNotificationStore(selector) {
  return useSyncExternalStore(
    subscribe,
    () => (selector ? selector(getSnapshot()) : getSnapshot()),
    () => (selector ? selector(getSnapshot()) : getSnapshot()),
  );
}

useNotificationStore.getState = () => ({
  ...getSnapshot(),
  refreshUnreadCount,
  adjustUnreadCount,
  setUnreadCount,
  addNotification,
  markAsRead,
  markAllAsRead,
  clearNotifications,
});
