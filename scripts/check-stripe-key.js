require('dotenv').config();
const { classifyStripeSecretKey } = require('../utils/stripeKeyValidation');

const k = String(process.env.STRIPE_SECRET_KEY || '').trim();
const c = classifyStripeSecretKey(k);
console.log('classification:', c);

console.log('length:', k.length);
console.log('prefix:', k.slice(0, 12));
console.log('suffix:', k.slice(-4));
console.log('hasWhitespace:', /\s/.test(k));

if (!c.valid) process.exit(1);

const Stripe = require('stripe');
const stripe = new Stripe(k, { apiVersion: '2026-01-28.clover' });

stripe.balance
  .retrieve()
  .then(() => console.log('Stripe API: secret key is VALID (balance.retrieve OK)'))
  .catch((e) => {
    console.error('Stripe API rejected the key:', e.message);
    process.exit(1);
  });
