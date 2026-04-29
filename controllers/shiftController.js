const pool = require('../config/database');
const { sendPushNotification } = require('../services/notificationService');

// ── Helper: insert an in-app notification ────────────────────────
const createNotification = async (userId, title, body, type = 'general', data = {}) => {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, body, type, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, title, body, type, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('createNotification error:', err.message);
  }
};

const toRad = (deg) => (Number(deg) * Math.PI) / 180;
const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLon = toRad(Number(lon2) - Number(lon1));
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getShiftTimeOfDay = (isoTime) => {
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return null;
  const hour = d.getHours();
  if (hour >= 5 && hour < 12) return 'am';
  if (hour >= 12 && hour < 20) return 'pm';
  return 'night';
};

// ── GET /api/shifts  (worker: open + assigned; participant: open listing) ───
const getAvailableShifts = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const shiftTypeFilter = String(req.query.shiftType || '').trim().toLowerCase();
    const isWorker = req.user?.role === 'worker';

    let workerTravel = null;
    if (isWorker) {
      const workerRes = await pool.query(
        `SELECT latitude, longitude, max_travel_km
         FROM workers
         WHERE user_id = $1
         LIMIT 1`,
        [req.user.userId]
      );
      workerTravel = workerRes.rows[0] || null;
    }

    // Workers should still see "their" assigned shift with full details after selection.
    // For workers: include open shifts + filled shifts assigned to them.
    // For participants: this endpoint is only used for "available shifts" browsing; keep it to open shifts.
    const queryParams = [limit, offset];
    let whereClause = `s.status = 'open'`;
    if (isWorker) {
      queryParams.push(req.user.userId);
      whereClause = `(s.status = 'open' OR (s.status = 'filled' AND s.filled_by_worker_id = $3))`;
    }

    const { rows } = await pool.query(
      `SELECT s.*,
              u.email AS participant_email,
              COALESCE(p.first_name, '') AS participant_first_name,
              COALESCE(p.last_name, '') AS participant_last_name,
              p.latitude AS participant_latitude,
              p.longitude AS participant_longitude,
              (SELECT COUNT(*) FROM shift_applications sa WHERE sa.shift_id = s.id) AS application_count
       FROM shifts s
       JOIN users u ON u.id = s.participant_id
       LEFT JOIN participants p ON p.user_id = s.participant_id
       WHERE ${whereClause}
       ORDER BY
         CASE WHEN s.status = 'filled' THEN 0 ELSE 1 END,
         s.created_at DESC
       LIMIT $1 OFFSET $2`,
      queryParams
    );

    const hasWorkerTravelFilter = Boolean(
      isWorker &&
      workerTravel &&
      workerTravel.latitude != null &&
      workerTravel.longitude != null &&
      Number(workerTravel.max_travel_km) > 0
    );

    const annotatedRows = rows
      .filter((shift) => {
        const shiftTypeMatch = ['am', 'pm', 'night'].includes(shiftTypeFilter)
          ? getShiftTimeOfDay(shift.start_time) === shiftTypeFilter
          : true;
        return shiftTypeMatch;
      })
      .map((shift) => {
        if (!hasWorkerTravelFilter) return { ...shift, _distance_m: null, _within_range: true };
        // If worker enabled travel filter but participant location coords are missing,
        // treat as out-of-range by default (can be viewed via "See anyway", but not applied).
        if (shift.participant_latitude == null || shift.participant_longitude == null) {
          return { ...shift, _distance_m: null, _within_range: false, _location_missing: true };
        }
        const meters = distanceMeters(
          workerTravel.latitude,
          workerTravel.longitude,
          shift.participant_latitude,
          shift.participant_longitude
        );
        const within = meters <= Number(workerTravel.max_travel_km) * 1000;
        return { ...shift, _distance_m: meters, _within_range: within, _location_missing: false };
      });

    const total = annotatedRows.length;

    const shifts = annotatedRows.map((shift) => {
      if (!isWorker) return shift;
      const isAssignedToMe = shift.status === 'filled' && shift.filled_by_worker_id === req.user.userId;
      const withinTravelRange = Boolean(shift._within_range);
      const distanceKm = shift._distance_m == null ? null : Number((Number(shift._distance_m) / 1000).toFixed(1));
      return {
        id: shift.id,
        title: shift.title,
        location: shift.location,
        status: shift.status,
        participant_first_name: shift.participant_first_name || '',
        participant_last_name: shift.participant_last_name || '',
        is_assigned_to_me: isAssignedToMe,
        within_travel_range: withinTravelRange,
        distance_km: distanceKm,
        location_missing: Boolean(shift._location_missing),
        travel_filter_enabled: hasWorkerTravelFilter,
        max_travel_km: hasWorkerTravelFilter ? Number(workerTravel.max_travel_km) : null,

        // Before acceptance: keep the listing minimal (UI decides what to show).
        // After acceptance: return full details (safe for the assigned worker).
        ...(isAssignedToMe ? {
          start_time: shift.start_time,
          end_time: shift.end_time,
          hourly_rate: shift.hourly_rate,
          description: shift.description,
          service_type: shift.service_type,
          participant_email: shift.participant_email,
        } : {
          start_time: shift.start_time,
          end_time: shift.end_time,
          hourly_rate: shift.hourly_rate,
        }),
      };
    });

    return res.json({
      ok: true,
      shifts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('getAvailableShifts error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch shifts' });
  }
};

