const express = require('express');
const multer = require('multer');
const { body } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const incidentsController = require('../controllers/incidentsController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only images are allowed.'));
    }
    return cb(null, true);
  },
});

const incidentMiddlewares = [
  auth,
  checkWorker,
  upload.array('images', 5),
  body('incident_name').isString().isLength({ min: 2, max: 120 }),
  body('incident_details').isString().isLength({ min: 5, max: 2000 }),
  body('triage_category')
    .isString()
    .isIn([
      'death_of_participant',
      'serious_injury',
      'abuse_or_neglect',
      'unlawful_physical_or_sexual_contact',
      'sexual_misconduct',
      'restrictive_practice',
      'other',
    ]),
  body('called_000')
    .isString()
    .isIn(['true', 'false']),
];

router.post(
  ['/',''],
  ...incidentMiddlewares,
  incidentsController.createIncident
);

module.exports = router;

