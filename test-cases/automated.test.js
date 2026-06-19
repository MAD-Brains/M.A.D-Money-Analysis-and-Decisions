const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Set isolated database path for automated tests
const testDbFile = path.join(__dirname, '../backend/test_automated.db');
process.env.MAD_DB_PATH = testDbFile;

// ─── 1. NLP Parser Unit Tests ───
const { parseInput } = require('../backend/parser');

test('Parser Unit Tests - standard expense', () => {
  const res = parseInput('250 swiggy');
  assert.equal(res.amount, 250);
  assert.equal(res.note, 'swiggy');
  assert.equal(res.category, 'Food');
  assert.equal(res.type, 'expense');
  assert.equal(res.splitWith, null);
});

test('Parser Unit Tests - income keywords', () => {
  const res = parseInput('salary 30000');
  assert.equal(res.amount, 30000);
  assert.equal(res.category, 'Income');
  assert.equal(res.type, 'income');
});

test('Parser Unit Tests - forced income prefix (+)', () => {
  const res = parseInput('+500 dividend');
  assert.equal(res.amount, 500);
  assert.equal(res.category, 'Income');
  assert.equal(res.type, 'income');
  assert.equal(res.note, 'dividend');
});

test('Parser Unit Tests - split command detection', () => {
  const res = parseInput('120 rapido split with Rohan');
  assert.equal(res.amount, 120);
  assert.equal(res.note, 'rapido');
  assert.equal(res.category, 'Travel');
  assert.equal(res.type, 'expense');
  assert.equal(res.splitWith, 'Rohan');
});

test('Parser Unit Tests - empty inputs and missing amounts', () => {
  const err1 = parseInput('');
  assert.ok(err1.error);
  
  const err2 = parseInput('swiggy lunch');
  assert.ok(err2.error);
});

// ─── 2. Health Score Calculations (Mock Queries) ───
const dbMock = require('../backend/db');
const originalGetTotals = dbMock.getCurrentMonthTotals;
const originalGetBreakdown = dbMock.getCategoryBreakdown;
const originalGetActiveDays = dbMock.getActiveDays;
const originalGetCount = dbMock.getTransactionCount;
const originalGetUserById = dbMock.getUserById;
const originalGetAllTransactions = dbMock.getAllTransactions;
const originalGetActiveGoals = dbMock.getActiveGoals;

test('Health Score - starter score when no transactions exist', async () => {
  dbMock.getTransactionCount = () => Promise.resolve({ count: 0 });
  dbMock.getUserById = () => Promise.resolve({ monthlyIncome: 0 });
  dbMock.getAllTransactions = () => Promise.resolve([]);
  dbMock.getActiveGoals = () => Promise.resolve([]);
  dbMock.getCurrentMonthTotals = () => Promise.resolve({ totalIncome: 0, totalExpense: 0 });
  dbMock.getCategoryBreakdown = () => Promise.resolve([]);
  dbMock.getActiveDays = () => Promise.resolve({ activeDays: 0 });
  
  delete require.cache[require.resolve('../backend/services/healthScore')];
  const { calculateHealthScore } = require('../backend/services/healthScore');
  
  const hs = await calculateHealthScore(1);
  assert.equal(hs.score, 50);
  assert.match(hs.subtitle, /start kar/);
});

test('Health Score - calculation with standard numbers', async () => {
  dbMock.getTransactionCount = () => Promise.resolve({ count: 5 });
  dbMock.getCurrentMonthTotals = () => Promise.resolve({ totalIncome: 10000, totalExpense: 4000 });
  dbMock.getCategoryBreakdown = () => Promise.resolve([{ category: 'Food', total: 2000 }, { category: 'Housing', total: 2000 }]);
  dbMock.getActiveDays = () => Promise.resolve({ activeDays: 15 });
  dbMock.getUserById = () => Promise.resolve({ monthlyIncome: 10000 });
  dbMock.getAllTransactions = () => Promise.resolve([
    { amount: 10000, type: 'income', category: 'Income', note: 'salary', createdAt: new Date().toISOString() },
    { amount: 2000, type: 'expense', category: 'Food', note: 'eating out', createdAt: new Date().toISOString() },
    { amount: 2000, type: 'expense', category: 'Housing', note: 'rent', createdAt: new Date().toISOString() }
  ]);
  dbMock.getActiveGoals = () => Promise.resolve([]);
  
  delete require.cache[require.resolve('../backend/services/healthScore')];
  const { calculateHealthScore } = require('../backend/services/healthScore');
  
  const hs = await calculateHealthScore(1);
  assert.ok(hs.score >= 0 && hs.score <= 100);
  assert.ok(hs.breakdown.savingsRate.score > 0);
  assert.equal(typeof hs.subtitle, 'string');
});

