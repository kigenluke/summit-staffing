const { validationResult } = require('express-validator');

const pool = require('../config/database');
const {
  stripe,
  resolveAppBaseUrl,
  useCustomConnect,
  createCustomWorkerAccount,
  attachAustralianBankAccount,
  replaceWorkerBankAccount,
  listWorkerBankAccounts,
  createConnectedAccount,
  createAccountLink,
  createAccountLoginLink,
  createPaymentIntent,
  createCheckoutSession,
  createTransfer,
  verifyWebhookSignature,
} = require('../services/stripeService');
const { validateAustralianBankDetails, formatBsbDisplay } = require('../utils/bankAccount');
const { userFacingPaymentMessage } = require('../utils/userFacingPaymentError');
const { classifyStripeSecretKey } = require('../utils/stripeKeyValidation');
const { stripeActionHint, isStaleConnectAccountError } = require('../utils/paymentErrorHints');
const { secretKeyCheck } = require('../config/stripe');
const {
  createBookingAuthorization,
  reconcileFundedStripeInvoicePaid,
} = require('../services/paymentPipelineService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const toCents = (amount) => Math.round(Number(amount || 0) * 100);
const ensureStripeConfigured = (res) => {
  if (!secretKeyCheck.valid) {
    res.status(503).json({
      ok: false,
      error: secretKeyCheck.message || 'Stripe secret key is not configured correctly on the server.',
      hint:
        secretKeyCheck.kind === 'restricted'
          ? 'In Railway (or .env), set STRIPE_SECRET_KEY to sk_live_... or sk_test_..., not rk_live_... (restricted key).'
          : 'Use Stripe Dashboard → Developers → API keys → Secret key for STRIPE_SECRET_KEY.',
    });
    return false;
  }
  if (!stripe) {
    res.status(503).json({
      ok: false,
      error: 'Payments are temporarily unavailable (Stripe is not configured on server)',
    });
    return false;
  }
  return true;
};

/** Best-effort message for Stripe, Postgres, and generic Errors */
const pickErrorMessage = (err) => {
  if (err == null) return '';
  if (typeof err === 'string') return err.slice(0, 500);
  try {
    const r = err.raw;
    if (r && typeof r === 'object') {
      const nested = r.error && typeof r.error === 'object' ? r.error.message : null;
      if (nested) return String(nested).trim().slice(0, 500);
      if (r.message) return String(r.message).trim().slice(0, 500);
      if (r.error && r.error.message) return String(r.error.message).trim().slice(0, 500);
    }
  } catch (_) {}
  if (err.response?.data?.error?.message) return String(err.response.data.error.message).trim().slice(0, 500);
  if (err.detail) return String(err.detail).trim().slice(0, 500);
  if (err.message && String(err.message).trim()) return String(err.message).trim().slice(0, 500);
  return '';
};

const computeCommissionBreakdown = (amount) => {
  const total = Number(amount || 0);
  const commission = Number((total * 0.15).toFixed(2));
  const workerPayout = Number((total - commission).toFixed(2));
  return { total, commission, workerPayout };
};

const ensurePaymentRecordForIntent = async (paymentIntentId, paymentIntent, options = {}) => {
  const existing = await pool.query(
    'SELECT id, worker_payout, stripe_transfer_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
    [paymentIntentId]
  );
  if (existing.rowCount > 0) return existing.rows[0];

  const pi = paymentIntent || await stripe.paymentIntents.retrieve(paymentIntentId);
  const fallbackBooking = options.fallbackBookingId != null ? String(options.fallbackBookingId) : '';
  const bookingId = (pi?.metadata?.bookingId && String(pi.metadata.bookingId)) || fallbackBooking;
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

  const { total, commission, workerPayout } = computeCommissionBreakdown(bookingRes.rows[0].total_amount);
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

/**
 * Worker-only: safe diagnostics for Stripe Connect (no secrets exposed).
 * Use when onboard fails — verify Railway env without guessing.
 */
const getConnectConfigCheck = async (req, res) => {
  try {
    const secret = process.env.STRIPE_SECRET_KEY || '';
    const pub = process.env.STRIPE_PUBLISHABLE_KEY || '';
    const secretClassification = classifyStripeSecretKey(secret);
    let secretMode = 'missing';
    if (secretClassification.kind === 'secret_test') secretMode = 'test';
    else if (secretClassification.kind === 'secret_live') secretMode = 'live';
    else if (secretClassification.kind === 'restricted') secretMode = 'restricted_key_invalid';
    else if (secretClassification.kind === 'publishable') secretMode = 'publishable_key_wrong_var';

    const appUrl = resolveAppBaseUrl();
    const isLocal = /localhost|127\.0\.0\.1/i.test(appUrl) || String(appUrl).startsWith('http://');
    const blockedInProd = process.env.NODE_ENV === 'production' && isLocal;

    return res.status(200).json({
      ok: true,
      stripe: {
        secret_key_configured: Boolean(secret),
        secret_key_mode: secretMode,
        secret_key_valid: secretClassification.valid,
        secret_key_issue: secretClassification.valid ? null : secretClassification.message,
        publishable_key_configured: Boolean(pub),
        stripe_client_initialized: Boolean(stripe),
      },
      connect_urls: {
        app_url_resolved: appUrl,
        return_url: `${appUrl}/stripe/return`,
        refresh_url: `${appUrl}/stripe/refresh`,
        blocked_in_production_due_to_localhost: blockedInProd
      },
      node_env: process.env.NODE_ENV || null
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: pickErrorMessage(err) || 'Config check failed' });
  }
};

const getAccountStatus = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    const workerRes = await pool.query(
      'SELECT stripe_account_id FROM workers WHERE user_id = $1 LIMIT 1',
      [req.user.userId]
    );

    if (workerRes.rowCount === 0) {
      return res.status(200).json({
        ok: true,
        hasWorkerProfile: false,
        hasAccount: false,
        onboardingComplete: false,
        connect_mode: 'custom',
        preferred_setup: 'in_app_bank',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });
    }

    const accountId = workerRes.rows[0].stripe_account_id;
    if (!accountId) {
      return res.status(200).json({
        ok: true,
        hasAccount: false,
        onboardingComplete: false,
        connect_mode: 'custom',
        preferred_setup: 'in_app_bank',
      });
    }

    let account;
    try {
      account = await stripe.accounts.retrieve(accountId);
    } catch (retrieveErr) {
      if (isStaleConnectAccountError(retrieveErr)) {
        await pool.query(
          'UPDATE workers SET stripe_account_id = NULL, updated_at = now() WHERE user_id = $1',
          [req.user.userId]
        );
        return res.status(200).json({
          ok: true,
          hasAccount: false,
          onboardingComplete: false,
          staleAccountCleared: true,
        });
      }
      throw retrieveErr;
    }

    let bankAccount = null;
    try {
      const banks = await listWorkerBankAccounts(accountId);
      const primary = banks.find((b) => b.default_for_currency) || banks[0];
      if (primary) {
        const bsbDigits = String(primary.routing_number || '').replace(/\D/g, '');
        bankAccount = {
          last4: primary.last4,
          bsb_display: bsbDigits.length === 6 ? formatBsbDisplay(bsbDigits) : null,
          account_holder_name: primary.account_holder_name || null,
        };
      }
    } catch (_) {
      bankAccount = null;
    }

    const transfersActive = account.capabilities?.transfers === 'active';
    const isCustom = account.type === 'custom';
    const onboardingComplete = isCustom
      ? Boolean(bankAccount?.last4) && (transfersActive || account.payouts_enabled)
      : Boolean(account.details_submitted) && Boolean(account.charges_enabled) && Boolean(account.payouts_enabled);

    return res.status(200).json({
      ok: true,
      hasAccount: true,
      accountId,
      connect_mode: isCustom ? 'custom' : 'express',
      preferred_setup: isCustom ? 'in_app_bank' : 'stripe_express',
      onboardingComplete,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      transfers_enabled: transfersActive,
      bank_account: bankAccount,
      account: {
        id: account.id,
        country: account.country,
        email: account.email || null,
        type: account.type || null,
        business_type: account.business_type || null,
        default_currency: account.default_currency || null,
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to get Stripe account status' });
  }
};

/** Worker: in-app bank (default) or Stripe Express onboarding when STRIPE_CONNECT_MODE=express. */
const getExpressOnboardingUrlHandler = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;

    if (useCustomConnect()) {
      return res.status(200).json({
        ok: true,
        connect_mode: 'custom',
        use_in_app_bank_form: true,
        message: 'Enter account holder name, BSB, and account number under Payments. Summit Staffing links your bank for payouts — no Stripe signup.',
      });
    }

    const workerRes = await pool.query(
      `SELECT w.id, w.stripe_account_id, u.email
       FROM workers w
       JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1
       LIMIT 1`,
      [req.user.userId]
    );

    if (workerRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Worker profile not found.' });
    }

    let accountId = workerRes.rows[0].stripe_account_id;

    if (accountId) {
      try {
        const existing = await stripe.accounts.retrieve(accountId);
        if (existing.type !== 'express') accountId = null; // e.g. old custom account -> replace with express
      } catch (e) {
        if (isStaleConnectAccountError(e)) accountId = null;
        else throw e;
      }
    }

    if (!accountId) {
      const acct = await createConnectedAccount(workerRes.rows[0].email);
      accountId = acct.id;
      await pool.query(
        'UPDATE workers SET stripe_account_id = $2, updated_at = now() WHERE id = $1',
        [workerRes.rows[0].id, accountId]
      );
    }

    const link = await createAccountLink(accountId);
    return res.status(200).json({
      ok: true,
      connect_mode: 'express',
      express_onboarding_url: link.url,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: userFacingPaymentMessage(pickErrorMessage(err) || err, 500) || 'Failed to start Stripe onboarding.',
      hint: stripeActionHint(err),
    });
  }
};

/** Worker: create/reuse Express Connect account and return hosted onboarding URL. */
const createConnectAccount = getExpressOnboardingUrlHandler;

/** Worker: save AU bank details in-app (Stripe Custom Connect — BSB never stored in our DB). */
const saveWorkerBankDetails = async (req, res) => {
  if (!ensureStripeConfigured(res)) return;
  if (respondValidation(req, res)) return;

  const validated = validateAustralianBankDetails(req.body);
  if (!validated.ok) {
    return res.status(400).json({ ok: false, error: validated.error });
  }

  let worker = null;
  try {
    const workerRes = await pool.query(
      `SELECT w.id, w.user_id, w.stripe_account_id, w.first_name, w.last_name, u.email
       FROM workers w
       JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1
       LIMIT 1`,
      [req.user.userId]
    );
    if (workerRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Worker profile not found.' });
    }
    worker = workerRes.rows[0];

    let accountId = worker.stripe_account_id;
    if (accountId) {
      try {
        const existing = await stripe.accounts.retrieve(accountId);
        if (existing.type === 'express') {
          accountId = null;
        }
      } catch (e) {
        if (isStaleConnectAccountError(e)) accountId = null;
        else throw e;
      }
    }

    const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1';

    if (!accountId) {
      const account = await createCustomWorkerAccount({
        email: worker.email,
        firstName: worker.first_name,
        lastName: worker.last_name,
        tosAcceptanceIp: clientIp,
      });
      accountId = account.id;
      await pool.query('UPDATE workers SET stripe_account_id = $2, updated_at = now() WHERE id = $1', [
        worker.id,
        accountId,
      ]);
    }

    const bank = await replaceWorkerBankAccount(accountId, {
      accountHolderName: validated.account_holder_name,
      bsb: validated.bsb,
      accountNumber: validated.account_number,
    });

    return res.status(200).json({
      ok: true,
      connect_mode: 'custom',
      accountId,
      bank_account: {
        last4: bank.last4,
        bsb_display: formatBsbDisplay(validated.bsb),
        account_holder_name: validated.account_holder_name,
      },
      message: 'Bank account saved. You will receive 85% of each paid shift (15% platform fee). No Stripe account needed.',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('saveWorkerBankDetails:', err);

    return res.status(500).json({
      ok: false,
      error: userFacingPaymentMessage(pickErrorMessage(err) || err, 500) || 'Could not save bank details.',
      hint: stripeActionHint(err),
    });
  }
};

const createConnectLoginLinkHandler = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    const workerRes = await pool.query(
      'SELECT stripe_account_id FROM workers WHERE user_id = $1 LIMIT 1',
      [req.user.userId]
    );
    if (workerRes.rowCount === 0 || !workerRes.rows[0].stripe_account_id) {
      return res.status(404).json({ ok: false, error: 'No Stripe account connected yet' });
    }
    const loginLink = await createAccountLoginLink(workerRes.rows[0].stripe_account_id);
    return res.status(200).json({ ok: true, loginUrl: loginLink.url });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: userFacingPaymentMessage(pickErrorMessage(err) || err, 500) || 'Could not open Stripe dashboard.',
    });
  }
};

