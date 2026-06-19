const pool = require('../config/database');
const { stripe, createTransfer } = require('./stripeService');
const { computePlatformFeeBreakdown } = require('../utils/platformFee.cjs');

const toCents = (amount) => Math.round(Number(amount || 0) * 100);

const logTransferError = (context, paymentIntentId, err) => {
  // eslint-disable-next-line no-console
  console.error(`[worker-transfer] ${context} pi=${paymentIntentId}:`, err?.message || err);
};

const resolveBookingIdForIntent = async (paymentIntentId, pi, fallbackBookingId = null) => {
  if (pi?.metadata?.bookingId) return String(pi.metadata.bookingId);
  if (fallbackBookingId) return String(fallbackBookingId);

  const payRes = await pool.query(
    'SELECT booking_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
    [paymentIntentId]
  );
  if (payRes.rowCount > 0) return String(payRes.rows[0].booking_id);

  if (!stripe) return null;
  try {
    const search = await stripe.paymentIntents.search({
      query: `metadata['bookingId']:'' AND id:'${paymentIntentId}'`,
      limit: 1,
    });
    if (search.data?.[0]?.metadata?.bookingId) return String(search.data[0].metadata.bookingId);
  } catch (_) {
    /* search optional */
  }
  return null;
};

const ensurePaymentRecordForIntent = async (paymentIntentId, paymentIntent, options = {}) => {
  const existing = await pool.query(
    'SELECT id, worker_payout, stripe_transfer_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
    [paymentIntentId]
  );
  if (existing.rowCount > 0) return existing.rows[0];

  const pi = paymentIntent || (await stripe.paymentIntents.retrieve(paymentIntentId));
  const bookingId = await resolveBookingIdForIntent(paymentIntentId, pi, options.fallbackBookingId);
  if (!bookingId) {
    throw new Error('Missing bookingId metadata');
  }

  const bookingRes = await pool.query(
    'SELECT id, total_amount FROM bookings WHERE id = $1 LIMIT 1',
    [bookingId]
  );
  if (bookingRes.rowCount === 0) {
    throw new Error('Booking not found for PaymentIntent');
  }

  const { total, commission, workerPayout } = computePlatformFeeBreakdown(bookingRes.rows[0].total_amount);
  await pool.query(
    `INSERT INTO payments (booking_id, stripe_payment_intent_id, amount, commission, worker_payout, status, payment_date)
     VALUES ($1, $2, $3, $4, $5, 'pending', NULL)
     ON CONFLICT (stripe_payment_intent_id) DO NOTHING`,
    [bookingId, paymentIntentId, total, commission, workerPayout]
  );

  const inserted = await pool.query(
    'SELECT id, worker_payout, stripe_transfer_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
    [paymentIntentId]
  );
  if (inserted.rowCount === 0) {
    throw new Error('Failed to create payment record');
  }
  return inserted.rows[0];
};

const assertWorkerCanReceiveTransfer = async (stripeAccountId) => {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  const transfersStatus = account.capabilities?.transfers;
  if (transfersStatus && transfersStatus !== 'active') {
    throw new Error(`Worker Stripe account cannot receive transfers yet (${transfersStatus})`);
  }
  if (account.payouts_enabled === false) {
    // eslint-disable-next-line no-console
    console.warn(`[worker-transfer] payouts_enabled=false for ${stripeAccountId}; transfer may still succeed`);
  }
  return account;
};

/**
 * Transfer 85% worker payout for a succeeded PaymentIntent.
 * Idempotent — skips if stripe_transfer_id already set.
 */
