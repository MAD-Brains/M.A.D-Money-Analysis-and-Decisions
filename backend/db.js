const { Pool } = require('pg');

// ─── Connection Pool ───
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : false),
});

// Log connection errors (don't crash)
pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

// ─── Table Creation ───
async function initDB() {
  const client = await pool.connect();
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "displayName" TEXT,
        "avatarUrl" TEXT,
        "googleId" TEXT,
        "monthlyIncome" REAL DEFAULT 0,
        language TEXT NOT NULL DEFAULT 'en',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Partial unique index for googleId
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_googleid
      ON users("googleId") WHERE "googleId" IS NOT NULL
    `);

    // Create transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL DEFAULT 'local-user',
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category TEXT NOT NULL,
        note TEXT,
        date TEXT NOT NULL,
        "isIncorrect" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create goals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL DEFAULT 'local-user',
        title TEXT NOT NULL,
        "targetAmount" REAL NOT NULL,
        "currentAmount" REAL NOT NULL DEFAULT 0,
        "durationMonths" INTEGER NOT NULL,
        priority INTEGER NOT NULL CHECK(priority IN (1, 2, 3)),
        "targetDate" TEXT NOT NULL,
        "monthlyRequired" REAL NOT NULL,
        "isCompleted" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create recurring_bills table
    await client.query(`
      CREATE TABLE IF NOT EXISTS recurring_bills (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL DEFAULT 'local-user',
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT,
        frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
        "dueDate" TEXT NOT NULL,
        "lastLoggedDate" TEXT,
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create friends table
    await client.query(`
      CREATE TABLE IF NOT EXISTS friends (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL DEFAULT 'local-user',
        name TEXT NOT NULL,
        "upiId" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create splits table
    await client.query(`
      CREATE TABLE IF NOT EXISTS splits (
        id SERIAL PRIMARY KEY,
        "transactionId" INTEGER NOT NULL REFERENCES transactions(id),
        "friendId" INTEGER NOT NULL REFERENCES friends(id),
        "splitAmount" REAL NOT NULL,
        "isSettled" INTEGER NOT NULL DEFAULT 0,
        "settledDate" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create connections table
    await client.query(`
      CREATE TABLE IF NOT EXISTS connections (
        id SERIAL PRIMARY KEY,
        "requesterId" INTEGER NOT NULL REFERENCES users(id),
        "addresseeId" INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected', 'blocked')) DEFAULT 'pending',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        "relatedId" INTEGER,
        "isRead" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create expenses table (Phase C: Shared Expense Schema)
    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        "transactionId" INTEGER NOT NULL REFERENCES transactions(id),
        "payerId" INTEGER REFERENCES users(id),
        "totalAmount" REAL NOT NULL,
        description TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create expense_participants table (Phase C)
    await client.query(`
      CREATE TABLE IF NOT EXISTS expense_participants (
        id SERIAL PRIMARY KEY,
        "expenseId" INTEGER NOT NULL REFERENCES expenses(id),
        "userId" INTEGER REFERENCES users(id),
        "legacyFriendName" TEXT,
        "shareAmount" REAL NOT NULL,
        "isSettled" INTEGER NOT NULL DEFAULT 0,
        "settledDate" TEXT,
        "settledByUserId" INTEGER REFERENCES users(id),
        "isLocalOnly" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_payerid ON expenses("payerId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_transactionid ON expenses("transactionId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expense_participants_expenseid ON expense_participants("expenseId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expense_participants_userid ON expense_participants("userId")`);

    console.log('  ✅ PostgreSQL tables initialized');
  } catch (err) {
    console.error('  ❌ DB initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════
// Async query functions (replacing prepared statements)
// ═══════════════════════════════════════════════

// ─── Transactions ───

async function insertTransaction({ userId, amount, type, category, note, date }) {
  const { rows } = await pool.query(
    `INSERT INTO transactions ("userId", amount, type, category, note, date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, amount, type, category, note, date]
  );
  return rows[0];
}

async function getRecentTransactions({ userId }) {
  const { rows } = await pool.query(
    `SELECT id, amount, type, category, note, date, "createdAt"
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1
     ORDER BY "createdAt" DESC
     LIMIT 5`,
    [userId]
  );
  return rows;
}

async function getAllTransactions({ userId }) {
  const { rows } = await pool.query(
    `SELECT id, amount, type, category, note, date, "createdAt"
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1
     ORDER BY "createdAt" DESC`,
    [userId]
  );
  return rows;
}

async function updateTransaction({ id, userId, amount, note, category, type }) {
  const result = await pool.query(
    `UPDATE transactions
     SET amount = $1, note = $2, category = $3, type = $4
     WHERE id = $5 AND "userId" = $6 AND "isIncorrect" = 0`,
    [amount, note, category, type, id, userId]
  );
  return { changes: result.rowCount };
}

async function softDeleteTransaction({ id, userId }) {
  const result = await pool.query(
    `UPDATE transactions SET "isIncorrect" = 1 WHERE id = $1 AND "userId" = $2`,
    [id, userId]
  );
  return { changes: result.rowCount };
}

// ─── Health Score Queries (current calendar month) ───

async function getCurrentMonthTotals({ userId }) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS "totalIncome",
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "totalExpense"
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1
       AND TO_CHAR("createdAt", 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`,
    [userId]
  );
  return rows[0];
}

async function getCategoryBreakdown({ userId }) {
  const { rows } = await pool.query(
    `SELECT category, SUM(amount) AS total
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1
       AND type = 'expense'
       AND TO_CHAR("createdAt", 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')
     GROUP BY category`,
    [userId]
  );
  return rows;
}

async function getActiveDays({ userId }) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT "createdAt"::date) AS "activeDays"
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1
       AND TO_CHAR("createdAt", 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`,
    [userId]
  );
  return rows[0];
}

async function getTransactionCount({ userId }) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1`,
    [userId]
  );
  return rows[0];
}

// ─── Insights Queries ───

async function getDailySpending({ userId }) {
  const { rows } = await pool.query(
    `SELECT "createdAt"::date AS day,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1
       AND "createdAt" >= NOW() - INTERVAL '30 days'
     GROUP BY "createdAt"::date
     ORDER BY day ASC`,
    [userId]
  );
  return rows;
}

async function getMonthSummary({ userId }) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS "totalIncome",
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "totalExpense",
       COUNT(CASE WHEN type = 'expense' THEN 1 END) AS "expenseCount",
       COUNT(CASE WHEN type = 'income' THEN 1 END) AS "incomeCount"
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1
       AND TO_CHAR("createdAt", 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`,
    [userId]
  );
  return rows[0];
}

async function getAllCategoryBreakdown({ userId }) {
  const { rows } = await pool.query(
    `SELECT category, type, SUM(amount) AS total, COUNT(*) AS count
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1
       AND TO_CHAR("createdAt", 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')
     GROUP BY category, type
     ORDER BY total DESC`,
    [userId]
  );
  return rows;
}

// ─── Goals Queries ───

async function insertGoal({ userId, title, targetAmount, durationMonths, priority, targetDate, monthlyRequired }) {
  const { rows } = await pool.query(
    `INSERT INTO goals ("userId", title, "targetAmount", "durationMonths", priority, "targetDate", "monthlyRequired")
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, title, targetAmount, durationMonths, priority, targetDate, monthlyRequired]
  );
  return rows[0];
}

async function getActiveGoals({ userId }) {
  const { rows } = await pool.query(
    `SELECT id, title, "targetAmount", "currentAmount", "durationMonths", priority, "targetDate", "monthlyRequired", "isCompleted", "createdAt"
     FROM goals
     WHERE "userId" = $1
     ORDER BY priority DESC, "createdAt" ASC`,
    [userId]
  );
  return rows;
}

async function updateGoalProgress({ id, userId, currentAmount, isCompleted }) {
  const result = await pool.query(
    `UPDATE goals
     SET "currentAmount" = $1, "isCompleted" = $2
     WHERE id = $3 AND "userId" = $4`,
    [currentAmount, isCompleted, id, userId]
  );
  return { changes: result.rowCount };
}

async function getGoalById({ id, userId }) {
  const { rows } = await pool.query(
    `SELECT id, title, "targetAmount", "currentAmount", "durationMonths", priority, "targetDate", "monthlyRequired", "isCompleted", "createdAt"
     FROM goals
     WHERE id = $1 AND "userId" = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function deleteGoal({ id, userId }) {
  const result = await pool.query(
    `DELETE FROM goals WHERE id = $1 AND "userId" = $2`,
    [id, userId]
  );
  return { changes: result.rowCount };
}

async function getHistoricalSavings({ userId }) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount WHEN category = 'Finance' THEN 0 ELSE -amount END), 0) AS "netSavings",
       COALESCE(COUNT(DISTINCT TO_CHAR("createdAt", 'YYYY-MM')), 1) AS "monthCount"
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1`,
    [userId]
  );
  return rows[0];
}

// ─── Goals: inline queries moved from routes/goals.js ───

async function getHistoricalIncomeAverage(userId) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount), 0) AS "totalIncome",
       COALESCE(COUNT(DISTINCT TO_CHAR("createdAt", 'YYYY-MM')), 1) AS "monthCount"
     FROM transactions
     WHERE "isIncorrect" = 0 AND type = 'income' AND "userId" = $1`,
    [userId]
  );
  const row = rows[0];
  return row.totalIncome / Math.max(row.monthCount, 1);
}

async function getAllTimeTotals({ userId }) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS "totalIncome",
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "totalExpense"
     FROM transactions
     WHERE "isIncorrect" = 0 AND "userId" = $1`,
    [userId]
  );
  return rows[0];
}

async function getFinanceCategoryTotal({ userId }) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE "isIncorrect" = 0 AND type = 'expense' AND category = 'Finance' AND "userId" = $1`,
    [userId]
  );
  return rows[0];
}

// ─── Automation Queries ───

async function insertRecurringBill({ userId, amount, category, note, frequency, dueDate }) {
  const { rows } = await pool.query(
    `INSERT INTO recurring_bills ("userId", amount, category, note, frequency, "dueDate")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, amount, category, note, frequency, dueDate]
  );
  return rows[0];
}

