/**
 * Base URL for user-facing links in emails (password reset, verify email, invites).
 * Do NOT use APP_URL here — that is the public API origin (Stripe, etc.), not the React app.
 */

const PRODUCTION_WEB_URL = 'https://summitstaffing.com.au';

function trimBase(u) {
  return String(u || '').trim().replace(/\/$/, '');
}

function isLocalDevUrl(url) {
  return /localhost|127\.0\.0\.1/i.test(String(url || ''));
}

/**
 * Public site URL for emails, referral links, and share URLs.
 * Never returns localhost — always the live summitstaffing.com.au site.
 */
function getWebClientBaseUrl() {
  const candidates = [
    process.env.WEB_APP_URL,
    process.env.CLIENT_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
  ];
  for (const c of candidates) {
    const t = trimBase(c);
    if (!t || isLocalDevUrl(t) || t.includes(',')) continue;
    try {
      const parsed = new URL(t);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return trimBase(parsed.origin);
      }
    } catch (_) {
      /* skip invalid */
    }
  }
  return PRODUCTION_WEB_URL;
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
    || trimBase(process.env.FRONTEND_URL)
    || trimBase(process.env.FRONTEND_ORIGIN);
  if (hasExplicit) return null;
  return 'Set WEB_APP_URL on the server to the public URL where users open the app (not the API URL).';
}

/** Custom scheme for APK-only reset/verify links (no website required). */
function getAppDeepLinkScheme() {
  const scheme = String(process.env.APP_DEEP_LINK_SCHEME || 'summitstaffing').trim();
  return scheme || 'summitstaffing';
}

/**
 * Password reset URL for emails. APK: summitstaffing://reset-password?token=…
 * Web dev: set WEB_APP_URL and PASSWORD_RESET_USE_WEB_URL=true
 */
function getPasswordResetUrl(resetToken) {
  const token = encodeURIComponent(String(resetToken || '').trim());
  const useWeb = String(process.env.PASSWORD_RESET_USE_WEB_URL || '').toLowerCase() === 'true';
  if (useWeb) {
    const base = getWebClientBaseUrl();
    return `${base}/reset-password?token=${token}`;
  }
  const scheme = getAppDeepLinkScheme();
  return `${scheme}://reset-password?token=${token}`;
}

module.exports = {
  getWebClientBaseUrl,
  getWebClientBaseUrlWarning,
  getAppDeepLinkScheme,
  getPasswordResetUrl,
};
