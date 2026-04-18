const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { emitNewMessage, emitReadReceipt } = require('../services/socketService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const generateConversationId = (userId1, userId2) => {
  const [a, b] = [String(userId1), String(userId2)].sort();
  return `${a}_${b}`;
};

const assertInConversation = (conversationId, userId) => {
  if (!conversationId || typeof conversationId !== 'string') return false;
  const parts = conversationId.split('_');
  return parts.length === 2 && parts.includes(String(userId));
};

const getMessageRecipients = async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;

    if (role === 'worker') {
      const workerRes = await pool.query('SELECT id FROM workers WHERE user_id = $1 LIMIT 1', [userId]);
      if (workerRes.rowCount === 0) {
        return res.status(200).json({ ok: true, recipients: [] });
      }
      const workerId = workerRes.rows[0].id;
      const resRecipients = await pool.query(
        `SELECT DISTINCT p.user_id AS id, COALESCE(p.first_name, 'Participant') AS first_name, u.email
         FROM bookings b
         JOIN participants p ON p.id = b.participant_id
         JOIN users u ON u.id = p.user_id
         WHERE b.worker_id = $1
         ORDER BY first_name`,
        [workerId]
      );
      const recipients = (resRecipients.rows || []).map((r) => ({
        id: r.id,
        first_name: r.first_name,
        email: r.email,
      }));
      return res.status(200).json({ ok: true, recipients });
    }

    if (role === 'participant') {
      const partRes = await pool.query('SELECT id FROM participants WHERE user_id = $1 LIMIT 1', [userId]);
      if (partRes.rowCount === 0) {
        return res.status(200).json({ ok: true, recipients: [] });
      }
      const participantId = partRes.rows[0].id;
      const resRecipients = await pool.query(
        `SELECT DISTINCT w.user_id AS id, COALESCE(w.first_name, 'Worker') AS first_name, u.email
         FROM bookings b
         JOIN workers w ON w.id = b.worker_id
         JOIN users u ON u.id = w.user_id
         WHERE b.participant_id = $1
         ORDER BY first_name`,
        [participantId]
      );
      const recipients = (resRecipients.rows || []).map((r) => ({
        id: r.id,
        first_name: r.first_name,
        email: r.email,
      }));
      return res.status(200).json({ ok: true, recipients });
    }

    return res.status(200).json({ ok: true, recipients: [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch recipients' });
  }
};

const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;

    const convoRes = await pool.query(
      `SELECT DISTINCT ON (conversation_id)
          conversation_id,
          sender_id,
          receiver_id,
          message_text,
          read_status,
          created_at
       FROM messages
       WHERE sender_id = $1 OR receiver_id = $1
       ORDER BY conversation_id, created_at DESC`,
      [userId]
    );

    const rows = convoRes.rows || [];

    const otherUserIds = Array.from(
      new Set(
        rows.map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id)).filter(Boolean)
      )
    );

    let profilesByUserId = {};
    if (otherUserIds.length) {
      const profRes = await pool.query(
        `SELECT u.id AS user_id,
                COALESCE(p.first_name, w.first_name, 'User') AS first_name,
                u.role
         FROM users u
         LEFT JOIN participants p ON p.user_id = u.id
         LEFT JOIN workers w ON w.user_id = u.id
         WHERE u.id = ANY($1::uuid[])`,
        [otherUserIds]
      );

      profilesByUserId = profRes.rows.reduce((acc, r) => {
        acc[r.user_id] = { first_name: r.first_name, role: r.role };
        return acc;
      }, {});
    }

    const conversations = rows.map((r) => {
      const otherUserId = r.sender_id === userId ? r.receiver_id : r.sender_id;
      return {
        conversation_id: r.conversation_id,
        other_user_id: otherUserId,
        other_user: profilesByUserId[otherUserId] || null,
        last_message: {
          message_text: r.message_text,
          created_at: r.created_at,
          sender_id: r.sender_id,
          receiver_id: r.receiver_id,
          read_status: r.read_status
        }
      };
    });

    return res.status(200).json({ ok: true, conversations });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch conversations' });
  }
};

const getMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    if (!assertInConversation(conversationId, userId)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM messages WHERE conversation_id = $1', [conversationId]);

    const msgRes = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.receiver_id, m.message_text, m.read_status, m.created_at,
              COALESCE(p.first_name, w.first_name, 'User') AS sender_first_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN participants p ON p.user_id = u.id
       LEFT JOIN workers w ON w.user_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    return res.status(200).json({
      ok: true,
      total: countRes.rows[0]?.total || 0,
      limit,
      offset,
      messages: msgRes.rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch messages' });
  }
};

const sendMessage = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const senderId = req.user.userId;
    const { receiverId, messageText } = req.body;

    if (String(receiverId) === String(senderId)) {
      return res.status(400).json({ ok: false, error: 'You cannot message yourself' });
    }

    const userRes = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [receiverId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Recipient not found' });
    }

    const conversationId = generateConversationId(senderId, receiverId);

    const insertRes = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, receiver_id, message_text, read_status)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id, conversation_id, sender_id, receiver_id, message_text, read_status, created_at`,
      [conversationId, senderId, receiverId, messageText]
    );

    const message = insertRes.rows[0];

    emitNewMessage(conversationId, message);

    return res.status(201).json({ ok: true, message });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to send message' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { messageId } = req.params;

    const msgRes = await pool.query(
      'SELECT id, conversation_id, receiver_id, read_status FROM messages WHERE id = $1 LIMIT 1',
      [messageId]
    );

    if (msgRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Message not found' });
    }

    const msg = msgRes.rows[0];

    if (String(msg.receiver_id) !== String(userId)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (!msg.read_status) {
      await pool.query('UPDATE messages SET read_status = TRUE WHERE id = $1', [messageId]);
      emitReadReceipt(msg.conversation_id, { conversationId: msg.conversation_id, messageId, userId });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to mark message as read' });
  }
};

module.exports = {
  getMessageRecipients,
  getConversations,
  getMessages,
  sendMessage,
  markAsRead,
  generateConversationId
};
