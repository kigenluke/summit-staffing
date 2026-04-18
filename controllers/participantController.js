const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { uploadFile } = require('../services/s3Service');
const { validateNDISNumber } = require('../utils/ndisValidator');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const isAdmin = (req) => {
  return req.user && req.user.role === 'admin';
};

const getParticipantForUser = async (userId) => {
  const res = await pool.query(
    `SELECT
      p.*, u.email, u.email_verified
     FROM participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1
     LIMIT 1`,
    [userId]
  );
  return res.rowCount ? res.rows[0] : null;
};

const safeParticipantForUser = (participant) => {
  if (!participant) return null;
  return {
    id: participant.id,
    user_id: participant.user_id,
    first_name: participant.first_name,
    last_name: participant.last_name,
    phone: participant.phone,
    address: participant.address,
    latitude: participant.latitude,
    longitude: participant.longitude,
    management_type: participant.management_type,
    plan_manager_name: participant.plan_manager_name,
    plan_manager_email: participant.plan_manager_email,
    plan_manager_phone: participant.plan_manager_phone,
    monthly_budget: participant.monthly_budget,
    ndis_number: participant.ndis_number,
    profile_image_url: participant.profile_image_url,
    created_at: participant.created_at,
    updated_at: participant.updated_at,
    email: participant.email,
    email_verified: participant.email_verified
  };
};

const getMe = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const participant = await getParticipantForUser(req.user.userId);
    if (!participant) {
      return res.status(404).json({ ok: false, error: 'Participant not found' });
    }

    return res.status(200).json({ ok: true, participant: safeParticipantForUser(participant) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch participant' });
  }
};

const uploadProfilePhoto = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const participant = await getParticipantForUser(req.user.userId);
    if (!participant) {
      return res.status(404).json({ ok: false, error: 'Participant not found' });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'File is required' });
    }

    const folder = `participant-profiles/${participant.id}`;
    const fileUrl = await uploadFile(req.file, folder);

    const updated = await pool.query('UPDATE participants SET profile_image_url = $2, updated_at = now() WHERE id = $1 RETURNING *', [
      participant.id,
      fileUrl
    ]);

    return res.status(200).json({ ok: true, participant: safeParticipantForUser({ ...participant, ...updated.rows[0] }) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to upload profile photo' });
  }
};

const getParticipants = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM participants');

    const dataRes = await pool.query(
      `SELECT
        p.id,
        p.user_id,
        p.ndis_number,
        p.first_name,
        p.last_name,
        p.phone,
        p.address,
        p.latitude,
        p.longitude,
        p.plan_manager_name,
        p.plan_manager_email,
        p.plan_manager_phone,
        p.management_type,
        p.created_at,
        p.updated_at,
        u.email,
        u.email_verified
      FROM participants p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.status(200).json({
      ok: true,
      total: countRes.rows[0]?.total || 0,
      limit,
      offset,
      participants: dataRes.rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch participants' });
  }
};

const getParticipantById = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;

    const participantRes = await pool.query(
      `SELECT
        p.*, u.email, u.email_verified
      FROM participants p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = $1
      LIMIT 1`,
      [id]
    );

    if (participantRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Participant not found' });
    }

    const participant = participantRes.rows[0];

    const canView = isAdmin(req) || (req.user && req.user.userId === participant.user_id);
    if (!canView) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (!isAdmin(req)) {
      // protect participant data for non-admin
      const safe = {
        id: participant.id,
        user_id: participant.user_id,
        first_name: participant.first_name,
        last_name: participant.last_name,
        phone: participant.phone,
        address: participant.address,
        latitude: participant.latitude,
        longitude: participant.longitude,
        management_type: participant.management_type,
        monthly_budget: participant.monthly_budget,
        created_at: participant.created_at,
        updated_at: participant.updated_at,
        email: participant.email,
        email_verified: participant.email_verified
      };
      return res.status(200).json({ ok: true, participant: safe });
    }

    return res.status(200).json({ ok: true, participant });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch participant' });
  }
};

const updateParticipant = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;

    const participantRes = await pool.query('SELECT id, user_id FROM participants WHERE id = $1 LIMIT 1', [id]);
    if (participantRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Participant not found' });
    }

    const participant = participantRes.rows[0];

    if (!req.user || req.user.userId !== participant.user_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const allowed = [
      'ndis_number',
      'first_name',
      'last_name',
      'phone',
      'address',
      'latitude',
      'longitude',
      'plan_manager_name',
      'plan_manager_email',
      'plan_manager_phone',
      'monthly_budget',
      'management_type'
    ];

    const fields = [];
    const params = [];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        let value = req.body[key];
        if (key === 'ndis_number') {
          value = value == null ? null : String(value).trim();
          if (value === '') value = null;
        }
        if (key === 'ndis_number' && value && !validateNDISNumber(value)) {
          return res.status(400).json({ ok: false, error: 'Invalid NDIS number format' });
        }
        params.push(value);
        fields.push(`${key} = $${params.length}`);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }

    params.push(id);

    const updateSql = `UPDATE participants SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`;
    const updatedRes = await pool.query(updateSql, params);

    const updated = updatedRes.rows[0];

    const safe = {
      id: updated.id,
      user_id: updated.user_id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      phone: updated.phone,
      address: updated.address,
      latitude: updated.latitude,
      longitude: updated.longitude,
      management_type: updated.management_type,
      monthly_budget: updated.monthly_budget,
      created_at: updated.created_at,
      updated_at: updated.updated_at
    };

    return res.status(200).json({ ok: true, participant: safe });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to update participant' });
  }
};

const verifyNDIS = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { ndisNumber } = req.body;
    const valid = validateNDISNumber(ndisNumber);

    return res.status(200).json({ ok: true, valid });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to verify NDIS number' });
  }
};

module.exports = {
  getParticipants,
  getParticipantById,
  getMe,
  updateParticipant,
  uploadProfilePhoto,
  verifyNDIS
};
