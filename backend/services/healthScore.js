/**
 * ═══════════════════════════════════════════════
 * MAD — Money Health Score Calculator v2
 * ═══════════════════════════════════════════════
 *
 * Score = weighted average of 6 factors (0–100):
 *
 *  1. Savings Rate        (25%) — (income - expense) / income
 *  2. Goal Progress       (20%) — priority-weighted goal tracking
 *  3. Expense Control     (20%) — essential vs non-essential ratio
 *  4. Budget Discipline   (15%) — expense vs salary (monthlyIncome)
 *  5. Consistency         (10%) — how regularly user tracks
 *  6. Spending Diversity  (10%) — spread across categories
 *
 *  Goal Priority Impact:
 *    High (3) → 3x weight in goal score
 *    Medium (2) → 2x weight
 *    Low (1) → 1x weight
 */

const {
  getCurrentMonthTotals,
  getCategoryBreakdown,
  getActiveDays,
  getTransactionCount,
  getActiveGoals,
  getAllTimeTotals,
  getFinanceCategoryTotal,
  getUserById,
} = require('../db');

// Categories considered "essential" (Needs)
const ESSENTIAL_CATEGORIES = ['Housing', 'Health', 'Travel', 'Subscription'];
// Categories considered "non-essential" (Wants)
const NON_ESSENTIAL_CATEGORIES = ['Food', 'Shopping', 'Smoking', 'Alcohol', 'Others'];

/**
 * Calculate the Money Health Score v2
 * @param {number} userId
 * @returns {Promise<{ score: number, breakdown: object, subtitle: string }>}
 */
