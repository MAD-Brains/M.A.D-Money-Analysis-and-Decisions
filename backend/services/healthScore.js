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
  getUserById,
  getAllTransactions,
  getActiveGoals
} = require('../db');

// Categories considered "discretionary" (Wants / avoidable)
const DISCRETIONARY_CATEGORIES = ['Food', 'Shopping', 'Smoking', 'Alcohol', 'Subscription', 'Others'];

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
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // Retrieve monthly salary from user profile
  const user = await getUserById({ id: userId });
  const monthlyIncome = parseFloat(user && user.monthlyIncome) || 0;
  const hasSalaryData = monthlyIncome > 0;

  // Retrieve all transactions to scan for additional random incomes and fine-grain expenses
  const allTxns = await getAllTransactions({ userId });
  const currentMonthTxns = allTxns.filter(t => {
    const d = new Date(t.createdAt);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });

  // Retrieve active savings goals
  const goals = await getActiveGoals({ userId });
  const activeHighPriorityGoals = goals.filter(g => g.priority === 3 && g.isCompleted === 0);
  const hasHighPriorityGoal = activeHighPriorityGoals.length > 0;

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
      // expense
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

  // ─── No data at all? Return starter score ───
  if (totalTransactions === 0 || parseInt(totalTransactions, 10) === 0) {
    return {
      score: 50,
      breakdown: {
        savingsRate: { score: 50, weight: (hasSalaryData || hasHighPriorityGoal) ? 30 : 35 },
        diversity: { score: 50, weight: (hasSalaryData || hasHighPriorityGoal) ? 15 : 20 },
        consistency: { score: 50, weight: (hasSalaryData || hasHighPriorityGoal) ? 20 : 25 },
        expenseControl: { score: 50, weight: (hasSalaryData || hasHighPriorityGoal) ? 15 : 20 },
        budgetDiscipline: { score: 50, weight: (hasSalaryData || hasHighPriorityGoal) ? 20 : 0, active: (hasSalaryData || hasHighPriorityGoal) },
      },
      subtitle: 'Abhi koi entry nahi hai, start kar! 📝',
    };
  }

  // ─── Income entered but no expense? Return 100 ───
  if (totalIncome > 0 && totalExpense === 0) {
    return {
      score: 100,
      breakdown: {
        savingsRate: { score: 100, weight: (hasSalaryData || hasHighPriorityGoal) ? 30 : 35 },
        diversity: { score: 100, weight: (hasSalaryData || hasHighPriorityGoal) ? 15 : 20 },
        consistency: { score: 100, weight: (hasSalaryData || hasHighPriorityGoal) ? 20 : 25 },
        expenseControl: { score: 100, weight: (hasSalaryData || hasHighPriorityGoal) ? 15 : 20 },
        budgetDiscipline: { score: 100, weight: (hasSalaryData || hasHighPriorityGoal) ? 20 : 0, active: (hasSalaryData || hasHighPriorityGoal) },
      },
      subtitle: 'Wah! Income hai aur koi kharcha nahi. 100/100 score! 🤑',
    };
  }

  // ═══════════════════════════════════════
  // 1. SAVINGS RATE (35% or 30% with salary/goals)
  // ═══════════════════════════════════════
  let savingsScore = 50; // default if no income
  if (totalIncome > 0) {
    // Basic necessary expenses do not reduce the savings rate score.
    const savingsRate = (totalIncome - discretionaryExpense) / totalIncome;
    // 20% savings = 100 score, 0% = 40, negative = 0-30
    if (savingsRate >= 0.20) {
      savingsScore = 100;
    } else if (savingsRate >= 0.10) {
      savingsScore = 70 + (savingsRate - 0.10) / 0.10 * 30;
    } else if (savingsRate >= 0) {
      savingsScore = 40 + (savingsRate / 0.10) * 30;
    } else {
      // Negative savings (overspending on discretionary)
      savingsScore = Math.max(0, 30 + savingsRate * 100);
    }
  } else if (discretionaryExpense > 0) {
    // Only discretionary expenses, no income logged
    savingsScore = 30;
  }

  // ═══════════════════════════════════════
  // 2. SPENDING DIVERSITY (20% or 15% with salary/goals)
  // ═══════════════════════════════════════
  const activeExpenseCategories = categories.filter(c => c.category !== 'Finance' && c.category !== 'Income');
  const numCategories = activeExpenseCategories.length;
  // More categories = better (shows awareness of where money goes)
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

  // If total expense is very small, boost diversity score towards 100
  const bufferThreshold = totalIncome > 0 ? 0.05 * totalIncome : 1000;
  if (totalExpense < bufferThreshold && totalExpense > 0) {
    const ratio = totalExpense / bufferThreshold;
    diversityScore = diversityScore + (1 - ratio) * (100 - diversityScore);
  }

  // ═══════════════════════════════════════
  // 3. CONSISTENCY (25% or 20% with salary/goals)
  // ═══════════════════════════════════════
  // Calculate maximum trackable days for the current month based on registration date
  const regDate = new Date((user && user.createdAt) || today);
  let maxTrackableDays = dayOfMonth;
  if (regDate.getFullYear() === today.getFullYear() && regDate.getMonth() === today.getMonth()) {
    // Registered this month: trackable days is days since registration
    const msDiff = today - regDate;
    const daysDiff = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    maxTrackableDays = Math.max(1, Math.min(dayOfMonth, daysDiff));
  }
  const trackingRate = maxTrackableDays > 0 ? activeDays / maxTrackableDays : 0;
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
  // 4. EXPENSE CONTROL (20% or 15% with salary/goals)
  // ═══════════════════════════════════════
  let controlScore = 50;
  const totalControlSpend = necessaryExpense + discretionaryExpense;
  if (totalControlSpend > 0) {
    const essentialRatio = necessaryExpense / totalControlSpend;
    // More necessary spend vs discretionary = better control
    if (essentialRatio >= 0.6) {
      controlScore = 90 + (essentialRatio - 0.6) / 0.4 * 10;
    } else if (essentialRatio >= 0.4) {
      controlScore = 60 + (essentialRatio - 0.4) / 0.2 * 30;
    } else {
      controlScore = 30 + essentialRatio / 0.4 * 30;
    }

    // If discretionary spending is very small, we should not drop the controlScore.
    if (discretionaryExpense < bufferThreshold) {
      // Smoothly interpolate: if discretionaryExpense = 0, boost to 100.
      // If discretionaryExpense = bufferThreshold, keep the original controlScore.
      const ratio = discretionaryExpense / bufferThreshold; // 0 to 1
      controlScore = controlScore + (1 - ratio) * (100 - controlScore);
    }
  }

  // ═══════════════════════════════════════
  // 5. BUDGET/GOAL DISCIPLINE (0% or 20% with salary/goals)
  // ═══════════════════════════════════════
  let budgetScore = 50;
  const scoreActiveDiscipline = hasSalaryData || hasHighPriorityGoal;

  if (hasHighPriorityGoal) {
    // If a high-priority goal is active, penalize excessive discretionary spending
    if (totalIncome > 0) {
      const discretionaryRatio = discretionaryExpense / totalIncome;
      if (discretionaryRatio <= 0.15) {
        budgetScore = 100;
      } else if (discretionaryRatio <= 0.30) {
        budgetScore = 100 - ((discretionaryRatio - 0.15) / 0.15) * 60;
      } else {
        budgetScore = Math.max(0, 40 - ((discretionaryRatio - 0.30) / 0.20) * 40);
      }
    } else {
      if (discretionaryExpense <= 2000) {
        budgetScore = 100;
      } else if (discretionaryExpense <= 5000) {
        budgetScore = 100 - ((discretionaryExpense - 2000) / 3000) * 60;
      } else {
        budgetScore = Math.max(0, 40 - ((discretionaryExpense - 5000) / 5000) * 40);
      }
    }
  } else if (hasSalaryData) {
    const expenseRatio = discretionaryExpense / monthlyIncome;
    if (expenseRatio <= 0.20) {
      budgetScore = 100;
    } else if (expenseRatio <= 0.40) {
      budgetScore = 80 + ((0.40 - expenseRatio) / 0.20) * 20;
    } else if (expenseRatio <= 0.60) {
      budgetScore = 55 + ((0.60 - expenseRatio) / 0.20) * 25;
    } else if (expenseRatio <= 0.80) {
      budgetScore = 35 + ((0.80 - expenseRatio) / 0.20) * 20;
    } else {
      budgetScore = Math.max(0, 35 - (expenseRatio - 0.80) * 50);
    }
  }

  // ═══════════════════════════════════════
  // FINAL WEIGHTED SCORE
  // ═══════════════════════════════════════
  const score = scoreActiveDiscipline
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
  if (scoreActiveDiscipline) {
    subtitleFactors.budgetScore = budgetScore;
  }
  const subtitle = generateSubtitle(clampedScore, subtitleFactors, hasHighPriorityGoal);

  return {
    score: clampedScore,
    breakdown: {
      savingsRate: { score: Math.round(savingsScore), weight: scoreActiveDiscipline ? 30 : 35 },
      diversity: { score: Math.round(diversityScore), weight: scoreActiveDiscipline ? 15 : 20 },
      consistency: { score: Math.round(consistencyScore), weight: scoreActiveDiscipline ? 20 : 25 },
      expenseControl: { score: Math.round(controlScore), weight: scoreActiveDiscipline ? 15 : 20 },
      budgetDiscipline: { score: Math.round(budgetScore), weight: scoreActiveDiscipline ? 20 : 0, active: scoreActiveDiscipline },
    },
    subtitle,
  };
}

/**
 * Generate a contextual Hinglish subtitle based on score
 */
function generateSubtitle(score, factors, hasHighPriorityGoal) {
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
      budgetScore: hasHighPriorityGoal ? [
        'Bhai, high priority savings goal active hai! Swiggy, shopping aur daaru/sutta band kar 🎯',
        'Discretionary kharche cut down kar, goal achieve karna hai na? 💸',
        'Savings goal ke liye extra bacha, discretionary spending rok de abhi! 🛑'
      ] : [
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
