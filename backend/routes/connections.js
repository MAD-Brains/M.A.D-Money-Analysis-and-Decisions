const express = require('express');
const router = express.Router();
const { 
  getUserByUsername, 
  getUserByEmail, 
  getConnection, 
  insertConnection, 
  getPendingRequests, 
  updateConnectionStatus,
  insertNotification,
  getUserById,
  insertFriend
} = require('../db');

router.post('/request', (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({ success: false, error: 'Username or email required' });
    }

    const trimmed = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    
    const targetUser = isEmail 
      ? getUserByEmail.get({ email: trimmed }) 
      : getUserByUsername.get({ username: trimmed });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (targetUser.id === req.session.userId) {
      return res.status(400).json({ success: false, error: 'You cannot add yourself' });
    }

    const existingConn = getConnection.get({ 
      userId1: req.session.userId, 
      userId2: targetUser.id 
    });

    if (existingConn) {
      if (existingConn.status === 'accepted') {
        return res.status(400).json({ success: false, error: 'Already friends' });
      }
      return res.status(400).json({ success: false, error: 'Connection request already exists' });
    }

    // Create pending connection
    insertConnection.run({
      requesterId: req.session.userId,
      addresseeId: targetUser.id
    });

    // Get current user info for notification
    const me = getUserById.get({ id: req.session.userId });
    const displayName = me.displayName || me.username;

    // Send notification
    insertNotification.run({
      userId: targetUser.id,
      type: 'friend_request',
      message: `${displayName} sent you a friend request.`,
      relatedId: req.session.userId
    });

    // Dummy log for Email
    console.log(`[EMAIL MOCK] To: ${targetUser.email} -> You have a new friend request from ${displayName}`);

    return res.json({ success: true, message: 'Friend request sent' });
  } catch (err) {
    console.error('POST /connections/request error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/pending', (req, res) => {
  try {
    const requests = getPendingRequests.all({ userId: req.session.userId });
    return res.json({ success: true, requests });
  } catch (err) {
    console.error('GET /connections/pending error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/accept/:id', (req, res) => {
  try {
    const connId = parseInt(req.params.id, 10);
    const result = updateConnectionStatus.run({ 
      status: 'accepted', 
      id: connId, 
      addresseeId: req.session.userId 
    });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or unauthorized' });
    }

    // Also populate the old `friends` table for backward compatibility in Phase B
    // Wait, let's keep it simple. The user might want the old splits to work.
    // I won't do `insertFriend` yet, because the frontend split picker relies on `GET /friends`.
    // Actually, Phase C will rebuild the Split picker. For now, this is just linking.

    return res.json({ success: true });
  } catch (err) {
    console.error('POST /connections/accept error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
