const pool = require('../config/database');

// ── GET /api/notifications ───────────────────────────────────────
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unread === 'true';

    const whereClause = unreadOnly
      ? 'WHERE user_id = $1 AND read = false'
      : 'WHERE user_id = $1';

    const { rows } = await pool.query(
      `SELECT * FROM notifications ${whereClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM notifications ${whereClause}`,
      [userId]
    );
    const total = parseInt(countRes.rows[0].count, 10);

    return res.json({
      ok: true,
      notifications: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch notifications' });
  }
};

// ── GET /api/notifications/unread-count ──────────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
      [userId]
    );
    return res.json({ ok: true, count: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch count' });
  }
};

// ── PUT /api/notifications/:id/read ──────────────────────────────
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Notification not found' });
    }

    return res.json({ ok: true, notification: result.rows[0] });
  } catch (err) {
    console.error('markAsRead error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to mark as read' });
  }
};

// ── PUT /api/notifications/read-all ──────────────────────────────
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    await pool.query(
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
      [userId]
    );
    return res.json({ ok: true, message: 'All notifications marked as read' });
  } catch (err) {
    console.error('markAllAsRead error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to mark all as read' });
  }
};

// ── DELETE /api/notifications/:id ────────────────────────────────
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Notification not found' });
    }

    return res.json({ ok: true, message: 'Notification deleted' });
  } catch (err) {
    console.error('deleteNotification error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to delete notification' });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
