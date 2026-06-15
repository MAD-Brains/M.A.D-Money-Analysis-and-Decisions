require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool, initDB } = require('./db');
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
const splitsRoutes = require('./routes/splits');
const groupsRoutes = require('./routes/groups');

const app = express();
const PORT = process.env.PORT || 3002;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : true;

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Trust proxy in production (Render, etc.) for secure cookies
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

// Serve frontend static files (only in local dev when no separate frontend URL)
if (!process.env.FRONTEND_URL) {
  app.use(express.static(path.join(__dirname, '..', 'frontend'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }));
}

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
app.use('/api/splits', requireAuth, splitsRoutes);
app.use('/api/groups', requireAuth, groupsRoutes);

// Fallback: serve index.html for any non-API route (local dev only)
if (!process.env.FRONTEND_URL) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  });
}

// Start server — async to initialize DB first
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`\n  🔥 MAD server running at http://localhost:${PORT}`);
      console.log(`  📦 Database: PostgreSQL (Neon)`);
      if (process.env.FRONTEND_URL) {
        console.log(`  🌐 Frontend: ${process.env.FRONTEND_URL}`);
      } else {
        console.log(`  🌐 Frontend: served locally`);
      }
      console.log();
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
