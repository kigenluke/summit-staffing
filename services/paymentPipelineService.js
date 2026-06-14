const pool = require('../config/database');
const { stripe } = require('../config/stripe');
const {
  createAuthorizationHold,
  updatePaymentIntentAmount,
  capturePaymentIntent,
  cancelPaymentIntent,
  createTransfer,
} = require('./stripeService');
const { getPaymentPipeline, isPrivatePay } = require('../utils/fundingPipeline');
const { processFundedPipelineOnApproval } = require('./invoicePipelineService');

const toCents = (amount) => Math.round(Number(amount || 0) * 100);

const { computePlatformFeeBreakdown } = require('../utils/platformFee.cjs');

const lookupUserDisplayName = async (userId, role) => {
  try {
    let row = null;
    if (role === 'participant') {
      const r = await pool.query('SELECT first_name, last_name FROM participants WHERE user_id = $1 LIMIT 1', [userId]);
      row = r.rows[0];
    } else if (role === 'worker') {
      const r = await pool.query('SELECT first_name, last_name FROM workers WHERE user_id = $1 LIMIT 1', [userId]);
      row = r.rows[0];
    }
    if (!row) return '';
    return `${row.first_name || ''} ${row.last_name || ''}`.trim();
  } catch (_) {
    return '';
  }
};

const ensureStripeCustomerForUser = async (userId) => {
  const userRes = await pool.query(
    'SELECT id, email, role, stripe_customer_id FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  if (userRes.rowCount === 0) throw new Error('User not found');
  const user = userRes.rows[0];
  if (user.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(user.stripe_customer_id);
      if (existing && !existing.deleted) return existing.id;
    } catch (_) {}
  }
  const displayName = await lookupUserDisplayName(user.id, user.role);
  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: displayName || undefined,
    metadata: { userId: String(user.id), role: String(user.role || '') },
  });
  await pool.query('UPDATE users SET stripe_customer_id = $2, updated_at = now() WHERE id = $1', [
    user.id,
    customer.id,
  ]);
  return customer.id;
};

const getDefaultPaymentMethodId = async (customerId) => {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.invoice_settings?.default_payment_method) {
    return typeof customer.invoice_settings.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings.default_payment_method.id;
  }
  const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
  return pms.data[0]?.id || null;
};

const loadBookingPaymentContext = async (bookingId) => {
  const res = await pool.query(
    `SELECT
      b.*,
      p.user_id AS participant_user_id,
      p.funding_type, p.management_type, p.plan_manager_email, p.ndis_number,
      w.stripe_account_id
    FROM bookings b
    JOIN participants p ON p.id = b.participant_id
    JOIN workers w ON w.id = b.worker_id
    WHERE b.id = $1
    LIMIT 1`,
    [bookingId]
  );
  return res.rowCount ? res.rows[0] : null;
};

/**
 * Pipeline A — at booking confirmation: place card authorization hold for estimated total.
 */
