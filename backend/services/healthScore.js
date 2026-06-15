/**
 * ═══════════════════════════════════════════════
 * MAD — Money Health Score Calculator
 * ═══════════════════════════════════════════════
 *
 * "Income" for these factors = max(logged income this month, profile Monthly Salary),
 * so setting a Monthly Salary in the profile auto-populates income/savings calculations
 * even before any income transaction is logged.
 *
 * Score = weighted average of factors (0–100):
 *
 *  1. Savings Rate       (35% / 30% with salary) — (income - expense) / income
 *  2. Spending Diversity (20% / 15% with salary) — spread across categories
 *  3. Consistency        (25% / 20% with salary) — how regularly user tracks
 *  4. Expense Control    (20% / 15% with salary) — essential vs non-essential ratio
 *  5. Budget Discipline  (0% / 20% with salary)  — expense vs Monthly Salary ratio
 */

const {
  getCurrentMonthTotals,
  getCategoryBreakdown,
  getActiveDays,
  getTransactionCount,
  getUserById
} = require('../db');

// Categories considered "essential" (Needs)
const ESSENTIAL_CATEGORIES = ['Housing', 'Health', 'Travel', 'Subscription'];
// Categories considered "non-essential" (Wants)
const NON_ESSENTIAL_CATEGORIES = ['Food', 'Shopping', 'Smoking', 'Alcohol', 'Others'];

/**
 * Calculate the Money Health Score
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
        savingsRate: { score: 50, weight: 35 },
        diversity: { score: 50, weight: 20 },
        consistency: { score: 50, weight: 25 },
        expenseControl: { score: 50, weight: 20 },
        budgetDiscipline: { score: 50, weight: 0, active: false },
      },
      subtitle: 'Abhi koi entry nahi hai, start kar! 📝',
    };
  }

  const { totalIncome: loggedIncome, totalExpense } = totals;

  // Monthly Salary set in profile — auto-populates as baseline income
  // when no (or less) income has been logged for the month yet
  const user = await getUserById({ id: userId });
  const monthlyIncome = parseFloat(user && user.monthlyIncome) || 0;
  const hasSalaryData = monthlyIncome > 0;
  const totalIncome = Math.max(parseFloat(loggedIncome) || 0, monthlyIncome);

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
  // 1. SAVINGS RATE (35%)
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
  // 2. SPENDING DIVERSITY (20%)
  // ═══════════════════════════════════════
  // Count categories excluding Finance and Income
  const activeExpenseCategories = categories.filter(c => c.category !== 'Finance' && c.category !== 'Income');
  const numCategories = activeExpenseCategories.length;
  // More categories = better (shows awareness of where money goes)
  // 1 category = 30, 2 = 50, 3 = 70, 4+ = 85-100
  let diversityScore;
  if (numCategories === 0) {
    diversityScore = 50;
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
  // 3. CONSISTENCY (25%)
  // ═══════════════════════════════════════
  // What % of days in this month has user tracked?
  const trackingRate = dayOfMonth > 0 ? activeDays / dayOfMonth : 0;
  let consistencyScore;
  if (trackingRate >= 0.8) {
    consistencyScore = 100;
  } else if (trackingRate >= 0.5) {
    consistencyScore = 60 + (trackingRate - 0.5) / 0.3 * 40;
  } else if (trackingRate >= 0.2) {
    consistencyScore = 35 + (trackingRate - 0.2) / 0.3 * 25;
  } else if (trackingRate > 0) {
    consistencyScore = 20 + trackingRate / 0.2 * 15;
  } else {
    consistencyScore = 10;
  }

  // ═══════════════════════════════════════
  // 4. EXPENSE CONTROL (20%)
  // ═══════════════════════════════════════
  let controlScore = 50;
  const totalControlSpend = adjustedExpense;
  if (totalControlSpend > 0 && activeExpenseCategories.length > 0) {
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
  // 5. BUDGET DISCIPLINE — Salary Aware (0% / 20% with salary)
  // ═══════════════════════════════════════
  let budgetScore = 50;
  if (hasSalaryData) {
    const expenseRatio = adjustedExpense / monthlyIncome;
    if (expenseRatio <= 0.50) {
      // Under budget king — spending less than half salary
      budgetScore = 95 + (0.50 - expenseRatio) / 0.50 * 5;
    } else if (expenseRatio <= 0.70) {
      // Healthy spending
      budgetScore = 75 + (0.70 - expenseRatio) / 0.20 * 20;
    } else if (expenseRatio <= 0.85) {
      // Getting tight
      budgetScore = 55 + (0.85 - expenseRatio) / 0.15 * 20;
    } else if (expenseRatio <= 1.00) {
      // Paycheck-to-paycheck
      budgetScore = 35 + (1.00 - expenseRatio) / 0.15 * 20;
    } else {
      // Overspending vs salary
      budgetScore = Math.max(0, 35 - (expenseRatio - 1.0) * 50);
    }
    budgetScore = Math.max(0, Math.min(100, budgetScore));
  }

  // ═══════════════════════════════════════
  // FINAL WEIGHTED SCORE
  // ═══════════════════════════════════════
  const score = hasSalaryData
    ? Math.round(
        savingsScore * 0.30 +
        diversityScore * 0.15 +
        consistencyScore * 0.20 +
        controlScore * 0.15 +
        budgetScore * 0.20
      )
    : Math.round(
        savingsScore * 0.35 +
        diversityScore * 0.20 +
        consistencyScore * 0.25 +
        controlScore * 0.20
      );

  const clampedScore = Math.max(0, Math.min(100, score));

  // ─── Generate subtitle ───
  const subtitleFactors = {
    savingsScore,
    diversityScore,
    consistencyScore,
    controlScore,
  };
  if (hasSalaryData) {
    subtitleFactors.budgetScore = budgetScore;
  }
  const subtitle = generateSubtitle(clampedScore, subtitleFactors);

  return {
    score: clampedScore,
    breakdown: {
      savingsRate: { score: Math.round(savingsScore), weight: hasSalaryData ? 30 : 35 },
      diversity: { score: Math.round(diversityScore), weight: hasSalaryData ? 15 : 20 },
      consistency: { score: Math.round(consistencyScore), weight: hasSalaryData ? 20 : 25 },
      expenseControl: { score: Math.round(controlScore), weight: hasSalaryData ? 15 : 20 },
      budgetDiscipline: { score: Math.round(budgetScore), weight: hasSalaryData ? 20 : 0, active: hasSalaryData },
    },
    subtitle,
  };
}

/**
 * Generate a contextual Hinglish subtitle based on score
 */
