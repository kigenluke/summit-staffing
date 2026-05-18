/**
 * Stripe API key shape checks for server configuration.
 * STRIPE_SECRET_KEY must be sk_test_... or sk_live_... — never rk_ (restricted) or pk_ (publishable).
 */

function classifyStripeSecretKey(key) {
  const k = String(key || '').trim();
  if (!k) return { valid: false, kind: 'missing', message: 'STRIPE_SECRET_KEY is not set.' };
  if (k.startsWith('sk_test_')) return { valid: true, kind: 'secret_test', message: null };
  if (k.startsWith('sk_live_')) return { valid: true, kind: 'secret_live', message: null };
  if (k.startsWith('rk_test_') || k.startsWith('rk_live_')) {
    return {
      valid: false,
      kind: 'restricted',
      message:
        'STRIPE_SECRET_KEY is a restricted key (rk_...). Use your Secret key from Stripe Dashboard → Developers → API keys → Secret key (sk_live_... or sk_test_...). Restricted keys cannot create PaymentIntents or Connect accounts.',
    };
  }
  if (k.startsWith('pk_test_') || k.startsWith('pk_live_')) {
    return {
      valid: false,
      kind: 'publishable',
      message:
        'STRIPE_SECRET_KEY is set to a publishable key (pk_...). Put pk_... in STRIPE_PUBLISHABLE_KEY and sk_... in STRIPE_SECRET_KEY.',
    };
  }
  return {
    valid: false,
    kind: 'unknown',
    message: 'STRIPE_SECRET_KEY must start with sk_test_ or sk_live_.',
  };
}

function classifyStripePublishableKey(key) {
  const k = String(key || '').trim();
  if (!k) return { valid: false, kind: 'missing' };
  if (k.startsWith('pk_test_') || k.startsWith('pk_live_')) return { valid: true, kind: 'publishable' };
  if (k.startsWith('sk_') || k.startsWith('rk_')) return { valid: false, kind: 'wrong_type' };
  return { valid: false, kind: 'unknown' };
}

module.exports = {
  classifyStripeSecretKey,
  classifyStripePublishableKey,
};
