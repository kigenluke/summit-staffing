const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { generateToken } = require('../utils/jwt');
const {
  sendPasswordResetEmail,
  sendVerificationEmail
} = require('../services/emailService');

const SALT_ROUNDS = 12;
const TOKEN_BYTES = 32;

const sha256 = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const register = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { email, password, role } = req.body;

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [normalizedEmail]);
      if (existing.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok: false, error: 'Email already registered' });
      }

      const userResult = await client.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, email_verified, created_at',
        [normalizedEmail, passwordHash, role]
      );

      const user = userResult.rows[0];

      if (role === 'worker') {
        const { abn, first_name, last_name, phone, address, work_as, vendor_categories } = req.body;
        const workerInsert = await client.query(
          'INSERT INTO workers (user_id, abn, first_name, last_name, phone, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [user.id, abn, first_name, last_name, phone || null, address || null]
        );
        const workerId = workerInsert.rows[0]?.id;
        if (work_as === 'vendor' && workerId && Array.isArray(vendor_categories) && vendor_categories.length > 0) {
          const uniqueCategories = [...new Set(vendor_categories.map((x) => String(x).trim()).filter(Boolean))];
          for (const category of uniqueCategories) {
            await client.query(
              'INSERT INTO worker_skills (worker_id, skill_name) VALUES ($1, $2) ON CONFLICT (worker_id, skill_name) DO NOTHING',
              [workerId, category]
            );
          }
        }
      }

      if (role === 'participant') {
        const {
          ndis_number,
          first_name,
          last_name,
          phone,
          address,
          who_needs_support,
          when_start_looking,
          over_18,
          funding_type,
        } = req.body;
        await client.query(
          `INSERT INTO participants (
            user_id, ndis_number, first_name, last_name, phone, address,
            who_needs_support, when_start_looking, over_18, funding_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            user.id,
            ndis_number || null,
            first_name || null,
            last_name || null,
            phone || null,
            address || null,
            who_needs_support || null,
            when_start_looking || null,
            over_18 === undefined ? null : Boolean(over_18),
            funding_type || null,
          ]
        );
      }

      const verificationToken = crypto.randomBytes(TOKEN_BYTES).toString('hex');
      const verificationTokenHash = sha256(verificationToken);
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [user.id]);
      await client.query(
        'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, verificationTokenHash, verificationExpiresAt]
      );

      await client.query('COMMIT');

      try {
        await sendVerificationEmail(user.email, verificationToken);
      } catch (emailErr) {
        // Email failure should not block registration
      }

      const token = generateToken({ userId: user.id, role: user.role, email: user.email }, '24h');
      return res.status(201).json({ ok: true, token, user });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { email, password } = req.body;
    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await pool.query(
      'SELECT id, email, password_hash, role, email_verified, is_suspended FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [normalizedEmail]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (user.is_suspended) {
      return res.status(403).json({ ok: false, error: 'Account suspended' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    await pool.query('UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1', [user.id]);

    const token = generateToken({ userId: user.id, role: user.role, email: user.email }, '24h');
    return res.status(200).json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        email_verified: user.email_verified
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Login failed' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { email } = req.body;
    const normalizedEmail = String(email).trim().toLowerCase();

    const userRes = await pool.query('SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1', [normalizedEmail]);

    // Always return success to avoid account enumeration
    if (userRes.rowCount === 0) {
      return res.status(200).json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
    }

    const user = userRes.rows[0];

    const resetToken = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    const resetTokenHash = sha256(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetTokenHash, expiresAt]
    );

    await sendPasswordResetEmail(user.email, resetToken);

    return res.status(200).json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Forgot password failed' });
  }
};

const resetPassword = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { token, newPassword } = req.body;

    const tokenHash = sha256(token);

    const tokenRes = await pool.query(
      'SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1',
      [tokenHash]
    );

    if (tokenRes.rowCount === 0) {
      return res.status(400).json({ ok: false, error: 'Invalid or expired reset token' });
    }

    const row = tokenRes.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
      return res.status(400).json({ ok: false, error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, row.user_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);

    return res.status(200).json({ ok: true, message: 'Password updated' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Reset password failed' });
  }
};

const verifyEmail = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { token } = req.body;
    const tokenHash = sha256(token);

    const tokenRes = await pool.query(
      'SELECT user_id, expires_at FROM email_verification_tokens WHERE token_hash = $1 LIMIT 1',
      [tokenHash]
    );

    if (tokenRes.rowCount === 0) {
      return res.status(400).json({ ok: false, error: 'Invalid or expired verification token' });
    }

    const row = tokenRes.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query('DELETE FROM email_verification_tokens WHERE token_hash = $1', [tokenHash]);
      return res.status(400).json({ ok: false, error: 'Invalid or expired verification token' });
    }

    await pool.query('UPDATE users SET email_verified = TRUE, updated_at = now() WHERE id = $1', [row.user_id]);
    await pool.query('DELETE FROM email_verification_tokens WHERE token_hash = $1', [tokenHash]);

    return res.status(200).json({ ok: true, message: 'Email verified' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Verify email failed' });
  }
};

const refreshToken = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1 LIMIT 1', [req.user.userId]);
    if (result.rowCount === 0) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const user = result.rows[0];
    const token = generateToken({ userId: user.id, role: user.role, email: user.email }, '24h');
    return res.status(200).json({ ok: true, token });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Refresh token failed' });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
  refreshToken
};
