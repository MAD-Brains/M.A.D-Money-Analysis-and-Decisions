const express = require('express');
const router = express.Router();
const {
  insertGoal, getActiveGoals, updateGoalProgress, getGoalById, deleteGoal,
  getHistoricalSavings, getHistoricalIncomeAverage, getAllTimeTotals, getFinanceCategoryTotal
} = require('../db');

/**
 * POST /api/goals/validate
 * Validates a proposed goal's monthly required savings against average savings and income
 * Body: { title, targetAmount, durationMonths, priority }
 */
router.post('/validate', async (req, res) => {
  try {
    const { targetAmount, durationMonths } = req.body;

    if (!targetAmount || !durationMonths) {
      return res.status(400).json({ success: false, error: 'Amount and duration are required' });
    }

    const amount = parseFloat(targetAmount);
    const duration = parseInt(durationMonths, 10);

    if (isNaN(amount) || amount <= 0 || isNaN(duration) || duration <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount or duration' });
    }

    const monthlyRequired = amount / duration;

    // Get average monthly savings
    const savingsRow = await getHistoricalSavings({ userId: req.session.userId });
    const averageSavings = savingsRow.netSavings / Math.max(savingsRow.monthCount, 1);

    // Get average monthly income
    const averageIncome = await getHistoricalIncomeAverage(req.session.userId);

    // Determine feasibility state
    let status = 'feasible';
    let suggestionText = '';
    let suggestedDuration = duration;

    // Default safety boundaries if database is empty
    const incomeLimit = averageIncome > 0 ? averageIncome : 50000;
    const savingsLimit = averageSavings > 0 ? averageSavings : 10000;

    if (monthlyRequired <= savingsLimit) {
      status = 'feasible';
    } else if (monthlyRequired <= 0.5 * incomeLimit) {
      status = 'stretch';
    } else {
      status = 'unrealistic';
      // Suggest duration based on 25% of income or average savings
      const targetMonthlySaving = Math.max(savingsLimit, 0.25 * incomeLimit, 2000);
      suggestedDuration = Math.ceil(amount / targetMonthlySaving);
    }

    return res.json({
      success: true,
      status,
      monthlyRequired: Math.round(monthlyRequired),
      averageSavings: Math.round(averageSavings),
      averageIncome: Math.round(averageIncome),
      suggestedDuration,
    });
  } catch (err) {
    console.error('POST /goals/validate error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/goals
 * Adds a new savings goal (validates and saves)
 */
router.post('/', async (req, res) => {
  try {
    const { title, targetAmount, durationMonths, priority } = req.body;

    if (!title || !targetAmount || !durationMonths || !priority) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    const amount = parseFloat(targetAmount);
    const duration = parseInt(durationMonths, 10);
    const prio = parseInt(priority, 10);

    if (!title.trim() || isNaN(amount) || amount <= 0 || isNaN(duration) || duration <= 0 || isNaN(prio) || prio < 1 || prio > 3) {
      return res.status(400).json({ success: false, error: 'Invalid goal inputs' });
    }

    const monthlyRequired = amount / duration;
    
    // Calculate target date (current date + durationMonths)
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + duration);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    const result = await insertGoal({
      userId: req.session.userId,
      title: title.trim(),
      targetAmount: amount,
      durationMonths: duration,
      priority: prio,
      targetDate: targetDateStr,
      monthlyRequired,
    });

    return res.json({
      success: true,
      goal: {
        id: result.id,
        title: title.trim(),
        targetAmount: amount,
        durationMonths: duration,
        priority: prio,
        targetDate: targetDateStr,
        monthlyRequired,
      }
    });
  } catch (err) {
    console.error('POST /goals error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * GET /api/goals
 * Fetches all active goals, calculates dynamic allocation progress based on actual current surplus
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const goals = await getActiveGoals({ userId });

    // Calculate total actual surplus in the DB since start of month
    const totalsRow = await getAllTimeTotals({ userId });

    // Subtract Finance category from totalExpense to treat investments as savings
    const financeRow = await getFinanceCategoryTotal({ userId });

    const netSavings = totalsRow.totalIncome - (totalsRow.totalExpense - financeRow.total);
    const availableSurplus = Math.max(0, netSavings);

    // Auto-allocate surplus among goals based on priority (High -> Medium -> Low)
    let remainingSurplus = availableSurplus;

    const processedGoals = [];
    for (const goal of goals) {
      let allocatedAmount = 0;

      if (remainingSurplus > 0) {
        const goalNeed = goal.targetAmount;
        if (remainingSurplus >= goalNeed) {
          allocatedAmount = goalNeed;
          remainingSurplus -= goalNeed;
        } else {
          allocatedAmount = remainingSurplus;
          remainingSurplus = 0;
        }
      }

      // Sync progress in the database (soft check)
      const isCompleted = allocatedAmount >= goal.targetAmount ? 1 : 0;
      await updateGoalProgress({
        id: goal.id,
        userId,
        currentAmount: allocatedAmount,
        isCompleted,
      });

      processedGoals.push({
        ...goal,
        currentAmount: Math.round(allocatedAmount),
        isCompleted,
      });
    }

    return res.json({ success: true, goals: processedGoals, netSavings: Math.round(availableSurplus) });
  } catch (err) {
    console.error('GET /goals error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * DELETE /api/goals/:id
 * Deletes a goal from the system
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const result = await deleteGoal({ id, userId: req.session.userId });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Goal not found' });
    }

    return res.json({ success: true, message: 'Goal removed successfully' });
  } catch (err) {
    console.error('DELETE /goals/:id error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
