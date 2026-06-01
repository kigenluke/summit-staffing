const express = require('express');
const { body, param, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const checkParticipant = require('../middleware/checkParticipant');
const bookingController = require('../controllers/bookingController');
const timesheetController = require('../controllers/timesheetController');

const router = express.Router();

router.post(
  '/',
  [
    auth,
    checkParticipant,
    body('worker_id').isUUID(),
    body('service_type').isString().isLength({ min: 2, max: 100 }),
    body('start_time').isISO8601(),
    body('end_time').isISO8601(),
    body('proposed_hourly_rate').isFloat({ min: 0 }).withMessage('Your budget (hourly rate) is required and must be 0 or more'),
    body('location_address').optional({ nullable: true }).isString(),
    body('location_lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }).toFloat(),
    body('location_lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }).toFloat(),
    body('high_intensity_support').optional().isBoolean().toBoolean(),
    body('travel_distance_km').optional({ nullable: true }).isFloat({ min: 0, max: 2000 }).toFloat(),
    body('sleepover_flat_amount').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  ],
  bookingController.createBooking
);

router.get(
  '/',
  [
    auth,
    query('status').optional().isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  bookingController.getBookings
);

router.get('/:id', [auth, param('id').isUUID()], bookingController.getBookingById);

router.put('/:id/accept', [auth, checkWorker, param('id').isUUID()], bookingController.acceptBooking);
router.put(
  '/:id/decline',
  [auth, checkWorker, param('id').isUUID(), body('reason').optional({ nullable: true }).isString().isLength({ max: 500 })],
  bookingController.declineBooking
);

router.put('/:id/cancel', [auth, param('id').isUUID()], bookingController.cancelBooking);

router.post(
  '/:id/clock-in',
  [auth, checkWorker, param('id').isUUID(), body('lat').isFloat({ min: -90, max: 90 }).toFloat(), body('lng').isFloat({ min: -180, max: 180 }).toFloat()],
  bookingController.clockIn
);

router.post(
  '/:id/clock-out',
  [auth, checkWorker, param('id').isUUID(), body('lat').isFloat({ min: -90, max: 90 }).toFloat(), body('lng').isFloat({ min: -180, max: 180 }).toFloat()],
  bookingController.clockOut
);

router.put(
  '/:id/notes',
  [auth, checkWorker, param('id').isUUID(), body('notes').optional({ nullable: true }).isString()],
  bookingController.updateTimesheetNotes
);

router.put('/:id/complete', [auth, param('id').isUUID()], bookingController.completeBooking);

router.get('/:id/timesheet', [auth, param('id').isUUID()], timesheetController.getTimesheetStatus);
router.post(
  '/:id/timesheet/approve',
  [auth, checkParticipant, param('id').isUUID()],
  timesheetController.approveTimesheetHandler
);
router.post(
  '/:id/timesheet/dispute',
  [
    auth,
    checkParticipant,
    param('id').isUUID(),
    body('reason').isString().isLength({ min: 3, max: 2000 }),
  ],
  timesheetController.disputeTimesheetHandler
);

module.exports = router;
