const express = require('express');
const router = express.Router();
const {
  getUserByUsername,
  getUserByEmail,
  getConnection,
  insertConnection,
  getPendingRequests,
  updateConnectionStatus,
  getAcceptedConnections,
  insertNotification,
  getUserById,
  insertFriend
} = require('../db');

router.post('/request', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({ success: false, error: 'Username or email required' });
    }

    const trimmed = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    
    const targetUser = isEmail 
      ? await getUserByEmail({ email: trimmed }) 
      : await getUserByUsername({ username: trimmed });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (targetUser.id === req.session.userId) {
      return res.status(400).json({ success: false, error: 'You cannot add yourself' });
    }

    const existingConn = await getConnection({ 
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
    await insertConnection({
      requesterId: req.session.userId,
      addresseeId: targetUser.id
    });

    // Get current user info for notification
    const me = await getUserById({ id: req.session.userId });
    const displayName = me.displayName || me.username;

    // Send notification
    await insertNotification({
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

router.get('/accepted', async (req, res) => {
  try {
    const connections = await getAcceptedConnections({ userId: req.session.userId });
    return res.json({ success: true, connections });
  } catch (err) {
    console.error('GET /connections/accepted error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/pending', async (req, res) => {
  try {
    const requests = await getPendingRequests({ userId: req.session.userId });
    return res.json({ success: true, requests });
  } catch (err) {
    console.error('GET /connections/pending error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/accept/:id', async (req, res) => {
  try {
    const connId = parseInt(req.params.id, 10);
    const result = await updateConnectionStatus({ 
      status: 'accepted', 
      id: connId, 
      addresseeId: req.session.userId 
    });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or unauthorized' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('POST /connections/accept error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
