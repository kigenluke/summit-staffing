const { validationResult } = require('express-validator');

const pool = require('../config/database');
const {
  stripe,
  createConnectedAccount,
  createAccountLink,
  createPaymentIntent,
  createTransfer,
  verifyWebhookSignature
} = require('../services/stripeService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const toCents = (amount) => Math.round(Number(amount || 0) * 100);

const createConnectAccount = async (req, res) => {
  try {
    const workerRes = await pool.query(
      `SELECT w.id, w.user_id, w.stripe_account_id, u.email
       FROM workers w
       JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1
       LIMIT 1`,
      [req.user.userId]
    );

    if (workerRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const worker = workerRes.rows[0];

    let accountId = worker.stripe_account_id;
    if (!accountId) {
      const account = await createConnectedAccount(worker.email);
      accountId = account.id;
      await pool.query('UPDATE workers SET stripe_account_id = $2, updated_at = now() WHERE id = $1', [worker.id, accountId]);
    }

    const link = await createAccountLink(accountId);

    return res.status(200).json({ ok: true, accountId, onboardingUrl: link.url });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to create Stripe Connect account' });
  }
};

const getAccountStatus = async (req, res) => {
  try {
    const workerRes = await pool.query(
      'SELECT stripe_account_id FROM workers WHERE user_id = $1 LIMIT 1',
      [req.user.userId]
    );

    if (workerRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const accountId = workerRes.rows[0].stripe_account_id;
    if (!accountId) {
      return res.status(200).json({ ok: true, hasAccount: false, onboardingComplete: false });
    }

    const account = await stripe.accounts.retrieve(accountId);

    const onboardingComplete = Boolean(account.details_submitted) && Boolean(account.charges_enabled) && Boolean(account.payouts_enabled);

    return res.status(200).json({
      ok: true,
      hasAccount: true,
      accountId,
      onboardingComplete,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to get Stripe account status' });
  }
};

const createPaymentIntentHandler = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const participantRes = await pool.query('SELECT id FROM participants WHERE user_id = $1 LIMIT 1', [req.user.userId]);
    if (participantRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const participantId = participantRes.rows[0].id;
    const { bookingId } = req.body;

    const bookingRes = await pool.query(
      `SELECT b.id, b.participant_id, b.worker_id, b.status, b.total_amount, b.commission_amount, w.stripe_account_id
       FROM bookings b
       JOIN workers w ON w.id = b.worker_id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId]
    );

    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const booking = bookingRes.rows[0];

    if (booking.participant_id !== participantId) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (!['confirmed', 'completed'].includes(booking.status)) {
      return res.status(400).json({ ok: false, error: 'Booking must be confirmed (or completed) before payment' });
    }

    const amount = Number(booking.total_amount || 0);
    if (amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid booking amount' });
    }

    const amountCents = toCents(amount);

    const pi = await createPaymentIntent({
      amountCents,
      currency: 'aud',
      bookingId: booking.id,
      metadata: {
        workerId: booking.worker_id
      }
    });

    const commission = Number((amount * 0.1).toFixed(2));
    const workerPayout = Number((amount - commission).toFixed(2));

    await pool.query(
      `INSERT INTO payments (booking_id, stripe_payment_intent_id, amount, commission, worker_payout, status, payment_date)
       VALUES ($1, $2, $3, $4, $5, 'pending', NULL)
       ON CONFLICT (stripe_payment_intent_id) DO NOTHING`,
      [booking.id, pi.id, amount, commission, workerPayout]
    );

    return res.status(200).json({ ok: true, payment_intent_id: pi.id, client_secret: pi.client_secret });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to create payment intent' });
  }
};

const createTransferForPaymentIntent = async (paymentIntentId) => {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  if (!pi || pi.status !== 'succeeded') {
    throw new Error('PaymentIntent not succeeded');
  }

  const bookingId = pi.metadata?.bookingId;
  if (!bookingId) {
    throw new Error('Missing bookingId metadata');
  }

  const bookingRes = await pool.query(
    `SELECT b.id, b.worker_id, w.stripe_account_id
     FROM bookings b
     JOIN workers w ON w.id = b.worker_id
     WHERE b.id = $1
     LIMIT 1`,
    [bookingId]
  );

  if (bookingRes.rowCount === 0) {
    throw new Error('Booking not found');
  }

  const booking = bookingRes.rows[0];
  if (!booking.stripe_account_id) {
    throw new Error('Worker Stripe account not set');
  }

  const paymentRes = await pool.query(
    'SELECT id, worker_payout, stripe_transfer_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
    [paymentIntentId]
  );

  if (paymentRes.rowCount === 0) {
    throw new Error('Payment record not found');
  }

  const payment = paymentRes.rows[0];

  if (payment.stripe_transfer_id) {
    return { alreadyTransferred: true, transferId: payment.stripe_transfer_id };
  }

  const payoutCents = toCents(payment.worker_payout);

  const latestCharge = pi.latest_charge;
  const sourceTransaction = typeof latestCharge === 'string' ? latestCharge : latestCharge?.id;

  const transfer = await createTransfer({
    amountCents: payoutCents,
    destination: booking.stripe_account_id,
    sourceTransaction,
    metadata: { bookingId: booking.id, paymentIntentId }
  });

  await pool.query('UPDATE payments SET stripe_transfer_id = $2 WHERE id = $1', [payment.id, transfer.id]);

  return { alreadyTransferred: false, transferId: transfer.id };
};

const confirmPayment = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { payment_intent_id } = req.body;

    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (!pi) {
      return res.status(404).json({ ok: false, error: 'PaymentIntent not found' });
    }

    if (pi.status !== 'succeeded') {
      await pool.query("UPDATE payments SET status = 'failed' WHERE stripe_payment_intent_id = $1", [payment_intent_id]);
      return res.status(400).json({ ok: false, error: 'Payment not successful' });
    }

    await pool.query(
      "UPDATE payments SET status = 'succeeded', payment_date = now() WHERE stripe_payment_intent_id = $1",
      [payment_intent_id]
    );

    // Attempt transfer (90% payout)
    try {
      await createTransferForPaymentIntent(payment_intent_id);
    } catch (err) {
      // transfer failures are handled later via webhook/retry
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to confirm payment' });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const event = verifyWebhookSignature(req.body, signature);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        await pool.query(
          "UPDATE payments SET status = 'succeeded', payment_date = now() WHERE stripe_payment_intent_id = $1",
          [pi.id]
        );

        try {
          await createTransferForPaymentIntent(pi.id);
        } catch (err) {
          // ignore
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await pool.query("UPDATE payments SET status = 'failed' WHERE stripe_payment_intent_id = $1", [pi.id]);
        break;
      }
      case 'transfer.created': {
        const transfer = event.data.object;
        // best-effort link to payment intent via metadata
        if (transfer.metadata && transfer.metadata.paymentIntentId) {
          await pool.query('UPDATE payments SET stripe_transfer_id = $2 WHERE stripe_payment_intent_id = $1', [
            transfer.metadata.paymentIntentId,
            transfer.id
          ]);
        }
        break;
      }
      case 'account.updated': {
        const account = event.data.object;
        // status can be inferred at read-time; keep as no-op for now
        void account;
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

const getPaymentHistory = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const status = req.query.status || null;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const params = [];
    const where = [];

    if (req.user.role === 'admin') {
      // no restriction
    } else if (req.user.role === 'participant') {
      const p = await pool.query('SELECT id FROM participants WHERE user_id = $1 LIMIT 1', [req.user.userId]);
      if (p.rowCount === 0) return res.status(403).json({ ok: false, error: 'Forbidden' });
      params.push(p.rows[0].id);
      where.push(`b.participant_id = $${params.length}`);
    } else if (req.user.role === 'worker') {
      const w = await pool.query('SELECT id FROM workers WHERE user_id = $1 LIMIT 1', [req.user.userId]);
      if (w.rowCount === 0) return res.status(403).json({ ok: false, error: 'Forbidden' });
      params.push(w.rows[0].id);
      where.push(`b.worker_id = $${params.length}`);
    } else {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (status) {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      where.push(`p.created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      where.push(`p.created_at <= $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       ${whereSql}`,
      params
    );

    const dataRes = await pool.query(
      `SELECT
         p.*,
         b.service_type,
         b.start_time,
         b.end_time,
         i.invoice_number,
         i.status AS invoice_status,
         pa.first_name AS participant_first_name,
         pa.last_name AS participant_last_name
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       JOIN participants pa ON pa.id = b.participant_id
       LEFT JOIN invoices i ON i.booking_id = b.id
       ${whereSql}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({ ok: true, total: countRes.rows[0]?.total || 0, limit, offset, payments: dataRes.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch payment history' });
  }
};

module.exports = {
  createConnectAccount,
  getAccountStatus,
  createPaymentIntent: createPaymentIntentHandler,
  confirmPayment,
  createTransfer: async (req, res) => {
    try {
      if (respondValidation(req, res)) return;
      const { payment_intent_id } = req.body;
      const transfer = await createTransferForPaymentIntent(payment_intent_id);
      return res.status(200).json({ ok: true, ...transfer });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to create transfer' });
    }
  },
  handleWebhook,
  getPaymentHistory
};