const disconnectConnectAccountHandler = async (req, res) => {
  try {
    const workerRes = await pool.query(
      'SELECT id, stripe_account_id FROM workers WHERE user_id = $1 LIMIT 1',
      [req.user.userId]
    );
    if (workerRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Worker profile not found' });
    }
    if (!workerRes.rows[0].stripe_account_id) {
      return res.status(200).json({ ok: true, disconnected: false, message: 'No Stripe account was connected' });
    }
    await pool.query(
      'UPDATE workers SET stripe_account_id = NULL, updated_at = now() WHERE id = $1',
      [workerRes.rows[0].id]
    );
    return res.status(200).json({ ok: true, disconnected: true });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: userFacingPaymentMessage(pickErrorMessage(err) || err, 500) || 'Could not disconnect Stripe.',
    });
  }
};

const createPaymentIntentHandler = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    if (respondValidation(req, res)) return;

    const participantRes = await pool.query('SELECT id FROM participants WHERE user_id = $1 LIMIT 1', [req.user.userId]);
    if (participantRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Only participant accounts can start a payment for a booking.' });
    }

    const participantId = participantRes.rows[0].id;
    const { bookingId } = req.body;

    const bookingRes = await pool.query(
      `SELECT b.id, b.participant_id, b.worker_id, b.status, b.total_amount, b.commission_amount,
              b.payment_pipeline, b.authorization_status, w.stripe_account_id,
              t.approval_status AS timesheet_approval_status
       FROM bookings b
       JOIN workers w ON w.id = b.worker_id
       LEFT JOIN booking_timesheets t ON t.booking_id = b.id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId]
    );

    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const booking = bookingRes.rows[0];

    if (booking.participant_id !== participantId) {
      return res.status(403).json({ ok: false, error: 'You can only pay for your own bookings.' });
    }

    if (booking.payment_pipeline === 'funded') {
      return res.status(400).json({
        ok: false,
        error: 'This is a plan-managed (NDIS) booking. Payment is collected via invoice to your plan manager after timesheet approval.',
      });
    }

    if (booking.payment_pipeline === 'private_pay') {
      if (booking.authorization_status === 'authorized' || booking.authorization_status === 'captured') {
        return res.status(400).json({
          ok: false,
          error: 'Your card hold is active. Payment is captured automatically when the timesheet is approved (or after 24 hours).',
        });
      }
      const tsStatus = booking.timesheet_approval_status;
      if (tsStatus && !['approved', 'auto_approved'].includes(tsStatus)) {
        return res.status(400).json({
          ok: false,
          error: 'Approve the timesheet first, or wait 24 hours for automatic approval before manual payment.',
        });
      }
    }

    if (!['confirmed', 'completed'].includes(booking.status)) {
      return res.status(400).json({ ok: false, error: 'Booking must be confirmed (or completed) before payment' });
    }

    if (!booking.stripe_account_id) {
      return res.status(400).json({
        ok: false,
        error: 'The support worker has not added bank details for payouts yet. Ask them to complete Payments in their profile.',
      });
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

    const commission = Number((amount * 0.15).toFixed(2));
    const workerPayout = Number((amount - commission).toFixed(2));

    await pool.query(
      `INSERT INTO payments (booking_id, stripe_payment_intent_id, amount, commission, worker_payout, status, payment_date)
       VALUES ($1, $2, $3, $4, $5, 'pending', NULL)
       ON CONFLICT (stripe_payment_intent_id) DO NOTHING`,
      [booking.id, pi.id, amount, commission, workerPayout]
    );

    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || null;

    return res.status(200).json({
      ok: true,
      payment_intent_id: pi.id,
      client_secret: pi.client_secret,
      publishable_key: publishableKey,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('createPaymentIntentHandler:', err);
    return res.status(500).json({
      ok: false,
      error: userFacingPaymentMessage(pickErrorMessage(err) || err, 500) || 'Could not start payment. Please try again.',
    });
  }
};

const createCheckoutSessionHandler = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    if (respondValidation(req, res)) return;

    const participantRes = await pool.query('SELECT id FROM participants WHERE user_id = $1 LIMIT 1', [req.user.userId]);
    if (participantRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Only participant accounts can pay through checkout.' });
    }
    const participantId = participantRes.rows[0].id;
    const { bookingId } = req.body;

    const bookingRes = await pool.query(
      `SELECT b.id, b.participant_id, b.worker_id, b.status, b.total_amount, w.stripe_account_id
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
      return res.status(403).json({ ok: false, error: 'You can only pay for your own bookings.' });
    }
    if (!['confirmed', 'completed'].includes(booking.status)) {
      return res.status(400).json({ ok: false, error: 'Booking must be confirmed (or completed) before payment' });
    }
    if (!booking.stripe_account_id) {
      return res.status(400).json({
        ok: false,
        error: 'The support worker has not added bank details for payouts yet. Ask them to complete Payments in their profile.',
      });
    }

    const existingPaid = await pool.query(
      "SELECT id FROM payments WHERE booking_id = $1 AND status = 'succeeded' LIMIT 1",
      [booking.id]
    );
    if (existingPaid.rowCount > 0) {
      return res.status(409).json({ ok: false, error: 'This booking is already paid' });
    }

    const { total } = computeCommissionBreakdown(booking.total_amount);
    if (total <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid booking amount' });
    }

    const appUrl = resolveAppBaseUrl();
    const successUrl = `${appUrl}/booking/${booking.id}?payment=success`;
    const cancelUrl = `${appUrl}/booking/${booking.id}?payment=cancelled`;

    const session = await createCheckoutSession({
      amountCents: toCents(total),
      currency: 'aud',
      bookingId: booking.id,
      workerId: booking.worker_id,
      participantId,
      successUrl,
      cancelUrl,
    });

    return res.status(200).json({
      ok: true,
      checkout_url: session.url,
      checkout_session_id: session.id,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('createCheckoutSessionHandler:', err);
    return res.status(500).json({
      ok: false,
      error: userFacingPaymentMessage(pickErrorMessage(err) || err, 500) || 'Could not start checkout. Please try again.',
    });
  }
};

