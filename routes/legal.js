const express = require('express');
const { body, validationResult } = require('express-validator');

const auth = require('../middleware/auth');
const pool = require('../config/database');

const router = express.Router();

let termsTableReadyPromise = null;

function ensureTermsTable() {
  if (!termsTableReadyPromise) {
    termsTableReadyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS terms_acceptances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        terms_version TEXT NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ip_address TEXT,
        device_info TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT terms_acceptances_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT terms_acceptances_user_version_uq UNIQUE (user_id, terms_version)
      );
      CREATE INDEX IF NOT EXISTS terms_acceptances_user_id_idx ON terms_acceptances (user_id);
    `).catch((err) => {
      termsTableReadyPromise = null;
      throw err;
    });
  }
  return termsTableReadyPromise;
}

router.post(
  '/terms-acceptance',
  auth,
  [
    body('termsVersion').optional().isString(),
    body('acceptedAt').optional().isString(),
    body('deviceInfo').optional().isString(),
    body('ipAddress').optional().isString(),
  ],
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          ok: false,
          error: validationErrors.array().map((e) => e.msg).join(' '),
        });
      }

      await ensureTermsTable();

      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const termsVersion = String(req.body?.termsVersion || '1.0');
      const acceptedAt = req.body?.acceptedAt ? new Date(req.body.acceptedAt) : new Date();
      if (Number.isNaN(acceptedAt.getTime())) {
        return res.status(400).json({ ok: false, error: 'Invalid acceptance date' });
      }

      const ipFromHeader = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
      const ip = String(req.body?.ipAddress || ipFromHeader || req.ip || '');
      const deviceInfo = String(req.body?.deviceInfo || '');

      const q = await pool.query(
        `INSERT INTO terms_acceptances (user_id, terms_version, accepted_at, ip_address, device_info)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, terms_version)
         DO UPDATE SET accepted_at = EXCLUDED.accepted_at, ip_address = EXCLUDED.ip_address, device_info = EXCLUDED.device_info
         RETURNING id`,
        [userId, termsVersion, acceptedAt, ip || null, deviceInfo || null],
      );

      return res.status(201).json({ ok: true, id: q.rows[0]?.id });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[terms-acceptance]', err);
      const missingTable = err?.code === '42P01';
      return res.status(500).json({
        ok: false,
        error: missingTable
          ? 'Terms acceptance could not be saved — database setup is incomplete.'
          : 'Failed to store terms acceptance',
        hint: 'Please try again. If the problem continues, contact support@summitstaffing.com.au.',
      });
    }
  },
);

router.get('/terms-acceptance', auth, async (req, res) => {
  try {
    await ensureTermsTable();
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const termsVersion = String(req.query?.termsVersion || '1.0');
    const q = await pool.query(
      `SELECT id, terms_version, accepted_at
       FROM terms_acceptances
       WHERE user_id = $1 AND terms_version = $2
       LIMIT 1`,
      [userId, termsVersion],
    );

    return res.status(200).json({
      ok: true,
      accepted: q.rowCount > 0,
      acceptance: q.rows[0] || null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[terms-acceptance GET]', err);
    return res.status(500).json({ ok: false, error: 'Failed to check terms acceptance' });
  }
});

module.exports = router;
