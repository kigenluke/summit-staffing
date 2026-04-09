const { Server } = require('socket.io');

const socketAuth = require('../middleware/socketAuth');

let io;
const userSockets = new Map(); // userId -> Set(socketId)

const isUserInConversation = (conversationId, userId) => {
  if (!conversationId || typeof conversationId !== 'string') return false;
  const parts = conversationId.split('_');
  return parts.length === 2 && parts.includes(String(userId));
};

const addUserSocket = (userId, socketId) => {
  const existing = userSockets.get(userId) || new Set();
  existing.add(socketId);
  userSockets.set(userId, existing);
};

const removeUserSocket = (userId, socketId) => {
  const existing = userSockets.get(userId);
  if (!existing) return;
  existing.delete(socketId);
  if (existing.size === 0) userSockets.delete(userId);
};

const initSocket = (httpServer) => {
  if (io) return io;

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:19006'
  ];

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    const userId = socket.user?.userId;
    if (userId) {
      addUserSocket(userId, socket.id);
      socket.join(`user:${userId}`);
      io.to(`user:${userId}`).emit('online_status', { userId, online: true });
    }

    socket.on('join_conversation', ({ conversationId }) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') return;
        if (!userId || !isUserInConversation(conversationId, userId)) {
          socket.emit('error', { message: 'Forbidden' });
          return;
        }
        socket.join(`conversation:${conversationId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    socket.on('typing', ({ conversationId, isTyping }) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') return;
        if (!userId || !isUserInConversation(conversationId, userId)) return;
        socket.to(`conversation:${conversationId}`).emit('user_typing', { conversationId, userId, isTyping: Boolean(isTyping) });
      } catch (err) {
        socket.emit('error', { message: 'Typing event failed' });
      }
    });

    socket.on('read_message', ({ conversationId, messageId }) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') return;
        if (!userId || !isUserInConversation(conversationId, userId)) return;
        io.to(`conversation:${conversationId}`).emit('message_read', { conversationId, messageId, userId });
      } catch (err) {
        socket.emit('error', { message: 'Read receipt failed' });
      }
    });

    socket.on('disconnect', () => {
      try {
        if (userId) {
          removeUserSocket(userId, socket.id);
          const stillOnline = userSockets.has(userId);
          if (!stillOnline) {
            io.emit('online_status', { userId, online: false });
          }
        }
      } catch (err) {
        // ignore
      }
    });
  });

  return io;
};

const getIO = () => io;

const emitNewMessage = (conversationId, message) => {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit('new_message', message);
};

const emitReadReceipt = (conversationId, payload) => {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit('message_read', payload);
};

module.exports = {
  initSocket,
  getIO,
  emitNewMessage,
  emitReadReceipt
};
