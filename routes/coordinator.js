const express = require('express');
const { param, query } = require('express-validator');

const auth = require('../middleware/auth');
const checkCoordinator = require('../middleware/checkCoordinator');
const checkParticipant = require('../middleware/checkParticipant');
const coordinatorController = require('../controllers/coordinatorController');

const router = express.Router();

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