const createBookingAuthorization = async (bookingId) => {
  if (!stripe) return { ok: false, skipped: true, reason: 'stripe_not_configured' };

  const booking = await loadBookingPaymentContext(bookingId);
  if (!booking) throw new Error('Booking not found');

  const pipeline = booking.payment_pipeline || getPaymentPipeline(booking);
  if (pipeline !== 'private_pay') {
    return { ok: true, skipped: true, pipeline: 'funded' };
  }

  if (booking.authorization_status === 'authorized' && booking.stripe_authorization_intent_id) {
    return { ok: true, alreadyAuthorized: true, payment_intent_id: booking.stripe_authorization_intent_id };
  }

  const amount = Number(booking.total_amount || 0);
  if (amount <= 0) {
    await pool.query(
      "UPDATE bookings SET authorization_status = 'none', updated_at = now() WHERE id = $1",
      [bookingId]
    );
    return { ok: false, error: 'Invalid booking amount for authorization' };
  }

  const customerId = await ensureStripeCustomerForUser(booking.participant_user_id);
  const paymentMethodId = await getDefaultPaymentMethodId(customerId);

  if (!paymentMethodId) {
    await pool.query(
      "UPDATE bookings SET authorization_status = 'required', payment_pipeline = 'private_pay', updated_at = now() WHERE id = $1",
      [bookingId]
    );
    return { ok: false, requires_card: true, error: 'Save a payment card in Payments before confirming this booking.' };
  }

  const bufferCents = Math.round(amount * 1.1 * 100);
  const pi = await createAuthorizationHold({
    amountCents: bufferCents,
    bookingId,
    customerId,
    paymentMethodId,
  });

  const authorized =
    pi.status === 'requires_capture' || pi.status === 'succeeded' || pi.status === 'processing';

  if (!authorized) {
    await pool.query(
      "UPDATE bookings SET authorization_status = 'failed', stripe_authorization_intent_id = $2, updated_at = now() WHERE id = $1",
      [bookingId, pi.id]
    );
    return { ok: false, error: `Card authorization status: ${pi.status}`, payment_intent_id: pi.id };
  }

  await pool.query(
    `UPDATE bookings
     SET authorization_status = 'authorized',
         stripe_authorization_intent_id = $2,
         authorized_amount = $3,
         payment_pipeline = 'private_pay',
         updated_at = now()
     WHERE id = $1`,
    [bookingId, pi.id, amount]
  );

  const { commission, workerPayout } = computePlatformFeeBreakdown(amount);
  await pool.query(
    `INSERT INTO payments (booking_id, stripe_payment_intent_id, amount, commission, worker_payout, status, payment_kind, payment_date)
     VALUES ($1, $2, $3, $4, $5, 'pending', 'authorization_hold', NULL)
     ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET amount = EXCLUDED.amount, commission = EXCLUDED.commission, worker_payout = EXCLUDED.worker_payout`,
    [bookingId, pi.id, amount, commission, workerPayout]
  );

  return { ok: true, payment_intent_id: pi.id, authorized_amount: amount };
};

/**
 * Pipeline A — on timesheet approval: capture hold and transfer 85% to worker Connect account.
 */
const processPrivatePayOnApproval = async (bookingId) => {
  if (!stripe) throw new Error('Stripe is not configured');

  const booking = await loadBookingPaymentContext(bookingId);
  if (!booking) throw new Error('Booking not found');

  const finalAmount = Number(booking.total_amount || 0);
  if (finalAmount <= 0) throw new Error('Invalid final amount');

  let intentId = booking.stripe_authorization_intent_id;

  if (!intentId || booking.authorization_status === 'required') {
    const auth = await createBookingAuthorization(bookingId);
    if (!auth.ok) throw new Error(auth.error || 'Authorization required');
    intentId = auth.payment_intent_id;
  }

  const finalCents = toCents(finalAmount);
  const pi = await stripe.paymentIntents.retrieve(intentId);

  if (pi.status === 'requires_capture') {
    const authorizedCents = pi.amount;
    if (finalCents > authorizedCents) {
      await updatePaymentIntentAmount(intentId, finalCents);
    } else if (finalCents < authorizedCents) {
      await capturePaymentIntent(intentId, finalCents);
    } else {
      await capturePaymentIntent(intentId);
    }
  } else if (pi.status === 'succeeded') {
    // already captured (e.g. legacy flow)
  } else if (pi.status === 'canceled') {
    throw new Error('Authorization was cancelled; participant must update payment method.');
  } else {
    throw new Error(`Cannot capture payment in status ${pi.status}`);
  }

  const captured = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
  if (captured.status !== 'succeeded') {
    throw new Error(`Capture did not succeed (${captured.status})`);
  }

  const { commission, workerPayout } = computePlatformFeeBreakdown(finalAmount);

  await pool.query(
    `UPDATE payments SET amount = $2, commission = $3, worker_payout = $4, status = 'succeeded', payment_kind = 'capture', payment_date = now()
     WHERE stripe_payment_intent_id = $1`,
    [intentId, finalAmount, commission, workerPayout]
  );

  await pool.query(
    "UPDATE bookings SET authorization_status = 'captured', updated_at = now() WHERE id = $1",
    [bookingId]
  );

  if (!booking.stripe_account_id) {
    throw new Error('Worker Stripe account not connected');
  }

  const payRes = await pool.query(
    'SELECT id, stripe_transfer_id, worker_payout FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
    [intentId]
  );
  const payment = payRes.rows[0];

  if (!payment?.stripe_transfer_id) {
    const latestCharge = captured.latest_charge;
    const sourceTransaction = typeof latestCharge === 'string' ? latestCharge : latestCharge?.id;
    const transfer = await createTransfer({
      amountCents: toCents(workerPayout),
      destination: booking.stripe_account_id,
      sourceTransaction,
      metadata: { bookingId, paymentIntentId: intentId, pipeline: 'private_pay' },
    });
    await pool.query('UPDATE payments SET stripe_transfer_id = $2 WHERE id = $1', [payment.id, transfer.id]);
  }

  return {
    ok: true,
    pipeline: 'private_pay',
    payment_intent_id: intentId,
    amount: finalAmount,
    worker_payout: workerPayout,
    commission,
  };
};

