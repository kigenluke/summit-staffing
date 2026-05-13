const express = require('express');
const { param, query, body } = require('express-validator');

const auth = require('../middleware/auth');
const checkCoordinator = require('../middleware/checkCoordinator');
const checkParticipant = require('../middleware/checkParticipant');
const coordinatorController = require('../controllers/coordinatorController');

const router = express.Router();

router.get('/me/profile', [auth, checkCoordinator], coordinatorController.getMyProfile);
router.put(
  '/me/profile',
  [
    auth,
    checkCoordinator,
    body('first_name').optional({ nullable: true }).isString(),
    body('last_name').optional({ nullable: true }).isString(),
    body('phone').optional({ nullable: true }).isString(),
    body('address').optional({ nullable: true }).isString(),
    body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }).toFloat(),
    body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }).toFloat(),
  ],
  coordinatorController.updateMyProfile
);

router.get('/access-requests', [auth, checkCoordinator], coordinatorController.listCoordinatorAccessRequests);

router.get(
  '/managed-participants/:participantId/profile',
  [auth, checkCoordinator, param('participantId').isUUID()],
  coordinatorController.getManagedParticipantProfile
);

router.post(
  '/managed-participants/:participantId/session-as-participant',
  [auth, checkCoordinator, param('participantId').isUUID()],
  coordinatorController.sessionAsManagedParticipant
);

router.post(
  '/requests/:requestId/reject-participant',
  [auth, checkCoordinator, param('requestId').isUUID()],
  coordinatorController.rejectParticipantInitiatedRequest
);

router.post(
  '/requests/:requestId/withdraw',
  [auth, checkCoordinator, param('requestId').isUUID()],
  coordinatorController.withdrawCoordinatorAccessRequest
);

router.get('/stats', [auth, checkCoordinator], coordinatorController.getStats);
router.get(
  '/search-participant',
  [auth, checkCoordinator, query('email').isEmail().normalizeEmail()],
  coordinatorController.searchParticipantByEmail
);
router.get('/my-participants', [auth, checkCoordinator], coordinatorController.listMyManagedParticipants);
router.get('/participants', [auth, checkCoordinator], coordinatorController.listParticipants);
router.post(
  '/participants/:participantId/request',
  [auth, checkCoordinator, param('participantId').isUUID()],
  coordinatorController.requestParticipantAccess
);
router.post(
  '/requests/:requestId/approve',
  [auth, checkParticipant, param('requestId').isUUID()],
  coordinatorController.approveAccessRequest
);
router.post(
  '/requests/:requestId/approve-participant',
  [auth, checkCoordinator, param('requestId').isUUID()],
  coordinatorController.approveParticipantInitiatedRequest
);

module.exports = router;