const createTransferForPaymentIntent = async (paymentIntentId, fallbackBookingId = null) => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  if (!pi || pi.status !== 'succeeded') {
    throw new Error('PaymentIntent not succeeded');
  }

  let bookingId = (pi.metadata?.bookingId && String(pi.metadata.bookingId)) || fallbackBookingId;
  if (!bookingId) {
    const payRes = await pool.query(
      'SELECT booking_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
      [paymentIntentId]
    );
    if (payRes.rowCount > 0) {
      bookingId = String(payRes.rows[0].booking_id);
    }
  }
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

  const payment = await ensurePaymentRecordForIntent(paymentIntentId, pi, { fallbackBookingId: bookingId });

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
    if (!ensureStripeConfigured(res)) return;
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
    if (!ensureStripeConfigured(res)) return;
    const signature = req.headers['stripe-signature'];
    const event = verifyWebhookSignature(req.body, signature);

    switch (event.type) {
      case 'payment_intent.processing': {
        const pi = event.data.object;
        if (pi.metadata?.payment_kind === 'authorization_hold') break;
        await ensurePaymentRecordForIntent(pi.id, pi);
        await pool.query(
          "UPDATE payments SET status = 'pending' WHERE stripe_payment_intent_id = $1",
          [pi.id]
        );
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        if (pi.metadata?.payment_kind === 'authorization_hold' && pi.capture_method === 'manual') {
          break;
        }
        await ensurePaymentRecordForIntent(pi.id, pi);
        await pool.query(
          "UPDATE payments SET status = 'succeeded', payment_date = now() WHERE stripe_payment_intent_id = $1",
          [pi.id]
        );

        try {
          await createTransferForPaymentIntent(pi.id);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('transfer after payment_intent.succeeded:', err.message);
        }
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const stripeInvoiceId = invoice.id;
        try {
          await reconcileFundedStripeInvoicePaid(stripeInvoiceId);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('reconcileFundedStripeInvoicePaid:', err.message);
        }
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object;
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
        const sessionBookingId = session.metadata?.bookingId || null;
        if (paymentIntentId) {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          await ensurePaymentRecordForIntent(paymentIntentId, pi, { fallbackBookingId: sessionBookingId });
          await pool.query(
            "UPDATE payments SET status = 'succeeded', payment_date = now() WHERE stripe_payment_intent_id = $1",
            [paymentIntentId]
          );
          try {
            await createTransferForPaymentIntent(paymentIntentId, sessionBookingId);
          } catch (err) {
            // ignore transfer retry failures in webhook path
          }
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

/**
 * Look up a friendly display name for the user from their role-specific profile.
 * Falls back to an empty string when no profile row exists yet.
 */
const lookupUserDisplayName = async (userId, role) => {
  try {
    let row = null;
    if (role === 'participant') {
      const r = await pool.query(
        'SELECT first_name, last_name FROM participants WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      row = r.rows[0];
    } else if (role === 'worker') {
      const r = await pool.query(
        'SELECT first_name, last_name FROM workers WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      row = r.rows[0];
    } else if (role === 'coordinator') {
      const r = await pool.query(
        'SELECT first_name, last_name FROM coordinator_profiles WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      row = r.rows[0];
    }
    if (!row) return '';
    return `${row.first_name || ''} ${row.last_name || ''}`.trim();
  } catch (_) {
    return '';
  }
};

/**
 * Ensure a Stripe Customer exists for the current user and return its id.
 * Saves stripe_customer_id back to users table on first creation.
 *
 * Note: the `users` table does not have `full_name` — name is stored on the
 * role-specific profile (`participants`, `workers`, `coordinator_profiles`).
 */
const ensureStripeCustomerForUser = async (userId) => {
  const userRes = await pool.query(
    'SELECT id, email, role, stripe_customer_id FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  if (userRes.rowCount === 0) {
    throw Object.assign(new Error('User not found'), { code: 'user_missing' });
  }
  const user = userRes.rows[0];
  if (user.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(user.stripe_customer_id);
      if (existing && !existing.deleted) return existing.id;
    } catch (_) {
      // Saved id is stale — fall through and create a new customer below.
    }
  }
  const displayName = await lookupUserDisplayName(user.id, user.role);
  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: displayName || undefined,
    metadata: { userId: String(user.id), role: String(user.role || '') },
  });
  await pool.query(
    'UPDATE users SET stripe_customer_id = $2, updated_at = now() WHERE id = $1',
    [user.id, customer.id]
  );
  return customer.id;
};

/**
 * Participant: open a Stripe-hosted page to save a card for future bookings.
 * Returns { url } so the app/web can open Checkout (mode=setup).
 */
const createCustomerSetupSession = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    const customerId = await ensureStripeCustomerForUser(req.user.userId);

    const appUrl = resolveAppBaseUrl();
    const isLocal = /localhost|127\.0\.0\.1/i.test(appUrl) || String(appUrl).startsWith('http://');
    if (process.env.NODE_ENV === 'production' && isLocal) {
      return res.status(503).json({
        ok: false,
        error: 'APP_URL is not configured for production. Set it to your public https URL.',
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card', 'au_becs_debit'],
      success_url: `${appUrl}/stripe/return?type=setup`,
      cancel_url: `${appUrl}/stripe/return?type=setup&cancelled=1`,
    });

    return res.status(200).json({ ok: true, url: session.url, customerId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('createCustomerSetupSession:', err);
    return res.status(500).json({
      ok: false,
      error: userFacingPaymentMessage(pickErrorMessage(err) || err, 500) || 'Could not start card setup.',
    });
  }
};

/** Participant: list saved card payment methods for the current user. */
const listCustomerPaymentMethods = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    const userRes = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1 LIMIT 1',
      [req.user.userId]
    );
    const customerId = userRes.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(200).json({ ok: true, paymentMethods: [] });
    }
    const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
    const customer = await stripe.customers.retrieve(customerId).catch(() => null);
    const defaultId = customer?.invoice_settings?.default_payment_method || null;
    const cards = (list.data || []).map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: pm.id === defaultId,
    }));
    return res.status(200).json({ ok: true, paymentMethods: cards });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('listCustomerPaymentMethods:', err);
    return res.status(500).json({
      ok: false,
      error: 'Could not load saved cards.',
    });
  }
};

