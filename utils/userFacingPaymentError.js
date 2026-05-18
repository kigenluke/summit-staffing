/**
 * Map Stripe / internal payment errors to short, user-safe copy (no API keys or doc URLs).
 * Used by paymentController (Node). Keep messages in English for the app UI.
 */

const DEFAULT_500 = 'We could not complete payment. Please try again in a moment.';
const DEFAULT_EMPTY = 'Something went wrong with payment. Please try again.';

function pickRawMessage(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  try {
    const r = err.raw;
    if (r && typeof r === 'object') {
      const nested = r.error && typeof r.error === 'object' ? r.error.message : null;
      if (nested) return String(nested).trim();
      if (r.message) return String(r.message).trim();
    }
  } catch (_) {}
  if (err.response?.data?.error?.message) return String(err.response.data.error.message).trim();
  if (err.detail) return String(err.detail).trim();
  if (err.message) return String(err.message).trim();
  return '';
}

/**
 * @param {string|unknown} input – pre-picked message string, or a Stripe/Error object
 * @param {number} [httpStatus]
 * @returns {string}
 */
function userFacingPaymentMessage(input, httpStatus) {
  const msg = String(
    typeof input === 'string' ? input.trim() : pickRawMessage(input)
  ).trim();
  const lower = msg.toLowerCase();

  if (!msg) {
    if (httpStatus === 503) {
      return 'Payments are temporarily unavailable. Please try again later.';
    }
    if (httpStatus >= 500) return DEFAULT_500;
    return DEFAULT_EMPTY;
  }

  if (/invalid\s+api\s*key|no\s+api\s+key|api\s+key\s+provided|expired\s+api\s*key/i.test(msg)) {
    return 'Payments are not fully set up yet. Please try again later or contact support.';
  }

  if (/does not have the required permissions|restricted key|rk_live_|rk_test_/i.test(msg)) {
    return 'Payment server is using the wrong Stripe key type. Ask your admin to set STRIPE_SECRET_KEY to the Secret key (sk_live_...), not a Restricted key (rk_...).';
  }

  if (/webhook_secret|stripe-signature/i.test(lower)) {
    return DEFAULT_500;
  }

  if (/localhost|http:\/\/|return_url|refresh_url/.test(lower) && /url|stripe|account/i.test(lower)) {
    return 'Payment setup needs a correct website address on the server. Please contact support.';
  }

  if (/rate.?limit|too many requests/i.test(msg)) {
    return 'Too many attempts. Please wait a minute and try again.';
  }

  if (/no such (price|product|customer|checkout)/i.test(msg)) {
    return 'Payment could not be started. Please try again or contact support.';
  }

  if (/worker stripe account not set|destination charges|no connected account/i.test(lower)) {
    return 'The worker has not finished payment setup yet. Try again after they connect Stripe.';
  }

  let out = msg.replace(/https?:\/\/[^\s)]+/gi, '').replace(/\s{2,}/g, ' ').trim();

  if (out.length > 220) {
    out = `${out.slice(0, 217)}…`;
  }

  return out || DEFAULT_EMPTY;
}

module.exports = { userFacingPaymentMessage, pickRawMessage };
