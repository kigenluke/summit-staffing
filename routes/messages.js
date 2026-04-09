const express = require('express');
const { body, query, param } = require('express-validator');

const auth = require('../middleware/auth');
const messageController = require('../controllers/messageController');

const router = express.Router();

router.get('/recipients', [auth], messageController.getMessageRecipients);
router.get('/conversations', [auth], messageController.getConversations);

router.get(
  '/:conversationId',
  [auth, param('conversationId').isString(), query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()],
  messageController.getMessages
);

router.post(
  '/send',
  [auth, body('receiverId').isUUID().withMessage('receiverId is required'), body('messageText').isString().isLength({ min: 1, max: 2000 })],
  messageController.sendMessage
);

router.put(
  '/:messageId/read',
  [auth, param('messageId').isUUID().withMessage('messageId is required')],
  messageController.markAsRead
);

module.exports = router;
