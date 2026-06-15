const express = require('express');
const router = express.Router();
const {
  pool,
  insertGroup,
  getGroupsForUser,
  getGroupById,
  getGroupMembersWithBalances,
  addGroupMember,
  getGroupExpenses,
  getFriendByName,
  insertFriend,
} = require('../db');
const { notifySplitParticipants } = require('../utils/splitNotify');

/**
 * GET /api/groups
 * List all groups owned by the current user, with member counts and net balances.
 */
router.get('/', async (req, res) => {
  try {
    const groups = await getGroupsForUser({ userId: req.session.userId });
    return res.json({ success: true, groups });
  } catch (err) {
    console.error('GET /groups error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/groups
 * Create a group with an initial set of members (by friend name, found-or-created).
 * Body: { name, memberNames: string[] }
 */
router.post('/', async (req, res) => {
  try {
    const { name, memberNames } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ success: false, error: 'Group name is required' });
    }

    const userId = req.session.userId;
    const group = await insertGroup({ userId, name: trimmedName });

    const names = Array.isArray(memberNames) ? memberNames : [];
    for (const rawName of names) {
      const friendName = typeof rawName === 'string' ? rawName.trim() : '';
      if (!friendName) continue;

      let friend = await getFriendByName({ name: friendName, userId });
      if (!friend) {
        friend = await insertFriend({ name: friendName, userId });
      }
      await addGroupMember({ groupId: group.id, friendId: friend.id });
    }

    const members = await getGroupMembersWithBalances({ groupId: group.id });
    return res.json({ success: true, group: { ...group, memberCount: members.length, netBalance: 0, members } });
  } catch (err) {
    console.error('POST /groups error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * GET /api/groups/:id
 * Group detail: members with per-member balances, plus the group's expenses.
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid group ID' });
    }

    const group = await getGroupById({ id, userId: req.session.userId });
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const [members, expenses] = await Promise.all([
      getGroupMembersWithBalances({ groupId: id }),
      getGroupExpenses({ groupId: id }),
    ]);

    return res.json({ success: true, group, members, expenses });
  } catch (err) {
    console.error('GET /groups/:id error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/groups/:id/members
 * Add a friend (by name, found-or-created) to the group.
 * Body: { name }
 */
router.post('/:id/members', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid group ID' });
    }

    const userId = req.session.userId;
    const group = await getGroupById({ id, userId });
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, error: 'Friend name is required' });
    }

    let friend = await getFriendByName({ name, userId });
    if (!friend) {
      friend = await insertFriend({ name, userId });
    }
    await addGroupMember({ groupId: id, friendId: friend.id });

    const members = await getGroupMembersWithBalances({ groupId: id });
    return res.json({ success: true, members });
  } catch (err) {
    console.error('POST /groups/:id/members error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/groups/:id/expenses
 * Log a group expense and split it among the given members.
 * New participants are automatically added as group members.
 * Body: { amount, note, category, splits: [{ friendName, amount }] }
 */
router.post('/:id/expenses', async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    if (isNaN(groupId)) {
      return res.status(400).json({ success: false, error: 'Invalid group ID' });
    }

    const userId = req.session.userId;
    const group = await getGroupById({ id: groupId, userId });
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const { amount, note, category } = req.body || {};
    const totalAmount = parseFloat(amount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ success: false, error: 'A valid amount is required' });
    }
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ success: false, error: 'Category is required' });
    }

    const requestedSplits = Array.isArray(req.body?.splits) ? req.body.splits : [];
    const splitsToCreate = [];
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

    if (splitsToCreate.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one split is required' });
    }

    const splitTotal = splitsToCreate.reduce((sum, s) => sum + s.splitAmount, 0);
    if (splitTotal <= 0 || splitTotal > totalAmount + 0.01) {
      return res.status(400).json({ success: false, error: 'Split amounts must add up to no more than the total amount' });
    }

    const finalAmount = Math.round((totalAmount - splitTotal) * 100) / 100;

    const client = await pool.connect();
    let transactionId;
    try {
      await client.query('BEGIN');

      const txnResult = await client.query(
        `INSERT INTO transactions ("userId", amount, type, category, note, date)
         VALUES ($1, $2, 'expense', $3, $4, $5)
         RETURNING id`,
        [userId, finalAmount, category, note || null, new Date().toISOString()]
      );
      transactionId = txnResult.rows[0].id;

      for (const { friendName, splitAmount } of splitsToCreate) {
        let friend = await getFriendByName({ name: friendName, userId });
        if (!friend) {
          friend = await insertFriend({ name: friendName, userId });
        }
        await addGroupMember({ groupId, friendId: friend.id });

        await client.query(
          `INSERT INTO splits ("transactionId", "friendId", "splitAmount", "groupId")
           VALUES ($1, $2, $3, $4)`,
          [transactionId, friend.id, splitAmount, groupId]
        );
      }

      await client.query('COMMIT');
    } catch (txnErr) {
      await client.query('ROLLBACK');
      throw txnErr;
    } finally {
      client.release();
    }

    await notifySplitParticipants({ userId, splitsToCreate, note, category, transactionId });

    return res.json({
      success: true,
      groupId,
      transaction: { id: transactionId, amount: finalAmount, type: 'expense', category, note },
    });
  } catch (err) {
    console.error('POST /groups/:id/expenses error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
