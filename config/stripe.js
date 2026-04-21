const Stripe = require('stripe');

const apiKey = process.env.STRIPE_SECRET_KEY;
const stripe = apiKey ? new Stripe(apiKey, { apiVersion: '2026-01-28.clover' }) : null;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;

module.exports = { stripe, webhookSecret };
