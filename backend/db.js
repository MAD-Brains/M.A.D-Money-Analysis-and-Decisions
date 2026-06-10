const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.MAD_DB_PATH 
  ? path.resolve(process.env.MAD_DB_PATH) 
  : path.join(__dirname, 'mad.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    displayName TEXT,
    avatarUrl TEXT,
    googleId TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN avatarUrl TEXT');
} catch (e) {
  // Column already exists, ignore
}

// Migration for monthlyIncome
try {
  db.exec('ALTER TABLE users ADD COLUMN monthlyIncome REAL DEFAULT 0');
} catch (e) {
  // Column already exists, ignore
}

// Migration for googleId (Sign in with Google)
try {
  db.exec('ALTER TABLE users ADD COLUMN googleId TEXT');
} catch (e) {
  // Column already exists, ignore
}
// Partial unique index — SQLite ALTER TABLE can't add UNIQUE directly;
// allows many NULLs (non-Google accounts) but enforces uniqueness when set.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_googleId ON users(googleId) WHERE googleId IS NOT NULL');

// Create transactions table
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL DEFAULT 'local-user',
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    category TEXT NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    isIncorrect INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// Create goals table
db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL DEFAULT 'local-user',
    title TEXT NOT NULL,
    targetAmount REAL NOT NULL,
    currentAmount REAL NOT NULL DEFAULT 0,
    durationMonths INTEGER NOT NULL,
    priority INTEGER NOT NULL CHECK(priority IN (1, 2, 3)),
    targetDate TEXT NOT NULL,
    monthlyRequired REAL NOT NULL,
    isCompleted INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// Create recurring_bills table
db.exec(`
  CREATE TABLE IF NOT EXISTS recurring_bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL DEFAULT 'local-user',
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    note TEXT,
    frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    dueDate TEXT NOT NULL,
    lastLoggedDate TEXT,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// Create friends table
db.exec(`
  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL DEFAULT 'local-user',
    name TEXT NOT NULL,
    upiId TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// Create splits table
db.exec(`
  CREATE TABLE IF NOT EXISTS splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transactionId INTEGER NOT NULL,
    friendId INTEGER NOT NULL,
    splitAmount REAL NOT NULL,
    isSettled INTEGER NOT NULL DEFAULT 0,
    settledDate TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(transactionId) REFERENCES transactions(id),
    FOREIGN KEY(friendId) REFERENCES friends(id)
  )
`);

// Create connections table (Phase B)
db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requesterId INTEGER NOT NULL,
    addresseeId INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected', 'blocked')) DEFAULT 'pending',
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(requesterId) REFERENCES users(id),
    FOREIGN KEY(addresseeId) REFERENCES users(id)
  )
`);

// Create notifications table
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    relatedId INTEGER,
    isRead INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(userId) REFERENCES users(id)
  )
`);

// Create expenses table (Phase C: Shared Expense Schema)
// One row per shared expense, owned by the account that paid (payerId).
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transactionId INTEGER NOT NULL,
    payerId INTEGER,
    totalAmount REAL NOT NULL,
    description TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(transactionId) REFERENCES transactions(id),
    FOREIGN KEY(payerId) REFERENCES users(id)
  )
