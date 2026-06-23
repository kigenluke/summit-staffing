const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { isWithinRadius, CLOCK_SITE_RADIUS_METERS } = require('../utils/gpsHelper.cjs');
const { sendPushNotification } = require('../services/notificationService');
const { sendSMS } = require('../services/smsService');
const { getPaymentPipeline, isFundedAccount } = require('../utils/fundingPipeline');
const { createBookingAuthorization, cancelBookingAuthorization } = require('../services/paymentPipelineService');
const { submitTimesheetForReview } = require('../services/timesheetApprovalService');
const { resolveWorkLocationCoords } = require('../utils/bookingLocation');
const { computePlatformFeeBreakdown } = require('../utils/platformFee.cjs');
const { syncMissingBookingsForUser } = require('../services/shiftBookingSyncService');
const {
  performShiftClockOut,
  reconcileStaleInProgressShift,
} = require('../services/shiftClockService');
const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

/** Unassigned posted shifts appear in Bookings as open (participant view). */
const mapOpenShiftToPendingBooking = (shift) => {
  const endMs = shift.end_time ? new Date(shift.end_time).getTime() : null;
  const isPast = endMs != null && endMs < Date.now();
  return {
    id: shift.id,
    service_type: shift.service_type,
    title: shift.title,
    start_time: shift.start_time,
    end_time: shift.end_time,
    status: isPast ? 'expired' : 'open',
    is_open_shift: true,
    worker_id: null,
    worker_first_name: '',
    worker_last_name: '',
    application_count: shift.application_count || 0,
    location_address: shift.location,
    hourly_rate: shift.hourly_rate,
    created_at: shift.created_at,
    updated_at: shift.updated_at,
  };
};

const updateTimesheetNotes = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;
    const { notes } = req.body;

    const worker = await getWorkerForUser(req.user.userId);
    if (!worker) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const bookingRes = await pool.query('SELECT id, worker_id FROM bookings WHERE id = $1 LIMIT 1', [id]);
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const booking = bookingRes.rows[0];
    if (booking.worker_id !== worker.id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const notesText = notes === null || notes === undefined ? '' : String(notes);
    if (notesText.length > 500) {
      return res.status(400).json({ ok: false, error: 'Notes must be 500 characters or less' });
    }

    const existing = await pool.query('SELECT id FROM booking_timesheets WHERE booking_id = $1 LIMIT 1', [id]);
    if (existing.rowCount === 0) {
      await pool.query('INSERT INTO booking_timesheets (booking_id, notes) VALUES ($1, $2)', [id, notesText]);
    } else {
      await pool.query('UPDATE booking_timesheets SET notes = $2 WHERE booking_id = $1', [id, notesText]);
    }

    const timesheet = await pool.query('SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1', [id]);
    return res.status(200).json({ ok: true, timesheet: timesheet.rows[0] || null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to save notes' });
  }
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
};

const hoursBetween = (start, end) => {
  const ms = end.getTime() - start.getTime();
  return Math.max(ms / (1000 * 60 * 60), 0);
};

const getParticipantForUser = async (userId) => {
  const res = await pool.query(
    `SELECT id, user_id, phone, funding_type, management_type, plan_manager_email, ndis_number
     FROM participants WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return res.rowCount ? res.rows[0] : null;
};

const getWorkerForUser = async (userId) => {
  const res = await pool.query('SELECT id, user_id FROM workers WHERE user_id = $1 LIMIT 1', [userId]);
  return res.rowCount ? res.rows[0] : null;
};

const createBooking = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const [ndis, breakMeta] = await Promise.all([
      import('../utils/ndisParticipantRates.mjs'),
      import('../utils/shiftBreakMeta.mjs'),
    ]);
    const {
      validateParticipantOfferedHourlyRate,
      validateTravelDistanceKm,
      validateSleepoverFlatAmount,
      TRAVEL_NON_LABOUR_PER_KM,
    } = ndis;
    const { getShiftPayEstimate } = breakMeta;

    const participant = await getParticipantForUser(req.user.userId);
    if (!participant) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const {
      worker_id,
      service_type,
      start_time,
      end_time,
      proposed_hourly_rate,
      location_address,
      location_lat,
      location_lng,
      special_instructions,
      high_intensity_support,
      travel_distance_km,
      sleepover_flat_amount,
    } = req.body;

    const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [worker_id]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];
    const rate = Number(proposed_hourly_rate);
    if (rate < 0) {
      return res.status(400).json({ ok: false, error: 'Proposed hourly rate must be 0 or more' });
    }

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

    const highIntensity = Boolean(high_intensity_support);

    if (rate <= 0 && !(sleepoverFlat > 0)) {
      return res.status(400).json({
        ok: false,
        error: 'Enter an hourly labour rate and/or include the NDIS sleepover flat fee.',
      });
    }

    const paymentPipeline = getPaymentPipeline(participant);

    if (rate > 0 && isFundedAccount(participant)) {
      const rateCheck = validateParticipantOfferedHourlyRate(service_type, start_time, rate, {
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

    const start = new Date(start_time);
    const end = new Date(end_time);
    const payEst = getShiftPayEstimate(start, end, rate, special_instructions || '', {
      sleepoverFlatAmount: sleepoverFlat || 0,
      travelKm: travelKm || 0,
      travelRatePerKm: TRAVEL_NON_LABOUR_PER_KM,
    });
    const totalAmount = Number(payEst.estimatedTotal.toFixed(2));
    const { commission: commissionAmount } = computePlatformFeeBreakdown(totalAmount);

    const bookingRes = await pool.query(
      `INSERT INTO bookings (
        participant_id,
        worker_id,
        service_type,
        start_time,
        end_time,
        status,
        hourly_rate,
        location_address,
        location_lat,
        location_lng,
        special_instructions,
        total_amount,
        commission_amount,
        high_intensity,
        travel_distance_km,
        sleepover_flat_amount,
        travel_rate_per_km,
        payment_pipeline
      ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        participant.id,
        worker.id,
        service_type,
        start,
        end,
        rate,
        location_address || null,
        toNumberOrNull(location_lat),
        toNumberOrNull(location_lng),
        special_instructions || null,
        totalAmount,
        commissionAmount,
        highIntensity,
        travelKm,
        sleepoverFlat,
        TRAVEL_NON_LABOUR_PER_KM,
        paymentPipeline,
      ]
    );

    const booking = bookingRes.rows[0];

    await sendPushNotification(worker.user_id, 'New booking request', 'You have a new booking request.', {
      bookingId: booking.id,
      type: 'booking_created'
    });

    return res.status(201).json({ ok: true, booking });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to create booking' });
  }
};

