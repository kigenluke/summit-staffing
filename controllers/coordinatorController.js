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

    const upsertRes = await pool.query(
      `INSERT INTO coordinator_participant_access (coordinator_user_id, participant_user_id, status, requested_at, approved_at, rejected_at)
       VALUES ($1, $2, 'pending', now(), NULL, NULL)
       ON CONFLICT (coordinator_user_id, participant_user_id)
       DO UPDATE SET status = 'pending', requested_at = now(), approved_at = NULL, rejected_at = NULL
       RETURNING id, status, requested_at`,
      [coordinatorUserId, participant.user_id]
    );
    const requestRow = upsertRes.rows[0];

    await sendPushNotification(
      participant.user_id,
      'Coordinator access request',
      `${coordinatorRes.rows[0].email} requested access to manage your account.`,
      {
        type: 'coordinator_access_request',
        requestId: requestRow.id,
        coordinatorUserId,
        participantId: participant.id
      }
    );

    return res.status(200).json({
      ok: true,
      request: {
        id: requestRow.id,
        status: requestRow.status,
        requested_at: requestRow.requested_at
      }
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
      return res.status(403).json({ ok: false, error: 'Only participant can approve this request' });
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
      `Your request to manage ${accessRequest.first_name || 'participant'} ${accessRequest.last_name || ''}`.trim(),
      {
        type: 'coordinator_access_approved',
        requestId: accessRequest.id,
        participantId: accessRequest.participant_id
      }
    );

    return res.status(200).json({ ok: true, request: updatedRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to approve request' });
  }
};

module.exports = {
  listParticipants,
  requestParticipantAccess,
  approveAccessRequest
};
