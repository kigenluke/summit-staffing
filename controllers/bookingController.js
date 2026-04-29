const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { isWithinRadius } = require('../utils/gpsHelper');
const { sendPushNotification } = require('../services/notificationService');
const { sendSMS } = require('../services/smsService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
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
  const res = await pool.query('SELECT id, user_id, phone FROM participants WHERE user_id = $1 LIMIT 1', [userId]);
  return res.rowCount ? res.rows[0] : null;
};

const getWorkerForUser = async (userId) => {
  const res = await pool.query('SELECT id, user_id FROM workers WHERE user_id = $1 LIMIT 1', [userId]);
  return res.rowCount ? res.rows[0] : null;
};

const createBooking = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

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
      special_instructions
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

    const start = new Date(start_time);
    const end = new Date(end_time);
    const scheduledHours = hoursBetween(start, end);
    const totalAmount = Number((rate * scheduledHours).toFixed(2));
    const commissionAmount = Number((totalAmount * 0.15).toFixed(2));

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
        commission_amount
      ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12)
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
        commissionAmount
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

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM bookings b ${whereSql}`, params);

    const dataRes = await pool.query(
      `SELECT b.*
       FROM bookings b
       ${whereSql}
       ORDER BY b.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      ok: true,
      total: countRes.rows[0]?.total || 0,
      limit,
      offset,
      bookings: dataRes.rows
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

    if (req.user.role !== 'admin') {
      const canView = req.user.userId === booking.participant_user_id || req.user.userId === booking.worker_user_id;
      if (!canView) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    }

    const timesheetRes = await pool.query('SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1', [id]);

    return res.status(200).json({ ok: true, booking, timesheet: timesheetRes.rows[0] || null });
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

      await sendPushNotification(booking.participant_user_id, 'Booking accepted', 'Your booking has been accepted by the worker.', {
        bookingId: booking.id,
        type: 'booking_accepted',
      });

      if (booking.participant_phone) {
        await sendSMS(booking.participant_phone, `Your booking ${id} has been accepted.`);
      }

      return res.status(200).json({ ok: true, booking: updatedRes.rows[0] });
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
      const now = new Date();
      // Guard rail: if an early clock-in request comes in, cap recorded time at shift start.
      const effectiveClockInTime = (startAt && now < startAt) ? startAt : now;

      if (booking.location_lat === null || booking.location_lng === null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Booking location is not set' });
      }

      const within = isWithinRadius(Number(lat), Number(lng), Number(booking.location_lat), Number(booking.location_lng), 100);
      if (!within) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Clock-in location is not within 100m of booking location' });
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
          [id, effectiveClockInTime, Number(lat), Number(lng)]
        );
      } else {
        await client.query(
          `UPDATE booking_timesheets
           SET clock_in_time = $2, clock_in_lat = $3, clock_in_lng = $4
           WHERE booking_id = $1`,
          [id, effectiveClockInTime, Number(lat), Number(lng)]
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
    const useScheduledEndTime = req.body?.useScheduledEndTime === true || req.body?.mode === 'auto';

    const worker = await getWorkerForUser(req.user.userId);
    if (!worker) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookingRes = await client.query(
        `SELECT b.*, w.hourly_rate AS worker_hourly_rate
         FROM bookings b
         JOIN workers w ON w.id = b.worker_id
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

      if (booking.status !== 'in_progress') {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Invalid booking status transition' });
      }

      if (booking.location_lat === null || booking.location_lng === null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Booking location is not set' });
      }

      const within = isWithinRadius(Number(lat), Number(lng), Number(booking.location_lat), Number(booking.location_lng), 100);
      if (!within) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Clock-out location is not within 100m of booking location' });
      }

      const timesheetRes = await client.query('SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1 FOR UPDATE', [id]);
      if (timesheetRes.rowCount === 0 || !timesheetRes.rows[0].clock_in_time) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Cannot clock out before clock in' });
      }

      if (timesheetRes.rows[0].clock_out_time) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Already clocked out' });
      }

      const clockInTime = new Date(timesheetRes.rows[0].clock_in_time);
      const clockOutTime = useScheduledEndTime && booking?.end_time
        ? new Date(booking.end_time)
        : new Date();
      const actualHours = Number(hoursBetween(clockInTime, clockOutTime).toFixed(2));

      await client.query(
        `UPDATE booking_timesheets
         SET clock_out_time = $2,
             clock_out_lat = $3,
             clock_out_lng = $4,
             actual_hours = $5
         WHERE booking_id = $1`,
        [id, clockOutTime, Number(lat), Number(lng), actualHours]
      );

      const rate = Number(booking.hourly_rate ?? booking.worker_hourly_rate ?? 0);
      const totalAmount = Number((rate * actualHours).toFixed(2));
      const commissionAmount = Number((totalAmount * 0.15).toFixed(2));

      const updatedBooking = await client.query(
        'UPDATE bookings SET total_amount = $2, commission_amount = $3, updated_at = now() WHERE id = $1 RETURNING *',
        [id, totalAmount, commissionAmount]
      );

      const updatedTimesheet = await client.query('SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1', [id]);

      await client.query('COMMIT');

      return res.status(200).json({ ok: true, booking: updatedBooking.rows[0], timesheet: updatedTimesheet.rows[0] || null, actual_hours: actualHours });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to clock out' });
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

    return res.status(200).json({ ok: true, booking: updatedRes.rows[0] });
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