`);

// Create expense_participants table (Phase C: Shared Expense Schema)
// One row per non-payer share. userId is set for linked accounts;
// legacyFriendName + isLocalOnly mark migrated free-text "friend" shares.
db.exec(`
  CREATE TABLE IF NOT EXISTS expense_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expenseId INTEGER NOT NULL,
    userId INTEGER,
    legacyFriendName TEXT,
    shareAmount REAL NOT NULL,
    isSettled INTEGER NOT NULL DEFAULT 0,
    settledDate TEXT,
    settledByUserId INTEGER,
    isLocalOnly INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(expenseId) REFERENCES expenses(id),
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(settledByUserId) REFERENCES users(id)
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_payerId ON expenses(payerId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_transactionId ON expenses(transactionId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_expense_participants_expenseId ON expense_participants(expenseId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_expense_participants_userId ON expense_participants(userId)`);

// Prepared statements for performance
const insertTransaction = db.prepare(`
  INSERT INTO transactions (userId, amount, type, category, note, date)
  VALUES (@userId, @amount, @type, @category, @note, @date)
`);

const getRecentTransactions = db.prepare(`
  SELECT id, amount, type, category, note, date, createdAt
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
  ORDER BY createdAt DESC
  LIMIT 5
`);

const getAllTransactions = db.prepare(`
  SELECT id, amount, type, category, note, date, createdAt
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
  ORDER BY createdAt DESC
`);

const updateTransaction = db.prepare(`
  UPDATE transactions
  SET amount = @amount, note = @note, category = @category, type = @type
  WHERE id = @id AND userId = @userId AND isIncorrect = 0
`);

const softDeleteTransaction = db.prepare(`
  UPDATE transactions SET isIncorrect = 1 WHERE id = @id AND userId = @userId
`);

// ─── Health Score Queries (current calendar month) ───

const getCurrentMonthTotals = db.prepare(`
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS totalIncome,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpense
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
    AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')
`);

const getCategoryBreakdown = db.prepare(`
  SELECT category, SUM(amount) AS total
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
    AND type = 'expense'
    AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')
  GROUP BY category
`);

const getActiveDays = db.prepare(`
  SELECT COUNT(DISTINCT date(createdAt)) AS activeDays
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
    AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')
`);

const getTransactionCount = db.prepare(`
  SELECT COUNT(*) AS count
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
`);

// ─── Insights Queries ───

const getDailySpending = db.prepare(`
  SELECT date(createdAt) AS day,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
    AND createdAt >= datetime('now', 'localtime', '-30 days')
  GROUP BY date(createdAt)
  ORDER BY day ASC
`);

const getMonthSummary = db.prepare(`
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS totalIncome,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpense,
    COUNT(CASE WHEN type = 'expense' THEN 1 END) AS expenseCount,
    COUNT(CASE WHEN type = 'income' THEN 1 END) AS incomeCount
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
    AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')
`);

const getAllCategoryBreakdown = db.prepare(`
  SELECT category, type, SUM(amount) AS total, COUNT(*) AS count
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
    AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')
  GROUP BY category, type
  ORDER BY total DESC
`);

// ─── Goals Queries ───

const insertGoal = db.prepare(`
  INSERT INTO goals (userId, title, targetAmount, durationMonths, priority, targetDate, monthlyRequired)
  VALUES (@userId, @title, @targetAmount, @durationMonths, @priority, @targetDate, @monthlyRequired)
`);

const getActiveGoals = db.prepare(`
  SELECT id, title, targetAmount, currentAmount, durationMonths, priority, targetDate, monthlyRequired, isCompleted, createdAt
  FROM goals
  WHERE userId = @userId
  ORDER BY priority DESC, createdAt ASC
`);

const updateGoalProgress = db.prepare(`
  UPDATE goals
  SET currentAmount = @currentAmount, isCompleted = @isCompleted
  WHERE id = @id AND userId = @userId
`);

const getGoalById = db.prepare(`
  SELECT id, title, targetAmount, currentAmount, durationMonths, priority, targetDate, monthlyRequired, isCompleted, createdAt
  FROM goals
  WHERE id = @id AND userId = @userId
`);

const deleteGoal = db.prepare(`
  DELETE FROM goals
  WHERE id = @id AND userId = @userId
`);

const getHistoricalSavings = db.prepare(`
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount WHEN category = 'Finance' THEN 0 ELSE -amount END), 0) AS netSavings,
    COALESCE(COUNT(DISTINCT strftime('%Y-%m', createdAt)), 1) AS monthCount
  FROM transactions
  WHERE isIncorrect = 0 AND userId = @userId
`);

// ─── Automation Queries ───

const insertRecurringBill = db.prepare(`
  INSERT INTO recurring_bills (userId, amount, category, note, frequency, dueDate)
  VALUES (@userId, @amount, @category, @note, @frequency, @dueDate)
`);

const getRecurringBills = db.prepare(`
  SELECT id, amount, category, note, frequency, dueDate, lastLoggedDate, isActive, createdAt
  FROM recurring_bills
  WHERE isActive = 1 AND userId = @userId
  ORDER BY dueDate ASC
`);

const updateRecurringBillDueDate = db.prepare(`
  UPDATE recurring_bills
  SET dueDate = @dueDate, lastLoggedDate = @lastLoggedDate
  WHERE id = @id AND userId = @userId
`);

const deleteRecurringBill = db.prepare(`
  UPDATE recurring_bills SET isActive = 0 WHERE id = @id AND userId = @userId
`);

// ─── Phase 5: Ledger / Splits Queries ───

const insertFriend = db.prepare(`
  INSERT INTO friends (userId, name) VALUES (@userId, @name)
`);

const getFriendByName = db.prepare(`
  SELECT id, name, upiId FROM friends WHERE lower(name) = lower(@name) AND userId = @userId
`);

const getAllFriends = db.prepare(`
  SELECT id, name, upiId FROM friends WHERE userId = @userId ORDER BY name ASC
`);

const insertSplit = db.prepare(`
  INSERT INTO splits (transactionId, friendId, splitAmount) VALUES (@transactionId, @friendId, @splitAmount)
`);

const getLedgerBalances = db.prepare(`
  SELECT f.id as friendId, f.name, f.upiId, SUM(s.splitAmount) as netBalance
  FROM friends f
  LEFT JOIN splits s ON f.id = s.friendId AND s.isSettled = 0
  WHERE f.userId = @userId
  GROUP BY f.id, f.name, f.upiId
`);

const settleFriendDebts = db.prepare(`
  UPDATE splits
  SET isSettled = 1, settledDate = datetime('now', 'localtime')
  WHERE friendId = @friendId AND isSettled = 0
`);

// ─── Auth / Users Queries ───

const insertUser = db.prepare(`
  INSERT INTO users (username, email, passwordHash, displayName)
  VALUES (@username, @email, @passwordHash, @displayName)
`);

const getUserByEmail = db.prepare(`
  SELECT id, username, email, passwordHash, displayName, avatarUrl, monthlyIncome, googleId, createdAt FROM users WHERE lower(email) = lower(@email)
`);

const getUserByUsername = db.prepare(`
  SELECT id, username, email, passwordHash, displayName, avatarUrl, monthlyIncome, googleId, createdAt FROM users WHERE lower(username) = lower(@username)
`);

const getUserByGoogleId = db.prepare(`
  SELECT id, username, email, passwordHash, displayName, avatarUrl, monthlyIncome, googleId, createdAt FROM users WHERE googleId = @googleId
`);

const linkGoogleId = db.prepare('UPDATE users SET googleId = @googleId WHERE id = @id');

const insertGoogleUser = db.prepare(`
  INSERT INTO users (username, email, passwordHash, displayName, avatarUrl, googleId)
  VALUES (@username, @email, @passwordHash, @displayName, @avatarUrl, @googleId)
`);

const getUserById = db.prepare(`
  SELECT id, username, email, displayName, avatarUrl, monthlyIncome, createdAt FROM users WHERE id = @id
`);

const searchUsersByEmailOrUsername = db.prepare(`
  SELECT id, username, email, displayName, avatarUrl, monthlyIncome FROM users
  WHERE (lower(username) LIKE lower(@query) OR lower(email) LIKE lower(@query)) AND id != @excludeUserId
  ORDER BY username ASC
  LIMIT 20
`);

const updateUserProfile = db.prepare('UPDATE users SET displayName = @displayName, email = @email, monthlyIncome = @monthlyIncome WHERE id = @id');
const updateUserPassword = db.prepare('UPDATE users SET passwordHash = @passwordHash WHERE id = @id');
const updateUserAvatar = db.prepare('UPDATE users SET avatarUrl = @avatarUrl WHERE id = @id');

const getUserPasswordHash = db.prepare(`
  SELECT passwordHash FROM users WHERE id = @id
`);

// ─── Connections & Notifications Queries ───

const insertConnection = db.prepare(`
  INSERT INTO connections (requesterId, addresseeId, status)
  VALUES (@requesterId, @addresseeId, 'pending')
`);

const getConnection = db.prepare(`
  SELECT * FROM connections 
  WHERE (requesterId = @userId1 AND addresseeId = @userId2) 
     OR (requesterId = @userId2 AND addresseeId = @userId1)
`);

const getPendingRequests = db.prepare(`
  SELECT c.id as connectionId, u.id as requesterId, u.username, u.email, u.displayName, c.createdAt
  FROM connections c
  JOIN users u ON c.requesterId = u.id
  WHERE c.addresseeId = @userId AND c.status = 'pending'
`);

const updateConnectionStatus = db.prepare(`
  UPDATE connections SET status = @status WHERE id = @id AND addresseeId = @addresseeId
`);

const insertNotification = db.prepare(`
  INSERT INTO notifications (userId, type, message, relatedId)
  VALUES (@userId, @type, @message, @relatedId)
`);

const getUnreadNotifications = db.prepare(`
  SELECT id, type, message, relatedId, createdAt
  FROM notifications
  WHERE userId = @userId AND isRead = 0
  ORDER BY createdAt DESC
`);

const markNotificationsRead = db.prepare(`
  UPDATE notifications SET isRead = 1 WHERE userId = @userId AND isRead = 0
`);

module.exports = {
  db,
  insertTransaction,
  getRecentTransactions,
  getAllTransactions,
  updateTransaction,
  softDeleteTransaction,
  getCurrentMonthTotals,
  getCategoryBreakdown,
  getActiveDays,
  getTransactionCount,
  getDailySpending,
  getMonthSummary,
  getAllCategoryBreakdown,
  insertGoal,
  getActiveGoals,
  updateGoalProgress,
  getGoalById,
  deleteGoal,
  getHistoricalSavings,
  insertRecurringBill,
  getRecurringBills,
  updateRecurringBillDueDate,
  deleteRecurringBill,
  insertFriend,
  getFriendByName,
  getAllFriends,
  insertSplit,
  getLedgerBalances,
  settleFriendDebts,
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
  insertConnection,
  getConnection,
  getPendingRequests,
  updateConnectionStatus,
  insertNotification,
  getUnreadNotifications,
  markNotificationsRead,
};