function generateSubtitle(score, factors) {
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
    // Find weakest area
    const weakest = Object.entries(factors).reduce((a, b) =>
      a[1] < b[1] ? a : b
    );
    const tips = {
      savingsScore: [
        'Savings badhane pe focus kar 💰',
        'Kamai achhi hai toh bacha bhi le thoda, mutual fund bula raha hai! 💸',
        'Bhai, save first, spend later. Rule #1 yaad hai na? 🧠',
        'Salary aate hi 20% side pe nikal diya kar! 🐖'
      ],
      diversityScore: [
        'Spending track karna start kar har category mein 📊',
        'Khaali ek-do chizon pe kharch ho raha hai kya? Categorize properly! 🏷️',
        'Apne kharcho ko different categories me divide kar, clarity aayegi. 🔍'
      ],
      consistencyScore: [
        'Roz track kar, habit banana padega 📝',
        'Bhai, entry missing hain lagta hai. Track daily! ⏰',
        'Ek din track kiya, teen din choda? Aise nahi chalega, track regularly! 🚶‍♂️',
        'Daily logging is the secret of MAD! Streak banale ⚡'
      ],
      controlScore: [
        'Non-essential kharche thoda kam kar ✂️',
        'Swiggy-Zomato aur shopping ka bill thoda tight kar 🍕',
        'Wants vs Needs ki ladai me Needs ko jitna zaroori hai! 🛑',
        'Bhai discretionary kharche pocket khaali kar denge, control kar! 🪓'
      ],
      budgetScore: [
        'Salary ke against kharcha zyada ho raha hai, budget tight kar 💳',
        'Mahine ke end tak salary tikni chahiye, abhi se control kar! 📆',
        'Apni salary ka ek fixed % hi kharch karne ka rule bana le 🎯'
      ],
    };
    const tipList = tips[weakest[0]] || ['Thoda improve karna padega, keep going! 📈'];
    return getRandomItem(tipList);
  }
  if (score >= 40) {
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
