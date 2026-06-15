const { getConnectedUserByName, insertNotification, getUserById } = require('../db');

/**
 * Notify connected friends that a split was added against them.
 * Best-effort: failures are logged but never propagate to the caller.
 */
async function notifySplitParticipants({ userId, splitsToCreate, note, category, transactionId }) {
  for (const { friendName, splitAmount } of splitsToCreate) {
    try {
      const connectedUser = await getConnectedUserByName({ userId, name: friendName });
      if (connectedUser) {
        const me = await getUserById({ id: userId });
        const payerName = me?.displayName || me?.username || 'Someone';
        await insertNotification({
          userId: connectedUser.userId,
          type: 'split_added',
          message: `${payerName} added a split of ₹${splitAmount.toLocaleString('en-IN')} for "${note || category}" with you.`,
          relatedId: transactionId,
        });
      }
    } catch (notifyErr) {
      console.error('Split notification error (non-fatal):', notifyErr);
    }
  }
}

module.exports = { notifySplitParticipants };
