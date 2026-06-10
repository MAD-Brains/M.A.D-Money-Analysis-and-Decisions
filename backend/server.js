require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const { db } = require('./db');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const insightRoutes = require('./routes/insights');
const goalRoutes = require('./routes/goals');
const automationRoutes = require('./routes/automation');
const ledgerRoutes = require('./routes/ledger');
const friendRoutes = require('./routes/friends');
const connectionsRoutes = require('./routes/connections');
const notificationsRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

// Serve frontend static files (no cache in dev for instant updates)
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}));

// Serve user uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', requireAuth, transactionRoutes);
app.use('/api/insights', requireAuth, insightRoutes);
app.use('/api/goals', requireAuth, goalRoutes);
app.use('/api/automation', requireAuth, automationRoutes);
app.use('/api/ledger', requireAuth, ledgerRoutes);
app.use('/api/friends', requireAuth, friendRoutes);
app.use('/api/connections', requireAuth, connectionsRoutes);
app.use('/api/notifications', requireAuth, notificationsRoutes);

// Fallback: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n  🔥 MAD server running at http://localhost:${PORT}\n`);
});
