require('dotenv').config({ path: '.env' });
console.log('DB URL:', process.env.DATABASE_URL);

const http = require('http');
const pool = require('./config/database');
const { app, allowedOrigins } = require('./app.backend');
const { initSocket } = require('./services/socketService');

const port = Number(process.env.PORT) || 3000;
const server = http.createServer(app);

initSocket(server);

const validateEnv = () => {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // optional but recommended
  const recommended = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'MAILGUN_API_KEY', 'MAILGUN_DOMAIN'];
  const missingRecommended = recommended.filter((k) => !process.env[k]);
  if (missingRecommended.length) {
    // eslint-disable-next-line no-console
    console.warn(`Warning: missing recommended env vars: ${missingRecommended.join(', ')}`);
  }

  const { classifyStripeSecretKey } = require('./utils/stripeKeyValidation');
  const stripeSecret = classifyStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (process.env.STRIPE_SECRET_KEY && !stripeSecret.valid) {
    // eslint-disable-next-line no-console
    console.error(`[stripe] ${stripeSecret.message}`);
  } else if (process.env.STRIPE_SECRET_KEY && stripeSecret.valid) {
    try {
      const { stripe } = require('./config/stripe');
      if (stripe) {
        stripe.balance
          .retrieve()
          .then(() => {
            // eslint-disable-next-line no-console
            console.log('[stripe] Secret key verified with Stripe API');
          })
          .catch((e) => {
            // eslint-disable-next-line no-console
            console.error(
              '[stripe] STRIPE_SECRET_KEY is set but Stripe rejected it (revoked, wrong copy, or rolled key).',
              e.message
            );
          });
      }
    } catch (_) {
      /* ignore */
    }
  }

  try {
    const { isOutboundEmailConfigured } = require('./services/emailService');
    const { getWebClientBaseUrl, getWebClientBaseUrlWarning } = require('./utils/clientAppUrl');
    if (isOutboundEmailConfigured()) {
      // eslint-disable-next-line no-console
      console.log('[email] Mailgun configured — welcome & password-reset emails enabled');
      const w = getWebClientBaseUrlWarning();
      if (w) {
        // eslint-disable-next-line no-console
        console.warn(`[email] ${w} Links will use: ${getWebClientBaseUrl()}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn('[email] MAILGUN_API_KEY / MAILGUN_DOMAIN missing — sign-up welcome emails will not send');
    }
  } catch (_) {
    /* ignore optional checks */
  }

  // eslint-disable-next-line no-console
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
};

const start = async () => {
  validateEnv();

  try {
    await pool.query('SELECT NOW()');
    // eslint-disable-next-line no-console
    console.log('Database connection established');
    const { ensureDbSchema } = require('./services/ensureDbSchema');
    await ensureDbSchema(pool);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Database connection failed', err);
    process.exit(1);
  }
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Summit Staffing API running on http://localhost:${port}`);
    // eslint-disable-next-line no-console
    console.log('Summit Staffing Pty Ltd - ABN 73690199501');

    if (process.env.ENABLE_TIMESHEET_CRON !== 'false') {
      try {
        const cron = require('node-cron');
        const { runTimesheetApprovalCron } = require('./jobs/timesheetApprovalCron');
        const { runMissedShiftCron } = require('./jobs/missedShiftCron');
        cron.schedule('*/15 * * * *', () => {
          runTimesheetApprovalCron().catch((e) => {
            // eslint-disable-next-line no-console
            console.error('[cron] timesheet auto-approval failed:', e.message);
          });
          runMissedShiftCron().catch((e) => {
            // eslint-disable-next-line no-console
            console.error('[cron] missed-shift auto-close failed:', e.message);
          });
        });
        // eslint-disable-next-line no-console
        console.log('[cron] Timesheet 24h auto-approval + missed-shift jobs scheduled (every 15 minutes)');
      } catch (cronErr) {
        // eslint-disable-next-line no-console
        console.warn('[cron] Could not start timesheet job:', cronErr.message);
      }
    }
  });
};

const shutdown = async (signal) => {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}. Shutting down gracefully...`);

  try {
    await new Promise((resolve) => server.close(resolve));
  } catch (e) {
    // ignore
  }

  try {
    await pool.end();
  } catch (e) {
    // ignore
  }

  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
