const express = require('express');
const { body, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

router.post(
  '/',
  [
    auth,
    body('bookingId').isUUID().withMessage('bookingId is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be an integer between 1 and 5'),
    body('comment').optional().isString(),
    body('incidentReported').optional().isBoolean(),
    body('incidentDetails').optional({ nullable: true }).isString().isLength({ max: 2000 })
  ],
  reviewController.createReview
);

router.get(
  '/worker/:workerId',
  [query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()],
  reviewController.getReviews
);

router.get(
  '/participant/:participantId',
  [auth, checkWorker, query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()],
  reviewController.getReviews
);

router.put(
  '/:id/flag',
  [auth, body('reason').optional().isString().isLength({ max: 500 }).withMessage('reason too long')],
  reviewController.flagReview
);

module.exports = router;
