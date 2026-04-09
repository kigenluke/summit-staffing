const { verifyToken } = require('../utils/jwt');

const socketAuth = (socket, next) => {
  try {
    const token =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
      socket.handshake?.query?.token;

    if (!token) {
      return next(new Error('Unauthorized'));
    }

    const decoded = verifyToken(token);
    socket.user = decoded;
    return next();
  } catch (err) {
    return next(new Error('Unauthorized'));
  }
};

module.exports = socketAuth;
