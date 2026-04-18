/**
 * Stripe publishable key (pk_...) — safe to ship in the app.
 * Prefer loading from env at build time; fallback is empty until you add payment UI.
 *
 * Web (Vite): set VITE_STRIPE_PUBLISHABLE_KEY in .env
 * Native (Expo): set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
 *
 * Alternatively, POST /api/payments/create-intent returns `publishable_key` from the server
 * when STRIPE_PUBLISHABLE_KEY is set on Railway — use that to avoid duplicating the key in the client.
 */

function readVite() {
  try {
    // eslint-disable-next-line no-undef
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY) {
      return String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
    }
  } catch (_) {}
  return '';
}

export function getStripePublishableKeyFromEnv() {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return String(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  }
  return readVite();
}
