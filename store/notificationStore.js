import { create } from 'zustand';
import { api } from '../services/api.js';

let refreshInFlight = null;
let lastUnreadFetchAt = 0;
const UNREAD_CACHE_MS = 12000;

export const useNotificationStore = create((set, get) => ({
  unreadCount: 0,
  notifications: [],
  isLoading: false,

  refreshUnreadCount: async (force = false) => {
    const now = Date.now();
    if (!force && refreshInFlight) return refreshInFlight;
    if (!force && now - lastUnreadFetchAt < UNREAD_CACHE_MS) {
      return get().unreadCount;
    }

    refreshInFlight = (async () => {
      try {
        const { data } = await api.get('/api/notifications/unread-count');
        if (data?.ok) {
          const count = Math.max(0, Number(data.count) || 0);
          lastUnreadFetchAt = Date.now();
          set({ unreadCount: count });
          return count;
        }
      } catch (_) {
        /* ignore */
      } finally {
        refreshInFlight = null;
      }
      return get().unreadCount;
    })();

    return refreshInFlight;
  },

  adjustUnreadCount: (delta) => {
    set({ unreadCount: Math.max(0, get().unreadCount + Number(delta || 0)) });
  },

  setUnreadCount: (count) => {
    lastUnreadFetchAt = Date.now();
    set({ unreadCount: Math.max(0, Number(count) || 0) });
  },

  addNotification: (notification) => {
    const item = {
      ...notification,
      id: notification?.id || `${Date.now()}-${Math.random()}`,
      read: Boolean(notification?.read),
      createdAt: notification?.createdAt || new Date().toISOString(),
    };

    set({
      notifications: [item, ...get().notifications],
      unreadCount: get().unreadCount + (item.read ? 0 : 1),
    });
  },

  markAsRead: (id) => {
    const list = get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    const unread = list.filter((n) => n.read !== true).length;
    set({ notifications: list, unreadCount: unread });
  },

  markAllAsRead: () => {
    const list = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications: list, unreadCount: 0 });
  },

  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0 });
  },
}));
