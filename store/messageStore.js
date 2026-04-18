import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {useAuthStore} from './authStore.js';
import * as messageService from '../services/messageService';
import * as socketService from '../services/socketService';

const CACHE_KEY = 'summitstaffing.messages.cache.v1';

const buildConversationId = (userId1, userId2) => {
  const [a, b] = [String(userId1 || ''), String(userId2 || '')].sort();
  return `${a}_${b}`;
};

const computeUnreadCount = (conversation, myUserId) => {
  const last = conversation?.last_message;
  if (!last) return 0;
  if (String(last.receiver_id) !== String(myUserId)) return 0;
  return last.read_status ? 0 : 1;
};

const smartSortConversations = (list, myUserId) => {
  const arr = [...(list || [])];
  arr.sort((a, b) => {
    const aUnread = computeUnreadCount(a, myUserId);
    const bUnread = computeUnreadCount(b, myUserId);
    if (aUnread !== bUnread) return bUnread - aUnread;
    const aTs = new Date(a?.last_message?.created_at || 0).getTime();
    const bTs = new Date(b?.last_message?.created_at || 0).getTime();
    return bTs - aTs;
  });
  return arr;
};

export const useMessageStore = create((set, get) => ({
  conversations: [],
  messagesByConversationId: {},
  onlineByUserId: {},
  typingByConversationId: {},
  searchQuery: '',
  isLoading: false,
  error: null,
  realtimeReady: false,

  hydrateCache: async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.conversations) set({conversations: parsed.conversations});
      if (parsed?.messagesByConversationId) set({messagesByConversationId: parsed.messagesByConversationId});
    } catch (e) {
      void e;
    }
  },

  persistCache: async () => {
    try {
      const {conversations, messagesByConversationId} = get();
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({conversations, messagesByConversationId}));
    } catch (e) {
      void e;
    }
  },

  initRealtime: () => {
    if (get().realtimeReady) return;

    socketService.connect();

    socketService.onNewMessage((msg) => {
      const myUserId = useAuthStore.getState().user?.id;
      const conversationId = msg?.conversation_id;
      if (!conversationId) return;

      set((state) => {
        const prev = state.messagesByConversationId[conversationId] || [];
        const exists = prev.some((m) => m.id === msg.id);
        const nextMsgs = exists ? prev : [msg, ...prev];

        const prevConvos = state.conversations || [];
        const idx = prevConvos.findIndex((c) => c.conversation_id === conversationId);
        const updated = {
          conversation_id: conversationId,
          other_user_id: msg.sender_id === myUserId ? msg.receiver_id : msg.sender_id,
          other_user: idx >= 0 ? prevConvos[idx].other_user : null,
          last_message: {
            message_text: msg.message_text,
            created_at: msg.created_at,
            sender_id: msg.sender_id,
            receiver_id: msg.receiver_id,
            read_status: msg.read_status,
          },
        };

        const merged = idx >= 0 ? [...prevConvos.slice(0, idx), {...prevConvos[idx], ...updated}, ...prevConvos.slice(idx + 1)] : [updated, ...prevConvos];
        return {
          messagesByConversationId: {...state.messagesByConversationId, [conversationId]: nextMsgs},
          conversations: smartSortConversations(merged, myUserId),
        };
      });

      void get().persistCache();
    });

    socketService.onMessageRead(({conversationId, messageId, userId}) => {
      if (!conversationId || !messageId) return;

      set((state) => {
        const prev = state.messagesByConversationId[conversationId] || [];
        const next = prev.map((m) => (m.id === messageId ? {...m, read_status: true} : m));
        return {messagesByConversationId: {...state.messagesByConversationId, [conversationId]: next}};
      });

      void userId;
      void get().persistCache();
    });

    socketService.onUserTyping(({conversationId, userId, isTyping}) => {
      if (!conversationId) return;
      set((state) => ({
        typingByConversationId: {
          ...state.typingByConversationId,
          [conversationId]: isTyping ? {userId, ts: Date.now()} : null,
        },
      }));
    });

    socketService.onOnlineStatus(({userId, online}) => {
      if (!userId) return;
      set((state) => ({onlineByUserId: {...state.onlineByUserId, [userId]: Boolean(online)}}));
    });

    set({realtimeReady: true});
  },

  setSearchQuery: (q) => set({searchQuery: q}),

  fetchConversations: async () => {
    const myUserId = useAuthStore.getState().user?.id;
    set({isLoading: true, error: null});
    const res = await messageService.getConversations();
    set({isLoading: false});

    if (!res.success) {
      set({error: res.error});
      return res;
    }

    const list = res.data?.conversations || [];
    set({conversations: smartSortConversations(list, myUserId), error: null});
    void get().persistCache();
    return res;
  },

  ensureConversation: async (otherUserId) => {
    const myUserId = useAuthStore.getState().user?.id;
    if (!myUserId || !otherUserId) return null;

    const conversationId = buildConversationId(myUserId, otherUserId);

    const existing = get().conversations.find((c) => c.conversation_id === conversationId);
    if (existing) return existing;

    // Create conversation lazily by fetching conversations; if still missing, return a placeholder.
    await get().fetchConversations();

    const updated = get().conversations.find((c) => c.conversation_id === conversationId);
    if (updated) return updated;

    const placeholder = {
      conversation_id: conversationId,
      other_user_id: otherUserId,
      other_user: {first_name: 'User'},
      last_message: null,
    };

    set((state) => ({conversations: smartSortConversations([placeholder, ...state.conversations], myUserId)}));
    void get().persistCache();
    return placeholder;
  },

  fetchMessages: async (conversationId, opts = {}) => {
    const {reset = false} = opts;

    const prev = get().messagesByConversationId[conversationId] || [];
    const offset = reset ? 0 : prev.length;

    const res = await messageService.getMessages(conversationId, {limit: 50, offset});
    if (!res.success) return res;

    const list = res.data?.messages || [];
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: reset ? list : [...prev, ...list],
      },
    }));

    void get().persistCache();
    return res;
  },

  sendTextMessage: async (conversationIdOrReceiverId, text) => {
    const messageText = String(text || '').trim();
    if (!messageText) return {success: false, error: 'Empty message'};

    const myUserId = useAuthStore.getState().user?.id;
    const tempId = `local-${Date.now()}-${Math.random()}`;

    // Optimistic insert
    set((state) => {
      const conversationId = String(conversationIdOrReceiverId || '');
      const prev = state.messagesByConversationId[conversationId] || [];
      const optimistic = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: myUserId,
        receiver_id: null,
        message_text: messageText,
        read_status: false,
        created_at: new Date().toISOString(),
        __optimistic: true,
      };
      return {messagesByConversationId: {...state.messagesByConversationId, [conversationId]: [optimistic, ...prev]}};
    });

    const res = await messageService.sendMessage(conversationIdOrReceiverId, messageText);
    if (!res.success) {
      // mark failed
      set((state) => {
        const cid = String(conversationIdOrReceiverId || '');
        const prev = state.messagesByConversationId[cid] || [];
        const next = prev.map((m) => (m.id === tempId ? {...m, __failed: true} : m));
        return {messagesByConversationId: {...state.messagesByConversationId, [cid]: next}};
      });
      void get().persistCache();
      return res;
    }

    const msg = res.data?.message;

    if (msg?.conversation_id) {
      set((state) => {
        const cid = msg.conversation_id;
        const prev = state.messagesByConversationId[cid] || [];
        const cleaned = prev.filter((m) => m.id !== tempId);
        const exists = cleaned.some((m) => m.id === msg.id);
        const next = exists ? cleaned : [msg, ...cleaned];
        return {messagesByConversationId: {...state.messagesByConversationId, [cid]: next}};
      });

      await get().fetchConversations();
      socketService.joinConversation(msg.conversation_id);
    }

    void get().persistCache();
    return res;
  },

  markConversationRead: async (conversationId) => {
    const myUserId = useAuthStore.getState().user?.id;
    const list = get().messagesByConversationId[conversationId] || [];
    const unread = list.filter((m) => String(m.receiver_id) === String(myUserId) && !m.read_status);

    for (const m of unread) {
      await messageService.markAsRead(m.id);
      socketService.sendRead(conversationId, m.id);
    }

    set((state) => {
      const prev = state.messagesByConversationId[conversationId] || [];
      const next = prev.map((m) => (String(m.receiver_id) === String(myUserId) ? {...m, read_status: true} : m));
      const convos = smartSortConversations(
        state.conversations.map((c) => (c.conversation_id === conversationId ? {...c, last_message: c.last_message ? {...c.last_message, read_status: true} : c.last_message} : c)),
        myUserId
      );
      return {messagesByConversationId: {...state.messagesByConversationId, [conversationId]: next}, conversations: convos};
    });

    void get().persistCache();
  },

  deleteConversationLocal: (conversationId) => {
    const myUserId = useAuthStore.getState().user?.id;
    set((state) => {
      const convos = smartSortConversations(state.conversations.filter((c) => c.conversation_id !== conversationId), myUserId);
      const nextMap = {...state.messagesByConversationId};
      delete nextMap[conversationId];
      return {conversations: convos, messagesByConversationId: nextMap};
    });
    void get().persistCache();
  },
}));