/** Participant: place card authorization hold on a confirmed private-pay booking. */
const authorizeBookingHandler = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    if (respondValidation(req, res)) return;

    const participantRes = await pool.query('SELECT id FROM participants WHERE user_id = $1 LIMIT 1', [req.user.userId]);
    if (participantRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Only participants can authorize payment.' });
    }

    const { bookingId } = req.body;
    const bookingRes = await pool.query(
      'SELECT id, participant_id, status, payment_pipeline FROM bookings WHERE id = $1 LIMIT 1',
      [bookingId]
    );
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];
    if (booking.participant_id !== participantRes.rows[0].id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    if (booking.payment_pipeline === 'funded') {
      return res.status(400).json({ ok: false, error: 'Funded bookings use plan-manager invoicing, not card authorization.' });
    }
    if (booking.status !== 'confirmed' && booking.status !== 'in_progress' && booking.status !== 'completed') {
      return res.status(400).json({ ok: false, error: 'Booking must be confirmed before authorizing payment.' });
    }

    const result = await createBookingAuthorization(bookingId);
    if (!result.ok) {
      return res.status(402).json({
        ok: false,
        error: result.error || 'Could not authorize card.',
        requires_card: Boolean(result.requires_card),
      });
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('authorizeBookingHandler:', err);
    return res.status(500).json({
      ok: false,
      error: userFacingPaymentMessage(pickErrorMessage(err) || err, 500) || 'Could not authorize payment.',
    });
  }
};