const getBookings = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    if (req.user.role === 'worker' || req.user.role === 'participant') {
      try {
        await syncMissingBookingsForUser(req.user.userId, req.user.role);
      } catch (syncErr) {
        // eslint-disable-next-line no-console
        console.warn('[getBookings] shift→booking sync:', syncErr.message);
      }
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const status = req.query.status || null;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const params = [];
    const where = [];

    if (req.user.role === 'admin') {
      // no restriction
    } else if (req.user.role === 'participant') {
      const participant = await getParticipantForUser(req.user.userId);
      if (!participant) return res.status(403).json({ ok: false, error: 'Forbidden' });
      params.push(participant.id);
      where.push(`b.participant_id = $${params.length}`);
    } else if (req.user.role === 'worker') {
      const worker = await getWorkerForUser(req.user.userId);
      if (!worker) return res.status(403).json({ ok: false, error: 'Forbidden' });
      params.push(worker.id);
      where.push(`b.worker_id = $${params.length}`);
    } else {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (status) {
      params.push(status);
      where.push(`b.status = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      where.push(`b.start_time >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      where.push(`b.end_time <= $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const includeOpenShifts =
      req.user.role === 'participant'
      && (!status || status === 'pending');

    const dataRes = await pool.query(
      `SELECT b.*,
              COALESCE(p.first_name, '') AS participant_first_name,
              COALESCE(p.last_name, '') AS participant_last_name,
              COALESCE(w.first_name, '') AS worker_first_name,
              COALESCE(w.last_name, '') AS worker_last_name
       FROM bookings b
       JOIN participants p ON p.id = b.participant_id
       JOIN workers w ON w.id = b.worker_id
       ${whereSql}
       ORDER BY b.start_time DESC`,
      params
    );

    let bookings = dataRes.rows;

    if (includeOpenShifts) {
      const openShiftsRes = await pool.query(
        `SELECT s.*,
                (SELECT COUNT(*)::int FROM shift_applications sa WHERE sa.shift_id = s.id) AS application_count
         FROM shifts s
         WHERE s.participant_id = $1 AND s.status = 'open'
         ORDER BY s.start_time DESC`,
        [req.user.userId]
      );
      bookings = [
        ...bookings,
        ...openShiftsRes.rows.map(mapOpenShiftToPendingBooking),
      ].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    }

    const total = bookings.length;
    bookings = bookings.slice(offset, offset + limit);

    return res.status(200).json({
      ok: true,
      total,
      limit,
      offset,
      bookings,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch bookings' });
  }
};

const getBookingById = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;

    const bookingRes = await pool.query(
      `SELECT b.*,
        p.user_id AS participant_user_id,
        p.first_name AS participant_first_name,
        p.last_name AS participant_last_name,
        p.about AS participant_about,
        w.user_id AS worker_user_id
      FROM bookings b
      JOIN participants p ON p.id = b.participant_id
      JOIN workers w ON w.id = b.worker_id
      WHERE b.id = $1
      LIMIT 1`,
      [id]
    );

    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const booking = bookingRes.rows[0];

    if ((booking.location_lat == null || booking.location_lng == null) && booking.location_address) {
      const coords = await resolveWorkLocationCoords({
        location_address: booking.location_address,
        participantLat: null,
        participantLng: null,
      });
      if (coords.lat != null && coords.lng != null) {
        await pool.query(
          'UPDATE bookings SET location_lat = $2, location_lng = $3, updated_at = now() WHERE id = $1',
          [id, coords.lat, coords.lng]
        );
        booking.location_lat = coords.lat;
        booking.location_lng = coords.lng;
      }
    }

    if (req.user.role !== 'admin') {
      const canView = req.user.userId === booking.participant_user_id || req.user.userId === booking.worker_user_id;
      if (!canView) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    }

    if (booking.status === 'in_progress') {
      try {
        await reconcileStaleInProgressShift(id);
      } catch (reconcileErr) {
        // eslint-disable-next-line no-console
        console.error('[booking] reconcile stale shift:', id, reconcileErr?.message || reconcileErr);
      }
      const refreshed = await pool.query(
        `SELECT b.*,
          p.user_id AS participant_user_id,
          p.first_name AS participant_first_name,
          p.last_name AS participant_last_name,
          p.about AS participant_about,
          w.user_id AS worker_user_id
        FROM bookings b
        JOIN participants p ON p.id = b.participant_id
        JOIN workers w ON w.id = b.worker_id
        WHERE b.id = $1
        LIMIT 1`,
        [id]
      );
      if (refreshed.rowCount) {
        Object.assign(booking, refreshed.rows[0]);
      }
    }

    const timesheetRes = await pool.query('SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1', [id]);

    let timesheet = timesheetRes.rows[0] || null;
    if (timesheet?.clock_in_time && timesheet?.clock_out_time && booking.source_shift_id) {
      const shiftDescRes = await pool.query(
        'SELECT description FROM shifts WHERE id = $1 LIMIT 1',
        [booking.source_shift_id]
      );
      const { computeBillableShiftHours } = await import('../utils/billableShiftHours.mjs');
      const { paidHoursAtRate } = computeBillableShiftHours({
        clockInTime: timesheet.clock_in_time,
        clockOutTime: timesheet.clock_out_time,
        shiftStartTime: booking.start_time,
        shiftEndTime: booking.end_time,
        shiftDescription: shiftDescRes.rows[0]?.description,
      });
      timesheet = { ...timesheet, actual_hours: paidHoursAtRate };
    }

    const paymentRes = await pool.query(
      `SELECT id, status, amount, payment_date, created_at
       FROM payments
       WHERE booking_id = $1 AND status = 'succeeded'
       ORDER BY payment_date DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [id]
    );

    const reviewRes = await pool.query(
      `SELECT id, rating, comment, incident_reported, created_at
       FROM reviews
       WHERE booking_id = $1 AND reviewer_id = $2
       LIMIT 1`,
      [id, req.user.userId]
    );

    return res.status(200).json({
      ok: true,
      booking,
      timesheet,
      payment: paymentRes.rows[0] || null,
      user_review: reviewRes.rows[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch booking' });
  }
};

const acceptBooking = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;
    const worker = await getWorkerForUser(req.user.userId);
    if (!worker) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookingRes = await client.query(
        `SELECT b.*, p.phone AS participant_phone, p.user_id AS participant_user_id
         FROM bookings b
         JOIN participants p ON p.id = b.participant_id
         WHERE b.id = $1 FOR UPDATE`,
        [id]
      );

      if (bookingRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Booking not found' });
      }

      const booking = bookingRes.rows[0];

      if (booking.worker_id !== worker.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      if (booking.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Invalid booking status transition' });
      }

      const updatedRes = await client.query(
        "UPDATE bookings SET status = 'confirmed', updated_at = now() WHERE id = $1 RETURNING *",
        [id]
      );

      await client.query('COMMIT');

      let authorization = null;
      try {
        authorization = await createBookingAuthorization(id);
      } catch (authErr) {
        authorization = { ok: false, error: authErr.message };
      }

      await sendPushNotification(booking.participant_user_id, 'Booking accepted', 'Your booking has been accepted by the worker.', {
        bookingId: booking.id,
        type: 'booking_accepted',
      });

      if (booking.participant_phone) {
        await sendSMS(booking.participant_phone, `Your booking ${id} has been accepted.`);
      }

      return res.status(200).json({ ok: true, booking: updatedRes.rows[0], authorization });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to accept booking' });
  }
};

const declineBooking = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;
    const reason = req.body?.reason ? String(req.body.reason).trim() : null;
    const worker = await getWorkerForUser(req.user.userId);
    if (!worker) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookingRes = await client.query(
        `SELECT b.*, p.phone AS participant_phone, p.user_id AS participant_user_id
         FROM bookings b
         JOIN participants p ON p.id = b.participant_id
         WHERE b.id = $1 FOR UPDATE`,
        [id]
      );

      if (bookingRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Booking not found' });
      }

      const booking = bookingRes.rows[0];

      if (booking.worker_id !== worker.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      if (booking.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Invalid booking status transition' });
      }

      const updatedRes = await client.query(
        "UPDATE bookings SET status = 'cancelled', decline_reason = $2, updated_at = now() WHERE id = $1 RETURNING *",
        [id, reason]
      );

      await client.query('COMMIT');

      await sendPushNotification(booking.participant_user_id, 'Booking declined', 'Your booking request was declined by the worker.', {
        bookingId: booking.id,
        type: 'booking_declined',
        reason: reason || undefined,
      });

      if (booking.participant_phone) {
        const suffix = reason ? ` Reason: ${reason}` : '';
        await sendSMS(booking.participant_phone, `Your booking ${id} has been declined.${suffix}`);
      }

      return res.status(200).json({ ok: true, booking: updatedRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to decline booking' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookingRes = await client.query(
        `SELECT b.*,
                p.user_id AS participant_user_id,
                w.user_id AS worker_user_id,
                (b.end_time < now()) AS is_past_shift
         FROM bookings b
         JOIN participants p ON p.id = b.participant_id
         JOIN workers w ON w.id = b.worker_id
         WHERE b.id = $1 FOR UPDATE`,
        [id]
      );

      if (bookingRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Booking not found' });
      }

      const booking = bookingRes.rows[0];

      const canCancel = req.user.role === 'admin' || req.user.userId === booking.participant_user_id || req.user.userId === booking.worker_user_id;
      if (!canCancel) {
        await client.query('ROLLBACK');
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      const isWorkerUser = req.user.userId === booking.worker_user_id;
      const isParticipantUser = req.user.userId === booking.participant_user_id;
      if (isWorkerUser || isParticipantUser) {
        const isPastShift = Boolean(booking.is_past_shift);
        if (!isPastShift) {
          await client.query('ROLLBACK');
          return res.status(400).json({ ok: false, error: 'Only past shifts can be deleted' });
        }
      }

      if (booking.status === 'in_progress') {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Cannot cancel a booking in progress' });
      }

      if (booking.status === 'completed' || booking.status === 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Booking is already closed' });
      }

      const updatedRes = await client.query(
        "UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *",
        [id]
      );

      await client.query('COMMIT');

      try {
        await cancelBookingAuthorization(id);
      } catch (_) {}

      return res.status(200).json({ ok: true, booking: updatedRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to cancel booking' });
  }
};

const clockIn = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;
    const { lat, lng } = req.body;

    const worker = await getWorkerForUser(req.user.userId);
    if (!worker) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
      if (bookingRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Booking not found' });
      }

      const booking = bookingRes.rows[0];

      if (booking.worker_id !== worker.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      if (booking.status !== 'confirmed') {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Invalid booking status transition' });
      }

      const startAt = booking.start_time ? new Date(booking.start_time) : null;
      const endAt = booking.end_time ? new Date(booking.end_time) : null;
      const now = new Date();

      const { canClockInAt } = await import('../utils/shiftClockRules.mjs');
      const clockInCheck = canClockInAt(now, startAt, endAt);
      if (!clockInCheck.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: clockInCheck.error, code: clockInCheck.code });
      }

      const actualClockInTime = now;

      if (booking.location_lat === null || booking.location_lng === null) {
        const coords = await resolveWorkLocationCoords({
          location_lat: booking.location_lat,
          location_lng: booking.location_lng,
          location_address: booking.location_address,
        });
        if (coords.lat != null && coords.lng != null) {
          await client.query(
            'UPDATE bookings SET location_lat = $2, location_lng = $3, updated_at = now() WHERE id = $1',
            [id, coords.lat, coords.lng]
          );
          booking.location_lat = coords.lat;
          booking.location_lng = coords.lng;
        }
      }

      if (booking.location_lat === null || booking.location_lng === null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Booking location is not set' });
      }

      const within = isWithinRadius(
        Number(lat),
        Number(lng),
        Number(booking.location_lat),
        Number(booking.location_lng),
        CLOCK_SITE_RADIUS_METERS,
      );
      if (!within) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: `You must be within ${CLOCK_SITE_RADIUS_METERS} metres of the shift location to clock in. Move closer and try again.`,
        });
      }

      const timesheetRes = await client.query('SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1', [id]);
      if (timesheetRes.rowCount > 0 && timesheetRes.rows[0].clock_in_time) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Already clocked in' });
      }

      if (timesheetRes.rowCount === 0) {
        await client.query(
          `INSERT INTO booking_timesheets (booking_id, clock_in_time, clock_in_lat, clock_in_lng)
           VALUES ($1, $2, $3, $4)`,
          [id, actualClockInTime, Number(lat), Number(lng)]
        );
      } else {
        await client.query(
          `UPDATE booking_timesheets
           SET clock_in_time = $2, clock_in_lat = $3, clock_in_lng = $4
           WHERE booking_id = $1`,
          [id, actualClockInTime, Number(lat), Number(lng)]
        );
      }

      const updatedBooking = await client.query(
        "UPDATE bookings SET status = 'in_progress', updated_at = now() WHERE id = $1 RETURNING *",
        [id]
      );

      const updatedTimesheet = await client.query('SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1', [id]);

      await client.query('COMMIT');

      return res.status(200).json({ ok: true, booking: updatedBooking.rows[0], timesheet: updatedTimesheet.rows[0] || null });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to clock in' });
  }
};

