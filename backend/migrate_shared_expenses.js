// One-off migration (Phase C: Shared Expense Schema).
//
// Carries forward every legacy `friends` + `splits` row into the new
// `expenses` + `expense_participants` tables as "local only" entries, so
// the upcoming shared-ledger UI has a single source of truth and nothing
// from the old one-sided split model is lost.
//
// Safe to re-run: transactions that already have an `expenses` row are
// skipped.
//
// Usage: node migrate_shared_expenses.js

const { db } = require('./db');

const legacySplits = db.prepare(`
  SELECT s.transactionId, s.splitAmount, s.isSettled, s.settledDate, s.createdAt AS splitCreatedAt,
         f.name AS friendName,
         t.userId AS txnUserId, t.amount AS txnAmount, t.note AS txnNote, t.createdAt AS txnCreatedAt
  FROM splits s
  JOIN friends f ON f.id = s.friendId
  JOIN transactions t ON t.id = s.transactionId
  ORDER BY s.transactionId, s.id
`).all();

if (legacySplits.length === 0) {
  console.log('No legacy splits found - nothing to migrate.');
  process.exit(0);
}

const alreadyMigrated = db.prepare('SELECT 1 FROM expenses WHERE transactionId = ?');

const insertExpense = db.prepare(`
  INSERT INTO expenses (transactionId, payerId, totalAmount, description, createdAt)
  VALUES (@transactionId, @payerId, @totalAmount, @description, @createdAt)
`);

const insertParticipant = db.prepare(`
  INSERT INTO expense_participants (expenseId, userId, legacyFriendName, shareAmount, isSettled, settledDate, isLocalOnly, createdAt)
  VALUES (@expenseId, NULL, @legacyFriendName, @shareAmount, @isSettled, @settledDate, 1, @createdAt)
`);

const byTransaction = new Map();
for (const row of legacySplits) {
  if (!byTransaction.has(row.transactionId)) byTransaction.set(row.transactionId, []);
  byTransaction.get(row.transactionId).push(row);
}

let expenseCount = 0;
let participantCount = 0;
let skipped = 0;

const migrate = db.transaction(() => {
  for (const [transactionId, splits] of byTransaction) {
    if (alreadyMigrated.get(transactionId)) {
      skipped++;
      continue;
    }

    const splitTotal = splits.reduce((sum, s) => sum + s.splitAmount, 0);
    const totalAmount = Math.round((splits[0].txnAmount + splitTotal) * 100) / 100;
    const payerId = Number.parseInt(splits[0].txnUserId, 10);

    const { lastInsertRowid: expenseId } = insertExpense.run({
      transactionId,
      payerId: Number.isInteger(payerId) ? payerId : null,
      totalAmount,
      description: splits[0].txnNote,
      createdAt: splits[0].txnCreatedAt,
    });
    expenseCount++;

    for (const s of splits) {
      insertParticipant.run({
        expenseId,
        legacyFriendName: s.friendName,
        shareAmount: s.splitAmount,
        isSettled: s.isSettled,
        settledDate: s.settledDate,
        createdAt: s.splitCreatedAt,
      });
      participantCount++;
    }
  }
});

migrate();

console.log(`Migrated ${expenseCount} expense(s) with ${participantCount} participant row(s) as "local only" entries.`);
if (skipped > 0) {
  console.log(`Skipped ${skipped} transaction(s) already migrated.`);
}
