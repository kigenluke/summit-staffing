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
  const recommended = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'MAILGUN_API_KEY', 'MAILGUN_DOMAIN'];
  const missingRecommended = recommended.filter((k) => !process.env[k]);
  if (missingRecommended.length) {
    // eslint-disable-next-line no-console
    console.warn(`Warning: missing recommended env vars: ${missingRecommended.join(', ')}`);
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
