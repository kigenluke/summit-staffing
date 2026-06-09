const { classifyStripeSecretKey } = require('./stripeKeyValidation');

function pickStripeMessage(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err.trim();
  try {
    const r = err.raw;
    if (r?.error?.message) return String(r.error.message).trim();
    if (r?.message) return String(r.message).trim();
  } catch (_) {}
  if (err.message) return String(err.message).trim();
  return '';
}

/**
 * Admin-facing hint for Stripe Connect / payment failures (safe to show in app alerts).
 */
function stripeActionHint(err) {
  const keyCheck = classifyStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (!keyCheck.valid) {
    return `${keyCheck.message} Update STRIPE_SECRET_KEY on the server (Railway Variables), then redeploy.`;
  }

  const msg = pickStripeMessage(err).toLowerCase();
  if (!msg) return null;

  if (/invalid\s+api\s*key|no\s+api\s+key|api\s+key\s+provided|expired\s+api\s*key/i.test(msg)) {
    return (
      'The server STRIPE_SECRET_KEY is invalid or does not match this Stripe account. ' +
      'Use the Standard secret key (sk_live_... or sk_test_...) from Developers → API keys, not rk_.... ' +
      'If you use npm run web on localhost, the API may be on Railway — update variables there and redeploy.'
    );
  }

  if (/does not have the required permissions|restricted key/i.test(msg)) {
    return 'Use sk_live_... or sk_test_... in STRIPE_SECRET_KEY, not rk_... (restricted key).';
  }

  if (/localhost|127\.0\.0\.1|http:\/\/|return_url|refresh_url|must be a valid url/i.test(msg)) {
    return (
      'Set APP_URL on the server to your public https API URL (e.g. https://your-app.up.railway.app). ' +
      'Stripe cannot use localhost for Connect return URLs in production.'
    );
  }

  if (/signed up for connect|only create new accounts if you/i.test(msg)) {
    return (
      'Enable Stripe Connect on the same Stripe account as your API keys: Dashboard → turn ON Test mode if using sk_test_ → Settings → Connect → Get started (Australia, Express). Then try Setup Stripe Account again.'
    );
  }

  if (/recipient tos|service_agreement|tos agreement is not supported/i.test(msg)) {
    return (
      'This was a server configuration issue for Australian Connect (now fixed: use full ToS, not recipient). ' +
      'Redeploy the API, then try Save bank account again. You do not need to change Dashboard from Express to Custom.'
    );
  }

  if (/collecting requirements|responsibilities for collecting/i.test(msg)) {
    return (
      'Stripe platform owner: Dashboard → Settings → Connect → Platform setup (or Platform profile). ' +
      'Confirm your platform collects worker verification info (requirement_collection = application) and accepts liability for losses. ' +
      'See https://docs.stripe.com/connect/custom/onboarding — then redeploy and try Save bank account again. ' +
      'If the app offers Open Stripe, you can add bank details there temporarily.'
    );
  }

  if (/connect|platform|capabilities|not enabled/i.test(msg)) {
    return 'In Stripe Dashboard, complete Connect setup: Settings → Connect → get started (Australia).';
  }

  if (/not connected to your platform|no such account/i.test(msg)) {
    return (
      'Old Stripe Connect account in the database (test/live switch or new API keys). ' +
      'Tap Setup Stripe Account again — the server will create a new Connect account automatically.'
    );
  }

  return null;
}

/** Connect account id in DB does not belong to the Stripe account for the current API key. */
function isStaleConnectAccountError(err) {
  const msg = pickStripeMessage(err).toLowerCase();
  if (err?.code === 'resource_missing') return true;
  if (/no such account/i.test(msg)) return true;
  if (/not connected to your platform/i.test(msg)) return true;
  if (/does not exist/i.test(msg) && msg.includes('account')) return true;
  return false;
}

module.exports = {
  pickStripeMessage,
  stripeActionHint,
  isStaleConnectAccountError,
};
