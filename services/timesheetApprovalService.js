const pool = require('../config/database');
const { processPaymentPipelineOnApproval } = require('./paymentPipelineService');

const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Start 24-hour review window after shift timesheet is submitted (clock-out recorded).
 */
const submitTimesheetForReview = async (bookingId, client = null) => {
  const db = client || pool;
  const autoApproveAt = new Date(Date.now() + APPROVAL_WINDOW_MS);

  const tsRes = await db.query(
    `SELECT id, clock_out_time, approval_status FROM booking_timesheets WHERE booking_id = $1 LIMIT 1`,
    [bookingId]
  );
  if (tsRes.rowCount === 0 || !tsRes.rows[0].clock_out_time) {
    throw Object.assign(new Error('Timesheet must be clocked out before submission'), { code: 'timesheet_incomplete' });
  }

  const current = tsRes.rows[0].approval_status;
  if (['approved', 'auto_approved'].includes(current)) {
    return tsRes.rows[0];
  }
  if (current === 'disputed') {
    throw Object.assign(new Error('Timesheet is under dispute'), { code: 'timesheet_disputed' });
  }

  const updated = await db.query(
    `UPDATE booking_timesheets
     SET approval_status = 'pending_review',
         submitted_at = COALESCE(submitted_at, now()),
         auto_approve_at = $2,
         disputed_at = NULL,
         dispute_reason = NULL
     WHERE booking_id = $1
     RETURNING *`,
    [bookingId, autoApproveAt]
  );
  return updated.rows[0];
};

const approveTimesheet = async (bookingId, { auto = false } = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tsRes = await client.query(
      `SELECT t.*, b.status AS booking_status, b.payment_pipeline
       FROM booking_timesheets t
       JOIN bookings b ON b.id = t.booking_id
       WHERE t.booking_id = $1
       FOR UPDATE`,
      [bookingId]
    );
    if (tsRes.rowCount === 0) {
      throw Object.assign(new Error('Timesheet not found'), { code: 'not_found' });
    }
    const ts = tsRes.rows[0];
    if (!ts.clock_out_time) {
      throw Object.assign(new Error('Cannot approve before clock-out'), { code: 'timesheet_incomplete' });
    }
    if (['approved', 'auto_approved'].includes(ts.approval_status)) {
      await client.query('COMMIT');
      return { timesheet: ts, alreadyApproved: true };
    }
    if (ts.approval_status === 'disputed') {
      throw Object.assign(new Error('Cannot approve a disputed timesheet'), { code: 'timesheet_disputed' });
    }

    const status = auto ? 'auto_approved' : 'approved';
    const updatedTs = await client.query(
      `UPDATE booking_timesheets
       SET approval_status = $2,
           approved_at = now(),
           auto_approve_at = NULL
       WHERE booking_id = $1
       RETURNING *`,
      [bookingId, status]
    );

    await client.query('COMMIT');

    const pipelineResult = await processPaymentPipelineOnApproval(bookingId).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('processPaymentPipelineOnApproval:', bookingId, err);
      return { ok: false, error: err.message };
    });

    return { timesheet: updatedTs.rows[0], alreadyApproved: false, pipeline: pipelineResult };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const disputeTimesheet = async (bookingId, reason) => {
  const reasonText = String(reason || '').trim();
  if (!reasonText) {
    throw Object.assign(new Error('Dispute reason is required'), { code: 'reason_required' });
  }

  const updated = await pool.query(
    `UPDATE booking_timesheets
     SET approval_status = 'disputed',
         disputed_at = now(),
         dispute_reason = $2,
         auto_approve_at = NULL
     WHERE booking_id = $1
       AND approval_status IN ('pending_review', 'not_submitted')
     RETURNING *`,
    [bookingId, reasonText.slice(0, 2000)]
  );
  if (updated.rowCount === 0) {
    throw Object.assign(new Error('Timesheet cannot be disputed in its current state'), { code: 'invalid_state' });
  }
  return updated.rows[0];
};

/** Cron: auto-approve timesheets past the 24-hour window with no dispute. */
const runAutoApprovals = async () => {
  const due = await pool.query(
    `SELECT booking_id FROM booking_timesheets
     WHERE approval_status = 'pending_review'
       AND auto_approve_at IS NOT NULL
       AND auto_approve_at <= now()
     ORDER BY auto_approve_at ASC
     LIMIT 50`
  );

  const results = [];
  for (const row of due.rows) {
    try {
      const r = await approveTimesheet(row.booking_id, { auto: true });
      results.push({ bookingId: row.booking_id, ok: true, ...r });
    } catch (err) {
      results.push({ bookingId: row.booking_id, ok: false, error: err.message });
    }
  }
  return { processed: results.length, results };
};

module.exports = {
  APPROVAL_WINDOW_MS,
  submitTimesheetForReview,
  approveTimesheet,
  disputeTimesheet,
  runAutoApprovals,
};
