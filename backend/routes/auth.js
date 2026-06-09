const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { insertUser, getUserByEmail, getUserByUsername, getUserById } = require('../db');

const SALT_ROUNDS = 10;

const USERNAME_RE = /^(?=.{3,20}$)[a-zA-Z0-9_]+(?: [a-zA-Z0-9_]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return { 
    id: user.id, 
    username: user.username, 
    email: user.email, 
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl || null
  };
}

/**
 * POST /api/auth/signup
 * Create a new account, hash the password, and start a session.
 */
router.post('/signup', (req, res) => {
  try {
    const { username, email, password, displayName } = req.body || {};

    if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
      return res.status(400).json({ success: false, error: 'Username must be 3-20 characters (letters, numbers, underscore, single spaces)' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'A valid email is required' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    if (getUserByUsername.get({ username: trimmedUsername })) {
      return res.status(409).json({ success: false, error: 'That username is already taken' });
    }
    if (getUserByEmail.get({ email: trimmedEmail })) {
      return res.status(409).json({ success: false, error: 'An account with that email already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const result = insertUser.run({
      username: trimmedUsername,
      email: trimmedEmail,
      passwordHash,
      displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null,
    });

    const user = getUserById.get({ id: result.lastInsertRowid });
    req.session.userId = user.id;
    return res.status(201).json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('POST /auth/signup error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/auth/login
 * Verify credentials (by username or email) and start a session.
 */
router.post('/login', (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    if (typeof identifier !== 'string' || !identifier.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, error: 'Username/email and password are required' });
    }

    const trimmed = identifier.trim();
    const user = EMAIL_RE.test(trimmed)
      ? getUserByEmail.get({ email: trimmed })
      : getUserByUsername.get({ username: trimmed });

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Incorrect username/email or password' });
    }

    req.session.userId = user.id;
    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('POST /auth/login error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/auth/logout
 * Destroy the current session.
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('POST /auth/logout error:', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

/**
 * GET /api/auth/me
 * Return the current session's user, or 401 if not logged in.
 */
router.get('/me', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  const user = getUserById.get({ id: req.session.userId });
  if (!user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  return res.json({ success: true, user: publicUser(user) });
});

/**
 * PUT /api/auth/me
 * Update the current user's profile (displayName and email).
 */
router.put('/me', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  
  try {
    const { email, displayName } = req.body || {};
    
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'A valid email is required' });
    }

    const trimmedEmail = email.trim();
    const newDisplayName = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null;

    // Check if email belongs to another user
    const existingUser = getUserByEmail.get({ email: trimmedEmail });
    if (existingUser && existingUser.id !== req.session.userId) {
      return res.status(409).json({ success: false, error: 'An account with that email already exists' });
    }

    const { updateUserProfile } = require('../db');
    updateUserProfile.run({
      displayName: newDisplayName,
      email: trimmedEmail,
      id: req.session.userId
    });

    const user = getUserById.get({ id: req.session.userId });
    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('PUT /auth/me error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * PUT /api/auth/password
 * Update the user's password.
 */
router.put('/password', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Valid current password and new password (min 6 chars) are required' });
    }

    const { getUserPasswordHash, updateUserPassword } = require('../db');
    const userRow = getUserPasswordHash.get({ id: req.session.userId });

    if (!userRow || !bcrypt.compareSync(currentPassword, userRow.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Incorrect current password' });
    }

    const newPasswordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
    updateUserPassword.run({
      passwordHash: newPasswordHash,
      id: req.session.userId
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('PUT /auth/password error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/auth/avatar
 * Upload a profile picture as a base64 string
 */
router.post('/avatar', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  try {
    const { avatarBase64 } = req.body;
    if (!avatarBase64 || !avatarBase64.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'Valid base64 image data required' });
    }

    // Extract image format and base64 string
    const matches = avatarBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, error: 'Invalid base64 string' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Save to disk
    const filename = `user_${req.session.userId}_${Date.now()}.${ext}`;
    const filepath = path.join(__dirname, '..', 'uploads', filename);
    fs.writeFileSync(filepath, buffer);

    const avatarUrl = `/uploads/${filename}`;

    // Update DB
    const { updateUserAvatar } = require('../db');
    updateUserAvatar.run({ avatarUrl, id: req.session.userId });

    const user = getUserById.get({ id: req.session.userId });
    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('POST /auth/avatar error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
