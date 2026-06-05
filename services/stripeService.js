require('dotenv').config();

const { stripe, webhookSecret } = require('../config/stripe');

/**
 * Base URL for Stripe Connect return/refresh redirects.
 * Set APP_URL on Railway to your public API origin, e.g. https://athletic-heart-backend-production.up.railway.app
 */
const resolveAppBaseUrl = () => {
  const trim = (u) => String(u || '').replace(/\/$/, '');
  if (process.env.APP_URL) return trim(process.env.APP_URL);
  const railwayHost = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayHost) {
    const h = String(railwayHost).replace(/^https?:\/\//, '').split('/')[0];
    if (h) return `https://${h}`;
  }
  if (process.env.RAILWAY_STATIC_URL) return trim(process.env.RAILWAY_STATIC_URL);
  if (process.env.EXPO_PUBLIC_API_URL) return trim(process.env.EXPO_PUBLIC_API_URL);
  if (process.env.VITE_API_URL) return trim(process.env.VITE_API_URL);
  return 'http://localhost:3000';
};

/** In-app BSB is the default; set STRIPE_CONNECT_MODE=express only for legacy testing. */
const useCustomConnect = () => String(process.env.STRIPE_CONNECT_MODE || 'custom').toLowerCase() !== 'express';

/**
 * Custom Connect worker account (separate charges & transfers — no worker Stripe dashboard).
 * Stripe minimum: type custom, country AU, transfers capability.
 */
const createCustomWorkerAccount = async ({ email, firstName, lastName, tosAcceptanceIp }) => {
  const payload = {
    type: 'custom',
    country: 'AU',
    email: String(email || '').trim(),
    business_type: 'individual',
    capabilities: {
      transfers: { requested: true },
    },
    individual: {
      first_name: String(firstName || '').trim() || 'Worker',
      last_name: String(lastName || '').trim() || 'User',
      email: String(email || '').trim(),
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: tosAcceptanceIp || '127.0.0.1',
      service_agreement: 'recipient',
    },
    settings: {
      payouts: {
        schedule: { interval: 'daily' },
      },
    },
  };

  try {
    return await stripe.accounts.create(payload);
  } catch (minimalErr) {
    return stripe.accounts.create({
      ...payload,
      controller: {
        stripe_dashboard: { type: 'none' },
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        requirement_collection: 'application',
      },
    });
  }
};

const attachAustralianBankAccount = async (accountId, { accountHolderName, bsb, accountNumber }) => {
  const routing = String(bsb).replace(/\D/g, '');
  const accountNum = String(accountNumber).replace(/\D/g, '');
  const bankPayload = {
    country: 'AU',
    currency: 'aud',
    account_holder_name: accountHolderName,
    routing_number: routing,
    account_number: accountNum,
  };

  try {
    const token = await stripe.tokens.create({ bank_account: bankPayload });
    return stripe.accounts.createExternalAccount(accountId, {
      external_account: token.id,
      default_for_currency: true,
    });
  } catch (_) {
    return stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        ...bankPayload,
      },
      default_for_currency: true,
    });
  }
};

const listWorkerBankAccounts = async (accountId) => {
  const list = await stripe.accounts.listExternalAccounts(accountId, {
    object: 'bank_account',
    limit: 5,
  });
  return list.data || [];
};

const createConnectedAccount = async (workerEmail) => {
  const email = String(workerEmail || '').trim();
  if (!email || !email.includes('@')) {
    throw Object.assign(new Error('Worker email is missing or invalid. Update your account email first.'), { code: 'email_invalid' });
  }

  // Some Stripe accounts reject capabilities on create; retry with minimal payload.
  try {
    return await stripe.accounts.create({
      type: 'express',
      country: 'AU',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
  } catch (err) {
    return stripe.accounts.create({
      type: 'express',
      country: 'AU',
      email,
    });
  }
};

const createAccountLink = async (accountId) => {
  const appUrl = resolveAppBaseUrl();
  const isLocal =
    /localhost|127\.0\.0\.1/i.test(appUrl) || String(appUrl).startsWith('http://');
  if (process.env.NODE_ENV === 'production' && isLocal) {
    throw Object.assign(
      new Error(
        'Set APP_URL on the server to your public https URL (e.g. https://your-app.up.railway.app). Stripe rejects localhost or http return URLs in production.'
      ),
      { code: 'app_url_invalid' }
    );
  }
  const refreshUrl = `${appUrl}/stripe/refresh`;
  const returnUrl = `${appUrl}/stripe/return`;

  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding'
  });
};

const createAccountLoginLink = async (accountId) => {
  return stripe.accounts.createLoginLink(accountId);
};

const createPaymentIntent = async ({ amountCents, currency = 'aud', bookingId, metadata = {} }) => {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      bookingId,
      ...metadata
    }
  });
};

/** Private pay: pre-authorize estimated shift total (manual capture). */
const createAuthorizationHold = async ({
  amountCents,
  currency = 'aud',
  bookingId,
  customerId,
  paymentMethodId,
  metadata = {},
}) => {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    customer: customerId,
    payment_method: paymentMethodId,
    capture_method: 'manual',
    confirm: true,
    off_session: true,
    metadata: {
      bookingId: String(bookingId),
      pipeline: 'private_pay',
      payment_kind: 'authorization_hold',
      ...metadata,
    },
  });
};

const updatePaymentIntentAmount = async (paymentIntentId, amountCents) =>
  stripe.paymentIntents.update(paymentIntentId, { amount: amountCents });

const capturePaymentIntent = async (paymentIntentId, amountToCaptureCents = null) => {
  const params = amountToCaptureCents != null ? { amount_to_capture: amountToCaptureCents } : {};
  return stripe.paymentIntents.capture(paymentIntentId, params);
};

const cancelPaymentIntent = async (paymentIntentId) => stripe.paymentIntents.cancel(paymentIntentId);

const createTransfer = async ({ amountCents, destination, sourceTransaction, metadata = {} }) => {
  return stripe.transfers.create({
    amount: amountCents,
    currency: 'aud',
    destination,
    source_transaction: sourceTransaction,
    metadata
  });
};

const createCheckoutSession = async ({
  amountCents,
  currency = 'aud',
  bookingId,
  workerId,
  participantId,
  successUrl,
  cancelUrl,
}) => {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: `Booking #${bookingId} payment`,
          },
        },
      },
    ],
    metadata: {
      bookingId: String(bookingId),
      workerId: String(workerId),
      participantId: String(participantId),
    },
  });
};

const verifyWebhookSignature = (payloadBuffer, signature) => {
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return stripe.webhooks.constructEvent(payloadBuffer, signature, webhookSecret);
};

module.exports = {
  stripe,
  resolveAppBaseUrl,
  useCustomConnect,
  createCustomWorkerAccount,
  attachAustralianBankAccount,
  listWorkerBankAccounts,
  createConnectedAccount,
  createAccountLink,
  createAccountLoginLink,
  createPaymentIntent,
  createAuthorizationHold,
  updatePaymentIntentAmount,
  capturePaymentIntent,
  cancelPaymentIntent,
  createCheckoutSession,
  createTransfer,
  verifyWebhookSignature
};