const transferWorkerPayoutForPaymentIntent = async (paymentIntentId, fallbackBookingId = null) => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  if (!pi || pi.status !== 'succeeded') {
    throw new Error('PaymentIntent not succeeded');
  }

  const bookingId = await resolveBookingIdForIntent(paymentIntentId, pi, fallbackBookingId);
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

  await assertWorkerCanReceiveTransfer(booking.stripe_account_id);

  const payment = await ensurePaymentRecordForIntent(paymentIntentId, pi, { fallbackBookingId: bookingId });

  if (payment.stripe_transfer_id) {
    return { alreadyTransferred: true, transferId: payment.stripe_transfer_id, bookingId };
  }

  const payoutCents = toCents(payment.worker_payout);
  if (payoutCents <= 0) {
    throw new Error('Worker payout amount is zero');
  }

  const latestCharge = pi.latest_charge;
  const sourceTransaction = typeof latestCharge === 'string' ? latestCharge : latestCharge?.id;

  let transfer;
  try {
    transfer = await createTransfer({
      amountCents: payoutCents,
      destination: booking.stripe_account_id,
      sourceTransaction,
      metadata: { bookingId: booking.id, paymentIntentId },
    });
  } catch (err) {
    const retryable =
      err?.code === 'balance_insufficient' ||
      /insufficient|not yet available|pending|balance/i.test(String(err?.message || ''));

    if (retryable && sourceTransaction) {
      // Funds may not be available yet — cron will retry without source_transaction later.
      throw new Error(`Transfer pending (funds not available yet): ${err.message}`);
    }
    throw err;
  }

  await pool.query('UPDATE payments SET stripe_transfer_id = $2 WHERE id = $1', [payment.id, transfer.id]);

  return { alreadyTransferred: false, transferId: transfer.id, bookingId, workerPayout: payment.worker_payout };
};

/** Retry transfer using platform balance when source_transaction fails (funds now available). */
const retryTransferFromPlatformBalance = async (paymentIntentId, fallbackBookingId = null) => {
  if (!stripe) throw new Error('Stripe is not configured');

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== 'succeeded') throw new Error('PaymentIntent not succeeded');

  const bookingId = await resolveBookingIdForIntent(paymentIntentId, pi, fallbackBookingId);
  if (!bookingId) throw new Error('Missing bookingId metadata');

  const bookingRes = await pool.query(
    `SELECT b.id, w.stripe_account_id FROM bookings b JOIN workers w ON w.id = b.worker_id WHERE b.id = $1 LIMIT 1`,
    [bookingId]
  );
  if (bookingRes.rowCount === 0) throw new Error('Booking not found');

  const { stripe_account_id: destination } = bookingRes.rows[0];
  if (!destination) throw new Error('Worker Stripe account not set');

  const payRes = await pool.query(
    'SELECT id, worker_payout, stripe_transfer_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
    [paymentIntentId]
  );
  if (payRes.rowCount === 0) throw new Error('Payment record not found');
  const payment = payRes.rows[0];
  if (payment.stripe_transfer_id) {
    return { alreadyTransferred: true, transferId: payment.stripe_transfer_id };
  }

  const payoutCents = toCents(payment.worker_payout);
  const transfer = await createTransfer({
    amountCents: payoutCents,
    destination,
    sourceTransaction: null,
    metadata: { bookingId, paymentIntentId, retry: 'platform_balance' },
  });

  await pool.query('UPDATE payments SET stripe_transfer_id = $2 WHERE id = $1', [payment.id, transfer.id]);
  return { alreadyTransferred: false, transferId: transfer.id };
};

const markPaymentSucceeded = async (paymentIntentId) => {
  await pool.query(
    "UPDATE payments SET status = 'succeeded', payment_date = COALESCE(payment_date, now()) WHERE stripe_payment_intent_id = $1",
    [paymentIntentId]
  );
};

