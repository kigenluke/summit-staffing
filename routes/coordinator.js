const express = require('express');
const { param } = require('express-validator');

const auth = require('../middleware/auth');
const checkCoordinator = require('../middleware/checkCoordinator');
const checkParticipant = require('../middleware/checkParticipant');
const coordinatorController = require('../controllers/coordinatorController');

const router = express.Router();

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

module.exports = router;
