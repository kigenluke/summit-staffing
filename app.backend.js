require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const workerRoutes = require('./routes/workers');
const participantRoutes = require('./routes/participants');
const bookingRoutes = require('./routes/bookings');
const invoiceRoutes = require('./routes/invoices');
const paymentRoutes = require('./routes/payments');
const paymentController = require('./controllers/paymentController');
const reviewRoutes = require('./routes/reviews');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');
const legalRoutes = require('./routes/legal');
const userRoutes = require('./routes/users');
const shiftRoutes = require('./routes/shifts');
const notificationRoutes = require('./routes/notifications');

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:19006'
];

const app = express();

// Trust proxy - needed for Railway/reverse proxy environments
app.set('trust proxy', 1);

// 1) morgan
app.use(morgan('dev'));

// 2) helmet
app.use(helmet());

// 3) cors
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  })
);

// 4) Stripe webhook raw body preservation
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentController.handleWebhook);

// 5) JSON + 6) urlencoded
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 7) rate-limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later'
  })
);

// health
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'summit-backend',
    timestamp: new Date().toISOString()
  });
});

// root – so visiting http://localhost:3000 in a browser shows something clear
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Summit Staffing API',
    docs: 'Use /api/* endpoints. Health: GET /health'
  });
});

// routes
app.use('/api/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/notifications', notificationRoutes);

// Explicit preflight handler for CORS
app.options('*', cors());

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  // eslint-disable-next-line no-console
  console.error(err);

  const payload = { success: false, error: message };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
});

module.exports = {
  app,
  allowedOrigins
};
