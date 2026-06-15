const express = require('express');
const router = express.Router();
const {
  getFriendById,
  getFriendSplitDetails,
  getSplitWithOwnership,
  getSplitsForTransaction,
  pool,
} = require('../db');

// GET /api/splits/friend/:friendId
// Itemized splits for one friend (Friend Detail view).
router.get('/friend/:friendId', async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (isNaN(friendId)) {
      return res.status(400).json({ success: false, error: 'Invalid friend ID' });
    }
    const userId = req.session.userId;

    const friend = await getFriendById({ id: friendId, userId });
    if (!friend) {
      return res.status(404).json({ success: false, error: 'Friend not found' });
    }

    const splits = await getFriendSplitDetails({ friendId, userId });
    return res.json({ success: true, friend, splits });
  } catch (err) {
    console.error('GET /splits/friend/:friendId error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/splits/:id
// Body: { splitAmount: number }
// Edits a split's amount and recomputes transactions.amount (payer's own share)
// so originalTotal = oldAmount + sum(all current splits) stays constant.
router.patch('/:id', async (req, res) => {
  try {
    const splitId = parseInt(req.params.id, 10);
    const { splitAmount } = req.body;
    if (isNaN(splitId) || !Number.isFinite(splitAmount) || splitAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid splitAmount required' });
    }

    const existing = await getSplitWithOwnership({ splitId, userId: req.session.userId });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Split not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const allSplits = await getSplitsForTransaction({ transactionId: existing.transactionId });
      const otherSplitsTotal = allSplits
        .filter(s => s.id !== splitId)
        .reduce((sum, s) => sum + s.splitAmount, 0);

      const originalTotal = existing.transactionAmount + existing.splitAmount + otherSplitsTotal;
      const newTransactionAmount = Math.round((originalTotal - otherSplitsTotal - splitAmount) * 100) / 100;

      if (newTransactionAmount < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Split amount exceeds the original total' });
      }

      await client.query(`UPDATE splits SET "splitAmount" = $1 WHERE id = $2`, [splitAmount, splitId]);
      await client.query(`UPDATE transactions SET amount = $1 WHERE id = $2`, [newTransactionAmount, existing.transactionId]);

      await client.query('COMMIT');
      return res.json({ success: true, split: { id: splitId, splitAmount }, transaction: { id: existing.transactionId, amount: newTransactionAmount } });
    } catch (txnErr) {
      await client.query('ROLLBACK');
      throw txnErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('PATCH /splits/:id error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/splits/:id
// Removes a split and recomputes transactions.amount so the removed friend's
// share reverts to the payer (originalTotal = oldAmount + sum(all current splits)).
router.delete('/:id', async (req, res) => {
  try {
    const splitId = parseInt(req.params.id, 10);
    if (isNaN(splitId)) {
      return res.status(400).json({ success: false, error: 'Invalid split ID' });
    }

    const existing = await getSplitWithOwnership({ splitId, userId: req.session.userId });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Split not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const allSplits = await getSplitsForTransaction({ transactionId: existing.transactionId });
      const otherSplitsTotal = allSplits
        .filter(s => s.id !== splitId)
        .reduce((sum, s) => sum + s.splitAmount, 0);

      const originalTotal = existing.transactionAmount + existing.splitAmount + otherSplitsTotal;
      const newTransactionAmount = Math.round((originalTotal - otherSplitsTotal) * 100) / 100;

      await client.query(`DELETE FROM splits WHERE id = $1`, [splitId]);
      await client.query(`UPDATE transactions SET amount = $1 WHERE id = $2`, [newTransactionAmount, existing.transactionId]);

      await client.query('COMMIT');
      return res.json({ success: true, transaction: { id: existing.transactionId, amount: newTransactionAmount } });
    } catch (txnErr) {
      await client.query('ROLLBACK');
      throw txnErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('DELETE /splits/:id error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
