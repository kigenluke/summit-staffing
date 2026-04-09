import {create} from 'zustand';

export const useNotificationStore = create((set, get) => ({
  unreadCount: 0,
  notifications: [],
  isLoading: false,

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
    const list = get().notifications.map((n) => (n.id === id ? {...n, read: true} : n));
    const unread = list.filter((n) => !n.read).length;
    set({notifications: list, unreadCount: unread});
  },

  markAllAsRead: () => {
    const list = get().notifications.map((n) => ({...n, read: true}));
    set({notifications: list, unreadCount: 0});
  },

  clearNotifications: () => {
    set({notifications: [], unreadCount: 0});
  },

  setUnreadCount: (count) => {
    set({unreadCount: Math.max(0, Number(count) || 0)});
  },
}));
