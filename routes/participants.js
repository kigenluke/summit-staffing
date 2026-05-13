const express = require('express');
const multer = require('multer');
const { body, param, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkAdmin = require('../middleware/checkAdmin');
const checkParticipant = require('../middleware/checkParticipant');
const participantController = require('../controllers/participantController');
const incidentsController = require('../controllers/incidentsController');

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

const incidentImagesUpload = multer({
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

const participantIncidentMiddlewares = [
  auth,
  checkParticipant,
  incidentImagesUpload.array('images', 5),
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

const participantComplaintMiddlewares = [
  auth,
  checkParticipant,
  incidentImagesUpload.array('images', 5),
  body('complaint_details').isString().isLength({ min: 5, max: 2000 }),
];

router.get(
  '/',
  [auth, checkAdmin, query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()],
  participantController.getParticipants
);

router.get('/me', [auth, checkParticipant], participantController.getMe);

router.put(
  '/me',
  [
    auth,
    checkParticipant,
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
    body('management_type').optional({ nullable: true }).isIn(['self', 'plan_managed', 'ndia']),
    body('about').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('emergency_contact_name').optional({ nullable: true }).isString().isLength({ max: 200 }),
    body('emergency_contact_phone').optional({ nullable: true }).isString().isLength({ max: 40 }),
    body('emergency_contact_relationship').optional({ nullable: true }).isString().isLength({ max: 120 })
  ],
  participantController.updateMe
);

router.get('/me/access-requests', [auth, checkParticipant], participantController.listMyAccessRequests);

router.post(
  '/me/access-requests/:requestId/reject',
  [auth, checkParticipant, param('requestId').isUUID()],
  participantController.rejectCoordinatorAccessRequest
);

router.post(
  '/me/incidents',
  participantIncidentMiddlewares,
  incidentsController.createParticipantIncident
);

router.post(
  '/me/complaints',
  participantComplaintMiddlewares,
  incidentsController.createParticipantComplaint
);

router.post(
  '/invite-coordinator',
  [auth, checkParticipant, body('email').isEmail().normalizeEmail()],
  participantController.inviteCoordinatorByEmail
);

router.get(
  '/search-coordinator',
  [auth, checkParticipant, query('email').isEmail().normalizeEmail()],
  participantController.searchCoordinatorByEmail
);

router.post(
  '/request-coordinator',
  [auth, checkParticipant, body('coordinatorUserId').isUUID()],
  participantController.requestCoordinatorAccess
);

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
    body('management_type').optional({ nullable: true }).isIn(['self', 'plan_managed', 'ndia']),
    body('about').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('emergency_contact_name').optional({ nullable: true }).isString().isLength({ max: 200 }),
    body('emergency_contact_phone').optional({ nullable: true }).isString().isLength({ max: 40 }),
    body('emergency_contact_relationship').optional({ nullable: true }).isString().isLength({ max: 120 })
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
