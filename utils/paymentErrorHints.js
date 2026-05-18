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

  if (/connect|platform|capabilities|not enabled|signed up for connect/i.test(msg)) {
    return 'In Stripe Dashboard, complete Connect setup: Settings → Connect → get started (Australia).';
  }

  return null;
}

module.exports = {
  pickStripeMessage,
  stripeActionHint,
};
