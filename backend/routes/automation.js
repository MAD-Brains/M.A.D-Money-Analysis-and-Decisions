const express = require('express');
const router = express.Router();
const { 
  db,
  insertRecurringBill, 
  getRecurringBills, 
  updateRecurringBillDueDate, 
  deleteRecurringBill,
  insertTransaction
} = require('../db');

// Helper to advance the due date to the next future occurrence
function getNextDueDate(currentDueDateStr, frequency) {
  // Parse YYYY-MM-DD strictly as local time
  const [year, month, day] = currentDueDateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Compare dates only (ignore time)

  // Keep advancing until the next due date is strictly in the future
  let iterations = 0;
  while (date <= today && iterations < 100) { // Limit to 100 to prevent infinite loops in bad states
    iterations++;
    if (frequency === 'weekly') {
      date.setDate(date.getDate() + 7);
    } else if (frequency === 'monthly') {
      date.setMonth(date.getMonth() + 1);
    } else if (frequency === 'yearly') {
      date.setFullYear(date.getFullYear() + 1);
    } else if (frequency === 'daily') {
      date.setDate(date.getDate() + 1);
    }
  }
  
  // Return in YYYY-MM-DD format using local time components
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

/**
 * GET /api/automation/recurring
 * Fetch all active recurring bills/subscriptions
 */
router.get('/recurring', (req, res) => {
  try {
    const bills = getRecurringBills.all({ userId: req.session.userId });
    return res.json({ success: true, bills });
  } catch (err) {
    console.error('GET /automation/recurring error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/automation/recurring
 * Add a new recurring bill template
 */
router.post('/recurring', (req, res) => {
  try {
    const { amount, category, note, frequency, dueDate } = req.body;

    if (!amount || !category || !frequency || !dueDate) {
      return res.status(400).json({ success: false, error: 'Amount, category, frequency and due date are required' });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) {
      return res.status(400).json({ success: false, error: 'Invalid frequency' });
    }

    // Validate dueDate format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ success: false, error: 'Due date must be in YYYY-MM-DD format' });
    }

    const result = insertRecurringBill.run({
      userId: req.session.userId,
      amount: amt,
      category,
      note: note ? note.trim() : null,
      frequency,
      dueDate
    });

    return res.json({
      success: true,
      bill: {
        id: result.lastInsertRowid,
        amount: amt,
        category,
        note,
        frequency,
        dueDate
      }
    });
  } catch (err) {
    console.error('POST /automation/recurring error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * DELETE /api/automation/recurring/:id
 * Soft delete/deactivate a recurring bill template
 */
router.delete('/recurring/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }

    const result = deleteRecurringBill.run({ id, userId: req.session.userId });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Recurring bill not found' });
    }

    return res.json({ success: true, message: 'Recurring bill deactivated successfully' });
  } catch (err) {
    console.error('DELETE /automation/recurring/:id error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * GET /api/automation/due-bills
 * Identify active recurring bills due within next 3 days, or overdue
 */
router.get('/due-bills', (req, res) => {
  try {
    const bills = getRecurringBills.all({ userId: req.session.userId });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const limitDate = new Date();
    limitDate.setDate(today.getDate() + 3); // 3 days buffer
    limitDate.setHours(0, 0, 0, 0);

    const dueBills = [];

    for (const bill of bills) {
      const billDueDate = new Date(bill.dueDate);
      billDueDate.setHours(0, 0, 0, 0);

      // A bill is due if:
      // 1. Its dueDate is in the past (overdue) or within the next 3 days
      // 2. It hasn't been logged yet for the current cycle (lastLoggedDate !== dueDate)
      if (billDueDate <= limitDate && bill.lastLoggedDate !== bill.dueDate) {
        // Calculate due status text in Hinglish/English
        let status = 'due';
        const diffMs = billDueDate - today;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          status = `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''} 🚨`;
        } else if (diffDays === 0) {
          status = 'Due today ⚡';
        } else if (diffDays === 1) {
          status = 'Due tomorrow 📺';
        } else {
          status = `Due in ${diffDays} days 🗓️`;
        }

        dueBills.push({
          ...bill,
          statusText: status,
          isOverdue: diffDays < 0
        });
      }
    }

    return res.json({ success: true, bills: dueBills });
  } catch (err) {
    console.error('GET /automation/due-bills error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/automation/log-pending/:id
 * Log a pending bill as a transaction, advance its due date
 */
router.post('/log-pending/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }

    // Fetch the bill
    const bill = db.prepare('SELECT * FROM recurring_bills WHERE id = ? AND userId = ? AND isActive = 1').get(id, req.session.userId);
    if (!bill) {
      return res.status(404).json({ success: false, error: 'Recurring bill not found' });
    }

    // 1. Insert into transactions table
    const displayNote = bill.note ? bill.note : `Recurring: ${bill.category}`;
    insertTransaction.run({
      userId: req.session.userId,
      amount: bill.amount,
      type: 'expense',
      category: bill.category,
      note: displayNote,
      date: new Date().toISOString()
    });

    // 2. Advance due date
    const nextDueDate = getNextDueDate(bill.dueDate, bill.frequency);
    updateRecurringBillDueDate.run({
      id: bill.id,
      userId: req.session.userId,
      dueDate: nextDueDate,
      lastLoggedDate: bill.dueDate // Mark this specific cycle date as logged
    });

    return res.json({ 
      success: true, 
      message: 'Bill logged successfully and advanced to next cycle',
      nextDueDate 
    });
  } catch (err) {
    console.error('POST /automation/log-pending/:id error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/automation/skip-pending/:id
 * Skip logging the transaction, simply advance the bill's due date
 */
router.post('/skip-pending/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }

    // Fetch the bill
    const bill = db.prepare('SELECT * FROM recurring_bills WHERE id = ? AND userId = ? AND isActive = 1').get(id, req.session.userId);
    if (!bill) {
      return res.status(404).json({ success: false, error: 'Recurring bill not found' });
    }

    // Advance due date without logging transaction
    const nextDueDate = getNextDueDate(bill.dueDate, bill.frequency);
    updateRecurringBillDueDate.run({
      id: bill.id,
      userId: req.session.userId,
      dueDate: nextDueDate,
      lastLoggedDate: bill.dueDate // Still mark this cycle date as logged/handled
    });

    return res.json({ 
      success: true, 
      message: 'Bill alert skipped. Advanced to next cycle',
      nextDueDate 
    });
  } catch (err) {
    console.error('POST /automation/skip-pending/:id error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * GET /api/automation/quick-logs
 * Identifies the top 4 most frequent expenses from the last 30 days
 */
router.get('/quick-logs', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        amount,
        category,
        note,
        COUNT(*) as frequency
      FROM transactions
      WHERE isIncorrect = 0
        AND userId = @userId
        AND type = 'expense'
        AND createdAt >= datetime('now', 'localtime', '-30 days')
      GROUP BY amount, category, COALESCE(note, '')
      ORDER BY frequency DESC
      LIMIT 4
    `).all({ userId: req.session.userId });

    return res.json({ success: true, quickLogs: rows });
  } catch (err) {
    console.error('GET /automation/quick-logs error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