// Restore mocks
dbMock.getCurrentMonthTotals = originalGetTotals;
dbMock.getCategoryBreakdown = originalGetBreakdown;
dbMock.getActiveDays = originalGetActiveDays;
dbMock.getTransactionCount = originalGetCount;
dbMock.getUserById = originalGetUserById;
dbMock.getAllTransactions = originalGetAllTransactions;
dbMock.getActiveGoals = originalGetActiveGoals;

// ─── 3. Database Integrations (Isolated Clean Testing Database) ───
test('Database Integration Tests', { skip: !process.env.DATABASE_URL }, async (t) => {
  const walFile = testDbFile + '-wal';
  const shmFile = testDbFile + '-shm';

  // Cleanup leftover files from previous crashed runs
  if (dbMock.db && typeof dbMock.db.close === 'function') dbMock.db.close();
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
  if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

  // Clear require cache for db to ensure fresh DB loaded
  delete require.cache[require.resolve('../backend/db')];
  const testDb = require('../backend/db');

  try {
    // 3b: Test User signup & user search
    const passHash = 'hashedpassword123';
    testDb.insertUser.run({
      username: 'Alice',
      email: 'alice@mad.com',
      passwordHash: passHash,
      displayName: 'Alice User'
    });
    
    testDb.insertUser.run({
      username: 'Bob',
      email: 'bob@mad.com',
      passwordHash: passHash,
      displayName: 'Bob User'
    });

    const alice = testDb.getUserByUsername.get({ username: 'Alice' });
    const bob = testDb.getUserByUsername.get({ username: 'Bob' });
    
    assert.equal(alice.displayName, 'Alice User');
    assert.equal(bob.displayName, 'Bob User');

    // 3c: Test Transaction Insertion & Query Isolation
    testDb.insertTransaction.run({
      userId: alice.id,
      amount: 150.50,
      type: 'expense',
      category: 'Food',
      note: 'dinner',
      date: new Date().toISOString()
    });

    testDb.insertTransaction.run({
      userId: bob.id,
      amount: 4500,
      type: 'expense',
      category: 'Housing',
      note: 'rent',
      date: new Date().toISOString()
    });

    const aliceTxns = testDb.getAllTransactions.all({ userId: alice.id });
    const bobTxns = testDb.getAllTransactions.all({ userId: bob.id });

    assert.equal(aliceTxns.length, 1);
    assert.equal(aliceTxns[0].amount, 150.50);
    assert.equal(aliceTxns[0].note, 'dinner');

    assert.equal(bobTxns.length, 1);
    assert.equal(bobTxns[0].amount, 4500);
    assert.equal(bobTxns[0].note, 'rent');

    // 3d: Test Savings Goals Creation
    testDb.insertGoal.run({
      userId: alice.id,
      title: 'iPad',
      targetAmount: 30000,
      durationMonths: 6,
      priority: 3,
      targetDate: new Date().toISOString(),
      monthlyRequired: 5000
    });

    const aliceGoals = testDb.getActiveGoals.all({ userId: alice.id });
    assert.equal(aliceGoals.length, 1);
    assert.equal(aliceGoals[0].title, 'iPad');

    // 3e: Test Connections Friend requests graph
    testDb.insertConnection.run({
      requesterId: alice.id,
      addresseeId: bob.id
    });

    const bobPending = testDb.getPendingRequests.all({ userId: bob.id });
    assert.equal(bobPending.length, 1);
    assert.equal(bobPending[0].username, 'Alice');

    // Accept request
    testDb.updateConnectionStatus.run({
      status: 'accepted',
      id: bobPending[0].connectionId,
      addresseeId: bob.id
    });

    const bobPendingAfter = testDb.getPendingRequests.all({ userId: bob.id });
    assert.equal(bobPendingAfter.length, 0);

    // 3f: Test Notifications Insertion
    testDb.insertNotification.run({
      userId: alice.id,
      type: 'friend_request_accept',
      message: 'Bob accepted your friend request.',
      relatedId: bob.id
    });

    const aliceNotifs = testDb.getUnreadNotifications.all({ userId: alice.id });
    assert.equal(aliceNotifs.length, 1);
    assert.equal(aliceNotifs[0].type, 'friend_request_accept');

  } finally {
    // Safely close connection
    if (testDb.db && typeof testDb.db.close === 'function') testDb.db.close();
    if (dbMock.db && typeof dbMock.db.close === 'function') dbMock.db.close();
    if (testDb.pool && typeof testDb.pool.end === 'function') await testDb.pool.end();
    if (dbMock.pool && typeof dbMock.pool.end === 'function') await dbMock.pool.end();
    
    // Cleanup files
    if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  }
});
