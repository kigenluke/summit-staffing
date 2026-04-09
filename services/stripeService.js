require('dotenv').config();

const { stripe, webhookSecret } = require('../config/stripe');

const createConnectedAccount = async (workerEmail) => {
  return stripe.accounts.create({
    type: 'express',
    country: 'AU',
    email: workerEmail,
    capabilities: {
      transfers: { requested: true }
    }
  });
};

const createAccountLink = async (accountId) => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const refreshUrl = `${appUrl.replace(/\/$/, '')}/stripe/refresh`;
  const returnUrl = `${appUrl.replace(/\/$/, '')}/stripe/return`;

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

const verifyWebhookSignature = (payloadBuffer, signature) => {
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return stripe.webhooks.constructEvent(payloadBuffer, signature, webhookSecret);
};

module.exports = {
  stripe,
  createConnectedAccount,
  createAccountLink,
  createPaymentIntent,
  createTransfer,
  verifyWebhookSignature
};
