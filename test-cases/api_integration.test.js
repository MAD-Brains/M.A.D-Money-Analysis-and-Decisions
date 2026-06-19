const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Set isolated database path for API integration tests
const testDbFile = path.join(__dirname, '../backend/test_api_integration.db');
process.env.MAD_DB_PATH = testDbFile;
process.env.PORT = '3005';
process.env.SESSION_SECRET = 'test-secret';

test('API End-to-End Integration Tests', { skip: !process.env.DATABASE_URL }, async (t) => {
  const walFile = testDbFile + '-wal';
  const shmFile = testDbFile + '-shm';

  // Cleanup leftover files from previous crashed runs
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
  if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

  // Load backend db wrapper to ensure test DB schema is initialized
  delete require.cache[require.resolve('../backend/db')];
  const testDb = require('../backend/db');

  // Require Express Server to start listening on 3005
  delete require.cache[require.resolve('../backend/server.js')];
  const server = require('../backend/server.js');
  
  // Wait a brief moment for server socket startup
  await new Promise(resolve => setTimeout(resolve, 500));

  const BASE_URL = 'http://localhost:3005';
  let user1Cookie = '';
  let user2Cookie = '';

  try {
    // ─── Test 2a: SignUp User 1 (Alice) ───
    const signupRes1 = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Alice',
        email: 'alice@test.com',
        password: 'password123',
        displayName: 'Alice In Wonderland'
      })
    });
    
    const signupData1 = await signupRes1.json();
    assert.equal(signupRes1.status, 200);
    assert.equal(signupData1.success, true);
    
    // Save session cookie
    const setCookie1 = signupRes1.headers.get('set-cookie');
    assert.ok(setCookie1);
    user1Cookie = setCookie1.split(';')[0];

    // ─── Test 2b: SignUp User 2 (Bob) ───
    const signupRes2 = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Bob',
        email: 'bob@test.com',
        password: 'password123',
        displayName: 'Builder Bob'
      })
    });
    
    const signupData2 = await signupRes2.json();
    assert.equal(signupRes2.status, 200);
    assert.equal(signupData2.success, true);
    user2Cookie = signupRes2.headers.get('set-cookie').split(';')[0];

    // ─── Test 2c: Verify Profile Fetch (/auth/me) ───
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Cookie': user1Cookie }
    });
    const meData = await meRes.json();
    assert.equal(meRes.status, 200);
    assert.equal(meData.success, true);
    assert.equal(meData.user.username, 'Alice');

    // ─── Test 2d: Test Transaction Posting with NLP ───
    const txnRes = await fetch(`${BASE_URL}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': user1Cookie
      },
      body: JSON.stringify({ input: '250 swiggy' })
    });
    const txnData = await txnRes.json();
    assert.equal(txnRes.status, 200);
    assert.equal(txnData.success, true);
    assert.equal(txnData.transaction.amount, 250);
    assert.equal(txnData.transaction.category, 'Food');

    // ─── Test 2e: Test Split Transaction NLP ───
    const splitRes = await fetch(`${BASE_URL}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': user1Cookie
      },
      body: JSON.stringify({ input: '400 dinner split with Bob' })
    });
    const splitData = await splitRes.json();
    assert.equal(splitRes.status, 200);
    assert.equal(splitData.success, true);
    assert.equal(splitData.transaction.amount, 200);

    // ─── Test 2f: Test Friend Request / connections ───
    const connRes = await fetch(`${BASE_URL}/api/connections/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': user1Cookie
      },
      body: JSON.stringify({ identifier: 'Bob' })
    });
    const connData = await connRes.json();
    assert.equal(connRes.status, 200);
    assert.equal(connData.success, true);

    // Verify Bob receives pending request and notification
    const pendingRes = await fetch(`${BASE_URL}/api/connections/pending`, {
      headers: { 'Cookie': user2Cookie }
    });
    const pendingData = await pendingRes.json();
    assert.equal(pendingRes.status, 200);
    assert.equal(pendingData.requests.length, 1);
    assert.equal(pendingData.requests[0].username, 'Alice');

    const notifRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { 'Cookie': user2Cookie }
    });
    const notifData = await notifRes.json();
    assert.equal(notifRes.status, 200);
    assert.equal(notifData.success, true);
    assert.ok(notifData.notifications.length > 0);
    assert.match(notifData.notifications[0].message, /Alice sent you a friend request/);

  } finally {
    // Safely close connection
    if (testDb && testDb.db && typeof testDb.db.close === 'function') testDb.db.close();
    if (testDb && testDb.pool && typeof testDb.pool.end === 'function') await testDb.pool.end();
    
    // Cleanup files
    if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
    
    // Terminate process safely to release port 3005
    if (process.env.DATABASE_URL) {
      process.exit(0);
    }
  }
});
