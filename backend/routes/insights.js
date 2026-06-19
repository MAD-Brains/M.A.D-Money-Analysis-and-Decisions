const express = require('express');
const router = express.Router();
const { calculateHealthScore } = require('../services/healthScore');
const { getDailySpending, getMonthSummary, getAllCategoryBreakdown, getActiveRecurringBills, getFrequentTransactions, getUserById, getAllTransactions, getActiveGoals } = require('../db');

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

    // Retrieve active savings goals
    const goals = await getActiveGoals({ userId });
    const activeHighPriorityGoals = goals.filter(g => g.priority === 3 && g.isCompleted === 0);
    const hasHighPriorityGoal = activeHighPriorityGoals.length > 0;

    // Monthly Salary set in profile auto-populates as baseline income when
    // no (or less) income has been logged for the month yet
    const user = await getUserById({ id: userId });
    const monthlyIncome = parseFloat(user && user.monthlyIncome) || 0;

    // Scan all transactions for the current month to calculate exact totals
    const allTxns = await getAllTransactions({ userId });
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentMonthTxns = allTxns.filter(t => {
      const d = new Date(t.createdAt);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    const DISCRETIONARY_CATEGORIES = ['Food', 'Shopping', 'Smoking', 'Alcohol', 'Subscription', 'Others'];

    let necessaryExpense = 0;
    let discretionaryExpense = 0;
    let investments = 0;
    let loggedSalary = 0;
    let additionalIncome = 0;

    for (const tx of currentMonthTxns) {
      const amount = parseFloat(tx.amount) || 0;
      if (tx.type === 'income') {
        const note = tx.note ? tx.note.toLowerCase() : '';
        const isSalaryNote = note.includes('salary');
        const isSalaryAmount = Math.abs(amount - monthlyIncome) < 0.01;
        if ((isSalaryNote || isSalaryAmount) && loggedSalary === 0 && monthlyIncome > 0) {
          loggedSalary = amount;
        } else {
          additionalIncome += amount;
        }
      } else {
        const category = tx.category;
        const note = tx.note ? tx.note.toLowerCase() : '';

        if (category === 'Finance') {
          const isInvestment = note.includes('sip') || 
                               note.includes('mutual') || 
                               note.includes('stock') || 
                               note.includes('share') || 
                               note.includes('gold') || 
                               note.includes('investment');
          if (isInvestment) {
            investments += amount;
          } else {
            necessaryExpense += amount;
          }
        } else if (DISCRETIONARY_CATEGORIES.includes(category)) {
          discretionaryExpense += amount;
        } else {
          necessaryExpense += amount;
        }
      }
    }

    const totalIncome = Math.max(loggedSalary, monthlyIncome) + additionalIncome;
    const totalExpense = necessaryExpense + discretionaryExpense;

    summary.totalIncome = totalIncome;
    summary.totalExpense = totalExpense;

    // Calculate actual savings (excluding investments which are savings)
    const savings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0
      ? Math.round((savings / totalIncome) * 100)
      : 0;

    // Category percentages (expense only)
    const categoryData = [];
    let totalExpenseForBreakdown = 0;

    for (const c of categories) {
      if (c.type === 'expense') {
        if (c.category === 'Finance') {
          const financeExpense = Math.max(0, c.total - investments);
          if (financeExpense > 0) {
            categoryData.push({
              category: c.category,
              total: financeExpense,
              count: c.count,
            });
            totalExpenseForBreakdown += financeExpense;
          }
        } else {
          categoryData.push({
            category: c.category,
            total: c.total,
            count: c.count,
          });
          totalExpenseForBreakdown += c.total;
        }
      }
    }

    categoryData.forEach(c => {
      c.percentage = totalExpenseForBreakdown > 0 ? Math.round((c.total / totalExpenseForBreakdown) * 100) : 0;
    });

    // Compile Jarvis Advice Checklist
    const jarvisAdvice = [];
    const wantsTotal = discretionaryExpense; // Use the parsed discretionary total

    const wantsPercentageOfIncome = totalIncome > 0 ? (wantsTotal / totalIncome) * 100 : 0;

    if (totalIncome > 0 && wantsPercentageOfIncome > 30) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Wants',
        text: `Bhai, discretionary kharche (Swiggy, shopping, sutta/daaru) income ke ${Math.round(wantsPercentageOfIncome)}% ho chuke hain! Lagaan lagao 🚨`
      });
    } else if (totalIncome === 0 && wantsTotal > 0.4 * totalExpense) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Wants',
        text: 'Bhai, total kharche ka 40% se jyada discretionary items pe ja raha hai. Thoda control kar! 🚨'
      });
    }

    if (totalIncome > 0 && savingsRate < 10) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Savings',
        text: `Savings rate low chal raha hai (${savingsRate}%). Target is min 20% 📉`
      });
    }

    if (totalIncome > 0 && investments === 0) {
      jarvisAdvice.push({
        type: 'tip',
        category: 'Investment',
        text: 'Surplus bacha hai toh mutual fund ya gold SIP shuru kar ke paisa compound kar! 💡'
      });
    }

    if (hasHighPriorityGoal && discretionaryExpense > 0.20 * totalIncome && totalIncome > 0) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Goals',
        text: `Bhai, high priority goal active hai par Swiggy, shopping aur daaru/sutta pe kharcha control se bahar hai (${Math.round((discretionaryExpense / totalIncome) * 100)}% of income). Thoda cut-down kar! 🎯`
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

    // Budget Discipline warning (salary-aware factor)
    if (healthScore.breakdown.budgetDiscipline && healthScore.breakdown.budgetDiscipline.active && healthScore.breakdown.budgetDiscipline.score < 50) {
      jarvisAdvice.push({
        type: 'warning',
        category: 'Budget',
        text: 'Salary ke against kharcha zyada ho raha hai! Budget tight karo warna month end me dikkat hogi 💳'
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