const clockOut = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;
    const { lat, lng } = req.body;
    const isAutoMode = req.body?.mode === 'auto';

    const worker = await getWorkerForUser(req.user.userId);
    if (!worker) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const bookingCheck = await pool.query('SELECT id, worker_id, end_time FROM bookings WHERE id = $1 LIMIT 1', [id]);
    if (bookingCheck.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }
    if (bookingCheck.rows[0].worker_id !== worker.id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const endAt = bookingCheck.rows[0].end_time ? new Date(bookingCheck.rows[0].end_time) : null;
    const skipGpsCheck = isAutoMode && endAt && Date.now() >= endAt.getTime();

    const result = await performShiftClockOut({
      bookingId: id,
      clockOutTime: new Date(),
      lat,
      lng,
      source: 'worker',
      skipGpsCheck,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        error: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      ok: true,
      already_clocked_out: result.already_clocked_out === true,
      booking: result.booking,
      timesheet: result.timesheet || null,
      actual_hours: result.actual_hours,
      timesheet_review: result.timesheet_review,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[clockOut]', err);
    const msg = String(err?.message || '').trim();
    return res.status(500).json({
      ok: false,
      error: msg && !/internal/i.test(msg) ? msg : 'Failed to clock out',
    });
  }
};

const completeBooking = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;

    const bookingRes = await pool.query(
      `SELECT b.*, p.user_id AS participant_user_id, w.user_id AS worker_user_id
       FROM bookings b
       JOIN participants p ON p.id = b.participant_id
       JOIN workers w ON w.id = b.worker_id
       WHERE b.id = $1
       LIMIT 1`,
      [id]
    );

    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const booking = bookingRes.rows[0];
    const isParticipant = req.user.userId === booking.participant_user_id;
    const isWorker = req.user.userId === booking.worker_user_id;

    if (!(req.user.role === 'admin' || isParticipant || isWorker)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const timesheetRes = await pool.query('SELECT clock_out_time FROM booking_timesheets WHERE booking_id = $1 LIMIT 1', [id]);
    if (timesheetRes.rowCount === 0 || !timesheetRes.rows[0].clock_out_time) {
      return res.status(400).json({ ok: false, error: 'Cannot complete booking without clock-out' });
    }

    if (booking.status !== 'in_progress') {
      return res.status(400).json({ ok: false, error: 'Invalid booking status transition' });
    }

    const updatedRes = await pool.query(
      "UPDATE bookings SET status = 'completed', updated_at = now() WHERE id = $1 RETURNING *",
      [id]
    );

    let timesheetReview = null;
    try {
      timesheetReview = await submitTimesheetForReview(id);
    } catch (submitErr) {
      timesheetReview = { error: submitErr.message };
    }

    return res.status(200).json({ ok: true, booking: updatedRes.rows[0], timesheet_review: timesheetReview });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to complete booking' });
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  acceptBooking,
  declineBooking,
  cancelBooking,
  clockIn,
  clockOut,
  completeBooking,
  updateTimesheetNotes
};