// ── GET /api/shifts/mine ─────────────────────────────────────────
const getMyShifts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM shift_applications sa WHERE sa.shift_id = s.id) AS application_count
       FROM shifts s
       WHERE s.participant_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );
    return res.json({ ok: true, shifts: rows });
  } catch (err) {
    console.error('getMyShifts error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch your shifts' });
  }
};

// ── GET /api/shifts/:id ──────────────────────────────────────────
const getShiftById = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT s.*,
              u.email AS participant_email,
              COALESCE(p.first_name, '') AS participant_first_name,
              COALESCE(p.last_name, '') AS participant_last_name
       FROM shifts s
       JOIN users u ON u.id = s.participant_id
       LEFT JOIN participants p ON p.user_id = s.participant_id
       WHERE s.id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Shift not found' });
    }

    const shift = rows[0];
    const isParticipantOwner = req.user?.userId === shift.participant_id;
    const isWorkerAssigned = req.user?.userId === shift.filled_by_worker_id;
    const canViewFull = req.user?.role === 'admin' || isParticipantOwner || isWorkerAssigned;

    if (!canViewFull) {
      return res.json({
        ok: true,
        shift: {
          id: shift.id,
          title: shift.title,
          start_time: shift.start_time,
          end_time: shift.end_time,
          hourly_rate: shift.hourly_rate,
          location: shift.location,
          status: shift.status,
        },
        applications: [],
      });
    }

    // Also fetch applications
    const apps = await pool.query(
      `SELECT sa.*,
              u.email AS worker_email,
              COALESCE(w.first_name, '') AS worker_first_name,
              COALESCE(w.last_name, '') AS worker_last_name,
              w.hourly_rate AS worker_hourly_rate,
              w.rating AS worker_rating
       FROM shift_applications sa
       JOIN users u ON u.id = sa.worker_id
       LEFT JOIN workers w ON w.user_id = sa.worker_id
       WHERE sa.shift_id = $1
       ORDER BY sa.created_at DESC`,
      [id]
    );

    return res.json({ ok: true, shift, applications: apps.rows });
  } catch (err) {
    console.error('getShiftById error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch shift' });
  }
};

// ── POST /api/shifts  (participants only) ────────────────────────
const createShift = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, service_type, start_time, end_time, hourly_rate, location, required_skills } = req.body;

    // Validation
    if (!title || !service_type || !start_time || !end_time || hourly_rate == null || !location) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: title, service_type, start_time, end_time, hourly_rate, location' });
    }

    const start = new Date(start_time);
    const end = new Date(end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ ok: false, error: 'Invalid time range' });
    }

    if (parseFloat(hourly_rate) < 0) {
      return res.status(400).json({ ok: false, error: 'Hourly rate must be non-negative' });
    }

    const skills = Array.isArray(required_skills) ? required_skills : [];

    const { rows } = await pool.query(
      `INSERT INTO shifts (participant_id, title, description, service_type, start_time, end_time, hourly_rate, location, required_skills)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, title, description || null, service_type, start_time, end_time, parseFloat(hourly_rate), location, skills]
    );

    return res.status(201).json({ ok: true, shift: rows[0] });
  } catch (err) {
    console.error('createShift error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to create shift' });
  }
};

// ── POST /api/shifts/:id/apply  (workers only) ──────────────────
const applyForShift = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { message } = req.body;

    // Check shift exists and is open
    const shiftRes = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
    if (shiftRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Shift not found' });
    }
    const shift = shiftRes.rows[0];

    if (shift.status !== 'open') {
      return res.status(400).json({ ok: false, error: 'Shift is no longer open for applications' });
    }

    // Can't apply to own shift
    if (shift.participant_id === userId) {
      return res.status(400).json({ ok: false, error: 'You cannot apply to your own shift' });
    }

    // Check for duplicate application
    const existingApp = await pool.query(
      'SELECT id FROM shift_applications WHERE shift_id = $1 AND worker_id = $2',
      [id, userId]
    );
    if (existingApp.rowCount > 0) {
      return res.status(400).json({ ok: false, error: 'You have already applied to this shift' });
    }

    const { rows } = await pool.query(
      `INSERT INTO shift_applications (shift_id, worker_id, message)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, userId, message || null]
    );

    // Notify the shift creator
    await createNotification(
      shift.participant_id,
      'New shift application',
      `A worker has applied for "${shift.title}"`,
      'shift_application',
      { shift_id: id, application_id: rows[0].id }
    );

    await sendPushNotification(
      shift.participant_id,
      'New shift application',
      `A worker has applied for "${shift.title}"`,
      { type: 'shift_application', shiftId: id }
    );

    return res.status(201).json({ ok: true, application: rows[0] });
  } catch (err) {
    console.error('applyForShift error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to apply for shift' });
  }
};

