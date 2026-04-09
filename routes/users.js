const express = require('express');

const auth = require('../middleware/auth');
const pool = require('../config/database');

const router = express.Router();

const ensureRow = async (userId) => {
  await pool.query(
    `INSERT INTO user_onboarding (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
};

router.post('/onboarding-complete', auth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    await ensureRow(userId);
    await pool.query('UPDATE user_onboarding SET onboarding_completed_at = now(), updated_at = now() WHERE user_id = $1', [userId]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to update onboarding status' });
  }
});

router.post('/profile-setup-complete', auth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    await ensureRow(userId);
    await pool.query(
      "UPDATE user_onboarding SET profile_setup_completed_at = now(), profile_setup_skipped_at = NULL, updated_at = now() WHERE user_id = $1",
      [userId]
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to update profile setup status' });
  }
});

router.post('/profile-setup-skip', auth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    await ensureRow(userId);
    await pool.query(
      "UPDATE user_onboarding SET profile_setup_skipped_at = now(), updated_at = now() WHERE user_id = $1",
      [userId]
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to update profile setup status' });
  }
});

router.post('/permissions-complete', auth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    await ensureRow(userId);
    await pool.query('UPDATE user_onboarding SET permissions_completed_at = now(), updated_at = now() WHERE user_id = $1', [userId]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to update permissions status' });
  }
});

module.exports = router;
