const express = require('express');
const { body } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const incidentsController = require('../controllers/incidentsController');

const router = express.Router();

router.post(
  ['/',''],
  [
    auth,
    checkWorker,
    body('complaint_details').isString().isLength({ min: 5, max: 2000 }),
  ],
  incidentsController.createComplaint
);

module.exports = router;

