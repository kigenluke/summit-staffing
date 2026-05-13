const crypto = require('crypto');
const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { uploadFile } = require('../services/s3Service');
const { validateNDISNumber } = require('../utils/ndisValidator');
const { sendPushNotification } = require('../services/notificationService');
const { sendCoordinatorInviteEmail } = require('../services/emailService');
let initiatorColumnAvailable = null;

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const hasInitiatorColumn = async () => {
  if (initiatorColumnAvailable !== null) return initiatorColumnAvailable;
  try {
    const colRes = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'coordinator_participant_access'
         AND column_name = 'initiator'
       LIMIT 1`
    );
    initiatorColumnAvailable = colRes.rowCount > 0;
  } catch (_) {
    initiatorColumnAvailable = false;
  }
  return initiatorColumnAvailable;
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
    about: participant.about,
    emergency_contact_name: participant.emergency_contact_name,
    emergency_contact_phone: participant.emergency_contact_phone,
    emergency_contact_relationship: participant.emergency_contact_relationship,
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
        p.about,
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
        about: participant.about,
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
      'management_type',
      'about',
      'emergency_contact_name',
      'emergency_contact_phone',
      'emergency_contact_relationship'
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
        if (
          key === 'emergency_contact_name'
          || key === 'emergency_contact_phone'
          || key === 'emergency_contact_relationship'
        ) {
          value = value == null ? null : String(value).trim();
          if (value === '') value = null;
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
      about: updated.about,
      emergency_contact_name: updated.emergency_contact_name,
      emergency_contact_phone: updated.emergency_contact_phone,
      emergency_contact_relationship: updated.emergency_contact_relationship,
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

const searchCoordinatorByEmail = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Valid email is required' });
    }
    const result = await pool.query(
      `SELECT u.id AS user_id, u.email
       FROM users u
       WHERE u.role = 'coordinator' AND lower(u.email) = lower($1)
       LIMIT 1`,
      [email]
    );
    if (result.rowCount === 0) {
      return res.status(200).json({ ok: true, coordinator: null });
    }
    const row = result.rows[0];
    return res.status(200).json({
      ok: true,
      coordinator: {
        user_id: row.user_id,
        email: row.email,
        display_name: row.email.split('@')[0],
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Search failed' });
  }
};

const requestCoordinatorAccess = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const participantUserId = req.user.userId;
    const { coordinatorUserId } = req.body;

    if (!coordinatorUserId) {
      return res.status(400).json({ ok: false, error: 'coordinatorUserId is required' });
    }

    const coordRes = await pool.query(
      `SELECT id, email FROM users WHERE id = $1 AND role = 'coordinator' LIMIT 1`,
      [coordinatorUserId]
    );
    if (coordRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Coordinator not found' });
    }

    const participant = await getParticipantForUser(participantUserId);
    if (!participant) {
      return res.status(404).json({ ok: false, error: 'Participant not found' });
    }

    const participantDisplay = `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || participant.email.split('@')[0];

    const hasInitiator = await hasInitiatorColumn();
    const upsertRes = hasInitiator
      ? await pool.query(
        `INSERT INTO coordinator_participant_access (
           coordinator_user_id, participant_user_id, status, requested_at, approved_at, rejected_at, initiator
         )
         VALUES ($1, $2, 'pending', now(), NULL, NULL, 'participant')
         ON CONFLICT (coordinator_user_id, participant_user_id)
         DO UPDATE SET
           status = 'pending',
           requested_at = now(),
           approved_at = NULL,
           rejected_at = NULL,
           initiator = 'participant'
         RETURNING id, status, requested_at`,
        [coordinatorUserId, participantUserId]
      )
      : await pool.query(
        `INSERT INTO coordinator_participant_access (
           coordinator_user_id, participant_user_id, status, requested_at, approved_at, rejected_at
         )
         VALUES ($1, $2, 'pending', now(), NULL, NULL)
         ON CONFLICT (coordinator_user_id, participant_user_id)
         DO UPDATE SET
           status = 'pending',
           requested_at = now(),
           approved_at = NULL,
           rejected_at = NULL
         RETURNING id, status, requested_at`,
        [coordinatorUserId, participantUserId]
      );
    const requestRow = upsertRes.rows[0];

    await sendPushNotification(
      coordinatorUserId,
      'Participant access request',
      `${participantDisplay} has requested that you manage their account.`,
      {
        type: 'participant_access_request',
        requestId: requestRow.id,
        participantUserId,
        participantId: participant.id,
      }
    );

    return res.status(200).json({
      ok: true,
      request: {
        id: requestRow.id,
        status: requestRow.status,
        requested_at: requestRow.requested_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to send request' });
  }
};

const inviteCoordinatorByEmail = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const participantUserId = req.user.userId;
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Valid email is required' });
    }

    const participant = await getParticipantForUser(participantUserId);
    if (!participant) {
      return res.status(404).json({ ok: false, error: 'Participant not found' });
    }

    const existing = await pool.query(
      'SELECT id, email, role FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email]
    );
    if (existing.rowCount > 0) {
      const u = existing.rows[0];
      if (u.role === 'coordinator') {
        return res.status(200).json({
          ok: true,
          mode: 'existing_coordinator',
          coordinator: {
            user_id: u.id,
            email: u.email,
            display_name: u.email.split('@')[0],
          },
        });
      }
      return res.status(400).json({
        ok: false,
        error: 'This email is already registered as a worker or participant. They need a different email for a coordinator account.',
      });
    }

    await pool.query(
      `DELETE FROM coordinator_email_invites
       WHERE participant_user_id = $1 AND lower(invited_email) = lower($2) AND consumed_at IS NULL`,
      [participantUserId, email]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO coordinator_email_invites (participant_user_id, invited_email, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [participantUserId, email, token, expiresAt]
    );

    const appUrl = (process.env.WEB_APP_URL || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
    const signupUrl = `${appUrl}/?coordinatorInvite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&role=coordinator`;

    const participantDisplay = `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || participant.email.split('@')[0];

    try {
      await sendCoordinatorInviteEmail(email, participantDisplay, signupUrl);
    } catch (emailErr) {
      // eslint-disable-next-line no-console
      console.error('sendCoordinatorInviteEmail failed:', emailErr?.message || emailErr);
      return res.status(503).json({
        ok: false,
        error: 'Could not send email. Check server Mailgun settings (MAILGUN_API_KEY, MAILGUN_DOMAIN) or try again later.',
        details: process.env.NODE_ENV !== 'production' ? String(emailErr?.message || emailErr).slice(0, 200) : undefined,
      });
    }

    return res.status(200).json({ ok: true, mode: 'invited', message: 'Invitation email sent.' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('inviteCoordinatorByEmail:', err);
    if (String(err?.message || '').includes('coordinator_email_invites')) {
      return res.status(503).json({
        ok: false,
        error: 'Database is missing coordinator invite tables. Run the latest schema migration (coordinator_email_invites), then try again.',
      });
    }
    return res.status(500).json({ ok: false, error: 'Failed to send invitation' });
  }
};

module.exports = {
  getParticipants,
  getParticipantById,
  getMe,
  updateParticipant,
  uploadProfilePhoto,
  verifyNDIS,
  searchCoordinatorByEmail,
  requestCoordinatorAccess,
  inviteCoordinatorByEmail,
};
