const express = require('express');
const multer = require('multer');
const { body, param, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkAdmin = require('../middleware/checkAdmin');
const checkParticipant = require('../middleware/checkParticipant');
const participantController = require('../controllers/participantController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPG, PNG are allowed.'));
    }
    return cb(null, true);
  }
});

router.get(
  '/',
  [auth, checkAdmin, query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()],
  participantController.getParticipants
);

router.get('/me', [auth, checkParticipant], participantController.getMe);

router.get('/:id', [auth, param('id').isUUID()], participantController.getParticipantById);

router.put(
  '/:id',
  [
    auth,
    checkParticipant,
    param('id').isUUID(),
    body('ndis_number').optional({ nullable: true }).isString(),
    body('first_name').optional({ nullable: true }).isString(),
    body('last_name').optional({ nullable: true }).isString(),
    body('phone').optional({ nullable: true }).isString(),
    body('address').optional({ nullable: true }).isString(),
    body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }).toFloat(),
    body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }).toFloat(),
    body('plan_manager_name').optional({ nullable: true }).isString(),
    body('plan_manager_email').optional({ nullable: true }).isEmail().normalizeEmail(),
    body('plan_manager_phone').optional({ nullable: true }).isString(),
    body('monthly_budget').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('management_type').optional({ nullable: true }).isIn(['self', 'plan_managed', 'ndia'])
  ],
  participantController.updateParticipant
);

router.post(
  '/verify-ndis',
  [auth, checkParticipant, body('ndisNumber').isString().withMessage('ndisNumber is required')],
  participantController.verifyNDIS
);

router.post(
  '/me/profile-photo',
  [auth, checkParticipant, upload.single('file')],
  participantController.uploadProfilePhoto
);

module.exports = router;
