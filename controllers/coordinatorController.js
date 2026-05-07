const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { sendPushNotification } = require('../services/notificationService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getStats = async (req, res) => {
  try {
    const coordinatorUserId = req.user.userId;
    const statsRes = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE is_suspended = false) AS active_users,
         (SELECT COUNT(*)::int FROM participants) AS total_participants,
         (SELECT COUNT(*)::int FROM coordinator_participant_access
           WHERE coordinator_user_id = $1 AND status = 'pending') AS pending_requests`,
      [coordinatorUserId]
    );
    const row = statsRes.rows[0] || {};
    return res.status(200).json({
      ok: true,
      stats: {
        active_users: row.active_users ?? 0,
        total_participants: row.total_participants ?? 0,
        pending_requests: row.pending_requests ?? 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch stats' });
  }
};

const searchParticipantByEmail = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Valid email is required' });
    }
    const result = await pool.query(
      `SELECT p.id, p.user_id, p.first_name, p.last_name, u.email
       FROM participants p
       JOIN users u ON u.id = p.user_id
       WHERE lower(u.email) = lower($1)
       LIMIT 1`,
      [email]
    );
    if (result.rowCount === 0) {
      return res.status(200).json({ ok: true, participant: null });
    }
    const p = result.rows[0];
    return res.status(200).json({
      ok: true,
      participant: {
        id: p.id,
        user_id: p.user_id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        display_name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email.split('@')[0],
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Search failed' });
  }
};

const listMyManagedParticipants = async (req, res) => {
  try {
    const coordinatorUserId = req.user.userId;
    const result = await pool.query(
      `SELECT
         p.id,
         p.user_id,
         p.first_name,
         p.last_name,
         u.email
       FROM coordinator_participant_access cpa
       JOIN participants p ON p.user_id = cpa.participant_user_id
       JOIN users u ON u.id = p.user_id
       WHERE cpa.coordinator_user_id = $1 AND cpa.status = 'approved'
       ORDER BY p.first_name NULLS LAST, p.last_name NULLS LAST`,
      [coordinatorUserId]
    );
    const participants = result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      display_name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email.split('@')[0],
    }));
    return res.status(200).json({ ok: true, participants });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch managed participants' });
  }
};

const listParticipants = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const coordinatorUserId = req.user.userId;

    const result = await pool.query(
      `SELECT
         p.id,
         p.user_id,
         p.first_name,
         p.last_name,
         p.phone,
         p.address,
         p.profile_image_url,
         p.created_at,
         u.email,
         COALESCE(cpa.status::text, 'none') AS request_status
       FROM participants p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN coordinator_participant_access cpa
         ON cpa.participant_user_id = p.user_id
        AND cpa.coordinator_user_id = $1
       ORDER BY p.created_at DESC`,
      [coordinatorUserId]
    );

    return res.status(200).json({ ok: true, participants: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch participants' });
  }
};

const requestParticipantAccess = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const coordinatorUserId = req.user.userId;
    const { participantId } = req.params;

    const participantRes = await pool.query(
      `SELECT p.id, p.user_id, p.first_name, p.last_name
       FROM participants p
       WHERE p.id = $1
       LIMIT 1`,
      [participantId]
    );
    if (participantRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Participant not found' });
    }
    const participant = participantRes.rows[0];

    const coordinatorRes = await pool.query(
      `SELECT id, email FROM users WHERE id = $1 AND role = 'coordinator' LIMIT 1`,
      [coordinatorUserId]
    );
    if (coordinatorRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Only coordinator can request access' });
    }

    const coordName = `${coordinatorRes.rows[0].email.split('@')[0]}`;

    const upsertRes = await pool.query(
      `INSERT INTO coordinator_participant_access (
         coordinator_user_id, participant_user_id, status, requested_at, approved_at, rejected_at, initiator
       )
       VALUES ($1, $2, 'pending', now(), NULL, NULL, 'coordinator')
       ON CONFLICT (coordinator_user_id, participant_user_id)
       DO UPDATE SET
         status = 'pending',
         requested_at = now(),
         approved_at = NULL,
         rejected_at = NULL,
         initiator = 'coordinator'
       RETURNING id, status, requested_at`,
      [coordinatorUserId, participant.user_id]
    );
    const requestRow = upsertRes.rows[0];

    const participantDisplay = `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || 'Participant';

    await sendPushNotification(
      participant.user_id,
      'Coordinator access request',
      `${coordName} has requested to manage your account.`,
      {
        type: 'coordinator_access_request',
        requestId: requestRow.id,
        coordinatorUserId,
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
    return res.status(500).json({ ok: false, error: 'Failed to send access request' });
  }
};

const approveAccessRequest = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const participantUserId = req.user.userId;
    const { requestId } = req.params;

    const requestRes = await pool.query(
      `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status,
              COALESCE(cpa.initiator, 'coordinator') AS initiator,
              p.id AS participant_id, p.first_name, p.last_name
       FROM coordinator_participant_access cpa
       JOIN participants p ON p.user_id = cpa.participant_user_id
       WHERE cpa.id = $1
       LIMIT 1`,
      [requestId]
    );
    if (requestRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }

    const accessRequest = requestRes.rows[0];
    if (accessRequest.participant_user_id !== participantUserId) {
      return res.status(403).json({ ok: false, error: 'Only this participant can approve this request' });
    }
    if (accessRequest.initiator !== 'coordinator') {
      return res.status(400).json({ ok: false, error: 'This request is waiting for the coordinator to approve' });
    }

    const updatedRes = await pool.query(
      `UPDATE coordinator_participant_access
       SET status = 'approved', approved_at = now(), rejected_at = NULL
       WHERE id = $1
       RETURNING id, status, approved_at`,
      [requestId]
    );

    await sendPushNotification(
      accessRequest.coordinator_user_id,
      'Access approved',
      `${accessRequest.first_name || 'Participant'} approved your request to manage their account.`,
      {
        type: 'coordinator_access_approved',
        requestId: accessRequest.id,
        participantId: accessRequest.participant_id,
      }
    );

    return res.status(200).json({ ok: true, request: updatedRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to approve request' });
  }
};

const approveParticipantInitiatedRequest = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const coordinatorUserId = req.user.userId;
    const { requestId } = req.params;

    const requestRes = await pool.query(
      `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status,
              COALESCE(cpa.initiator, 'coordinator') AS initiator,
              p.id AS participant_id, p.first_name, p.last_name
       FROM coordinator_participant_access cpa
       JOIN participants p ON p.user_id = cpa.participant_user_id
       WHERE cpa.id = $1
       LIMIT 1`,
      [requestId]
    );
    if (requestRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }

    const accessRequest = requestRes.rows[0];
    if (accessRequest.coordinator_user_id !== coordinatorUserId) {
      return res.status(403).json({ ok: false, error: 'Only this coordinator can approve this request' });
    }
    if (accessRequest.initiator !== 'participant') {
      return res.status(400).json({ ok: false, error: 'This approval is only for participant-initiated requests' });
    }

    const updatedRes = await pool.query(
      `UPDATE coordinator_participant_access
       SET status = 'approved', approved_at = now(), rejected_at = NULL
       WHERE id = $1
       RETURNING id, status, approved_at`,
      [requestId]
    );

    await sendPushNotification(
      accessRequest.participant_user_id,
      'Coordinator approved',
      `Your coordinator can now help manage your account.`,
      {
        type: 'participant_access_approved',
        requestId: accessRequest.id,
        coordinatorUserId,
      }
    );

    return res.status(200).json({ ok: true, request: updatedRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to approve request' });
  }
};

module.exports = {
  getStats,
  searchParticipantByEmail,
  listMyManagedParticipants,
  listParticipants,
  requestParticipantAccess,
  approveAccessRequest,
  approveParticipantInitiatedRequest,
};
