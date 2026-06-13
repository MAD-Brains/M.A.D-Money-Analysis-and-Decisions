const express = require('express');
const router = express.Router();
const { pool, insertTransaction, getRecentTransactions, getAllTransactions, updateTransaction, softDeleteTransaction, getFriendByName, insertFriend, insertSplit } = require('../db');
const { parseInput } = require('../parser');

/**
 * POST /api/transactions
 * Accept natural language input, parse it, and store in DB
 *
 * Body: { "input": "250 swiggy" }
 */
router.post('/', async (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({ success: false, error: 'Input is required' });
    }

    const parsed = parseInput(input);

    if (parsed.error) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const { amount, note, type, category, splitWith } = parsed;
    const requestedSplits = req.body.splits;

    let finalAmount = amount;
    let splitsToCreate = []; // [{ friendName, splitAmount }]

    if (Array.isArray(requestedSplits) && requestedSplits.length > 0) {
      // Rich UI path: structured per-friend amounts computed client-side by the picker
      for (const entry of requestedSplits) {
        const friendName = typeof entry?.friendName === 'string' ? entry.friendName.trim() : '';
        const splitAmount = parseFloat(entry?.amount);

        if (!friendName) {
          return res.status(400).json({ success: false, error: 'Each split needs a friend name' });
        }
        if (!Number.isFinite(splitAmount) || splitAmount <= 0) {
          return res.status(400).json({ success: false, error: 'Each split amount must be a positive number' });
        }

        splitsToCreate.push({ friendName, splitAmount });
      }

      const splitTotal = splitsToCreate.reduce((sum, s) => sum + s.splitAmount, 0);
      if (splitTotal <= 0 || splitTotal > amount + 0.01) {
        return res.status(400).json({ success: false, error: 'Split amounts must add up to no more than the total amount' });
      }

      finalAmount = Math.round((amount - splitTotal) * 100) / 100;
    } else if (splitWith) {
      // Text path: "split with <name>" defaults to an even 50/50 split
      finalAmount = amount / 2;
      splitsToCreate = [{ friendName: splitWith, splitAmount: finalAmount }];
    }

    const userId = req.session.userId;

    // PostgreSQL transaction using pool client
    const client = await pool.connect();
    let transactionId;
    try {
      await client.query('BEGIN');

      const txnResult = await client.query(
        `INSERT INTO transactions ("userId", amount, type, category, note, date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userId, finalAmount, type, category, note, new Date().toISOString()]
      );
      transactionId = txnResult.rows[0].id;

      for (const { friendName, splitAmount } of splitsToCreate) {
        let friend = await getFriendByName({ name: friendName, userId });
        if (!friend) {
          friend = await insertFriend({ name: friendName, userId });
        }

        await client.query(
          `INSERT INTO splits ("transactionId", "friendId", "splitAmount")
           VALUES ($1, $2, $3)`,
          [transactionId, friend.id, splitAmount]
        );
      }

      await client.query('COMMIT');
    } catch (txnErr) {
      await client.query('ROLLBACK');
      throw txnErr;
    } finally {
      client.release();
    }

    return res.json({
      success: true,
      transaction: {
        id: transactionId,
        amount: finalAmount,
        type,
        category,
        note,
      },
    });
  } catch (err) {
    console.error('POST /transactions error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * GET /api/transactions
 * Return the last 5 transactions, sorted by latest
 */
router.get('/', async (req, res) => {
  try {
    const transactions = await getRecentTransactions({ userId: req.session.userId });
    return res.json({ transactions });
  } catch (err) {
    console.error('GET /transactions error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * GET /api/transactions/all
 * Return ALL transactions (for View All screen)
 */
router.get('/all', async (req, res) => {
  try {
    const transactions = await getAllTransactions({ userId: req.session.userId });
    return res.json({ transactions });
  } catch (err) {
    console.error('GET /transactions/all error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * PUT /api/transactions/:id
 * Edit a transaction's amount, note, category
 *
 * Body: { amount, note, category, type }
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID' });
    }

    const { amount, note, category, type } = req.body;

    if (!amount || !category || !type) {
      return res.status(400).json({ success: false, error: 'Amount, category and type are required' });
    }

    const result = await updateTransaction({
      id,
      userId: req.session.userId,
      amount: parseFloat(amount),
      note: note || '',
      category,
      type,
    });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    return res.json({
      success: true,
      transaction: { id, amount: parseFloat(amount), note, category, type },
    });
  } catch (err) {
    console.error('PUT /transactions/:id error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * PATCH /api/transactions/:id/incorrect
 * Soft-delete: mark a transaction as incorrect (won't show in list, but data stays for insights)
 */
router.patch('/:id/incorrect', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID' });
    }

    const result = await softDeleteTransaction({ id, userId: req.session.userId });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    return res.json({ success: true, message: 'Transaction marked as incorrect' });
  } catch (err) {
    console.error('PATCH /transactions/:id/incorrect error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
