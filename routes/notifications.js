const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// Get all notifications (paginated)
router.get('/', auth, notificationController.getNotifications);

// Get unread count
router.get('/unread-count', auth, notificationController.getUnreadCount);

// Mark all as read
router.put('/read-all', auth, notificationController.markAllAsRead);

// Mark single as read
router.put('/:id/read', auth, notificationController.markAsRead);

// Delete notification
router.delete('/:id', auth, notificationController.deleteNotification);

module.exports = router;
