/**
 * Base URL for user-facing links in emails (password reset, verify email, invites).
 * Do NOT use APP_URL here — that is the public API origin (Stripe, etc.), not the React app.
 */

function trimBase(u) {
  return String(u || '').trim().replace(/\/$/, '');
}

/**
 * @returns {string} e.g. https://app.example.com or http://localhost:5173
 */
function getWebClientBaseUrl() {
  const candidates = [
    process.env.WEB_APP_URL,
    process.env.CLIENT_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.FRONTEND_URL,
  ];
  for (const c of candidates) {
    const t = trimBase(c);
    if (t) return t;
  }
  return 'http://localhost:5173';
}

/**
 * Short hint for admins when email links would be wrong in production.
 */
function getWebClientBaseUrlWarning() {
  if (process.env.NODE_ENV !== 'production') return null;
  const hasExplicit =
    trimBase(process.env.WEB_APP_URL)
    || trimBase(process.env.CLIENT_APP_URL)
    || trimBase(process.env.PUBLIC_APP_URL)
    || trimBase(process.env.FRONTEND_URL);
  if (hasExplicit) return null;
  return 'Set WEB_APP_URL on the server to the public URL where users open the app (not the API URL).';
}

module.exports = {
  getWebClientBaseUrl,
  getWebClientBaseUrlWarning,
};
