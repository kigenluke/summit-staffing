const crypto = require('crypto');
const pool = require('../config/database');
const { getPlayStoreUrl, getAppStoreUrl } = require('../utils/storeUrls.cjs');
const { sendReferralInviteEmail } = require('../services/emailService');

const VALID_ROLES = new Set(['worker', 'participant']);
/** Referral share links always use the public website — never localhost or CORS origin lists. */
const REFERRAL_WEB_BASE = 'https://summitstaffing.com.au';

let referralSchemaReady = null;

async function ensureReferralSchema() {
  if (!referralSchemaReady) {
    referralSchemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS referral_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invited_email TEXT,
        role TEXT NOT NULL CHECK (role IN ('worker', 'participant')),
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS referral_invites_token_idx ON referral_invites (token);
      CREATE INDEX IF NOT EXISTS referral_invites_referrer_idx ON referral_invites (referrer_user_id);
    `).catch((err) => {
      referralSchemaReady = null;
      throw err;
    });
  }
  return referralSchemaReady;
}

const buildReferralLink = (token, role) =>
  `${REFERRAL_WEB_BASE}/refer?token=${encodeURIComponent(token)}&role=${encodeURIComponent(role)}`;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const createTokenRow = async ({ referrerUserId, role, email = null }) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO referral_invites (referrer_user_id, invited_email, role, token, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [referrerUserId, email, role, token, expiresAt]
  );
  return { token, expiresAt, link: buildReferralLink(token, role) };
};

const createReferralLink = async (req, res) => {
  try {
    await ensureReferralSchema();
    const role = String(req.body.role || '').trim();
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ ok: false, error: 'Role must be worker or participant' });
    }
    const row = await createTokenRow({ referrerUserId: req.user.userId, role });
    return res.status(200).json({ ok: true, role, ...row });
  } catch (err) {
    if (String(err?.message || '').includes('referral_invites')) {
      return res.status(503).json({
        ok: false,
        error: 'Referral tables are missing. Run migrations/referral_invites.sql on the database.',
      });
    }
    return res.status(500).json({ ok: false, error: 'Could not create referral link' });
  }
};

const sendReferralInvite = async (req, res) => {
  try {
    await ensureReferralSchema();
    const role = String(req.body.role || '').trim();
    const email = normalizeEmail(req.body.email);
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ ok: false, error: 'Role must be worker or participant' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Valid email is required' });
    }

    const existing = await pool.query(
      'SELECT id, email, role FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email]
    );
    if (existing.rowCount > 0) {
      return res.status(400).json({
        ok: false,
        error: 'This email already has a Summit Staffing account.',
      });
    }

    await pool.query(
      `DELETE FROM referral_invites
       WHERE referrer_user_id = $1 AND lower(invited_email) = lower($2) AND role = $3 AND consumed_at IS NULL`,
      [req.user.userId, email, role]
    );

    const { token, link } = await createTokenRow({
      referrerUserId: req.user.userId,
      role,
      email,
    });

    const referrerRes = await pool.query(
      `SELECT u.email,
              COALESCE(w.first_name, p.first_name, '') AS first_name,
              COALESCE(w.last_name, p.last_name, '') AS last_name
       FROM users u
       LEFT JOIN workers w ON w.user_id = u.id
       LEFT JOIN participants p ON p.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [req.user.userId]
    );
    const refRow = referrerRes.rows[0] || {};
    const referrerName =
      `${refRow.first_name || ''} ${refRow.last_name || ''}`.trim()
      || refRow.email?.split('@')[0]
      || 'Someone';

    try {
      await sendReferralInviteEmail({
        toEmail: email,
        referrerName,
        role,
        inviteUrl: link,
      });
    } catch (emailErr) {
      return res.status(503).json({
        ok: false,
        error: 'Could not send email. Check Mailgun settings or try again later.',
        link,
        token,
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Invitation email sent.',
      link,
      token,
      role,
    });
  } catch (err) {
    if (String(err?.message || '').includes('referral_invites')) {
      return res.status(503).json({
        ok: false,
        error: 'Referral tables are missing. Run migrations/referral_invites.sql on the database.',
      });
    }
    return res.status(500).json({ ok: false, error: 'Could not send referral invitation' });
  }
};

const validateReferralToken = async (req, res) => {
  try {
    await ensureReferralSchema();
    const token = String(req.query.token || '').trim();
    const role = String(req.query.role || '').trim();
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token is required' });
    }

    const result = await pool.query(
      `SELECT ri.role, ri.expires_at, ri.consumed_at, ri.invited_email,
              COALESCE(w.first_name, p.first_name, '') AS referrer_first,
              COALESCE(w.last_name, p.last_name, '') AS referrer_last,
              u.email AS referrer_email
       FROM referral_invites ri
       JOIN users u ON u.id = ri.referrer_user_id
       LEFT JOIN workers w ON w.user_id = u.id
       LEFT JOIN participants p ON p.user_id = u.id
       WHERE ri.token = $1
       LIMIT 1`,
      [token]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Invitation link is invalid or expired' });
    }
    const row = result.rows[0];
    if (role && row.role !== role) {
      return res.status(400).json({ ok: false, error: 'Invitation role does not match this link' });
    }
    if (row.consumed_at) {
      return res.status(410).json({ ok: false, error: 'This invitation has already been used' });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ ok: false, error: 'This invitation has expired' });
    }

    const referrerName =
      `${row.referrer_first || ''} ${row.referrer_last || ''}`.trim()
      || row.referrer_email?.split('@')[0]
      || 'A Summit Staffing member';

    return res.status(200).json({
      ok: true,
      role: row.role,
      invitedEmail: row.invited_email || null,
      referrerName,
      inviteUrl: buildReferralLink(token, row.role),
      playStoreUrl: getPlayStoreUrl(),
      appStoreUrl: getAppStoreUrl(),
    });
  } catch (err) {
    if (String(err?.message || '').includes('referral_invites')) {
      return res.status(503).json({ ok: false, error: 'Referral service is not configured on the server' });
    }
    return res.status(500).json({ ok: false, error: 'Could not validate invitation' });
  }
};

module.exports = {
  createReferralLink,
  sendReferralInvite,
  validateReferralToken,
};