async function calculateHealthScore(userId) {
  const totals = await getCurrentMonthTotals({ userId });
  const categories = await getCategoryBreakdown({ userId });
  const { activeDays } = await getActiveDays({ userId });
  const { count: totalTransactions } = await getTransactionCount({ userId });

  // Days elapsed in current month (today's date)
  const today = new Date();
  const dayOfMonth = today.getDate();

  // ─── No data at all? Return starter score ───
  if (totalTransactions === 0 || parseInt(totalTransactions, 10) === 0) {
    return {
      score: 50,
      breakdown: {
        savingsRate: { score: 50, weight: 25 },
        goalProgress: { score: 50, weight: 20 },
        expenseControl: { score: 50, weight: 20 },
        budgetDiscipline: { score: 50, weight: 15 },
        consistency: { score: 50, weight: 10 },
        diversity: { score: 50, weight: 10 },
      },
      subtitle: 'Abhi koi entry nahi hai, start kar! 📝',
    };
  }

  const { totalIncome, totalExpense } = totals;

  // Find investment total to adjust savings rate
  let financeTotal = 0;
  for (const cat of categories) {
    if (cat.category === 'Finance') {
      financeTotal += parseFloat(cat.total) || 0;
    }
  }

  // Adjusted expense excludes Finance investments (which are savings)
  const adjustedExpense = Math.max(0, totalExpense - financeTotal);
  const totalSavings = Math.max(0, totalIncome - adjustedExpense);

  // ═══════════════════════════════════════
  // 1. SAVINGS RATE (25%)
  // ═══════════════════════════════════════
  let savingsScore = 50; // default if no income
  if (totalIncome > 0) {
    const savingsRate = totalSavings / totalIncome;
    // 20% savings = 100 score, 0% = 40, negative = 0-30
    if (savingsRate >= 0.20) {
      savingsScore = 100;
    } else if (savingsRate >= 0.10) {
      savingsScore = 70 + (savingsRate - 0.10) / 0.10 * 30;
    } else if (savingsRate >= 0) {
      savingsScore = 40 + (savingsRate / 0.10) * 30;
    } else {
      // Negative savings (overspending)
      savingsScore = Math.max(0, 30 + savingsRate * 100);
    }
  } else if (adjustedExpense > 0) {
    // Only expenses, no income logged
    savingsScore = 30;
  }

  // ═══════════════════════════════════════
  // 2. GOAL PROGRESS — Priority Weighted (20%)
  // ═══════════════════════════════════════
  const goalProgressResult = await calculateGoalProgress(userId);
  const goalScore = goalProgressResult.score;

  // ═══════════════════════════════════════
  // 3. EXPENSE CONTROL (20%)
  // ═══════════════════════════════════════
  const activeExpenseCategories = categories.filter(c => c.category !== 'Finance' && c.category !== 'Income');
  let controlScore = 50;
  const totalControlSpend = adjustedExpense;
  if (totalControlSpend === 0 && totalIncome > 0) {
    // No expenses at all but income exists = perfect control
    controlScore = 100;
  } else if (totalControlSpend > 0 && activeExpenseCategories.length > 0) {
    let essentialSpend = 0;
    let nonEssentialSpend = 0;

    for (const cat of activeExpenseCategories) {
      if (ESSENTIAL_CATEGORIES.includes(cat.category)) {
        essentialSpend += parseFloat(cat.total) || 0;
      } else {
        nonEssentialSpend += parseFloat(cat.total) || 0;
      }
    }

    const essentialRatio = essentialSpend / totalControlSpend;
    // More essential spend = better control
    // 60%+ essential = 90-100, 40-60% = 60-85, <40% = 30-55
    if (essentialRatio >= 0.6) {
      controlScore = 90 + (essentialRatio - 0.6) / 0.4 * 10;
    } else if (essentialRatio >= 0.4) {
      controlScore = 60 + (essentialRatio - 0.4) / 0.2 * 30;
    } else {
      controlScore = 30 + essentialRatio / 0.4 * 30;
    }
  }

  // ═══════════════════════════════════════
  // 4. BUDGET DISCIPLINE — Salary Aware (15%)
  // ═══════════════════════════════════════
  const budgetResult = await calculateBudgetDiscipline(userId, adjustedExpense);
  const budgetScore = budgetResult.score;
  const hasSalaryData = budgetResult.hasSalaryData;

  // ═══════════════════════════════════════
  // 5. CONSISTENCY (10%)
  // ═══════════════════════════════════════
  let consistencyScore;
  if (adjustedExpense === 0 && totalIncome > 0) {
    // No expenses to track yet — nothing to miss, perfect consistency
    consistencyScore = 100;
  } else {
    const trackingRate = dayOfMonth > 0 ? activeDays / dayOfMonth : 0;
    if (trackingRate >= 0.8) {
      consistencyScore = 100;
    } else if (trackingRate >= 0.5) {
      consistencyScore = 60 + (trackingRate - 0.5) / 0.3 * 40;
    } else if (trackingRate >= 0.2) {
      consistencyScore = 35 + (trackingRate - 0.2) / 0.3 * 25;
    } else if (trackingRate > 0) {
      consistencyScore = Math.max(40, 20 + trackingRate / 0.2 * 15);
    } else {
      consistencyScore = 10;
    }
  }

  // ═══════════════════════════════════════
  // 6. SPENDING DIVERSITY (10%)
  // ═══════════════════════════════════════
  const numCategories = activeExpenseCategories.length;
  let diversityScore;
  if (numCategories === 0) {
    // No expenses yet — not applicable, score stays perfect
    diversityScore = totalIncome > 0 ? 100 : 50;
  } else if (numCategories === 1) {
    diversityScore = 35;
  } else if (numCategories === 2) {
    diversityScore = 55;
  } else if (numCategories === 3) {
    diversityScore = 75;
  } else {
    diversityScore = Math.min(100, 80 + (numCategories - 4) * 5);
  }

  // ═══════════════════════════════════════
  // FINAL WEIGHTED SCORE
  // ═══════════════════════════════════════
  let score;
  if (hasSalaryData) {
    // Full 6-factor formula
    score = Math.round(
      savingsScore * 0.25 +
      goalScore * 0.20 +
      controlScore * 0.20 +
      budgetScore * 0.15 +
      consistencyScore * 0.10 +
      diversityScore * 0.10
    );
  } else {
    // No salary data → redistribute budget discipline weight (15%)
    // New weights: savings 29%, goal 24%, control 23%, consistency 12%, diversity 12%
    score = Math.round(
      savingsScore * 0.29 +
      goalScore * 0.24 +
      controlScore * 0.23 +
      consistencyScore * 0.12 +
      diversityScore * 0.12
    );
  }

  const clampedScore = Math.max(0, Math.min(100, score));

  // ─── Generate subtitle ───
  const subtitle = generateSubtitle(clampedScore, {
    savingsScore,
    goalScore,
    controlScore,
    budgetScore: hasSalaryData ? budgetScore : null,
    consistencyScore,
    diversityScore,
  }, goalProgressResult);

  return {
    score: clampedScore,
    breakdown: {
      savingsRate: { score: Math.round(savingsScore), weight: 25 },
      goalProgress: { score: Math.round(goalScore), weight: 20, detail: goalProgressResult.detail },
      expenseControl: { score: Math.round(controlScore), weight: 20 },
      budgetDiscipline: { score: Math.round(budgetScore), weight: hasSalaryData ? 15 : 0, active: hasSalaryData },
      consistency: { score: Math.round(consistencyScore), weight: 10 },
      diversity: { score: Math.round(diversityScore), weight: 10 },
    },
    subtitle,
  };
}

/**
 * Calculate Goal Progress score with priority weighting
 * High priority (3) goals have 3x impact, Medium (2) = 2x, Low (1) = 1x
 */
