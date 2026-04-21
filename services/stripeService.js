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
    payment_intent_data: {
      metadata: {
        bookingId: String(bookingId),
        workerId: String(workerId),
        participantId: String(participantId),
      },
      automatic_payment_methods: { enabled: true },
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
  createConnectedAccount,
  createAccountLink,
  createPaymentIntent,
  createCheckoutSession,
  createTransfer,
  verifyWebhookSignature
};
