const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const checkParticipant = require('../middleware/checkParticipant');
const checkWorker = require('../middleware/checkWorker');
const shiftController = require('../controllers/shiftController');

// Create shift (participants only) - must be defined before GET routes
router.post('/', auth, checkParticipant, shiftController.createShift);

// My shifts (participant's own posted shifts)
router.get('/mine', auth, shiftController.getMyShifts);

// Available shifts (any authenticated user)
router.get('/', auth, shiftController.getAvailableShifts);

// Single shift detail (must be after all other routes)
router.get('/:id', auth, shiftController.getShiftById);

// Apply for shift (workers only)
router.post('/:id/apply', auth, checkWorker, shiftController.applyForShift);

// Accept an application (participant who created the shift)
router.put('/:id/applications/:applicationId/accept', auth, shiftController.acceptApplication);

// Cancel a shift
router.put('/:id/cancel', auth, shiftController.cancelShift);

module.exports = router;
