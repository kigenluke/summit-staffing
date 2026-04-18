const express = require('express');
const { param, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const invoiceController = require('../controllers/invoiceController');

const router = express.Router();

router.post('/generate/:bookingId', [auth, checkWorker, param('bookingId').isUUID()], invoiceController.generateInvoice);

router.get(
  '/',
  [
    auth,
    query('status').optional().isIn(['draft', 'sent', 'paid']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  invoiceController.getInvoices
);

router.get('/:id', [auth, param('id').isUUID()], invoiceController.getInvoiceById);

router.post('/:id/pdf', [auth, param('id').isUUID()], invoiceController.generatePDF);

router.post('/:id/send', [auth, param('id').isUUID()], invoiceController.sendInvoiceEmail);

module.exports = router;