async function getRecurringBills({ userId }) {
  const { rows } = await pool.query(
    `SELECT id, amount, category, note, frequency, "dueDate", "lastLoggedDate", "isActive", "createdAt"
     FROM recurring_bills
     WHERE "isActive" = 1 AND "userId" = $1
     ORDER BY "dueDate" ASC`,
    [userId]
  );
  return rows;
}

async function updateRecurringBillDueDate({ id, userId, dueDate, lastLoggedDate }) {
  const result = await pool.query(
    `UPDATE recurring_bills
     SET "dueDate" = $1, "lastLoggedDate" = $2
     WHERE id = $3 AND "userId" = $4`,
    [dueDate, lastLoggedDate, id, userId]
  );
  return { changes: result.rowCount };
}

async function deleteRecurringBill({ id, userId }) {
  const result = await pool.query(
    `UPDATE recurring_bills SET "isActive" = 0 WHERE id = $1 AND "userId" = $2`,
    [id, userId]
  );
  return { changes: result.rowCount };
}

// ─── Automation: inline queries moved from routes/automation.js ───

async function getRecurringBillById(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM recurring_bills WHERE id = $1 AND "userId" = $2 AND "isActive" = 1`,
    [id, userId]
  );
  return rows[0] || null;
}

async function getQuickLogs({ userId }) {
  const { rows } = await pool.query(
    `SELECT
       amount,
       category,
       note,
       COUNT(*) AS frequency
     FROM transactions
     WHERE "isIncorrect" = 0
       AND "userId" = $1
       AND type = 'expense'
       AND "createdAt" >= NOW() - INTERVAL '30 days'
     GROUP BY amount, category, COALESCE(note, '')
     ORDER BY frequency DESC
     LIMIT 4`,
    [userId]
  );
  return rows;
}

// ─── Insights: inline queries moved from routes/insights.js ───

async function getActiveRecurringBills({ userId }) {
  const { rows } = await pool.query(
    `SELECT amount, category, COALESCE(note, '') AS note
     FROM recurring_bills
     WHERE "isActive" = 1 AND "userId" = $1`,
    [userId]
  );
  return rows;
}

async function getFrequentTransactions({ userId }) {
  const { rows } = await pool.query(
    `SELECT amount, category, note, COUNT(*) AS frequency
     FROM transactions
     WHERE "isIncorrect" = 0
       AND "userId" = $1
       AND type = 'expense'
       AND "createdAt" >= NOW() - INTERVAL '30 days'
     GROUP BY amount, category, COALESCE(note, '')
     HAVING COUNT(*) >= 3
     ORDER BY frequency DESC
     LIMIT 2`,
    [userId]
  );
  return rows;
}

// ─── Phase 5: Ledger / Splits Queries ───

async function insertFriend({ userId, name }) {
  const { rows } = await pool.query(
    `INSERT INTO friends ("userId", name) VALUES ($1, $2) RETURNING id`,
    [userId, name]
  );
  return rows[0];
}

async function getFriendByName({ name, userId }) {
  const { rows } = await pool.query(
    `SELECT id, name, "upiId" FROM friends WHERE lower(name) = lower($1) AND "userId" = $2`,
    [name, userId]
  );
  return rows[0] || null;
}

async function getAllFriends({ userId }) {
  const { rows } = await pool.query(
    `SELECT id, name, "upiId" FROM friends WHERE "userId" = $1 ORDER BY name ASC`,
    [userId]
  );
  return rows;
}

async function insertSplit({ transactionId, friendId, splitAmount }) {
  const { rows } = await pool.query(
    `INSERT INTO splits ("transactionId", "friendId", "splitAmount")
     VALUES ($1, $2, $3) RETURNING id`,
    [transactionId, friendId, splitAmount]
  );
  return rows[0];
}

async function getLedgerBalances({ userId }) {
  const { rows } = await pool.query(
    `SELECT f.id AS "friendId", f.name, f."upiId", SUM(s."splitAmount") AS "netBalance"
     FROM friends f
     LEFT JOIN splits s ON f.id = s."friendId" AND s."isSettled" = 0
     WHERE f."userId" = $1
     GROUP BY f.id, f.name, f."upiId"`,
    [userId]
  );
  return rows;
}

async function settleFriendDebts({ friendId }) {
  const result = await pool.query(
    `UPDATE splits
     SET "isSettled" = 1, "settledDate" = NOW()::text
     WHERE "friendId" = $1 AND "isSettled" = 0`,
    [friendId]
  );
  return { changes: result.rowCount };
}

async function getFriendById({ id, userId }) {
  const { rows } = await pool.query(
    `SELECT id, name, "upiId" FROM friends WHERE id = $1 AND "userId" = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function getFriendSplitDetails({ friendId, userId }) {
  const { rows } = await pool.query(
    `SELECT
       s.id, s."splitAmount", s."isSettled", s."settledDate", s."createdAt",
       t.id AS "transactionId", t.note, t.category, t.date, t.amount AS "transactionAmount"
     FROM splits s
     JOIN transactions t ON t.id = s."transactionId"
     JOIN friends f ON f.id = s."friendId"
     WHERE s."friendId" = $1 AND f."userId" = $2 AND t."isIncorrect" = 0
     ORDER BY t."createdAt" DESC`,
    [friendId, userId]
  );
  return rows;
}

async function getSplitWithOwnership({ splitId, userId }) {
  const { rows } = await pool.query(
    `SELECT s.id, s."transactionId", s."friendId", s."splitAmount", s."isSettled",
            t."userId", t.amount AS "transactionAmount"
     FROM splits s
     JOIN transactions t ON t.id = s."transactionId"
     WHERE s.id = $1 AND t."userId" = $2`,
    [splitId, userId]
  );
  return rows[0] || null;
}

async function getSplitsForTransaction({ transactionId }) {
  const { rows } = await pool.query(
    `SELECT id, "splitAmount" FROM splits WHERE "transactionId" = $1`,
    [transactionId]
  );
  return rows;
}

// ─── Auth / Users Queries ───

async function insertUser({ username, email, passwordHash, displayName }) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, "passwordHash", "displayName")
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [username, email, passwordHash, displayName]
  );
  return rows[0];
}

