const express = require('express');
const router = express.Router();
const { getAllFriends } = require('../db');

/**
 * GET /api/friends
 * Fetch all friends for the split picker and autocomplete.
 */
router.get('/', (req, res) => {
  try {
    const friends = getAllFriends.all({ userId: req.session.userId });
    return res.json({ success: true, friends });
  } catch (err) {
    console.error('GET /friends error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
