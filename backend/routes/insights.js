const express = require('express');
const router = express.Router();
const { calculateHealthScore } = require('../services/healthScore');
const { getDailySpending, getMonthSummary, getAllCategoryBreakdown, getActiveRecurringBills, getFrequentTransactions } = require('../db');

/**
 * GET /api/insights/health-score
 * Returns the dynamic Money Health Score with breakdown
 */
router.get('/health-score', async (req, res) => {
  try {
    const result = await calculateHealthScore(req.session.userId);
    return res.json(result);
  } catch (err) {
    console.error('GET /insights/health-score error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * GET /api/insights/overview
 * Returns full insights data: month summary, category breakdown, daily trend
 */
router.get('/overview', async (req, res) => {
  try {
    const userId = req.session.userId;
    const summary = await getMonthSummary({ userId });
    const categories = await getAllCategoryBreakdown({ userId });
    const dailyTrend = await getDailySpending({ userId });
    const healthScore = await calculateHealthScore(userId);

    // Find finance category total to exclude from savings rate calculation
    const financeTotal = categories
      .filter(c => c.category === 'Finance')
      .reduce((sum, c) => sum + c.total, 0);

    // Calculate savings
    const savings = summary.totalIncome - (summary.totalExpense - financeTotal);
    const savingsRate = summary.totalIncome > 0
      ? Math.round((savings / summary.totalIncome) * 100)
      : 0;

    // Category percentages (expense only)
    const expenseCategories = categories.filter(c => c.type === 'expense');
    const totalExpense = expenseCategories.reduce((sum, c) => sum + c.total, 0);
    const categoryData = expenseCategories.map(c => ({
      category: c.category,
      total: c.total,
      count: c.count,
      percentage: totalExpense > 0 ? Math.round((c.total / totalExpense) * 100) : 0,
    }));

    // Compile Jarvis Advice Checklist
    const jarvisAdvice = [];
    const wantsCategories = ['Food', 'Shopping', 'Smoking', 'Alcohol'];
    const wantsTotal = categories
      .filter(c => c.type === 'expense' && wantsCategories.includes(c.category))
      .reduce((sum, c) => sum + c.total, 0);

    const incomeLimit = summary.totalIncome > 0 ? summary.totalIncome : 1;
    const wantsPercentageOfIncome = (wantsTotal / incomeLimit) * 100;

    if (summary.totalIncome > 0 && wantsPercentageOfIncome > 30) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Wants',
        text: `Bhai, discretionary kharche (Swiggy, shopping, sutta/daaru) income ke ${Math.round(wantsPercentageOfIncome)}% ho chuke hain! Lagaan lagao 🚨`
      });
    } else if (summary.totalIncome === 0 && wantsTotal > 0.4 * summary.totalExpense) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Wants',
        text: 'Bhai, total kharche ka 40% se jyada discretionary items pe ja raha hai. Thoda control kar! 🚨'
      });
    }

    if (summary.totalIncome > 0 && savingsRate < 10) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Savings',
        text: `Savings rate low chal raha hai (${savingsRate}%). Target is min 20% 📉`
      });
    }

    
    if (summary.totalIncome > 0 && financeTotal === 0) {
      jarvisAdvice.push({
        type: 'tip',
        category: 'Investment',
        text: 'Surplus bacha hai toh mutual fund ya gold SIP shuru kar ke paisa compound kar! 💡'
      });
    }

    // Dynamic recurring pattern detection suggestions
    try {
      const activeBills = await getActiveRecurringBills({ userId });
      const frequentTxns = await getFrequentTransactions({ userId });

      for (const txn of frequentTxns) {
        // Check if this is already configured as an active recurring bill
        const isAlreadyConfigured = activeBills.some(bill => 
          bill.amount === txn.amount && 
          bill.category === txn.category && 
          (bill.note || '') === (txn.note || '')
        );

        if (!isAlreadyConfigured) {
          const name = txn.note ? `"${txn.note}"` : txn.category;
          jarvisAdvice.push({
            type: 'tip',
            category: 'Automation',
            text: `Bhai, tu pichle 30 din me ${txn.frequency} baar ₹${txn.amount.toLocaleString('en-IN')} ${name} pe kharch kar chuka hai. Isko automated Recurring Bill bana le! ⚡`
          });
        }
      }
    } catch (err) {
      console.error('Jarvis pattern detection error:', err);
    }

    if (healthScore.breakdown.consistency.score < 50) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Consistency',
        text: 'Consistency low hai bhai. Roz transaction track kar, habit banana padega! 📝'
      });
    }

    return res.json({
      success: true,
      month: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      summary: {
        totalIncome: summary.totalIncome,
        totalExpense: summary.totalExpense,
        savings,
        savingsRate,
        expenseCount: summary.expenseCount,
        incomeCount: summary.incomeCount,
      },
      categories: categoryData,
      dailyTrend,
      healthScore: {
        score: healthScore.score,
        subtitle: healthScore.subtitle,
      },
      jarvisAdvice,
    });
  } catch (err) {
    console.error('GET /insights/overview error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
