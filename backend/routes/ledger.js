const express = require('express');
const router = express.Router();
const { getLedgerBalances, settleFriendDebts, insertTransaction } = require('../db');

/**
 * GET /api/ledger
 * Fetch net balances for all friends.
 */
router.get('/', async (req, res) => {
  try {
    const balances = await getLedgerBalances({ userId: req.session.userId });
    return res.json({ success: true, balances });
  } catch (err) {
    console.error('GET /ledger error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/ledger/settle/:friendId
 * Settle all outstanding splits with a friend.
 */
router.post('/settle/:friendId', async (req, res) => {
  try {
    const { friendId } = req.params;
    const { amount, friendName } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount required' });
    }

    // Mark all splits as settled
    await settleFriendDebts({ friendId });

    // Insert an income transaction to balance the user's wallet
    const result = await insertTransaction({
      userId: req.session.userId,
      amount,
      type: 'income',
      category: 'Others',
      note: `Settled up with ${friendName}`,
      date: new Date().toISOString(),
    });

    return res.json({ success: true, transactionId: result.id });
  } catch (err) {
    console.error('POST /ledger/settle error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