async function getUserByEmail({ email }) {
  const { rows } = await pool.query(
    `SELECT id, username, email, "passwordHash", "displayName", "avatarUrl", "monthlyIncome", "googleId", language, "createdAt"
     FROM users WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

async function getUserByUsername({ username }) {
  const { rows } = await pool.query(
    `SELECT id, username, email, "passwordHash", "displayName", "avatarUrl", "monthlyIncome", "googleId", language, "createdAt"
     FROM users WHERE lower(username) = lower($1)`,
    [username]
  );
  return rows[0] || null;
}

async function getUserByGoogleId({ googleId }) {
  const { rows } = await pool.query(
    `SELECT id, username, email, "passwordHash", "displayName", "avatarUrl", "monthlyIncome", "googleId", language, "createdAt"
     FROM users WHERE "googleId" = $1`,
    [googleId]
  );
  return rows[0] || null;
}

async function linkGoogleId({ googleId, id }) {
  const result = await pool.query(
    `UPDATE users SET "googleId" = $1 WHERE id = $2`,
    [googleId, id]
  );
  return { changes: result.rowCount };
}

async function insertGoogleUser({ username, email, passwordHash, displayName, avatarUrl, googleId }) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, "passwordHash", "displayName", "avatarUrl", "googleId")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [username, email, passwordHash, displayName, avatarUrl, googleId]
  );
  return rows[0];
}

async function getUserById({ id }) {
  const { rows } = await pool.query(
    `SELECT id, username, email, "displayName", "avatarUrl", "monthlyIncome", language, "createdAt"
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function searchUsersByEmailOrUsername({ query, excludeUserId }) {
  const { rows } = await pool.query(
    `SELECT id, username, email, "displayName", "avatarUrl", "monthlyIncome"
     FROM users
     WHERE (lower(username) LIKE lower($1) OR lower(email) LIKE lower($1)) AND id != $2
     ORDER BY username ASC
     LIMIT 20`,
    [query, excludeUserId]
  );
  return rows;
}

async function updateUserProfile({ displayName, email, monthlyIncome, language, id }) {
  const result = await pool.query(
    `UPDATE users SET "displayName" = $1, email = $2, "monthlyIncome" = $3, language = $4 WHERE id = $5`,
    [displayName, email, monthlyIncome, language, id]
  );
  return { changes: result.rowCount };
}

async function updateUserPassword({ passwordHash, id }) {
  const result = await pool.query(
    `UPDATE users SET "passwordHash" = $1 WHERE id = $2`,
    [passwordHash, id]
  );
  return { changes: result.rowCount };
}

async function updateUserAvatar({ avatarUrl, id }) {
  const result = await pool.query(
    `UPDATE users SET "avatarUrl" = $1 WHERE id = $2`,
    [avatarUrl, id]
  );
  return { changes: result.rowCount };
}

async function getUserPasswordHash({ id }) {
  const { rows } = await pool.query(
    `SELECT "passwordHash" FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// ─── Connections & Notifications Queries ───

async function insertConnection({ requesterId, addresseeId }) {
  const { rows } = await pool.query(
    `INSERT INTO connections ("requesterId", "addresseeId", status)
     VALUES ($1, $2, 'pending')
     RETURNING id`,
    [requesterId, addresseeId]
  );
  return rows[0];
}

async function getConnection({ userId1, userId2 }) {
  const { rows } = await pool.query(
    `SELECT * FROM connections
     WHERE ("requesterId" = $1 AND "addresseeId" = $2)
        OR ("requesterId" = $2 AND "addresseeId" = $1)`,
    [userId1, userId2]
  );
  return rows[0] || null;
}

async function getPendingRequests({ userId }) {
  const { rows } = await pool.query(
    `SELECT c.id AS "connectionId", u.id AS "requesterId", u.username, u.email, u."displayName", c."createdAt"
     FROM connections c
     JOIN users u ON c."requesterId" = u.id
     WHERE c."addresseeId" = $1 AND c.status = 'pending'`,
    [userId]
  );
  return rows;
}

async function updateConnectionStatus({ status, id, addresseeId }) {
  const result = await pool.query(
    `UPDATE connections SET status = $1 WHERE id = $2 AND "addresseeId" = $3`,
    [status, id, addresseeId]
  );
  return { changes: result.rowCount };
}

async function getAcceptedConnections({ userId }) {
  const { rows } = await pool.query(
    `SELECT
       CASE WHEN c."requesterId" = $1 THEN c."addresseeId" ELSE c."requesterId" END AS "userId",
       u.username, u."displayName", u."avatarUrl"
     FROM connections c
     JOIN users u ON u.id = CASE WHEN c."requesterId" = $1 THEN c."addresseeId" ELSE c."requesterId" END
     WHERE (c."requesterId" = $1 OR c."addresseeId" = $1) AND c.status = 'accepted'
     ORDER BY u."displayName" ASC, u.username ASC`,
    [userId]
  );
  return rows;
}

async function getConnectedUserByName({ userId, name }) {
  const { rows } = await pool.query(
    `SELECT
       CASE WHEN c."requesterId" = $1 THEN c."addresseeId" ELSE c."requesterId" END AS "userId",
       u.username, u."displayName"
     FROM connections c
     JOIN users u ON u.id = CASE WHEN c."requesterId" = $1 THEN c."addresseeId" ELSE c."requesterId" END
     WHERE (c."requesterId" = $1 OR c."addresseeId" = $1) AND c.status = 'accepted'
       AND (lower(u.username) = lower($2) OR lower(u."displayName") = lower($2))
     LIMIT 1`,
    [userId, name]
  );
  return rows[0] || null;
}

async function insertNotification({ userId, type, message, relatedId }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications ("userId", type, message, "relatedId")
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, type, message, relatedId]
  );
  return rows[0];
}

async function getUnreadNotifications({ userId }) {
  const { rows } = await pool.query(
    `SELECT id, type, message, "relatedId", "createdAt"
     FROM notifications
     WHERE "userId" = $1 AND "isRead" = 0
     ORDER BY "createdAt" DESC`,
    [userId]
  );
  return rows;
}

async function markNotificationsRead({ userId }) {
  const result = await pool.query(
    `UPDATE notifications SET "isRead" = 1 WHERE "userId" = $1 AND "isRead" = 0`,
    [userId]
  );
  return { changes: result.rowCount };
}

module.exports = {
  pool,
  initDB,
  // Transactions
  insertTransaction,
  getRecentTransactions,
  getAllTransactions,
  updateTransaction,
  softDeleteTransaction,
  // Health Score
  getCurrentMonthTotals,
  getCategoryBreakdown,
  getActiveDays,
  getTransactionCount,
  // Insights
  getDailySpending,
  getMonthSummary,
  getAllCategoryBreakdown,
  getActiveRecurringBills,
  getFrequentTransactions,
  // Goals
  insertGoal,
  getActiveGoals,
  updateGoalProgress,
  getGoalById,
  deleteGoal,
  getHistoricalSavings,
  getHistoricalIncomeAverage,
  getAllTimeTotals,
  getFinanceCategoryTotal,
  // Automation
  insertRecurringBill,
  getRecurringBills,
  updateRecurringBillDueDate,
  deleteRecurringBill,
  getRecurringBillById,
  getQuickLogs,
  // Ledger / Splits
  insertFriend,
  getFriendByName,
  getAllFriends,
  insertSplit,
  getLedgerBalances,
  settleFriendDebts,
  getFriendById,
  getFriendSplitDetails,
  getSplitWithOwnership,
  getSplitsForTransaction,
  // Users / Auth
  insertUser,
  getUserByEmail,
  getUserByUsername,
  getUserByGoogleId,
  linkGoogleId,
  insertGoogleUser,
  getUserById,
  searchUsersByEmailOrUsername,
  updateUserProfile,
  updateUserPassword,
  updateUserAvatar,
  getUserPasswordHash,
  // Connections & Notifications
  insertConnection,
  getConnection,
  getPendingRequests,
  updateConnectionStatus,
  getAcceptedConnections,
  getConnectedUserByName,
  insertNotification,
  getUnreadNotifications,
  markNotificationsRead,
};