// ── PUT /api/shifts/:id/applications/:applicationId/accept ──────
const acceptApplication = async (req, res) => {
  try {
    const { id, applicationId } = req.params;
    const userId = req.user.userId;

    // Verify shift ownership
    const shiftRes = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
    if (shiftRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Shift not found' });
    }
    const shift = shiftRes.rows[0];

    if (shift.participant_id !== userId) {
      return res.status(403).json({ ok: false, error: 'Only the shift creator can accept applications' });
    }

    if (shift.status !== 'open') {
      return res.status(400).json({ ok: false, error: 'Shift is no longer open' });
    }

    // Get the application
    const appRes = await pool.query('SELECT * FROM shift_applications WHERE id = $1 AND shift_id = $2', [applicationId, id]);
    if (appRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Application not found' });
    }
    const application = appRes.rows[0];

    // Accept this application, reject others
    await pool.query(`UPDATE shift_applications SET status = 'accepted' WHERE id = $1`, [applicationId]);
    await pool.query(`UPDATE shift_applications SET status = 'rejected' WHERE shift_id = $1 AND id != $2`, [id, applicationId]);

    // Update shift status
    await pool.query(`UPDATE shifts SET status = 'filled', filled_by_worker_id = $1, updated_at = now() WHERE id = $2`, [application.worker_id, id]);

    // Auto-create a booking
    const hours = (new Date(shift.end_time) - new Date(shift.start_time)) / (1000 * 60 * 60);
    const totalAmount = (hours * parseFloat(shift.hourly_rate)).toFixed(2);

    // Get participant and worker profile IDs
    const participantRes = await pool.query(
      'SELECT id, latitude, longitude, address FROM participants WHERE user_id = $1',
      [shift.participant_id]
    );
    const workerRes = await pool.query('SELECT id FROM workers WHERE user_id = $1', [application.worker_id]);

    if (participantRes.rowCount > 0 && workerRes.rowCount > 0) {
      const participant = participantRes.rows[0];
      const bookingLat = participant.latitude != null ? Number(participant.latitude) : null;
      const bookingLng = participant.longitude != null ? Number(participant.longitude) : null;
      const bookingAddress = shift.location || participant.address || null;
      await pool.query(
        `INSERT INTO bookings (
           participant_id,
           worker_id,
           service_type,
           start_time,
           end_time,
           status,
           location_address,
           location_lat,
           location_lng,
           total_amount,
           hourly_rate
         )
         VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9, $10)`,
        [
          participant.id,
          workerRes.rows[0].id,
          shift.service_type,
          shift.start_time,
          shift.end_time,
          bookingAddress,
          bookingLat,
          bookingLng,
          totalAmount,
          shift.hourly_rate,
        ]
      );
    }

    // Notify accepted worker
    await createNotification(
      application.worker_id,
      'Application accepted! 🎉',
      `Your application for "${shift.title}" has been accepted.`,
      'shift_accepted',
      { shift_id: id }
    );
    await sendPushNotification(
      application.worker_id,
      'Application accepted! 🎉',
      `Your application for "${shift.title}" has been accepted.`,
      { type: 'shift_accepted', shiftId: id }
    );

    // Notify rejected applicants
    const rejectedApps = await pool.query(
      `SELECT worker_id FROM shift_applications WHERE shift_id = $1 AND id != $2`,
      [id, applicationId]
    );
    for (const rej of rejectedApps.rows) {
      await createNotification(
        rej.worker_id,
        'Application update',
        `The shift "${shift.title}" has been filled.`,
        'shift_rejected',
        { shift_id: id }
      );
    }

    return res.json({ ok: true, message: 'Application accepted and booking created' });
  } catch (err) {
    console.error('acceptApplication error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to accept application' });
  }
};

// ── PUT /api/shifts/:id/cancel ───────────────────────────────────
const cancelShift = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const shiftRes = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
    if (shiftRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Shift not found' });
    }
    const shift = shiftRes.rows[0];

    if (shift.participant_id !== userId) {
      return res.status(403).json({ ok: false, error: 'Only the shift creator can cancel it' });
    }

    if (shift.status === 'completed' || shift.status === 'cancelled') {
      return res.status(400).json({ ok: false, error: 'Shift cannot be cancelled in current state' });
    }

    await pool.query(`UPDATE shifts SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id]);

    // Notify applicants
    const apps = await pool.query('SELECT worker_id FROM shift_applications WHERE shift_id = $1', [id]);
    for (const app of apps.rows) {
      await createNotification(
        app.worker_id,
        'Shift cancelled',
        `The shift "${shift.title}" has been cancelled.`,
        'shift_cancelled',
        { shift_id: id }
      );
    }

    return res.json({ ok: true, message: 'Shift cancelled' });
  } catch (err) {
    console.error('cancelShift error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to cancel shift' });
  }
};

module.exports = {
  getAvailableShifts,
  getMyShifts,
  getShiftById,
  createShift,
  applyForShift,
  acceptApplication,
  cancelShift,
  createNotification,
};
