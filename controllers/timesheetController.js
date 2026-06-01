const { validationResult } = require('express-validator');
const pool = require('../config/database');
const {
  approveTimesheet,
  disputeTimesheet,
} = require('../services/timesheetApprovalService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const assertParticipantBookingAccess = async (userId, bookingId) => {
  const res = await pool.query(
    `SELECT b.id, p.user_id AS participant_user_id
     FROM bookings b
     JOIN participants p ON p.id = b.participant_id
     WHERE b.id = $1 LIMIT 1`,
    [bookingId]
  );
  if (res.rowCount === 0) return { ok: false, status: 404, error: 'Booking not found' };
  if (res.rows[0].participant_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the participant can approve or dispute this timesheet' };
  }
  return { ok: true };
};

const getTimesheetStatus = async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const tsRes = await pool.query(
      `SELECT t.*, b.payment_pipeline, b.authorization_status, b.status AS booking_status
       FROM booking_timesheets t
       JOIN bookings b ON b.id = t.booking_id
       WHERE t.booking_id = $1 LIMIT 1`,
      [bookingId]
    );
    if (tsRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Timesheet not found' });
    }
    return res.status(200).json({ ok: true, timesheet: tsRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to load timesheet status' });
  }
};

const approveTimesheetHandler = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const { id: bookingId } = req.params;
    const access = await assertParticipantBookingAccess(req.user.userId, bookingId);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const result = await approveTimesheet(bookingId, { auto: false });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || 'Could not approve timesheet' });
  }
};

const disputeTimesheetHandler = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const { id: bookingId } = req.params;
    const access = await assertParticipantBookingAccess(req.user.userId, bookingId);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const timesheet = await disputeTimesheet(bookingId, req.body?.reason);
    return res.status(200).json({ ok: true, timesheet });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || 'Could not dispute timesheet' });
  }
};

module.exports = {
  getTimesheetStatus,
  approveTimesheetHandler,
  disputeTimesheetHandler,
};
