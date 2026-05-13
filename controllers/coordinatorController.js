const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { sendPushNotification } = require('../services/notificationService');
let initiatorColumnAvailable = null;

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getMyProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const uRes = await pool.query('SELECT id, email FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (uRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    let row = {};
    try {
      const pRes = await pool.query(
        'SELECT user_id, first_name, last_name, phone, address, latitude, longitude FROM coordinator_profiles WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (pRes.rowCount) row = pRes.rows[0];
    } catch (err) {
      if (String(err?.message || '').includes('coordinator_profiles')) {
        return res.status(503).json({
          ok: false,
          error: 'Coordinator profile storage is not set up yet. Run the latest database migration (coordinator_profiles table).',
        });
      }
      throw err;
    }

    const coordinator = {
      id: userId,
      user_id: userId,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      email: uRes.rows[0].email,
    };
    return res.status(200).json({ ok: true, coordinator });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getMyProfile coordinator', err);
    return res.status(500).json({ ok: false, error: 'Failed to load profile' });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const uRes = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (uRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const fn = req.body.first_name != null ? String(req.body.first_name).trim() || null : null;
    const ln = req.body.last_name != null ? String(req.body.last_name).trim() || null : null;
    const phone = req.body.phone != null ? String(req.body.phone).trim() || null : null;
    const address = req.body.address != null ? String(req.body.address).trim() || null : null;
    const lat = req.body.latitude != null && req.body.latitude !== '' ? Number(req.body.latitude) : null;
    const lng = req.body.longitude != null && req.body.longitude !== '' ? Number(req.body.longitude) : null;

    await pool.query(
      `INSERT INTO coordinator_profiles (user_id, first_name, last_name, phone, address, latitude, longitude, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (user_id) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         updated_at = now()`,
      [userId, fn, ln, phone, address, lat, lng]
    );

    const pRes = await pool.query(
      'SELECT user_id, first_name, last_name, phone, address, latitude, longitude FROM coordinator_profiles WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const row = pRes.rows[0] || {};
    const coordinator = {
      id: userId,
      user_id: userId,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
    };
    return res.status(200).json({ ok: true, coordinator });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('updateMyProfile coordinator', err);
    if (String(err?.message || '').includes('coordinator_profiles')) {
      return res.status(503).json({
        ok: false,
        error: 'Coordinator profile storage is not set up yet. Run the latest database migration (coordinator_profiles table).',
      });
    }
    return res.status(500).json({ ok: false, error: 'Failed to update profile' });
  }
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
         p.phone,
         p.address,
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
      phone: row.phone,
      address: row.address,
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

    const hasInitiator = await hasInitiatorColumn();
    const upsertRes = hasInitiator
      ? await pool.query(
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

    const hasInitiator = await hasInitiatorColumn();
    const requestRes = hasInitiator
      ? await pool.query(
        `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status,
                COALESCE(cpa.initiator, 'coordinator') AS initiator,
                p.id AS participant_id, p.first_name, p.last_name
         FROM coordinator_participant_access cpa
         JOIN participants p ON p.user_id = cpa.participant_user_id
         WHERE cpa.id = $1
         LIMIT 1`,
        [requestId]
      )
      : await pool.query(
        `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status,
                'coordinator'::text AS initiator,
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

const mapAccessRowForCoordinator = (row) => ({
  id: row.id,
  status: row.status,
  requested_at: row.requested_at,
  initiator: row.initiator || null,
  participant: {
    id: row.participant_table_id,
    user_id: row.participant_user_id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.participant_email,
    display_name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || (row.participant_email || '').split('@')[0],
  },
});

const listCoordinatorAccessRequests = async (req, res) => {
  try {
    const coordinatorUserId = req.user.userId;
    const hasInitiator = await hasInitiatorColumn();
    const baseSelect = `
      SELECT
        cpa.id,
        cpa.status,
        cpa.requested_at,
        ${hasInitiator ? 'cpa.initiator' : `NULL::text AS initiator`},
        cpa.participant_user_id,
        p.id AS participant_table_id,
        p.first_name,
        p.last_name,
        u.email AS participant_email
      FROM coordinator_participant_access cpa
      JOIN participants p ON p.user_id = cpa.participant_user_id
      JOIN users u ON u.id = p.user_id
      WHERE cpa.coordinator_user_id = $1 AND cpa.status = 'pending'
    `;
    if (hasInitiator) {
      const [inc, out] = await Promise.all([
        pool.query(`${baseSelect} AND cpa.initiator = 'participant' ORDER BY cpa.requested_at DESC`, [coordinatorUserId]),
        pool.query(`${baseSelect} AND cpa.initiator = 'coordinator' ORDER BY cpa.requested_at DESC`, [coordinatorUserId]),
      ]);
      return res.status(200).json({
        ok: true,
        incoming: inc.rows.map(mapAccessRowForCoordinator),
        outgoing: out.rows.map(mapAccessRowForCoordinator),
      });
    }
    const all = await pool.query(`${baseSelect} ORDER BY cpa.requested_at DESC`, [coordinatorUserId]);
    const rows = all.rows.map(mapAccessRowForCoordinator);
    return res.status(200).json({ ok: true, incoming: rows, outgoing: [], legacy_no_initiator_column: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('listCoordinatorAccessRequests', err);
    return res.status(500).json({ ok: false, error: 'Failed to list access requests' });
  }
};

const rejectParticipantInitiatedRequest = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const coordinatorUserId = req.user.userId;
    const { requestId } = req.params;

    const hasInitiator = await hasInitiatorColumn();
    const requestRes = hasInitiator
      ? await pool.query(
        `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status,
                COALESCE(cpa.initiator, 'coordinator') AS initiator
         FROM coordinator_participant_access cpa
         WHERE cpa.id = $1 LIMIT 1`,
        [requestId]
      )
      : await pool.query(
        `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status,
                'participant'::text AS initiator
         FROM coordinator_participant_access cpa
         WHERE cpa.id = $1 LIMIT 1`,
        [requestId]
      );
    if (requestRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }
    const accessRequest = requestRes.rows[0];
    if (accessRequest.coordinator_user_id !== coordinatorUserId) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    if (accessRequest.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'Request is no longer pending' });
    }
    if (hasInitiator && accessRequest.initiator !== 'participant') {
      return res.status(400).json({ ok: false, error: 'Use withdraw for requests you sent' });
    }

    await pool.query(
      `UPDATE coordinator_participant_access
       SET status = 'rejected', rejected_at = now(), approved_at = NULL
       WHERE id = $1
       RETURNING id, status, rejected_at`,
      [requestId]
    );

    await sendPushNotification(
      accessRequest.participant_user_id,
      'Coordinator declined',
      'Your coordinator declined the request to manage your account.',
      { type: 'participant_access_rejected', requestId: accessRequest.id }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to reject request' });
  }
};

const withdrawCoordinatorAccessRequest = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const coordinatorUserId = req.user.userId;
    const { requestId } = req.params;

    const hasInitiator = await hasInitiatorColumn();
    if (!hasInitiator) {
      return res.status(400).json({ ok: false, error: 'Withdraw requires initiator column migration' });
    }

    const requestRes = await pool.query(
      `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status, cpa.initiator
       FROM coordinator_participant_access cpa WHERE cpa.id = $1 LIMIT 1`,
      [requestId]
    );
    if (requestRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }
    const accessRequest = requestRes.rows[0];
    if (accessRequest.coordinator_user_id !== coordinatorUserId) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    if (accessRequest.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'Request is no longer pending' });
    }
    if (accessRequest.initiator !== 'coordinator') {
      return res.status(400).json({ ok: false, error: 'Only outgoing coordinator requests can be withdrawn here' });
    }

    await pool.query(
      `UPDATE coordinator_participant_access
       SET status = 'rejected', rejected_at = now(), approved_at = NULL
       WHERE id = $1`,
      [requestId]
    );

    await sendPushNotification(
      accessRequest.participant_user_id,
      'Coordinator request cancelled',
      'A coordinator withdrew their request to manage your account.',
      { type: 'coordinator_access_withdrawn', requestId: accessRequest.id }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to withdraw request' });
  }
};

const getManagedParticipantProfile = async (req, res) => {
  try {
    const coordinatorUserId = req.user.userId;
    const { participantId } = req.params;

    const result = await pool.query(
      `SELECT
         p.id,
         p.user_id,
         p.first_name,
         p.last_name,
         p.phone,
         p.address,
         p.latitude,
         p.longitude,
         p.ndis_number,
         p.about,
         p.management_type,
         p.monthly_budget,
         p.plan_manager_name,
         p.plan_manager_email,
         p.plan_manager_phone,
         p.profile_image_url,
         p.emergency_contact_name,
         p.emergency_contact_phone,
         p.emergency_contact_relationship,
         u.email,
         u.email_verified
       FROM participants p
       JOIN users u ON u.id = p.user_id
       INNER JOIN coordinator_participant_access cpa
         ON cpa.participant_user_id = p.user_id
        AND cpa.coordinator_user_id = $1
        AND cpa.status = 'approved'
       WHERE p.id = $2
       LIMIT 1`,
      [coordinatorUserId, participantId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Participant not found or access not approved' });
    }
    const p = result.rows[0];
    return res.status(200).json({
      ok: true,
      participant: {
        id: p.id,
        user_id: p.user_id,
        first_name: p.first_name,
        last_name: p.last_name,
        phone: p.phone,
        address: p.address,
        latitude: p.latitude != null ? Number(p.latitude) : null,
        longitude: p.longitude != null ? Number(p.longitude) : null,
        ndis_number: p.ndis_number,
        about: p.about,
        management_type: p.management_type,
        monthly_budget: p.monthly_budget,
        plan_manager_name: p.plan_manager_name,
        plan_manager_email: p.plan_manager_email,
        plan_manager_phone: p.plan_manager_phone,
        profile_image_url: p.profile_image_url,
        emergency_contact_name: p.emergency_contact_name,
        emergency_contact_phone: p.emergency_contact_phone,
        emergency_contact_relationship: p.emergency_contact_relationship,
        email: p.email,
        email_verified: p.email_verified,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getManagedParticipantProfile', err);
    return res.status(500).json({ ok: false, error: 'Failed to load participant' });
  }
};

const approveParticipantInitiatedRequest = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const coordinatorUserId = req.user.userId;
    const { requestId } = req.params;

    const hasInitiator = await hasInitiatorColumn();
    const requestRes = hasInitiator
      ? await pool.query(
        `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status,
                COALESCE(cpa.initiator, 'coordinator') AS initiator,
                p.id AS participant_id, p.first_name, p.last_name
         FROM coordinator_participant_access cpa
         JOIN participants p ON p.user_id = cpa.participant_user_id
         WHERE cpa.id = $1
         LIMIT 1`,
        [requestId]
      )
      : await pool.query(
        `SELECT cpa.id, cpa.coordinator_user_id, cpa.participant_user_id, cpa.status,
                'coordinator'::text AS initiator,
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
  getMyProfile,
  updateMyProfile,
  getStats,
  searchParticipantByEmail,
  listMyManagedParticipants,
  listParticipants,
  listCoordinatorAccessRequests,
  getManagedParticipantProfile,
  requestParticipantAccess,
  approveAccessRequest,
  approveParticipantInitiatedRequest,
  rejectParticipantInitiatedRequest,
  withdrawCoordinatorAccessRequest,
};
