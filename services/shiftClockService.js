const pool = require('../config/database');
const { isWithinRadius, CLOCK_SITE_RADIUS_METERS } = require('../utils/gpsHelper.cjs');
const { computePlatformFeeBreakdown } = require('../utils/platformFee.cjs');
const { submitTimesheetForReview } = require('./timesheetApprovalService');

let schemaReady = null;

async function ensureShiftClockSchema() {
  if (!schemaReady) {
    schemaReady = pool
      .query(`
        ALTER TABLE booking_timesheets ADD COLUMN IF NOT EXISTS clock_out_source TEXT;
        ALTER TABLE booking_timesheets ADD COLUMN IF NOT EXISTS payroll_review_required BOOLEAN NOT NULL DEFAULT false;
      `)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

async function loadBookingForClock(bookingId, client = pool) {
  const res = await client.query(
    `SELECT b.*, w.hourly_rate AS worker_hourly_rate, s.description AS shift_description
     FROM bookings b
     JOIN workers w ON w.id = b.worker_id
     LEFT JOIN shifts s ON s.id = b.source_shift_id
     WHERE b.id = $1`,
    [bookingId]
  );
  return res.rowCount ? res.rows[0] : null;
}

/**
 * Complete a shift clock-out (worker, system auto-close, or admin).
 */
async function performShiftClockOut({
  bookingId,
  clockOutTime = new Date(),
  lat = null,
  lng = null,
  source = 'worker',
  skipGpsCheck = false,
  payrollReviewRequired = null,
  client: externalClient = null,
}) {
  await ensureShiftClockSchema();

  const {
    canManualClockOutAt,
    canWorkerManualClockOut,
    getPayrollClockOutTime,
  } = await import('../utils/shiftClockRules.mjs');
  const { computeLabourPayout } = await import('../utils/billableShiftHours.mjs');

  const ownsClient = !externalClient;
  const client = externalClient || (await pool.connect());

  try {
    if (ownsClient) await client.query('BEGIN');

    const bookingRes = await client.query(
      'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    );

    if (bookingRes.rowCount === 0) {
      if (ownsClient) await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Booking not found' };
    }

    const booking = bookingRes.rows[0];

    const workerRes = await client.query(
      'SELECT hourly_rate FROM workers WHERE id = $1 LIMIT 1',
      [booking.worker_id]
    );
    booking.worker_hourly_rate = workerRes.rows[0]?.hourly_rate ?? null;

    if (booking.source_shift_id) {
      const shiftRes = await client.query(
        'SELECT description FROM shifts WHERE id = $1 LIMIT 1',
        [booking.source_shift_id]
      );
      booking.shift_description = shiftRes.rows[0]?.description ?? null;
    } else {
      booking.shift_description = null;
    }

    if (booking.status !== 'in_progress') {
      if (ownsClient) await client.query('ROLLBACK');
      return { ok: false, status: 400, error: 'Invalid booking status transition' };
    }

    const timesheetRes = await client.query(
      'SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1 FOR UPDATE',
      [bookingId]
    );

    if (timesheetRes.rowCount === 0 || !timesheetRes.rows[0].clock_in_time) {
      if (ownsClient) await client.query('ROLLBACK');
      return { ok: false, status: 400, error: 'Cannot clock out before clock in' };
    }

    if (timesheetRes.rows[0].clock_out_time) {
      if (ownsClient) await client.query('COMMIT');
      return {
        ok: true,
        already_clocked_out: true,
        booking,
        timesheet: timesheetRes.rows[0],
      };
    }

    const now = new Date(clockOutTime);
    const isWorkerSource = source === 'worker';

    if (isWorkerSource) {
      const manualCheck = canWorkerManualClockOut(
        now,
        booking.end_time,
        timesheetRes.rows[0].clock_in_time,
      );
      if (!manualCheck.ok) {
        if (ownsClient) await client.query('ROLLBACK');
        return { ok: false, status: 400, error: manualCheck.error, code: manualCheck.code };
      }
    } else {
      const manualCheck = canManualClockOutAt(now, booking.end_time);
      if (!manualCheck.ok) {
        if (ownsClient) await client.query('ROLLBACK');
        return { ok: false, status: 400, error: manualCheck.error, code: manualCheck.code };
      }
    }

    if (!skipGpsCheck) {
      if (booking.location_lat === null || booking.location_lng === null) {
        if (ownsClient) await client.query('ROLLBACK');
        return { ok: false, status: 400, error: 'Booking location is not set' };
      }
      const within = isWithinRadius(
        Number(lat),
        Number(lng),
        Number(booking.location_lat),
        Number(booking.location_lng),
        CLOCK_SITE_RADIUS_METERS,
      );
      if (!within) {
        if (ownsClient) await client.query('ROLLBACK');
        return {
          ok: false,
          status: 400,
          error: `You must be within ${CLOCK_SITE_RADIUS_METERS} metres of the shift location to clock out. Move closer and try again.`,
        };
      }
    }

    const actualClockOut = now;
    const payrollClockOut = getPayrollClockOutTime(actualClockOut, booking.end_time) || actualClockOut;
    const clockInTime = new Date(timesheetRes.rows[0].clock_in_time);

    const { paidHoursAtRate, labourSubtotal } = computeLabourPayout({
      clockInTime,
      clockOutTime: payrollClockOut,
      shiftStartTime: booking.start_time,
      shiftEndTime: booking.end_time,
      shiftDescription: booking.shift_description,
      hourlyRate: Number(booking.hourly_rate ?? booking.worker_hourly_rate ?? 0),
    });

    const reviewRequired = payrollReviewRequired != null
      ? Boolean(payrollReviewRequired)
      : source !== 'worker';

    await client.query(
      `UPDATE booking_timesheets
       SET clock_out_time = $2,
           clock_out_lat = $3,
           clock_out_lng = $4,
           actual_hours = $5,
           clock_out_source = $6,
           payroll_review_required = $7
       WHERE booking_id = $1`,
      [
        bookingId,
        actualClockOut,
        lat != null ? Number(lat) : null,
        lng != null ? Number(lng) : null,
        paidHoursAtRate,
        source,
        reviewRequired,
      ]
    );

    const { commission: commissionAmount } = computePlatformFeeBreakdown(labourSubtotal);

    const updatedBooking = await client.query(
      "UPDATE bookings SET status = 'completed', total_amount = $2, commission_amount = $3, updated_at = now() WHERE id = $1 RETURNING *",
      [bookingId, labourSubtotal, commissionAmount]
    );

    const updatedTimesheet = await client.query(
      'SELECT * FROM booking_timesheets WHERE booking_id = $1 LIMIT 1',
      [bookingId]
    );

    if (ownsClient) await client.query('COMMIT');

    let timesheetReview = null;
    try {
      timesheetReview = await submitTimesheetForReview(bookingId);
    } catch (submitErr) {
      timesheetReview = { error: submitErr.message };
    }

    return {
      ok: true,
      booking: updatedBooking.rows[0],
      timesheet: updatedTimesheet.rows[0] || null,
      actual_hours: paidHoursAtRate,
      timesheet_review: timesheetReview,
      system_logged_out: source === 'system',
      payroll_review_required: reviewRequired,
    };
  } catch (err) {
    if (ownsClient) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

/** Option B: close at scheduled end when shift window has passed. */
async function reconcileStaleInProgressShift(bookingId) {
  await ensureShiftClockSchema();
  const booking = await loadBookingForClock(bookingId);
  if (!booking || booking.status !== 'in_progress') return { reconciled: false };

  const tsRes = await pool.query(
    'SELECT clock_in_time, clock_out_time FROM booking_timesheets WHERE booking_id = $1 LIMIT 1',
    [bookingId]
  );
  const ts = tsRes.rows[0];
  if (!ts?.clock_in_time || ts.clock_out_time) return { reconciled: false };

  const { shouldReconcileStaleShift } = await import('../utils/shiftClockRules.mjs');
  if (!shouldReconcileStaleShift(new Date(), booking.end_time)) return { reconciled: false };

  const endTime = booking.end_time ? new Date(booking.end_time) : new Date();
  const result = await performShiftClockOut({
    bookingId,
    clockOutTime: endTime,
    source: 'system',
    skipGpsCheck: true,
    payrollReviewRequired: true,
  });

  return { reconciled: result.ok === true, result };
}

/** Option A: cron backup — 2 hours after scheduled end. */
async function processForgottenClockOuts() {
  await ensureShiftClockSchema();
  const { shouldForceCloseForgottenShift } = await import('../utils/shiftClockRules.mjs');

  const candidates = await pool.query(
    `SELECT b.id, b.end_time
     FROM bookings b
     JOIN booking_timesheets t ON t.booking_id = b.id
     WHERE b.status = 'in_progress'
       AND t.clock_in_time IS NOT NULL
       AND t.clock_out_time IS NULL
       AND b.end_time IS NOT NULL
       AND b.end_time < now()
     ORDER BY b.end_time ASC
     LIMIT 50`
  );

  let processed = 0;
  for (const row of candidates.rows) {
    if (!shouldForceCloseForgottenShift(new Date(), row.end_time)) continue;
    try {
      const endTime = new Date(row.end_time);
      const result = await performShiftClockOut({
        bookingId: row.id,
        clockOutTime: endTime,
        source: 'system',
        skipGpsCheck: true,
        payrollReviewRequired: true,
      });
      if (result.ok) processed += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[shiftClock] forgotten clock-out failed:', row.id, err.message);
    }
  }

  return { processed };
}

async function listStaleInProgressBookings(limit = 50) {
  await ensureShiftClockSchema();
  const res = await pool.query(
    `SELECT b.id AS booking_id, b.start_time, b.end_time, b.status, b.service_type,
            t.clock_in_time, t.clock_out_time, t.clock_out_source, t.payroll_review_required,
            w.first_name AS worker_first_name, w.last_name AS worker_last_name,
            p.first_name AS participant_first_name, p.last_name AS participant_last_name
     FROM bookings b
     JOIN booking_timesheets t ON t.booking_id = b.id
     JOIN workers w ON w.id = b.worker_id
     JOIN participants p ON p.id = b.participant_id
     WHERE b.status = 'in_progress'
       AND t.clock_in_time IS NOT NULL
       AND t.clock_out_time IS NULL
     ORDER BY b.end_time ASC NULLS LAST
     LIMIT $1`,
    [Math.min(limit, 100)]
  );
  return res.rows;
}

module.exports = {
  ensureShiftClockSchema,
  performShiftClockOut,
  reconcileStaleInProgressShift,
  processForgottenClockOuts,
  listStaleInProgressBookings,
};
