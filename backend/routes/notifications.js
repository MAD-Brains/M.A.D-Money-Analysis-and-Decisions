const express = require('express');
const router = express.Router();
const { getUnreadNotifications, markNotificationsRead } = require('../db');

router.get('/', async (req, res) => {
  try {
    const unread = await getUnreadNotifications({ userId: req.session.userId });
    return res.json({ success: true, notifications: unread });
  } catch (err) {
    console.error('GET /notifications error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/read', async (req, res) => {
  try {
    await markNotificationsRead({ userId: req.session.userId });
    return res.json({ success: true });
  } catch (err) {
    console.error('POST /notifications/read error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