/** Reconcile funded invoice paid via Stripe (bank transfer / invoice). */
const reconcileFundedStripeInvoicePaid = async (stripeInvoiceId) => {
  const invRes = await pool.query(
    `SELECT i.*, b.worker_id, w.stripe_account_id
     FROM invoices i
     JOIN bookings b ON b.id = i.booking_id
     JOIN workers w ON w.id = b.worker_id
     WHERE i.stripe_invoice_id = $1
     LIMIT 1`,
    [stripeInvoiceId]
  );
  if (invRes.rowCount === 0) return { ok: false, error: 'Invoice not found' };

  const invoice = invRes.rows[0];
  const total = Number(invoice.total || 0);
  const { commission, workerPayout } = computePlatformFeeBreakdown(total);

  await pool.query("UPDATE invoices SET status = 'paid' WHERE id = $1", [invoice.id]);

  if (invoice.stripe_account_id && workerPayout > 0 && stripe) {
    const transfer = await stripe.transfers.create({
      amount: toCents(workerPayout),
      currency: 'aud',
      destination: invoice.stripe_account_id,
      metadata: {
        bookingId: String(invoice.booking_id),
        invoiceId: String(invoice.id),
        eftReference: String(invoice.eft_reference || ''),
        pipeline: 'funded',
      },
    });
    await pool.query(
      `INSERT INTO payments (booking_id, stripe_transfer_id, amount, commission, worker_payout, status, payment_kind, payment_date)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', 'funded_eft', now())
       ON CONFLICT (stripe_transfer_id) DO NOTHING`,
      [invoice.booking_id, transfer.id, total, commission, workerPayout]
    );
  }

  return { ok: true, invoiceId: invoice.id, worker_payout: workerPayout };
};

const processPaymentPipelineOnApproval = async (bookingId) => {
  const booking = await loadBookingPaymentContext(bookingId);
  if (!booking) throw new Error('Booking not found');

  const pipeline = booking.payment_pipeline || getPaymentPipeline(booking);
  if (pipeline === 'private_pay' || isPrivatePay(booking)) {
    return processPrivatePayOnApproval(bookingId);
  }
  return processFundedPipelineOnApproval(bookingId);
};

const cancelBookingAuthorization = async (bookingId) => {
  const booking = await loadBookingPaymentContext(bookingId);
  if (!booking?.stripe_authorization_intent_id) return { ok: true, skipped: true };
  try {
    const pi = await stripe.paymentIntents.retrieve(booking.stripe_authorization_intent_id);
    if (pi.status === 'requires_capture') {
      await cancelPaymentIntent(booking.stripe_authorization_intent_id);
    }
  } catch (_) {}
  await pool.query(
    "UPDATE bookings SET authorization_status = 'cancelled', updated_at = now() WHERE id = $1",
    [bookingId]
  );
  return { ok: true };
};

module.exports = {
  computePlatformFeeBreakdown,
  ensureStripeCustomerForUser,
  createBookingAuthorization,
  processPrivatePayOnApproval,
  processPaymentPipelineOnApproval,
  reconcileFundedStripeInvoicePaid,
  cancelBookingAuthorization,
};
