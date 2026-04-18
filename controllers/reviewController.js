const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { calculateAverageRating } = require('../utils/ratingCalculator');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const createReview = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { bookingId, rating, comment, incidentReported, incidentDetails } = req.body;

    const bookingRes = await pool.query(
      `SELECT b.id, b.status,
              b.participant_id, p.user_id AS participant_user_id,
              b.worker_id, w.user_id AS worker_user_id
       FROM bookings b
       JOIN participants p ON p.id = b.participant_id
       JOIN workers w ON w.id = b.worker_id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId]
    );

    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const booking = bookingRes.rows[0];

    if (booking.status !== 'completed') {
      return res.status(400).json({ ok: false, error: 'Booking must be completed before leaving a review' });
    }

    const reviewerUserId = req.user.userId;

    const isParticipantReviewer = reviewerUserId === booking.participant_user_id;
    const isWorkerReviewer = reviewerUserId === booking.worker_user_id;

    if (!isParticipantReviewer && !isWorkerReviewer) {
      return res.status(403).json({ ok: false, error: 'You were not part of this booking' });
    }

    const revieweeUserId = isParticipantReviewer ? booking.worker_user_id : booking.participant_user_id;

    if (reviewerUserId === revieweeUserId) {
      return res.status(400).json({ ok: false, error: 'You cannot review yourself' });
    }

    // Role enforcement (participant reviews worker OR worker reviews participant)
    if (isParticipantReviewer && req.user.role !== 'participant') {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    if (isWorkerReviewer && req.user.role !== 'worker') {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const incidentFlag = Boolean(incidentReported);
    const incidentText = incidentDetails === undefined || incidentDetails === null
      ? null
      : String(incidentDetails).trim();
    if (incidentFlag && (!incidentText || incidentText.length < 5)) {
      return res.status(400).json({ ok: false, error: 'Please provide incident details (minimum 5 characters)' });
    }

    let inserted;
    try {
      inserted = await pool.query(
        `INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment, incident_reported, incident_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, booking_id, reviewer_id, reviewee_id, rating, comment, incident_reported, incident_details, created_at`,
        [booking.id, reviewerUserId, revieweeUserId, rating, comment || null, incidentFlag, incidentText]
      );
    } catch (e) {
      // unique per booking + reviewer
      if (String(e.code) === '23505') {
        return res.status(409).json({ ok: false, error: 'You have already submitted a review for this booking' });
      }
      throw e;
    }

    // If participant reviewed worker, update worker rating
    let workerRatingUpdate = null;
    if (isParticipantReviewer) {
      workerRatingUpdate = await calculateAverageRating(booking.worker_id);
    }

    return res.status(201).json({ ok: true, review: inserted.rows[0], workerRatingUpdate });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to create review' });
  }
};

const getReviews = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    if (req.params.workerId) {
      const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [req.params.workerId]);
      if (workerRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Worker not found' });

      const workerUserId = workerRes.rows[0].user_id;

      const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM reviews WHERE reviewee_id = $1', [workerUserId]);

      const dataRes = await pool.query(
        `SELECT r.id, r.booking_id, r.rating, r.comment, r.created_at,
                COALESCE(p.first_name, w.first_name, 'User') AS reviewer_first_name
         FROM reviews r
         JOIN users u ON u.id = r.reviewer_id
         LEFT JOIN participants p ON p.user_id = u.id
         LEFT JOIN workers w ON w.user_id = u.id
         WHERE r.reviewee_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [workerUserId, limit, offset]
      );

      return res.status(200).json({
        ok: true,
        total: countRes.rows[0]?.total || 0,
        limit,
        offset,
        reviews: dataRes.rows
      });
    }

    if (req.params.participantId) {
      // Only workers can view participant reviews
      if (req.user.role !== 'worker') {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      const participantRes = await pool.query('SELECT id, user_id FROM participants WHERE id = $1 LIMIT 1', [req.params.participantId]);
      if (participantRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Participant not found' });

      const participantUserId = participantRes.rows[0].user_id;

      const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM reviews WHERE reviewee_id = $1', [participantUserId]);

      const dataRes = await pool.query(
        `SELECT r.id, r.booking_id, r.rating, r.comment, r.created_at,
                COALESCE(p.first_name, w.first_name, 'User') AS reviewer_first_name
         FROM reviews r
         JOIN users u ON u.id = r.reviewer_id
         LEFT JOIN participants p ON p.user_id = u.id
         LEFT JOIN workers w ON w.user_id = u.id
         WHERE r.reviewee_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [participantUserId, limit, offset]
      );

      return res.status(200).json({
        ok: true,
        total: countRes.rows[0]?.total || 0,
        limit,
        offset,
        reviews: dataRes.rows
      });
    }

    return res.status(400).json({ ok: false, error: 'Missing workerId or participantId' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch reviews' });
  }
};

const updateWorkerRating = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const { workerId } = req.body;
    const result = await calculateAverageRating(workerId);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ ok: false, error: err.message || 'Failed to update worker rating' });
  }
};

const flagReview = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { reason } = req.body;

    const existing = await pool.query('SELECT id, is_flagged FROM reviews WHERE id = $1 LIMIT 1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ ok: false, error: 'Review not found' });

    await pool.query(
      `UPDATE reviews
       SET is_flagged = TRUE,
           flag_reason = $2,
           flagged_by = $3,
           flagged_at = now()
       WHERE id = $1`,
      [req.params.id, reason || null, req.user.userId]
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to flag review' });
  }
};

module.exports = {
  createReview,
  getReviews,
  updateWorkerRating,
  flagReview
};
