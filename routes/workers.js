const express = require('express');
const multer = require('multer');
const { body, param, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const workerController = require('../controllers/workerController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only PDF, JPG, PNG are allowed.'));
    }
    return cb(null, true);
  }
});

router.get(
  '/',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('rating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
    query('verified').optional().isIn(['true', 'false'])
  ],
  workerController.getWorkers
);

router.get(
  '/search',
  [
    query('latitude').isFloat({ min: -90, max: 90 }).withMessage('latitude is required').toFloat(),
    query('longitude').isFloat({ min: -180, max: 180 }).withMessage('longitude is required').toFloat(),
    query('radiusKm').optional().isFloat({ min: 0.1, max: 200 }).toFloat(),
    query('rating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
    query('day_of_week').optional().isInt({ min: 0, max: 6 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  workerController.searchWorkers
);

router.get('/me', [auth, checkWorker], workerController.getMe);

router.post(
  '/setup',
  [auth, checkWorker, body('first_name').optional({ nullable: true }).isString(), body('last_name').optional({ nullable: true }).isString(), body('abn').optional({ nullable: true }).isString()],
  workerController.setupWorkerProfile
);

router.get('/:id', [param('id').isUUID()], workerController.getWorkerById);

router.put(
  '/:id',
  [
    auth,
    checkWorker,
    param('id').isUUID(),
    body('first_name').optional({ nullable: true }).isString(),
    body('last_name').optional({ nullable: true }).isString(),
    body('phone').optional({ nullable: true }).isString(),
    body('address').optional({ nullable: true }).isString(),
    body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }).toFloat(),
    body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }).toFloat(),
    body('hourly_rate').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('monthly_earnings_target').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('max_travel_km').optional({ nullable: true }).isFloat({ min: 0, max: 500 }).toFloat(),
    body('bio').optional({ nullable: true }).isString(),
    body('profile_image_url').optional({ nullable: true }).isString()
  ],
  workerController.updateWorker
);

router.post(
  '/:id/documents',
  [
    auth,
    checkWorker,
    param('id').isUUID(),
    upload.single('file'),
    body('documentType')
      .isIn(['ndis_screening', 'wwcc', 'yellow_card', 'police_check', 'first_aid', 'manual_handling', 'insurance', 'other'])
      .withMessage('Invalid documentType'),
    body('issue_date').optional({ nullable: true }).isISO8601().toDate(),
    body('expiry_date').optional({ nullable: true }).isISO8601().toDate()
  ],
  workerController.uploadDocument
);

router.post(
  '/:id/documents/bulk',
  [
    auth,
    checkWorker,
    param('id').isUUID(),
    upload.array('files', 10),
    body('documentTypes')
      .isString()
      .withMessage('documentTypes required: comma-separated list, e.g. ndis_screening,wwcc,first_aid (one per file in order)')
  ],
  workerController.uploadDocumentsBulk
);

router.post(
  '/:id/profile-photo',
  [auth, checkWorker, param('id').isUUID(), upload.single('file')],
  workerController.uploadProfilePhoto
);

router.post(
  '/:id/skills',
  [
    auth,
    checkWorker,
    param('id').isUUID(),
    body('skill_name').isString().isLength({ min: 2, max: 100 }).withMessage('skill_name is required')
  ],
  workerController.addSkill
);

router.delete(
  '/:id/skills/:skillId',
  [auth, checkWorker, param('id').isUUID(), param('skillId').isUUID()],
  workerController.removeSkill
);

router.put(
  '/:id/availability',
  [
    auth,
    checkWorker,
    param('id').isUUID(),
    body('availability').isArray({ min: 0 }).withMessage('availability must be an array'),
    body('availability.*.day_of_week').isInt({ min: 0, max: 6 }),
    body('availability.*.start_time').optional({ nullable: true }).matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/),
    body('availability.*.end_time').optional({ nullable: true }).matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/),
    body('availability.*.is_available').optional({ nullable: true }).isBoolean().toBoolean()
  ],
  workerController.updateAvailability
);

router.post(
  '/verify-abn',
  [body('abn').isString().withMessage('abn is required')],
  workerController.verifyABN
);

module.exports = router;
