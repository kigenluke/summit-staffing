const express = require('express');
const { body, query, param } = require('express-validator');

const auth = require('../middleware/auth');
const checkAdmin = require('../middleware/checkAdmin');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.get('/dashboard', [auth, checkAdmin], adminController.getDashboardStats);

router.get(
  '/documents/pending',
  [auth, checkAdmin, query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()],
  adminController.getPendingDocuments
);

router.put('/documents/:id/approve', [auth, checkAdmin, param('id').isUUID()], adminController.approveDocument);

router.put(
  '/documents/:id/reject',
  [auth, checkAdmin, param('id').isUUID(), body('reason').optional().isString().isLength({ max: 500 })],
  adminController.rejectDocument
);

router.get(
  '/users',
  [
    auth,
    checkAdmin,
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('role').optional().isIn(['worker', 'participant', 'admin']),
    query('suspended').optional().isIn(['true', 'false']),
    query('search').optional().isString().isLength({ max: 200 })
  ],
  adminController.getUserList
);

router.get(
  '/users/:id/compliance',
  [auth, checkAdmin, param('id').isUUID()],
  adminController.getUserComplianceStatus
);

router.put(
  '/users/:id/compliance/:itemKey',
  [
    auth,
    checkAdmin,
    param('id').isUUID(),
    param('itemKey').isString().isLength({ min: 2, max: 80 }),
    body('action').isIn(['approve', 'reject', 'pending']),
    body('reason').optional().isString().isLength({ max: 500 })
  ],
  adminController.updateUserComplianceItem
);

router.put(
  '/users/:id/suspend',
  [auth, checkAdmin, param('id').isUUID(), body('reason').optional().isString().isLength({ max: 500 })],
  adminController.suspendUser
);

router.get(
  '/reports/revenue',
  [
    auth,
    checkAdmin,
    query('groupBy').optional().isIn(['day', 'week', 'month']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],
  adminController.getRevenueReport
);

router.get('/reports/bookings', [auth, checkAdmin], adminController.getBookingMetrics);

module.exports = router;
