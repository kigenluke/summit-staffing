require('dotenv').config();

const axios = require('axios');

const pool = require('../config/database');

const sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    const type = data.type || 'general';
    const payloadJson = JSON.stringify(data || {});
    // Avoid accidental duplicates when caller already inserted an in-app row
    // right before triggering push for the same event.
    const dupRes = await pool.query(
      `SELECT id
       FROM notifications
       WHERE user_id = $1
         AND title = $2
         AND COALESCE(body, '') = COALESCE($3, '')
         AND type = $4
         AND COALESCE(data, '{}'::jsonb) = $5::jsonb
         AND created_at >= now() - interval '2 minutes'
       LIMIT 1`,
      [userId, title, body || null, type, payloadJson]
    );
    if (dupRes.rowCount === 0) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, body, type, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, title, body, type, payloadJson]
      );
    }
  } catch (dbErr) {
    console.error('Failed to save in-app notification:', dbErr.message);
  }

  try {
    const serverKey = process.env.FIREBASE_SERVER_KEY;
    if (!serverKey) {
      return;
    }

    const tokensRes = await pool.query('SELECT token FROM user_push_tokens WHERE user_id = $1', [userId]);
    const tokens = tokensRes.rows.map((r) => r.token).filter(Boolean);

    if (tokens.length === 0) {
      return;
    }

    await axios.post(
      'https://fcm.googleapis.com/fcm/send',
      {
        registration_ids: tokens,
        notification: {
          title,
          body
        },
        data
      },
      {
        headers: {
          Authorization: `key=${serverKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
  } catch (err) {
    // swallow notification errors
  }
};

module.exports = {
  sendPushNotification
};
