const express = require('express');
const { body } = require('express-validator');

const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

const emailValidator = body('email').isEmail().withMessage('Valid email is required').normalizeEmail();
const passwordValidator = body('password')
  .isString()
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters');

router.post(
  '/register',
  [
    emailValidator,
    passwordValidator,
    body('role')
      .isIn(['worker', 'participant', 'admin'])
      .withMessage("Role must be one of: 'worker', 'participant', 'admin'"),
    body('abn')
      .optional({ nullable: true })
      .isLength({ min: 11, max: 11 })
      .withMessage('ABN must be 11 characters'),
    body('first_name').optional({ nullable: true }).isString(),
    body('last_name').optional({ nullable: true }).isString(),
    body('ndis_number').optional({ nullable: true }).isLength({ min: 10, max: 10 }),
    body('who_needs_support').optional({ nullable: true }).isString(),
    body('when_start_looking').optional({ nullable: true }).isString(),
    body('over_18').optional({ nullable: true }).isBoolean(),
    body('funding_type').optional({ nullable: true }).isString(),
    body('address').optional({ nullable: true }).isString(),
    body('work_as').optional({ nullable: true }).isIn(['individual', 'vendor']),
    body('vendor_categories').optional({ nullable: true }).isArray({ min: 1 }),
    body('vendor_categories.*').optional({ nullable: true }).isString().isLength({ min: 2, max: 100 })
  ],
  (req, res, next) => {
    // Enforce required worker fields
    if (req.body.role === 'worker') {
      if (!req.body.abn || !req.body.first_name || !req.body.last_name) {
        return res.status(400).json({
          ok: false,
          error: 'Worker registration requires abn, first_name, last_name'
        });
      }
      if (req.body.work_as === 'vendor' && (!Array.isArray(req.body.vendor_categories) || req.body.vendor_categories.length === 0)) {
        return res.status(400).json({
          ok: false,
          error: 'Vendor registration requires at least one vendor category'
        });
      }
    }
    return next();
  },
  authController.register
);

router.post('/login', [emailValidator, body('password').isString()], authController.login);

router.post('/forgot-password', [emailValidator], authController.forgotPassword);

router.post(
  '/reset-password',
  [
    body('token').isString().isLength({ min: 10 }).withMessage('Reset token is required'),
    body('newPassword')
      .isString()
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters')
  ],
  authController.resetPassword
);

router.post('/verify-email', [body('token').isString().isLength({ min: 10 }).withMessage('Verification token is required')], authController.verifyEmail);

router.post('/refresh', auth, authController.refreshToken);
router.delete('/account', auth, authController.deleteAccount);

module.exports = router;
