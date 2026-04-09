const express = require('express');
const { body, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const checkParticipant = require('../middleware/checkParticipant');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.post('/connect/onboard', [auth, checkWorker], paymentController.createConnectAccount);
router.get('/connect/status', [auth, checkWorker], paymentController.getAccountStatus);

router.post(
  '/create-intent',
  [auth, checkParticipant, body('bookingId').isUUID().withMessage('bookingId is required')],
  paymentController.createPaymentIntent
);

router.post(
  '/confirm',
  [auth, checkParticipant, body('payment_intent_id').isString().withMessage('payment_intent_id is required')],
  paymentController.confirmPayment
);

router.get(
  '/history',
  [auth, query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()],
  paymentController.getPaymentHistory
);

module.exports = router;
