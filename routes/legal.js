const express = require('express');
const { body } = require('express-validator');

const auth = require('../middleware/auth');
const pool = require('../config/database');

const router = express.Router();

router.post(
  '/terms-acceptance',
  auth,
  [
    body('termsVersion').optional().isString(),
    body('acceptedAt').optional().isString(),
    body('deviceInfo').optional().isString(),
    body('ipAddress').optional().isString()
  ],
  async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const termsVersion = String(req.body?.termsVersion || '1.0');
      const acceptedAt = req.body?.acceptedAt ? new Date(req.body.acceptedAt) : new Date();

      const ipFromHeader = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
      const ip = String(req.body?.ipAddress || ipFromHeader || req.ip || '');
      const deviceInfo = String(req.body?.deviceInfo || '');

      const q = await pool.query(
        `INSERT INTO terms_acceptances (user_id, terms_version, accepted_at, ip_address, device_info)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, terms_version)
         DO UPDATE SET accepted_at = EXCLUDED.accepted_at, ip_address = EXCLUDED.ip_address, device_info = EXCLUDED.device_info
         RETURNING id`,
        [userId, termsVersion, acceptedAt, ip || null, deviceInfo || null]
      );

      return res.status(201).json({ ok: true, id: q.rows[0]?.id });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to store terms acceptance' });
    }
  }
);

module.exports = router;
