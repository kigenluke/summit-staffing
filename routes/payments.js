const express = require('express');
const { body, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const checkParticipant = require('../middleware/checkParticipant');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// Browsers / REST clients often hit this URL with GET — the real route is POST only.
router.get('/connect/onboard', (req, res) => {
  res.status(405).json({
    ok: false,
    success: false,
    error:
      'Use POST (not GET) to /api/payments/connect/onboard with header Authorization: Bearer <worker_jwt>. Open this URL in a browser will not work.'
  });
});

router.post('/connect/onboard', [auth, checkWorker], paymentController.createConnectAccount);
router.get('/connect/config-check', [auth, checkWorker], paymentController.getConnectConfigCheck);
router.get('/connect/status', [auth, checkWorker], paymentController.getAccountStatus);
router.post('/connect/login-link', [auth, checkWorker], paymentController.createConnectLoginLink);
router.post('/connect/disconnect', [auth, checkWorker], paymentController.disconnectConnectAccount);

router.post(
  '/connect/bank-details',
  [
    auth,
    checkWorker,
    body('account_holder_name').isString().trim().isLength({ min: 2, max: 120 }),
    body('bsb').isString().trim().isLength({ min: 6, max: 8 }),
    body('account_number').isString().trim().isLength({ min: 5, max: 12 }),
  ],
  paymentController.saveWorkerBankDetails
);

router.post(
  '/checkout-session',
  [auth, checkParticipant, body('bookingId').isUUID().withMessage('bookingId is required')],
  paymentController.createCheckoutSession
);

// Browsers use GET — this route only accepts POST from the app.
router.get('/checkout-session', (req, res) => {
  res.status(405).json({
    ok: false,
    success: false,
    error:
      'Use POST (not GET) with JSON body { "bookingId": "<uuid>" } and header Authorization: Bearer <participant_token>. Opening this URL in the address bar will not work.',
  });
});

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

// Participant: save a card on Stripe (off-session use). Returns a hosted Checkout (mode=setup) URL.
router.post('/customer/setup-session', [auth, checkParticipant], paymentController.createCustomerSetupSession);
router.get('/customer/payment-methods', [auth, checkParticipant], paymentController.listCustomerPaymentMethods);
router.delete('/customer/payment-methods/:id', [auth, checkParticipant], paymentController.detachCustomerPaymentMethod);

router.post(
  '/booking/authorize',
  [auth, checkParticipant, body('bookingId').isUUID().withMessage('bookingId is required')],
  paymentController.authorizeBooking
);

module.exports = router;