async function calculateGoalProgress(userId) {
  const goals = await getActiveGoals({ userId });

  // No goals set → perfect score (nothing to fail at)
  if (!goals || goals.length === 0) {
    return {
      score: 100,
      detail: 'no_goals',
      goalCount: 0,
      highPriorityOnTrack: true,
      highPriorityBehind: false,
    };
  }

  // Get actual surplus to calculate current allocation
  const totalsRow = await getAllTimeTotals({ userId });
  const financeRow = await getFinanceCategoryTotal({ userId });
  const netSavings = totalsRow.totalIncome - (totalsRow.totalExpense - financeRow.total);
  const availableSurplus = Math.max(0, netSavings);

  // Simulate priority-ordered allocation (same logic as GET /goals)
  let remainingSurplus = availableSurplus;
  const goalScores = [];
  let highPriorityOnTrack = true;
  let highPriorityBehind = false;

  for (const goal of goals) {
    let allocatedAmount = 0;

    if (remainingSurplus > 0) {
      if (remainingSurplus >= goal.targetAmount) {
        allocatedAmount = goal.targetAmount;
        remainingSurplus -= goal.targetAmount;
      } else {
        allocatedAmount = remainingSurplus;
        remainingSurplus = 0;
      }
    }

    // Calculate progress ratio
    const progress = goal.targetAmount > 0 ? allocatedAmount / goal.targetAmount : 0;

    // Score this individual goal
    let individualScore;
    if (progress >= 1.0) {
      individualScore = 100;
    } else if (progress >= 0.75) {
      individualScore = 80 + (progress - 0.75) / 0.25 * 20;
    } else if (progress >= 0.50) {
      individualScore = 55 + (progress - 0.50) / 0.25 * 25;
    } else if (progress >= 0.25) {
      individualScore = 30 + (progress - 0.25) / 0.25 * 25;
    } else {
      individualScore = 10 + progress / 0.25 * 20;
    }

    // Track high priority status
    if (goal.priority === 3) {
      if (progress < 0.50) {
        highPriorityOnTrack = false;
        highPriorityBehind = true;
      }
    }

    // Priority IS the weight: High(3) = 3x impact, Med(2) = 2x, Low(1) = 1x
    goalScores.push({
      title: goal.title,
      priority: goal.priority,
      progress: Math.round(progress * 100),
      individualScore: Math.round(individualScore),
      weightedScore: individualScore * goal.priority,
    });
  }

  // Priority-weighted average
  const totalWeight = goalScores.reduce((sum, g) => sum + g.priority, 0);
  const weightedSum = goalScores.reduce((sum, g) => sum + g.weightedScore, 0);
  const finalScore = totalWeight > 0 ? weightedSum / totalWeight : 60;

  return {
    score: Math.max(0, Math.min(100, Math.round(finalScore))),
    detail: 'calculated',
    goalCount: goals.length,
    highPriorityOnTrack,
    highPriorityBehind,
    goals: goalScores,
  };
}

/**
 * Calculate Budget Discipline score based on expense vs salary ratio
 * Uses monthlyIncome from user profile
 */
async function calculateBudgetDiscipline(userId, monthlyExpense) {
  const user = await getUserById({ id: userId });
  const monthlyIncome = user ? (parseFloat(user.monthlyIncome) || 0) : 0;

  if (monthlyIncome <= 0) {
    // No salary set in profile — can't calculate
    return { score: 50, hasSalaryData: false };
  }

  const expenseRatio = monthlyExpense / monthlyIncome;

  let score;
  if (expenseRatio <= 0.50) {
    // Under budget king — spending less than half salary
    score = 95 + (0.50 - expenseRatio) / 0.50 * 5;
  } else if (expenseRatio <= 0.70) {
    // Healthy spending
    score = 75 + (0.70 - expenseRatio) / 0.20 * 20;
  } else if (expenseRatio <= 0.85) {
    // Getting tight
    score = 55 + (0.85 - expenseRatio) / 0.15 * 20;
  } else if (expenseRatio <= 1.00) {
    // Paycheck-to-paycheck
    score = 35 + (1.00 - expenseRatio) / 0.15 * 20;
  } else {
    // Overspending vs salary
    score = Math.max(0, 35 - (expenseRatio - 1.0) * 50);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    hasSalaryData: true,
    expenseRatio: Math.round(expenseRatio * 100),
  };
}

/**
 * Generate a contextual Hinglish subtitle based on score
 */
