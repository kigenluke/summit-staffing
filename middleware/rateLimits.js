const rateLimit = require('express-rate-limit');

/** Brute-force protection for unauthenticated auth writes only. */
const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Please try again in a few minutes.' }
});

module.exports = { authWriteLimiter };
