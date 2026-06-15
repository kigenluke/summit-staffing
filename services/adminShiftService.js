const pool = require('../config/database');
const { sendPushNotification } = require('./notificationService');
const { sendEmail } = require('./emailService');
const { cancelBookingAuthorization } = require('./paymentPipelineService');

const formatShiftDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const REOPENABLE_BOOKING_STATUSES = new Set(['pending', 'confirmed']);

async function findShiftForBooking(client, booking, participantUserId) {
  if (booking.source_shift_id) {
    const byId = await client.query('SELECT * FROM shifts WHERE id = $1 LIMIT 1', [booking.source_shift_id]);
    if (byId.rowCount > 0) return byId.rows[0];
  }

  const matched = await client.query(
    `SELECT *
     FROM shifts
     WHERE participant_id = $1
       AND start_time = $2
       AND end_time = $3
       AND service_type = $4
       AND status IN ('filled', 'open')
     ORDER BY CASE WHEN status = 'filled' THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [participantUserId, booking.start_time, booking.end_time, booking.service_type]
  );
  return matched.rowCount > 0 ? matched.rows[0] : null;
}

/**
 * Admin: remove assigned worker, cancel linked booking, reopen shift for applications.
 */
async function unassignWorkerAndReopenShift({
  bookingId = null,
  shiftId = null,
  reason = 'Removed by Summit Staffing office',
  notifyParticipant = true,
}) {
  if (!bookingId && !shiftId) {
    throw Object.assign(new Error('bookingId or shiftId is required'), { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let booking = null;
    let shift = null;

    if (bookingId) {
      const bookingRes = await client.query(
        `SELECT b.*,
                p.user_id AS participant_user_id,
                p.first_name AS participant_first_name,
                p.last_name AS participant_last_name,
                u.email AS participant_email,
                w.user_id AS worker_user_id,
                w.first_name AS worker_first_name,
                w.last_name AS worker_last_name
         FROM bookings b
         JOIN participants p ON p.id = b.participant_id
         JOIN users u ON u.id = p.user_id
         JOIN workers w ON w.id = b.worker_id
         WHERE b.id = $1
         FOR UPDATE`,
        [bookingId]
      );
      if (bookingRes.rowCount === 0) {
        throw Object.assign(new Error('Booking not found'), { status: 404 });
      }
      booking = bookingRes.rows[0];
      shift = await findShiftForBooking(client, booking, booking.participant_user_id);
    } else {
      const shiftRes = await client.query('SELECT * FROM shifts WHERE id = $1 FOR UPDATE', [shiftId]);
      if (shiftRes.rowCount === 0) {
        throw Object.assign(new Error('Shift not found'), { status: 404 });
      }
      shift = shiftRes.rows[0];

      const bookingRes = await client.query(
        `SELECT b.*,
                p.user_id AS participant_user_id,
                p.first_name AS participant_first_name,
                p.last_name AS participant_last_name,
                u.email AS participant_email,
                w.user_id AS worker_user_id,
                w.first_name AS worker_first_name,
                w.last_name AS worker_last_name
         FROM bookings b
         JOIN participants p ON p.id = b.participant_id
         JOIN users u ON u.id = p.user_id
         JOIN workers w ON w.id = b.worker_id
         WHERE (
           b.source_shift_id = $1
           OR (
             p.user_id = $2
             AND b.start_time = $3
             AND b.end_time = $4
             AND b.service_type = $5
           )
         )
           AND b.status IN ('pending', 'confirmed', 'in_progress')
         ORDER BY b.created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [shiftId, shift.participant_id, shift.start_time, shift.end_time, shift.service_type]
      );
      booking = bookingRes.rowCount > 0 ? bookingRes.rows[0] : null;
    }

    if (!shift) {
      throw Object.assign(new Error('No linked shift found for this booking'), { status: 404 });
    }

    if (shift.status !== 'filled') {
      throw Object.assign(new Error('Shift is not currently filled — nothing to unassign'), { status: 400 });
    }

    if (booking) {
      if (!REOPENABLE_BOOKING_STATUSES.has(booking.status)) {
        throw Object.assign(
          new Error(`Cannot unassign worker while booking is ${booking.status}. Only pending or confirmed bookings can be reopened.`),
          { status: 400 }
        );
      }

      await client.query(
        `UPDATE bookings
         SET status = 'cancelled',
             decline_reason = $2,
             updated_at = now()
         WHERE id = $1`,
        [booking.id, reason]
      );
    }

    const removedWorkerUserId = shift.filled_by_worker_id;

    await client.query(
      `UPDATE shifts
       SET status = 'open',
           filled_by_worker_id = NULL,
           updated_at = now()
       WHERE id = $1`,
      [shift.id]
    );

    if (removedWorkerUserId) {
      await client.query(
        `DELETE FROM shift_applications
         WHERE shift_id = $1 AND worker_id = $2`,
        [shift.id, removedWorkerUserId]
      );
    }

    await client.query(
      `UPDATE shift_applications
       SET status = 'pending'
       WHERE shift_id = $1 AND status = 'rejected'`,
      [shift.id]
    );

    await client.query('COMMIT');

    if (booking?.id) {
      try {
        await cancelBookingAuthorization(booking.id);
      } catch (_) {}
    }

    const shiftTitle = shift.title || shift.service_type || 'your shift';
    const shiftDate = formatShiftDate(shift.start_time);

    if (notifyParticipant && booking?.participant_user_id) {
      const participantMsg =
        `Summit Staffing removed the assigned worker from "${shiftTitle}" on ${shiftDate}. `
        + 'Your shift is open again — check My Shifts to review new applicants.';

      await sendPushNotification(
        booking.participant_user_id,
        'Shift open again',
        participantMsg,
        { type: 'shift_reopened', shiftId: shift.id, bookingId: booking?.id || null }
      );

      if (booking.participant_email) {
        try {
          await sendEmail(
            booking.participant_email,
            `Shift reopened — ${shiftTitle}`,
            `<p>Hi ${booking.participant_first_name || 'there'},</p>`
            + `<p>Summit Staffing has removed the support worker from your shift <strong>${shiftTitle}</strong> `
            + `scheduled for <strong>${shiftDate}</strong>.</p>`
            + `<p>Your shift is <strong>open again</strong> and visible to workers. Open the app → <strong>My Shifts</strong> to review applicants.</p>`
            + `<p>If you have questions, contact us at info@summitstaffing.com.au.</p>`
          );
        } catch (_) {}
      }
    }

    if (removedWorkerUserId) {
      await sendPushNotification(
        removedWorkerUserId,
        'Removed from shift',
        `You have been removed from "${shiftTitle}" on ${shiftDate} by Summit Staffing.`,
        { type: 'shift_unassigned', shiftId: shift.id, bookingId: booking?.id || null }
      );
    }

    return {
      ok: true,
      shift: { id: shift.id, title: shift.title, status: 'open', start_time: shift.start_time },
      booking: booking ? { id: booking.id, status: 'cancelled' } : null,
      removedWorkerUserId,
      participantNotified: Boolean(notifyParticipant && booking?.participant_user_id),
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function listAssignedShifts({ limit = 50, offset = 0, upcomingOnly = true } = {}) {
  const params = [];
  let timeFilter = '';
  if (upcomingOnly) {
    timeFilter = 'AND s.end_time >= now()';
  }

  const dataRes = await pool.query(
    `SELECT
       s.id AS shift_id,
       s.title,
       s.service_type,
       s.start_time,
       s.end_time,
       s.status AS shift_status,
       s.location,
       s.hourly_rate,
       s.filled_by_worker_id,
       p.first_name AS participant_first_name,
       p.last_name AS participant_last_name,
       pu.email AS participant_email,
       pu.id AS participant_user_id,
       w.first_name AS worker_first_name,
       w.last_name AS worker_last_name,
       wu.email AS worker_email,
       b.id AS booking_id,
       b.status AS booking_status
     FROM shifts s
     JOIN users pu ON pu.id = s.participant_id
     JOIN participants p ON p.user_id = s.participant_id
     LEFT JOIN users wu ON wu.id = s.filled_by_worker_id
     LEFT JOIN workers w ON w.user_id = s.filled_by_worker_id
     LEFT JOIN LATERAL (
       SELECT b2.id, b2.status
       FROM bookings b2
       WHERE b2.source_shift_id = s.id
          OR (
            b2.participant_id = p.id
            AND b2.start_time = s.start_time
            AND b2.end_time = s.end_time
            AND b2.service_type = s.service_type
          )
       AND b2.status IN ('pending', 'confirmed', 'in_progress')
       ORDER BY b2.created_at DESC
       LIMIT 1
     ) b ON true
     WHERE s.status = 'filled'
       ${timeFilter}
     ORDER BY s.start_time ASC
     LIMIT $1 OFFSET $2`,
    [Math.min(limit, 100), Math.max(offset, 0)]
  );

  return { ok: true, shifts: dataRes.rows, limit, offset };
}

module.exports = {
  unassignWorkerAndReopenShift,
  listAssignedShifts,
};
