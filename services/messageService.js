import { api, safeRequest } from './api';
import { tokenStorage } from './authService';

const base64Decode = (value) => {
  if (typeof global.atob === 'function') {
    return global.atob(value);
  }
  if (typeof atob === 'function') {
    return atob(value);
  }
  return null;
};

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = base64Decode(payload);
    if (!decoded) return null;
    const json = decodeURIComponent(
      decoded
        .split('')
        .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join('')
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
};

const getReceiverIdFromConversation = async (conversationId) => {
  const token = await tokenStorage.get();
  const payload = token ? decodeJwtPayload(token) : null;
  const userId = payload?.userId;

  const parts = String(conversationId || '').split('_');
  if (parts.length !== 2 || !userId) return null;
  const [a, b] = parts;
  return String(a) === String(userId) ? b : a;
};

export const getConversations = async () => {
  return safeRequest(() => api.get('/api/messages/conversations'));
};

export const getMessages = async (conversationId, params = {}) => {
  return safeRequest(() => api.get(`/api/messages/${conversationId}`, { params }));
};

export const sendMessage = async (conversationIdOrReceiverId, messageText) => {
  const value = String(conversationIdOrReceiverId || '');
  const receiverId = value.includes('_')
    ? await getReceiverIdFromConversation(value)
    : conversationIdOrReceiverId;

  if (!receiverId) {
    return { success: false, error: 'Unable to determine recipient for this conversation.' };
  }

  return safeRequest(() => api.post('/api/messages/send', { receiverId, messageText }));
};

export const markAsRead = async (messageId) => {
  return safeRequest(() => api.put(`/api/messages/${messageId}/read`));
};
