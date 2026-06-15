const pool = require('../config/database');
const { sendPushNotification } = require('../services/notificationService');
const { geocodeAddress } = require('../utils/geocodeAddress');
const { resolveWorkLocationCoords } = require('../utils/bookingLocation');

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
              ${isWorker ? `, (SELECT sa.status FROM shift_applications sa WHERE sa.shift_id = s.id AND sa.worker_id = $3 LIMIT 1) AS my_application_status` : ''}
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
        // If participant coords are missing, distance cannot be computed — still show the shift
        // in the default feed so workers do not miss newly posted shifts (coords may be saved later).
        if (shift.participant_latitude == null || shift.participant_longitude == null) {
          return { ...shift, _distance_m: null, _within_range: true, _location_missing: true };
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
      const myApplicationStatus = shift.my_application_status || null;
      return {
        id: shift.id,
        title: shift.title,
        location: shift.location,
        status: shift.status,
        service_type: shift.service_type,
        start_time: shift.start_time,
        end_time: shift.end_time,
        hourly_rate: shift.hourly_rate,
        description: shift.description,
        sleepover_flat_amount: shift.sleepover_flat_amount,
        travel_distance_km: shift.travel_distance_km,
        travel_rate_per_km: shift.travel_rate_per_km,
        participant_first_name: shift.participant_first_name || '',
        participant_last_name: shift.participant_last_name || '',
        participant_email: isAssignedToMe ? shift.participant_email : undefined,
        is_assigned_to_me: isAssignedToMe,
        has_applied: Boolean(myApplicationStatus),
        application_status: myApplicationStatus,
        within_travel_range: withinTravelRange,
        distance_km: distanceKm,
        location_missing: Boolean(shift._location_missing),
        travel_filter_enabled: hasWorkerTravelFilter,
        max_travel_km: hasWorkerTravelFilter ? Number(workerTravel.max_travel_km) : null,
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
              (SELECT COUNT(*) FROM shift_applications sa WHERE sa.shift_id = s.id) AS application_count,
              COALESCE(w.first_name, '') AS assigned_worker_first_name,
              COALESCE(w.last_name, '') AS assigned_worker_last_name,
              w.profile_image_url AS assigned_worker_profile_image_url,
              w.phone AS assigned_worker_phone,
              w.bio AS assigned_worker_bio,
              w.hourly_rate AS assigned_worker_public_hourly_rate,
              w.rating AS assigned_worker_rating,
              w.total_reviews AS assigned_worker_total_reviews,
              uw.email AS assigned_worker_email
       FROM shifts s
       LEFT JOIN users uw ON uw.id = s.filled_by_worker_id
       LEFT JOIN workers w ON w.user_id = s.filled_by_worker_id
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
              COALESCE(p.last_name, '') AS participant_last_name,
              COALESCE(wf.first_name, '') AS assigned_worker_first_name,
              COALESCE(wf.last_name, '') AS assigned_worker_last_name,
              wf.profile_image_url AS assigned_worker_profile_image_url,
              wf.phone AS assigned_worker_phone,
              wf.bio AS assigned_worker_bio,
              wf.hourly_rate AS assigned_worker_public_hourly_rate,
              wf.rating AS assigned_worker_rating,
              wf.total_reviews AS assigned_worker_total_reviews,
              uwf.email AS assigned_worker_email
       FROM shifts s
       JOIN users u ON u.id = s.participant_id
       LEFT JOIN participants p ON p.user_id = s.participant_id
       LEFT JOIN users uwf ON uwf.id = s.filled_by_worker_id
       LEFT JOIN workers wf ON wf.user_id = s.filled_by_worker_id
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
              w.rating AS worker_rating,
              w.profile_image_url AS worker_profile_image_url,
              w.phone AS worker_phone,
              w.bio AS worker_bio,
              w.total_reviews AS worker_total_reviews
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
    const {
      validateParticipantOfferedHourlyRate,
      validateTravelDistanceKm,
      validateSleepoverFlatAmount,
      TRAVEL_NON_LABOUR_PER_KM,
    } = await import('../utils/ndisParticipantRates.mjs');
    const userId = req.user.userId;
    const {
      title,
      description,
      service_type,
      start_time,
      end_time,
      hourly_rate,
      location,
      location_lat,
      location_lng,
      required_skills,
      high_intensity_support,
      travel_distance_km,
      sleepover_flat_amount,
    } = req.body;

    // Validation
    if (!title || !service_type || !start_time || !end_time || hourly_rate == null || !location) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: title, service_type, start_time, end_time, hourly_rate, location' });
    }

    const start = new Date(start_time);
    const end = new Date(end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ ok: false, error: 'Invalid time range' });
    }

    const hr = parseFloat(hourly_rate);
    if (Number.isNaN(hr) || hr < 0) {
      return res.status(400).json({ ok: false, error: 'Hourly rate must be non-negative' });
    }

    const highIntensity = Boolean(high_intensity_support);
    let travelKm = travel_distance_km == null || travel_distance_km === '' ? null : Number(travel_distance_km);
    if (travelKm != null && Number.isNaN(travelKm)) travelKm = null;
    const tv = validateTravelDistanceKm(travelKm == null ? '' : travelKm);
    if (!tv.ok) {
      return res.status(400).json({ ok: false, error: tv.error });
    }

    let sleepoverFlat = sleepover_flat_amount == null || sleepover_flat_amount === '' ? null : Number(sleepover_flat_amount);
    if (sleepoverFlat != null && (Number.isNaN(sleepoverFlat) || sleepoverFlat === 0)) sleepoverFlat = null;
    const sv = validateSleepoverFlatAmount(sleepoverFlat);
    if (!sv.ok) {
      return res.status(400).json({ ok: false, error: sv.error });
    }

    if (hr <= 0 && !(sleepoverFlat > 0)) {
      return res.status(400).json({
        ok: false,
        error: 'Enter an hourly labour rate and/or include the NDIS sleepover flat fee for this shift.',
      });
    }

    if (hr > 0) {
      const rateCheck = validateParticipantOfferedHourlyRate(service_type, start_time, hr, {
        highIntensity,
        endTimeIso: end_time,
      });
      if (!rateCheck.ok) {
        return res.status(400).json({
          ok: false,
          error: rateCheck.error,
          minimum_hourly_rate: rateCheck.minimum,
          maximum_hourly_rate: rateCheck.maximum,
        });
      }
    }

    const skills = Array.isArray(required_skills) ? required_skills : [];
    const shiftLat = location_lat != null && location_lat !== '' ? Number(location_lat) : null;
    const shiftLng = location_lng != null && location_lng !== '' ? Number(location_lng) : null;

    const dupRes = await pool.query(
      `SELECT * FROM shifts
       WHERE participant_id = $1 AND title = $2 AND start_time = $3 AND end_time = $4
         AND created_at > now() - interval '3 minutes'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, title, start_time, end_time]
    );
    if (dupRes.rowCount > 0) {
      return res.status(200).json({ ok: true, shift: dupRes.rows[0], duplicate: true });
    }

    const { rows } = await pool.query(
      `INSERT INTO shifts (
         participant_id, title, description, service_type, start_time, end_time, hourly_rate, location,
         location_lat, location_lng, required_skills,
         high_intensity, travel_distance_km, sleepover_flat_amount, travel_rate_per_km
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        userId,
        title,
        description || null,
        service_type,
        start_time,
        end_time,
        hr,
        location,
        Number.isNaN(shiftLat) ? null : shiftLat,
        Number.isNaN(shiftLng) ? null : shiftLng,
        skills,
        highIntensity,
        travelKm,
        sleepoverFlat,
        TRAVEL_NON_LABOUR_PER_KM,
      ]
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
    const shiftStartMs = shift?.start_time ? new Date(shift.start_time).getTime() : NaN;
    if (!Number.isFinite(shiftStartMs) || shiftStartMs <= Date.now()) {
      return res.status(400).json({ ok: false, error: 'This shift has already started or expired' });
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
    const [ndis, breakMeta] = await Promise.all([
      import('../utils/ndisParticipantRates.mjs'),
      import('../utils/shiftBreakMeta.mjs'),
    ]);
    const { TRAVEL_NON_LABOUR_PER_KM } = ndis;
    const { getShiftPayEstimate } = breakMeta;
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

    // Auto-create a booking (total aligns with shift card: unpaid break reduces billable hours)
    const payEst = getShiftPayEstimate(shift.start_time, shift.end_time, shift.hourly_rate, shift.description, {
      sleepoverFlatAmount: shift.sleepover_flat_amount != null ? Number(shift.sleepover_flat_amount) : 0,
      travelKm: shift.travel_distance_km != null ? Number(shift.travel_distance_km) : 0,
      travelRatePerKm: shift.travel_rate_per_km != null ? Number(shift.travel_rate_per_km) : undefined,
    });
    const totalAmount = payEst.estimatedTotal.toFixed(2);

    // Get participant and worker profile IDs
    const participantRes = await pool.query(
      'SELECT id, latitude, longitude, address FROM participants WHERE user_id = $1',
      [shift.participant_id]
    );
    const workerRes = await pool.query('SELECT id FROM workers WHERE user_id = $1', [application.worker_id]);

    if (participantRes.rowCount > 0 && workerRes.rowCount > 0) {
      const participant = participantRes.rows[0];
      const bookingAddress = shift.location || participant.address || null;
      const coords = await resolveWorkLocationCoords({
        location_lat: shift.location_lat,
        location_lng: shift.location_lng,
        location_address: bookingAddress,
        participantLat: participant.latitude,
        participantLng: participant.longitude,
      });
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
           hourly_rate,
           high_intensity,
           travel_distance_km,
           sleepover_flat_amount,
           travel_rate_per_km,
           source_shift_id
         )
         VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          participant.id,
          workerRes.rows[0].id,
          shift.service_type,
          shift.start_time,
          shift.end_time,
          bookingAddress,
          coords.lat,
          coords.lng,
          totalAmount,
          shift.hourly_rate,
          Boolean(shift.high_intensity),
          shift.travel_distance_km != null ? Number(shift.travel_distance_km) : null,
          shift.sleepover_flat_amount != null ? Number(shift.sleepover_flat_amount) : null,
          shift.travel_rate_per_km != null ? Number(shift.travel_rate_per_km) : TRAVEL_NON_LABOUR_PER_KM,
          id,
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

// ── PUT /api/shifts/:id  (participant owner — open shifts only) ──
const updateShift = async (req, res) => {
  try {
    const {
      validateParticipantOfferedHourlyRate,
      validateTravelDistanceKm,
      validateSleepoverFlatAmount,
      TRAVEL_NON_LABOUR_PER_KM,
    } = await import('../utils/ndisParticipantRates.mjs');
    const { id } = req.params;
    const userId = req.user.userId;

    const existingRes = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Shift not found' });
    }
    const existing = existingRes.rows[0];

    if (existing.participant_id !== userId) {
      return res.status(403).json({ ok: false, error: 'Only the shift creator can edit it' });
    }
    if (existing.status !== 'open') {
      return res.status(400).json({ ok: false, error: 'Only open shifts can be edited' });
    }

    const {
      title,
      description,
      service_type,
      start_time,
      end_time,
      hourly_rate,
      location,
      location_lat,
      location_lng,
      required_skills,
      high_intensity_support,
      travel_distance_km,
      sleepover_flat_amount,
    } = req.body;

    if (!title || !service_type || !start_time || !end_time || hourly_rate == null || !location) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: title, service_type, start_time, end_time, hourly_rate, location' });
    }

    const start = new Date(start_time);
    const end = new Date(end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ ok: false, error: 'Invalid time range' });
    }

    const hr = parseFloat(hourly_rate);
    if (Number.isNaN(hr) || hr < 0) {
      return res.status(400).json({ ok: false, error: 'Hourly rate must be non-negative' });
    }

    const highIntensity = Boolean(high_intensity_support);
    let travelKm = travel_distance_km == null || travel_distance_km === '' ? null : Number(travel_distance_km);
    if (travelKm != null && Number.isNaN(travelKm)) travelKm = null;
    const tv = validateTravelDistanceKm(travelKm == null ? '' : travelKm);
    if (!tv.ok) {
      return res.status(400).json({ ok: false, error: tv.error });
    }

    let sleepoverFlat = sleepover_flat_amount == null || sleepover_flat_amount === '' ? null : Number(sleepover_flat_amount);
    if (sleepoverFlat != null && (Number.isNaN(sleepoverFlat) || sleepoverFlat === 0)) sleepoverFlat = null;
    const sv = validateSleepoverFlatAmount(sleepoverFlat);
    if (!sv.ok) {
      return res.status(400).json({ ok: false, error: sv.error });
    }

    if (hr <= 0 && !(sleepoverFlat > 0)) {
      return res.status(400).json({
        ok: false,
        error: 'Enter an hourly labour rate and/or include the NDIS sleepover flat fee for this shift.',
      });
    }

    if (hr > 0) {
      const rateCheck = validateParticipantOfferedHourlyRate(service_type, start_time, hr, {
        highIntensity,
        endTimeIso: end_time,
      });
      if (!rateCheck.ok) {
        return res.status(400).json({
          ok: false,
          error: rateCheck.error,
          minimum_hourly_rate: rateCheck.minimum,
          maximum_hourly_rate: rateCheck.maximum,
        });
      }
    }

    const skills = Array.isArray(required_skills) ? required_skills : [];
    const shiftLat = location_lat != null && location_lat !== '' ? Number(location_lat) : null;
    const shiftLng = location_lng != null && location_lng !== '' ? Number(location_lng) : null;

    const { rows } = await pool.query(
      `UPDATE shifts SET
         title = $2,
         description = $3,
         service_type = $4,
         start_time = $5,
         end_time = $6,
         hourly_rate = $7,
         location = $8,
         location_lat = $9,
         location_lng = $10,
         required_skills = $11,
         high_intensity = $12,
         travel_distance_km = $13,
         sleepover_flat_amount = $14,
         travel_rate_per_km = $15,
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        title,
        description || null,
        service_type,
        start_time,
        end_time,
        hr,
        location,
        Number.isNaN(shiftLat) ? null : shiftLat,
        Number.isNaN(shiftLng) ? null : shiftLng,
        skills,
        highIntensity,
        travelKm,
        sleepoverFlat,
        TRAVEL_NON_LABOUR_PER_KM,
      ]
    );

    return res.json({ ok: true, shift: rows[0] });
  } catch (err) {
    console.error('updateShift error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to update shift' });
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
  updateShift,
  applyForShift,
  acceptApplication,
  cancelShift,
  createNotification,
};