const findPendingTransfers = async (limit = 50) => {
  const res = await pool.query(
    `SELECT p.id, p.stripe_payment_intent_id, p.booking_id, p.worker_payout, p.status, p.created_at
     FROM payments p
     WHERE p.stripe_transfer_id IS NULL
       AND p.stripe_payment_intent_id IS NOT NULL
       AND p.status IN ('succeeded', 'pending')
     ORDER BY p.created_at ASC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
};

/** Cron: retry worker transfers for succeeded payments missing stripe_transfer_id. */
const retryPendingWorkerTransfers = async ({ limit = 50 } = {}) => {
  const rows = await findPendingTransfers(limit);
  let transferred = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      if (pi.status !== 'succeeded') continue;
      if (row.status !== 'succeeded') {
        await markPaymentSucceeded(row.stripe_payment_intent_id);
      }
      const result = await transferWorkerPayoutForPaymentIntent(row.stripe_payment_intent_id, row.booking_id);
      if (result.alreadyTransferred) skipped += 1;
      else transferred += 1;
    } catch (err) {
      try {
        await retryTransferFromPlatformBalance(row.stripe_payment_intent_id);
        transferred += 1;
      } catch (retryErr) {
        failed += 1;
        logTransferError('cron-retry', row.stripe_payment_intent_id, retryErr);
      }
    }
  }

  return { checked: rows.length, transferred, failed, skipped };
};

/** Reconcile completed Checkout sessions whose worker transfer was missed (legacy web payments). */
const reconcileCheckoutSessionsWithoutTransfer = async ({ limit = 25 } = {}) => {
  if (!stripe) return { reconciled: 0 };

  let reconciled = 0;
  try {
    const sessions = await stripe.checkout.sessions.list({ limit, status: 'complete' });
    for (const session of sessions.data || []) {
      const bookingId = session.metadata?.bookingId;
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!bookingId || !paymentIntentId) continue;

      const payRes = await pool.query(
        'SELECT stripe_transfer_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
        [paymentIntentId]
      );
      if (payRes.rowCount > 0 && payRes.rows[0].stripe_transfer_id) continue;

      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== 'succeeded') continue;
        if (!pi.metadata?.bookingId) {
          await stripe.paymentIntents.update(paymentIntentId, {
            metadata: { ...pi.metadata, bookingId: String(bookingId) },
          });
        }
        await ensurePaymentRecordForIntent(paymentIntentId, pi, { fallbackBookingId: bookingId });
        await markPaymentSucceeded(paymentIntentId);
        await transferWorkerPayoutForPaymentIntent(paymentIntentId, bookingId);
        reconciled += 1;
      } catch (err) {
        try {
          await retryTransferFromPlatformBalance(paymentIntentId, bookingId);
          reconciled += 1;
        } catch (retryErr) {
          logTransferError('reconcile-checkout', paymentIntentId, retryErr);
        }
      }
    }
  } catch (err) {
    logTransferError('reconcile-checkout-list', 'batch', err);
  }
  return { reconciled };
};

/** Cron entry: DB retries + Stripe checkout reconciliation. */
const runWorkerPayoutRetryJob = async (options = {}) => {
  const dbResult = await retryPendingWorkerTransfers(options);
  const checkoutResult = await reconcileCheckoutSessionsWithoutTransfer({ limit: 25 });
  return { ...dbResult, checkout_reconciled: checkoutResult.reconciled };
};

/**
 * After web Checkout redirect: reconcile Stripe → DB and transfer worker payout.
 * Finds succeeded PaymentIntents for this booking (metadata or DB).
 */
const syncBookingPaymentFromStripe = async (bookingId) => {
  if (!stripe) throw new Error('Stripe is not configured');

  const intents = [];
  const dbRes = await pool.query(
    `SELECT stripe_payment_intent_id FROM payments
     WHERE booking_id = $1 AND stripe_payment_intent_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 5`,
    [bookingId]
  );
  for (const row of dbRes.rows) {
    intents.push(row.stripe_payment_intent_id);
  }

  try {
    const search = await stripe.paymentIntents.search({
      query: `metadata['bookingId']:'${bookingId}' AND status:'succeeded'`,
      limit: 5,
    });
    for (const pi of search.data || []) {
      if (!intents.includes(pi.id)) intents.push(pi.id);
    }
  } catch (searchErr) {
    logTransferError('sync-search', bookingId, searchErr);
  }

  if (intents.length === 0) {
    return { ok: false, error: 'No succeeded payment found for this booking in Stripe yet.' };
  }

  const results = [];
  for (const piId of intents) {
    await ensurePaymentRecordForIntent(piId, null, { fallbackBookingId: bookingId }).catch((err) => {
      logTransferError('sync-ensure', piId, err);
    });
    await markPaymentSucceeded(piId);

    try {
      const transfer = await transferWorkerPayoutForPaymentIntent(piId, bookingId);
      results.push({ payment_intent_id: piId, ok: true, ...transfer });
    } catch (err) {
      try {
        const transfer = await retryTransferFromPlatformBalance(piId, bookingId);
        results.push({ payment_intent_id: piId, ok: true, retried: true, ...transfer });
      } catch (retryErr) {
        results.push({ payment_intent_id: piId, ok: false, error: retryErr.message });
        logTransferError('sync-transfer', piId, retryErr);
      }
    }
  }

  const anyOk = results.some((r) => r.ok);
  return { ok: anyOk, results };
};

module.exports = {
  ensurePaymentRecordForIntent,
  transferWorkerPayoutForPaymentIntent,
  retryTransferFromPlatformBalance,
  retryPendingWorkerTransfers,
  runWorkerPayoutRetryJob,
  reconcileCheckoutSessionsWithoutTransfer,
  syncBookingPaymentFromStripe,
  markPaymentSucceeded,
  findPendingTransfers,
};
