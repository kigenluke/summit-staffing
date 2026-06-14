const pool = require('../config/database');
const { cancelBookingAuthorization } = require('./paymentPipelineService');
const { sendPushNotification } = require('./notificationService');

const NO_SHOW_DECLINE_REASON = 'No-show: worker did not clock in before the shift ended.';

/**
 * Auto-close confirmed bookings whose shift window ended with no clock-in.
 */
async function processMissedShifts() {
  const candidates = await pool.query(
    `SELECT b.id, w.user_id AS worker_user_id, p.user_id AS participant_user_id
     FROM bookings b
     JOIN workers w ON w.id = b.worker_id
     JOIN participants p ON p.id = b.participant_id
     LEFT JOIN booking_timesheets t ON t.booking_id = b.id
     WHERE b.status = 'confirmed'
       AND b.end_time < now()
       AND (t.clock_in_time IS NULL)
     ORDER BY b.end_time ASC
     LIMIT 100`
  );

  let processed = 0;
  for (const row of candidates.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lock = await client.query(
        `SELECT b.id
         FROM bookings b
         LEFT JOIN booking_timesheets t ON t.booking_id = b.id
         WHERE b.id = $1
           AND b.status = 'confirmed'
           AND b.end_time < now()
           AND (t.clock_in_time IS NULL)
         FOR UPDATE OF b`,
        [row.id]
      );

      if (lock.rowCount === 0) {
        await client.query('ROLLBACK');
        continue;
      }

      await client.query(
        `UPDATE bookings
         SET status = 'cancelled', decline_reason = $2, updated_at = now()
         WHERE id = $1`,
        [row.id, NO_SHOW_DECLINE_REASON]
      );

      await client.query('COMMIT');
      processed += 1;

      try {
        await cancelBookingAuthorization(row.id);
      } catch (_) {}

      try {
        await sendPushNotification(
          row.worker_user_id,
          'Shift marked no-show',
          'You did not clock in before the shift ended.',
          { bookingId: row.id, type: 'booking_no_show' }
        );
        await sendPushNotification(
          row.participant_user_id,
          'Shift not completed',
          'The worker did not clock in for this shift.',
          { bookingId: row.id, type: 'booking_no_show' }
        );
      } catch (_) {}
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    } finally {
      client.release();
    }
  }

  return { processed };
}

module.exports = {
  NO_SHOW_DECLINE_REASON,
  processMissedShifts,
};