function generateSubtitle(score, factors, goalResult) {
  const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

  if (score >= 85) {
    return getRandomItem([
      'Zabardast! Financial game strong hai 🔥',
      'Ambani level savings chal rahi hain, control superb hai! 🤑',
      'Ekdum solid! Aise hi chalega toh rich banega bhai 🚀',
      'Masterclass level tracking! Sahi ja raha hai bilkul 💎'
    ]);
  }
  if (score >= 70) {
    return getRandomItem([
      'Control mein hai, thoda aur better ho sakta hai 💪',
      'Bhai balance achha hai, bas thodi si discipline aur! 🎯',
      'Good going! Safe zone mein ho par chill mat ho jana 📈',
      'Aadatein sudhar rahi hain, keep the momentum up! ✨'
    ]);
  }
  if (score >= 55) {
    // Find weakest area and give targeted advice
    const factorEntries = [];
    factorEntries.push(['savingsScore', factors.savingsScore]);
    factorEntries.push(['goalScore', factors.goalScore]);
    factorEntries.push(['controlScore', factors.controlScore]);
    if (factors.budgetScore !== null) {
      factorEntries.push(['budgetScore', factors.budgetScore]);
    }
    factorEntries.push(['consistencyScore', factors.consistencyScore]);
    factorEntries.push(['diversityScore', factors.diversityScore]);

    const weakest = factorEntries.reduce((a, b) => a[1] < b[1] ? a : b);

    const tips = {
      savingsScore: [
        'Savings badhane pe focus kar 💰',
        'Kamai achhi hai toh bacha bhi le thoda, mutual fund bula raha hai! 💸',
        'Bhai, save first, spend later. Rule #1 yaad hai na? 🧠',
        'Salary aate hi 20% side pe nikal diya kar! 🐖'
      ],
      goalScore: goalResult && goalResult.highPriorityBehind ? [
        'Bhai, HIGH priority goal peeche chal raha hai! Focus kar warna miss ho jayega 🎯🚨',
        'Tera important goal miss hone wala hai, savings badha ASAP! ⚡',
        'High priority goal ke liye zyada paisa bacha, ye tere liye important hai! 🔥',
      ] : [
        'Goals ke liye saving thodi kam pad rahi hai, push kar! 🎯',
        'Goal progress slow hai, thoda aur effort laga savings me! 🏃‍♂️',
        'Apne goals pe nazar rakh, progress track kar regularly! 📊',
      ],
      controlScore: [
        'Non-essential kharche thoda kam kar ✂️',
        'Swiggy-Zomato aur shopping ka bill thoda tight kar 🍕',
        'Wants vs Needs ki ladai me Needs ko jitna zaroori hai! 🛑',
        'Bhai discretionary kharche pocket khaali kar denge, control kar! 🪓'
      ],
      budgetScore: [
        'Salary ke against kharcha zyada ho raha hai, budget banao! 💳',
        'Income se zyada ya barabar kharch ho raha hai, sambhal ja bhai! 📉',
        'Budget tight ho raha hai salary ke against, non-essential kato! ⚠️',
      ],
      consistencyScore: [
        'Roz track kar, habit banana padega 📝',
        'Bhai, entry missing hain lagta hai. Track daily! ⏰',
        'Ek din track kiya, teen din choda? Aise nahi chalega, track regularly! 🚶‍♂️',
        'Daily logging is the secret of MAD! Streak banale ⚡'
      ],
      diversityScore: [
        'Spending track karna start kar har category mein 📊',
        'Khaali ek-do chizon pe kharch ho raha hai kya? Categorize properly! 🏷️',
        'Apne kharcho ko different categories me divide kar, clarity aayegi. 🔍'
      ],
    };
    const tipList = tips[weakest[0]] || ['Thoda improve karna padega, keep going! 📈'];
    return getRandomItem(tipList);
  }
  if (score >= 40) {
    // Check if goals are dragging the score
    if (goalResult && goalResult.highPriorityBehind) {
      return getRandomItem([
        'Important goals miss ho rahe hain aur kharcha bhi zyada hai — double trouble! 🚨🎯',
        'Bhai, high priority goal ke liye paisa nahi bach raha. Kharche kat! ⛔',
        'Goals aur budget dono danger zone me hain, abhi action le! 🆘',
      ]);
    }
    return getRandomItem([
      'Paisa leak ho raha hai bhai, sambhal ja 🚨',
      'Wallet bol raha hai \'rehem karo\'! Budget tight karo 💳',
      'Kharche control se bahar ja rahe hain, break lagao! ⚠️',
      'Red zone ke paas ho, non-essential kharche bilkul band kar do abhi! ⛔'
    ]);
  }
  return getRandomItem([
    'Financial emergency mode — abhi se control le! 🆘',
    'Bhai, bank account check kiya kya? Halat gambhir hai! 🥶',
    'Ghar chalana mushkil ho jayega agar abhi control nahi kiya toh! 📉',
    'Khatre ki ghanti! Sabhi discretionary kharche turant rok do 🔔'
  ]);
}

module.exports = { calculateHealthScore };