/** Participant: detach (delete) a saved card. */
const detachCustomerPaymentMethod = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing payment method id' });
    }
    const userRes = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1 LIMIT 1',
      [req.user.userId]
    );
    const customerId = userRes.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(404).json({ ok: false, error: 'No saved cards.' });
    }
    const pm = await stripe.paymentMethods.retrieve(id).catch(() => null);
    if (!pm || pm.customer !== customerId) {
      return res.status(403).json({ ok: false, error: 'This card does not belong to your account.' });
    }
    await stripe.paymentMethods.detach(id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('detachCustomerPaymentMethod:', err);
    return res.status(500).json({ ok: false, error: 'Could not remove card.' });
  }
};

module.exports = {
  createConnectAccount,
  getConnectConfigCheck,
  getAccountStatus,
  getExpressOnboardingUrl: getExpressOnboardingUrlHandler,
  createConnectLoginLink: createConnectLoginLinkHandler,
  disconnectConnectAccount: disconnectConnectAccountHandler,
  createPaymentIntent: createPaymentIntentHandler,
  createCheckoutSession: createCheckoutSessionHandler,
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
  getPaymentHistory,
  createCustomerSetupSession,
  listCustomerPaymentMethods,
  detachCustomerPaymentMethod,
  authorizeBooking: authorizeBookingHandler,
  saveWorkerBankDetails,
};
