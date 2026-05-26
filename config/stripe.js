const Stripe = require('stripe');
const { classifyStripeSecretKey } = require('../utils/stripeKeyValidation');

// Trim — Railway copy/paste sometimes adds spaces; Stripe then returns "Invalid API Key".
const apiKey = String(process.env.STRIPE_SECRET_KEY || '').trim().replace(/^['"]|['"]$/g, '');
const secretKeyCheck = classifyStripeSecretKey(apiKey);

if (apiKey && !secretKeyCheck.valid) {
  // eslint-disable-next-line no-console
  console.error(`[stripe] Invalid STRIPE_SECRET_KEY: ${secretKeyCheck.message}`);
}

const stripe =
  apiKey && secretKeyCheck.valid ? new Stripe(apiKey, { apiVersion: '2026-01-28.clover' }) : null;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;

module.exports = { stripe, webhookSecret, secretKeyCheck };
