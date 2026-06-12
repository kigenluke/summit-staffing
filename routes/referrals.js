const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const referralController = require('../controllers/referralController');

router.post('/link', auth, referralController.createReferralLink);
router.post('/send', auth, referralController.sendReferralInvite);
router.get('/validate', referralController.validateReferralToken);

module.exports = router;
