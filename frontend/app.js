/* ═══════════════════════════════════════════════
   MAD — Client-Side Application Logic v3
   + View All + Edit Transaction
   ═══════════════════════════════════════════════ */

const API_BASE = '/api';

// ─── 401 interceptor ───
// If a session expires/clears mid-use, any authenticated API call comes back
// 401 — re-show the login gate instead of letting ~30 call sites fail silently.
const nativeFetch = window.fetch.bind(window);
window.fetch = async function(input, init) {
  const response = await nativeFetch(input, init);
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (response.status === 401 && url.startsWith(`${API_BASE}/`) && !url.startsWith(`${API_BASE}/auth/`)) {
    showAuthOverlay();
  }
  return response;
};

let currentTrendData = [];
let currentTrendView = 'daily'; // 'daily' or 'weekly'

// ─── Category Keyword Map (mirror of backend) ───
const CATEGORY_MAP = {
  swiggy: 'Food', zomato: 'Food', food: 'Food', lunch: 'Food',
  dinner: 'Food', breakfast: 'Food', chai: 'Food', tea: 'Food',
  coffee: 'Food', snacks: 'Food', restaurant: 'Food', biryani: 'Food',
  pizza: 'Food', burger: 'Food',
  uber: 'Travel', ola: 'Travel', auto: 'Travel', metro: 'Travel',
  bus: 'Travel', train: 'Travel', petrol: 'Travel', diesel: 'Travel',
  fuel: 'Travel', parking: 'Travel', toll: 'Travel', rapido: 'Travel',
  cab: 'Travel', flight: 'Travel', ticket: 'Travel',
  netflix: 'Subscription', spotify: 'Subscription', hotstar: 'Subscription',
  prime: 'Subscription', youtube: 'Subscription', jio: 'Subscription',
  airtel: 'Subscription', recharge: 'Subscription', subscription: 'Subscription',
  vi: 'Subscription', bsnl: 'Subscription',
  rent: 'Housing', housing: 'Housing', electricity: 'Housing',
  water: 'Housing', maintenance: 'Housing', gas: 'Housing',
  wifi: 'Housing', internet: 'Housing', bijli: 'Housing', society: 'Housing',
  amazon: 'Shopping', flipkart: 'Shopping', myntra: 'Shopping',
  clothes: 'Shopping', shoes: 'Shopping', shopping: 'Shopping',
  meesho: 'Shopping', ajio: 'Shopping',
  medicine: 'Health', doctor: 'Health', hospital: 'Health',
  gym: 'Health', pharmacy: 'Health', dawai: 'Health', checkup: 'Health',
  grocery: 'Grocery', sabzi: 'Grocery', kirana: 'Grocery', atta: 'Grocery',
  doodh: 'Grocery', milk: 'Grocery', eggs: 'Grocery', vegetables: 'Grocery',
  fruits: 'Grocery', ration: 'Grocery', bigbasket: 'Grocery', blinkit: 'Grocery',
  zepto: 'Grocery', instamart: 'Grocery',
  cigarette: 'Smoking', sutta: 'Smoking', smoke: 'Smoking', vape: 'Smoking',
  gutkha: 'Smoking', tambaku: 'Smoking', hookah: 'Smoking',
  daaru: 'Alcohol', beer: 'Alcohol', whiskey: 'Alcohol', vodka: 'Alcohol',
  wine: 'Alcohol', rum: 'Alcohol', bar: 'Alcohol', pub: 'Alcohol',
  drinks: 'Alcohol', theka: 'Alcohol',
  salary: 'Income', income: 'Income', freelance: 'Income',
  bonus: 'Income', refund: 'Income', cashback: 'Income',
  got: 'Income', received: 'Income', earned: 'Income',
  mila: 'Income', mile: 'Income', credited: 'Income', collected: 'Income',
  won: 'Income', returned: 'Income',
  investor: 'Income', dividend: 'Income', profit: 'Income',
  interest: 'Income', commission: 'Income', reward: 'Income',
  stipend: 'Income', pension: 'Income',
  investment: 'Finance', emi: 'Finance', loan: 'Finance',
  insurance: 'Finance', sip: 'Finance', mutual: 'Finance', tax: 'Finance',
  gold: 'Finance', stocks: 'Finance', shares: 'Finance',
  send: 'Others', sent: 'Others', diya: 'Others', diye: 'Others', bheja: 'Others',
  paid: 'Others', transfer: 'Others', given: 'Others',
};

const INCOME_KEYWORDS = [
  'salary', 'income', 'freelance', 'bonus', 'refund', 'cashback',
  'got', 'received', 'earned', 'mila', 'mile', 'credited', 'collected', 'won', 'returned',
  'investor', 'dividend', 'profit', 'interest', 'commission', 'reward', 'stipend', 'pension',
];

const CATEGORY_EMOJI = {
  Food: '🍔', Travel: '🚗', Subscription: '📺', Housing: '🏠',
  Shopping: '🛍️', Health: '💊', Income: '💰', Others: '📦',
  Finance: '🏦', Grocery: '🥬', Smoking: '🚬', Alcohol: '🍺',
};

// ─── DOM Elements ───
const mainInput      = document.getElementById('main-input');
const addBtn         = document.getElementById('add-btn');
const preview        = document.getElementById('preview');
const previewAmount  = document.getElementById('preview-amount-val');
const previewCat     = document.getElementById('preview-category-val');
const previewNote    = document.getElementById('preview-note-val');
const previewNoteDot = document.getElementById('preview-note-divider');
const txnList        = document.getElementById('transactions-list');
const txnEmpty       = document.getElementById('transactions-empty');
const toastContainer = document.getElementById('toast-container');

// Health Score DOM
const healthNumber   = document.querySelector('.health-card__number');
const healthProgress = document.querySelector('.health-card__progress');
const healthSubtitle = document.querySelector('.health-card__subtitle');
const healthTrend    = document.getElementById('health-trend');

// View All DOM
const viewAllBtn     = document.getElementById('view-all-btn');
const viewAllOverlay = document.getElementById('view-all-overlay');
const viewAllBack    = document.getElementById('view-all-back');
const viewAllList    = document.getElementById('view-all-list');
const viewAllCount   = document.getElementById('view-all-count');

// Edit Modal DOM
const editBackdrop   = document.getElementById('edit-backdrop');
const editForm       = document.getElementById('edit-form');
const editClose      = document.getElementById('edit-close');
const editId         = document.getElementById('edit-id');
const editAmount     = document.getElementById('edit-amount');
const editNote       = document.getElementById('edit-note');
const editCategory   = document.getElementById('edit-category');
const editType       = document.getElementById('edit-type');

// Chart Toggle DOM
const trendBtnDaily  = document.getElementById('trend-btn-daily');
const trendBtnWeekly = document.getElementById('trend-btn-weekly');

// Insights DOM
const insightsBtn        = document.getElementById('insights-btn');
const insightsOverlay    = document.getElementById('insights-overlay');
const insightsBack       = document.getElementById('insights-back');
const insightsMonth      = document.getElementById('insights-month');
const insightIncome      = document.getElementById('insight-income');
const insightExpense     = document.getElementById('insight-expense');
const insightSavings     = document.getElementById('insight-savings');
const insightSavingsRate = document.getElementById('insight-savings-rate');
const insightHealth      = document.getElementById('insight-health');
const insightHealthDesc  = document.getElementById('insight-health-desc');
const donutTotal         = document.getElementById('donut-total');
const donutChart         = document.getElementById('donut-chart');
const categoryLegend     = document.getElementById('category-legend');
const trendSvg           = document.getElementById('trend-svg');
const trendLabels        = document.getElementById('trend-labels');

// Ledger DOM
const ledgerBtn        = document.getElementById('ledger-btn');
const ledgerOverlay    = document.getElementById('ledger-overlay');
const ledgerBack       = document.getElementById('ledger-back');
const ledgerList       = document.getElementById('ledger-list');
const ledgerTotalBal   = document.getElementById('ledger-total-balance');
const ledgerTotalSub   = document.getElementById('ledger-total-subtitle');

// Split Picker DOM (NEW)
const splitTriggerBtn   = document.getElementById('open-split-picker-btn');
const splitAddFriendBtn = document.getElementById('split-add-friend-btn');
const splitBackdrop     = document.getElementById('split-backdrop');
const splitClose        = document.getElementById('split-close');
const splitFriendChips  = document.getElementById('split-friend-chips');

const splitMethodField  = document.getElementById('split-method-field');
const splitMethodSelector = document.getElementById('split-method-selector');
const splitRows         = document.getElementById('split-rows');
const splitSummary      = document.getElementById('split-summary');
const splitSubmitBtn    = document.getElementById('split-submit-btn');
const splitSuggestions  = document.getElementById('split-suggestions');

// Jarvis Advice DOM
const jarvisBtn          = document.getElementById('jarvis-btn');
const jarvisOverlay      = document.getElementById('jarvis-overlay');
const jarvisBack         = document.getElementById('jarvis-back');
const jarvisBadge        = document.getElementById('jarvis-badge');
const jarvisAdviceList   = document.getElementById('jarvis-advice-list');
const jarvisCount        = document.getElementById('jarvis-advice-count');

// Nav DOM
const navHome            = document.getElementById('nav-home');
const themeToggle        = document.getElementById('theme-toggle');

// Automation DOM (NEW)
const automationBtn      = document.getElementById('automation-btn');
const automationOverlay  = document.getElementById('automation-overlay');
const automationBack     = document.getElementById('automation-back');
const automationForm     = document.getElementById('automation-form');
const automationList     = document.getElementById('automation-list');
const autoNote           = document.getElementById('auto-note');
const autoAmount         = document.getElementById('auto-amount');
const autoCategory       = document.getElementById('auto-category');
const autoFrequency      = document.getElementById('auto-frequency');
const autoDueDate        = document.getElementById('auto-due-date');

// Quick Log Chips DOM (NEW)
const quickLogContainer  = document.getElementById('quick-log-container');
const quickLogChips      = document.getElementById('quick-log-chips');

// Bill Alerts DOM (NEW)
const billAlertsSection  = document.getElementById('bill-alerts-section');
const billAlertsList      = document.getElementById('bill-alerts-list');

// Goal Modal & Form DOM
const openGoalBtn        = document.getElementById('open-goal-modal-overlay-btn');
const goalBackdrop       = document.getElementById('goal-backdrop');
const goalClose          = document.getElementById('goal-close');
const goalForm           = document.getElementById('goal-form');
const goalTitle          = document.getElementById('goal-title');
const goalAmount         = document.getElementById('goal-amount');
const goalDuration       = document.getElementById('goal-duration');
const goalPriority       = document.getElementById('goal-priority');
const goalSubmitBtn      = document.getElementById('goal-submit-btn');

// Feasibility DOM
const goalFeasibility    = document.getElementById('goal-feasibility');
const feasibilityDot     = document.getElementById('feasibility-dot');
const feasibilityStatus  = document.getElementById('feasibility-status');
const feasibilityDesc    = document.getElementById('feasibility-desc');
const feasibilitySuggs   = document.getElementById('feasibility-suggestions');
const feasibilitySuggsList = document.getElementById('feasibility-suggestions-list');

// Goal Confirmation DOM
const goalConfirmBackdrop = document.getElementById('goal-confirm-backdrop');
const goalConfirmYes     = document.getElementById('goal-confirm-yes');
const goalConfirmNo      = document.getElementById('goal-confirm-no');
const confirmMonthlyReq  = document.getElementById('confirm-monthly-req');
const confirmMonthlyAvg  = document.getElementById('confirm-monthly-avg');

// Goals List DOM
const goalsList          = document.getElementById('goals-list');
const goalsEmpty         = document.getElementById('goals-empty');

// Goals Overlay & Hybrid DOM
const viewAllGoalsBtn    = document.getElementById('view-all-goals-btn');
const goalsOverlay       = document.getElementById('goals-overlay');
const goalsOverlayBack   = document.getElementById('goals-overlay-back');
const goalsOverlayAllocation = document.getElementById('goals-overlay-allocation');
const goalsSummaryStats  = document.getElementById('goals-summary-stats');
const goalsSummaryCards  = document.getElementById('goals-summary-cards');
const goalsSummaryEmpty  = document.getElementById('goals-summary-empty');

// ═══════════════════════════════════════════════
// LOCAL PARSER (mirrors backend for instant preview)
// ═══════════════════════════════════════════════
function parseInputLocally(raw) {
  if (!raw || !raw.trim()) return null;

  const input = raw.trim();

  // Detect explicit '+' prefix → force income
  const hasIncomePrefix = /^\+/.test(input);
  const cleanedInput = hasIncomePrefix ? input.replace(/^\+\s*/, '') : input;

  const numberMatch = cleanedInput.match(/(\d+(?:\.\d+)?)/);

  if (!numberMatch) return { amount: null, note: cleanedInput, category: 'Others', type: 'expense', splitWith: null };

  const amount = parseFloat(numberMatch[1]);
  let note = cleanedInput.replace(numberMatch[0], '').trim().replace(/\s+/g, ' ');
  
  // Phase 5: Split Detection
  let splitWith = null;
  const splitMatch = note.match(/split with\s+(.+)$/i);
  if (splitMatch) {
    splitWith = splitMatch[1].trim();
    note = note.replace(splitMatch[0], '').trim();
  }

  const words = note.toLowerCase().split(/\s+/).filter(Boolean);

  let category = 'Others';
  for (const word of words) {
    if (CATEGORY_MAP[word]) { category = CATEGORY_MAP[word]; break; }
  }

  const isIncome = hasIncomePrefix || words.some(w => INCOME_KEYWORDS.includes(w));
  if (hasIncomePrefix && category === 'Others') category = 'Income';

  return { amount, note: note || null, category, type: isIncome ? 'income' : 'expense', splitWith };
}

// ═══════════════════════════════════════════════
// "split with <name>" AUTOCOMPLETE
// ═══════════════════════════════════════════════
function updateSplitSuggestions(rawValue) {
  const match = rawValue.match(/split with\s+([a-zA-Z0-9_ ]*)$/i);
  if (!match) {
    splitSuggestions.style.display = 'none';
    splitSuggestions.innerHTML = '';
    return;
  }

  const partial = match[1].trim().toLowerCase();
  const matches = splitFriendsCache
    .filter(f => f.name.toLowerCase().startsWith(partial))
    .slice(0, 5);

  if (matches.length === 0) {
    splitSuggestions.style.display = 'none';
    splitSuggestions.innerHTML = '';
    return;
  }

  splitSuggestions.innerHTML = '';
  matches.forEach(friend => {
    const item = document.createElement('div');
    item.className = 'split-suggestion';
    item.textContent = friend.name;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus on the input so blur doesn't race the click
      const before = rawValue.slice(0, match.index);
      mainInput.value = `${before}split with ${friend.name}`;
      splitSuggestions.style.display = 'none';
      splitSuggestions.innerHTML = '';
      mainInput.dispatchEvent(new Event('input'));
      mainInput.focus();
    });
    splitSuggestions.appendChild(item);
  });

  splitSuggestions.style.display = 'block';
}

mainInput.addEventListener('blur', () => {
  setTimeout(() => { splitSuggestions.style.display = 'none'; }, 120);
});

// ═══════════════════════════════════════════════
// LIVE PREVIEW — Inline sleek
// ═══════════════════════════════════════════════
mainInput.addEventListener('input', () => {
  const val = mainInput.value;
  const parsed = parseInputLocally(val);
  updateSplitSuggestions(val);

  if (!parsed || (!parsed.amount && !parsed.note)) {
    preview.style.display = 'none';
    splitTriggerBtn.style.display = 'none';
    return;
  }

  preview.style.display = 'flex';
  splitTriggerBtn.style.display = parsed.amount != null ? 'inline-flex' : 'none';

  // Amount
  if (parsed.amount != null) {
    const sign = parsed.type === 'income' ? '+' : '';
    previewAmount.textContent = `${sign}₹${parsed.amount.toLocaleString('en-IN')}`;
    previewAmount.style.color = parsed.type === 'income' ? '#34d399' : '#06b6d4';
  } else {
    previewAmount.textContent = '₹—';
  }

  // Category
  const emoji = CATEGORY_EMOJI[parsed.category] || '📦';
  previewCat.textContent = `${emoji} ${parsed.category}`;

  // Note & Split
  let displayNote = parsed.note || '';
  if (parsed.splitWith) {
    displayNote += displayNote ? ` (Splitting with ${parsed.splitWith})` : `Splitting with ${parsed.splitWith}`;
  }

  if (displayNote) {
    previewNote.textContent = displayNote;
    previewNote.style.display = 'inline';
    previewNoteDot.style.display = 'inline';
    if (parsed.splitWith) {
      previewNote.style.color = '#8b5cf6'; // Highlight split intent
    } else {
      previewNote.style.color = '';
    }
  } else {
    previewNote.style.display = 'none';
    previewNoteDot.style.display = 'none';
  }
});

// ═══════════════════════════════════════════════
// SUBMIT TRANSACTION
// ═══════════════════════════════════════════════
async function submitTransaction() {
  const input = mainInput.value.trim();
  if (!input) return;

  // Quick local validation
  const parsed = parseInputLocally(input);
  if (!parsed || parsed.amount == null) {
    showToast('Amount missing! Try: 250 swiggy', true);
    return;
  }

  // Instant UI feedback — clear input immediately
  mainInput.value = '';
  preview.style.display = 'none';
  splitTriggerBtn.style.display = 'none';
  mainInput.focus();

  try {
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.error || 'Something went wrong', true);
      return;
    }

    const { amount, category } = data.transaction;
    showToast(`₹${amount.toLocaleString('en-IN')} ${category} added ✓`);
    fetchTransactions();
    fetchHealthScore();
    fetchGoals();
    fetchJarvisAdvice();
  } catch (err) {
    console.error('Submit error:', err);
    showToast('Network error — please try again', true);
  }
}

// Enter key
mainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitTransaction();
  }
});

// Add button
addBtn.addEventListener('click', submitTransaction);

// ═══════════════════════════════════════════════
// UTILITY — Time ago
// ═══════════════════════════════════════════════
function timeAgo(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ═══════════════════════════════════════════════
// RENDER TRANSACTION ROW (shared by both views)
// ═══════════════════════════════════════════════
function renderTxnRow(txn, i, clickable = true) {
  const emoji = CATEGORY_EMOJI[txn.category] || '📦';
  const amountClass = txn.type === 'income' ? 'txn-row__amount--income' : 'txn-row__amount--expense';
  const sign = txn.type === 'income' ? '+' : '-';
  const displayNote = txn.note || txn.category;
  const ago = timeAgo(txn.createdAt);
  const clickClass = clickable ? ' txn-row--clickable' : '';
  const clickHandler = clickable ? `onclick="openEditModal(${txn.id}, ${txn.amount}, '${escapeAttr(txn.note || '')}', '${txn.category}', '${txn.type}')"` : '';

  return `
    <div class="txn-swipe" data-txn-id="${txn.id}">
      <div class="txn-swipe__action" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        </svg>
        <span>Remove</span>
      </div>
      <div class="txn-row${clickClass}" id="txn-${txn.id}" style="animation-delay: ${i * 0.04}s" ${clickHandler}>
        <div class="txn-row__icon txn-row__icon--${txn.category}">${emoji}</div>
        <div class="txn-row__details">
          <div class="txn-row__note">${escapeHtml(displayNote)}</div>
          <div class="txn-row__meta">
            <span class="txn-row__category">${txn.category}</span>
            <span class="txn-row__time">${ago}</span>
          </div>
        </div>
        <div class="txn-row__amount ${amountClass}">
          ${sign}₹${txn.amount.toLocaleString('en-IN')}
        </div>
        <button class="txn-row__delete" onclick="event.stopPropagation(); softDeleteTransaction(${txn.id})" aria-label="Remove transaction" title="Galat entry? Hatao">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════
// FETCH & RENDER TRANSACTIONS (Recent 5)
// ═══════════════════════════════════════════════
async function fetchTransactions() {
  try {
    const res = await fetch(`${API_BASE}/transactions`);
    const data = await res.json();

    if (!data.transactions || data.transactions.length === 0) {
      txnList.innerHTML = '';
      txnList.appendChild(txnEmpty);
      txnEmpty.style.display = 'block';
      return;
    }

    txnEmpty.style.display = 'none';
    txnList.innerHTML = data.transactions.map((txn, i) => renderTxnRow(txn, i)).join('');
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

// ═══════════════════════════════════════════════
// VIEW ALL — Full transaction history
// ═══════════════════════════════════════════════
viewAllBtn.addEventListener('click', async () => {
  viewAllOverlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
  viewAllList.innerHTML = '<div style="text-align:center; padding:40px; color: rgba(240,240,245,0.3);">Loading...</div>';

  try {
    const res = await fetch(`${API_BASE}/transactions/all`);
    const data = await res.json();

    if (!data.transactions || data.transactions.length === 0) {
      viewAllList.innerHTML = '<div style="text-align:center; padding:40px; color: rgba(240,240,245,0.3);">No transactions yet</div>';
      viewAllCount.textContent = '0';
      return;
    }

    viewAllCount.textContent = data.transactions.length;
    viewAllList.innerHTML = data.transactions.map((txn, i) => renderTxnRow(txn, i)).join('');
  } catch (err) {
    console.error('View All error:', err);
    viewAllList.innerHTML = '<div style="text-align:center; padding:40px; color: #f87171;">Error loading transactions</div>';
  }
});

viewAllBack.addEventListener('click', () => {
  closeAllOverlays();
  // Refresh main list in case edits were made
  fetchTransactions();
  fetchHealthScore();
});

// ═══════════════════════════════════════════════
// EDIT TRANSACTION — Modal
// ═══════════════════════════════════════════════
function openEditModal(id, amount, note, category, type) {
  editId.value = id;
  editAmount.value = amount;
  editNote.value = note;
  editCategory.value = category;
  editType.value = type;
  editBackdrop.style.display = 'flex';
}

editClose.addEventListener('click', () => {
  editBackdrop.style.display = 'none';
});

editBackdrop.addEventListener('click', (e) => {
  if (e.target === editBackdrop) {
    editBackdrop.style.display = 'none';
  }
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = editId.value;
  const amount = parseFloat(editAmount.value);
  const note = editNote.value.trim();
  const category = editCategory.value;
  const type = editType.value;

  if (!amount || amount <= 0) {
    showToast('Amount should be greater than 0', true);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, note, category, type }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.error || 'Update failed', true);
      return;
    }

    editBackdrop.style.display = 'none';
    showToast('Transaction updated ✓');
    fetchTransactions();
    fetchHealthScore();
    fetchGoals();
    fetchJarvisAdvice();

    // If View All is open, refresh it too
    if (viewAllOverlay.style.display !== 'none') {
      viewAllBtn.click();
    }
  } catch (err) {
    console.error('Edit error:', err);
    showToast('Network error — phir try karo', true);
  }
});

// ═══════════════════════════════════════════════
// SOFT DELETE TRANSACTION
// ═══════════════════════════════════════════════
async function softDeleteTransaction(id) {
  const row = document.getElementById(`txn-${id}`);
  if (row) {
    row.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    row.style.opacity = '0';
    row.style.transform = 'translateX(60px)';
  }

  try {
    const res = await fetch(`${API_BASE}/transactions/${id}/incorrect`, {
      method: 'PATCH',
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.error || 'Kuch galat ho gaya', true);
      if (row) { row.style.opacity = '1'; row.style.transform = 'translateX(0)'; }
      return;
    }

    showToast('Entry hata di ✓');
    setTimeout(() => {
      fetchTransactions();
      fetchHealthScore();
      fetchGoals();
      fetchJarvisAdvice();
      // Refresh View All if open
      if (viewAllOverlay.style.display !== 'none') {
        viewAllBtn.click();
      }
    }, 300);
  } catch (err) {
    console.error('Soft delete error:', err);
    showToast('Network error — phir try karo', true);
    if (row) { row.style.opacity = '1'; row.style.transform = 'translateX(0)'; }
  }
}

// ═══════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' toast--error' : ''}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // Remove after animation completes
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 1600);
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ═══════════════════════════════════════════════
// HEALTH SCORE
// ═══════════════════════════════════════════════
let lastScore = null;

async function fetchHealthScore() {
  try {
    const res = await fetch(`${API_BASE}/insights/health-score`);
    const data = await res.json();

    const score = data.score;
    const circumference = 2 * Math.PI * 52; // r=52 from SVG
    const offset = circumference - (score / 100) * circumference;

    // Animate the ring
    if (healthProgress) {
      healthProgress.style.strokeDasharray = circumference;
      healthProgress.style.strokeDashoffset = offset;
    }

    // Animate number count-up
    if (healthNumber) {
      animateNumber(healthNumber, parseInt(healthNumber.textContent) || 0, score, 600);
    }

    // Update subtitle
    if (healthSubtitle) {
      healthSubtitle.textContent = data.subtitle;
    }

    // Update trend
    if (healthTrend && lastScore !== null) {
      const diff = score - lastScore;
      if (diff > 0) {
        healthTrend.textContent = `↑ +${diff} from last update`;
        healthTrend.className = 'health-card__trend health-card__trend--up';
      } else if (diff < 0) {
        healthTrend.textContent = `↓ ${diff} from last update`;
        healthTrend.className = 'health-card__trend health-card__trend--down';
      } else {
        healthTrend.textContent = '→ Stable';
        healthTrend.className = 'health-card__trend health-card__trend--same';
      }
    }
    lastScore = score;

    // Change ring color based on score
    if (healthProgress) {
      if (score >= 70) {
        healthProgress.style.stroke = '#34d399';
      } else if (score >= 45) {
        healthProgress.style.stroke = '#fbbf24';
      } else {
        healthProgress.style.stroke = '#f87171';
      }
    }

    // 🎭 Mood Engine — let the whole app's palette reflect the score
    applyMoodFromScore(score);
  } catch (err) {
    console.error('Health score fetch error:', err);
  }
}

/**
 * Animate a number from start to end
 */
function animateNumber(el, start, end, duration) {
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    el.textContent = current;
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

// ═══════════════════════════════════════════════
// INSIGHTS OVERVIEW & CHARTS
// ═══════════════════════════════════════════════
const CATEGORY_COLORS = {
  Food: '#f97316',
  Travel: '#3b82f6',
  Subscription: '#a855f7',
  Housing: '#14b8a6',
  Shopping: '#ec4899',
  Health: '#22c55e',
  Income: '#10b981',
  Others: '#6b7280',
  Finance: '#3b82f6',
  Grocery: '#10b981',
  Smoking: '#ef4444',
  Alcohol: '#fb923c',
};

async function fetchInsightsOverview() {
  try {
    const res = await fetch(`${API_BASE}/insights/overview`);
    const data = await res.json();

    if (!data.success) {
      showToast('Insights load failed', true);
      return;
    }

    // 1. Month display
    insightsMonth.textContent = data.month || 'Current Month';

    // 2. Summary grid card values
    insightIncome.textContent = `₹${data.summary.totalIncome.toLocaleString('en-IN')}`;
    insightExpense.textContent = `₹${data.summary.totalExpense.toLocaleString('en-IN')}`;
    
    // Savings
    const savings = data.summary.savings;
    insightSavings.textContent = `${savings < 0 ? '-' : ''}₹${Math.abs(savings).toLocaleString('en-IN')}`;
    insightSavings.style.color = savings >= 0 ? '#34d399' : '#f87171';
    
    // Savings Rate Badge
    insightSavingsRate.textContent = `${data.summary.savingsRate}% savings rate`;
    insightSavingsRate.style.color = data.summary.savingsRate >= 20 ? '#34d399' : (data.summary.savingsRate >= 0 ? '#fbbf24' : '#f87171');

    // M.A.D Health Score Card
    insightHealth.textContent = `${data.healthScore.score}/100`;
    insightHealthDesc.textContent = data.healthScore.subtitle;
    if (data.healthScore.score >= 70) {
      insightHealth.style.color = '#34d399';
    } else if (data.healthScore.score >= 45) {
      insightHealth.style.color = '#fbbf24';
    } else {
      insightHealth.style.color = '#f87171';
    }

    // 3. Category breakdown donut chart + legend
    const totalExp = data.summary.totalExpense;
    donutTotal.textContent = `₹${totalExp.toLocaleString('en-IN')}`;

    if (data.categories.length === 0 || totalExp === 0) {
      donutChart.style.background = 'conic-gradient(#1e1e2f 0% 100%)';
      categoryLegend.innerHTML = `
        <div style="text-align:center; padding: 12px; color: var(--text-tertiary); font-size: 0.8rem;">
          No expense transactions recorded yet
        </div>
      `;
    } else {
      // Build conic gradient & legend list
      let conicParts = [];
      let currentPercent = 0;
      let legendHtml = '';

      // Sort category percentages descending
      const sortedCats = [...data.categories].sort((a, b) => b.total - a.total);

      for (const cat of sortedCats) {
        const color = CATEGORY_COLORS[cat.category] || '#6b7280';
        const start = currentPercent;
        currentPercent += cat.percentage;
        conicParts.push(`${color} ${start}% ${currentPercent}%`);

        const emoji = CATEGORY_EMOJI[cat.category] || '📦';
        legendHtml += `
          <div class="legend-item">
            <div class="legend-item__left">
              <span class="legend-item__dot" style="background: ${color}"></span>
              <span class="legend-item__name">${emoji} ${cat.category}</span>
            </div>
            <div class="legend-item__right">
              <span class="legend-item__amount">₹${cat.total.toLocaleString('en-IN')}</span>
              <span class="legend-item__pct">${cat.percentage}%</span>
            </div>
          </div>
        `;
      }
      
      // If sum of percentage is slightly less than 100 due to rounding, stretch the last piece
      if (currentPercent < 100 && conicParts.length > 0) {
        const lastPartIdx = conicParts.length - 1;
        const lastColor = sortedCats[sortedCats.length - 1].category;
        const color = CATEGORY_COLORS[lastColor] || '#6b7280';
        const start = currentPercent - sortedCats[sortedCats.length - 1].percentage;
        conicParts[lastPartIdx] = `${color} ${start}% 100%`;
      }

      donutChart.style.background = `conic-gradient(${conicParts.join(', ')})`;
      categoryLegend.innerHTML = legendHtml;
    }

    // 4. Daily trend chart
    currentTrendData = data.dailyTrend || [];
    renderTrendChart();

  } catch (err) {
    console.error('Insights fetch error:', err);
    showToast('Failed to load insights details', true);
  }
}

function renderTrendChart() {
  // Clear old svg items (except defs)
  const paths = trendSvg.querySelectorAll('path, text:not(defs text), circle');
  paths.forEach(p => p.remove());

  let trend = currentTrendData;

  if (!trend || trend.length === 0) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '250');
    text.setAttribute('y', '85');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'rgba(240, 240, 245, 0.28)');
    text.setAttribute('font-size', '14');
    text.textContent = 'No transaction trend data available';
    trendSvg.appendChild(text);
    trendLabels.innerHTML = '';
    return;
  }

  // Apply Weekly grouping if needed
  if (currentTrendView === 'weekly') {
    const weeklyData = [];
    for (let i = 0; i < trend.length; i += 7) {
      const chunk = trend.slice(i, i + 7);
      const sumExpense = chunk.reduce((acc, curr) => acc + curr.expense, 0);
      const sumIncome = chunk.reduce((acc, curr) => acc + curr.income, 0);
      weeklyData.push({
        day: chunk[0].day,
        expense: sumExpense,
        income: sumIncome,
        isWeek: true
      });
    }
    trend = weeklyData;
  }

  // Find max value
  const maxExpense = Math.max(...trend.map(t => t.expense), 0);
  const maxVal = maxExpense > 0 ? maxExpense * 1.15 : 1000;

  const width = 500;
  const height = 170;
  const paddingBottom = 15;
  const paddingTop = 15;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = [];
  const n = trend.length;

  for (let i = 0; i < n; i++) {
    const item = trend[i];
    const x = n > 1 ? (i / (n - 1)) * width : width / 2;
    const y = height - paddingBottom - (item.expense / maxVal) * chartHeight;
    points.push({ x, y, item });
  }

  // Draw gradient area first
  if (points.length > 0) {
    const areaPathData = [
      `M ${points[0].x} ${height - paddingBottom}`,
      ...points.map(p => `L ${p.x} ${p.y}`),
      `L ${points[points.length - 1].x} ${height - paddingBottom}`,
      'Z'
    ].join(' ');

    const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    areaPath.setAttribute('d', areaPathData);
    areaPath.setAttribute('fill', 'url(#trend-area-grad)');
    areaPath.setAttribute('stroke', 'none');
    trendSvg.appendChild(areaPath);

    // Draw line
    const linePathData = [
      `M ${points[0].x} ${points[0].y}`,
      ...points.slice(1).map(p => `L ${p.x} ${p.y}`)
    ].join(' ');

    const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    linePath.setAttribute('d', linePathData);
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', 'url(#trend-line-grad)');
    linePath.setAttribute('stroke-width', '3');
    linePath.setAttribute('stroke-linecap', 'round');
    linePath.setAttribute('stroke-linejoin', 'round');
    trendSvg.appendChild(linePath);

    // Draw dynamic interactive dots
    points.forEach((p) => {
      if (p.item.expense > 0) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#06b6d4');
        circle.setAttribute('stroke', '#05050a');
        circle.setAttribute('stroke-width', '1.5');
        
        const formattedDate = new Date(p.item.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const prefix = p.item.isWeek ? 'Week of ' : '';
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${prefix}${formattedDate}: ₹${p.item.expense.toLocaleString('en-IN')}`;
        circle.appendChild(title);

        trendSvg.appendChild(circle);
      }
    });
  }

  // Draw X axis labels
  if (n > 0) {
    const formatDate = (dateStr) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    const firstDate = formatDate(trend[0].day);
    const lastDate = formatDate(trend[n - 1].day);
    const midIndex = Math.floor(n / 2);
    const midDate = n > 2 ? formatDate(trend[midIndex].day) : '';

    const pre = trend[0].isWeek ? 'Wk of ' : '';
    trendLabels.innerHTML = `
      <span>${pre}${firstDate}</span>
      <span>${pre}${midDate}</span>
      <span>${pre}${lastDate}</span>
    `;
  } else {
    trendLabels.innerHTML = '';
  }
}

// ═══════════════════════════════════════════════
// LEDGER LOGIC (Phase 5)
// ═══════════════════════════════════════════════
async function fetchLedger() {
  try {
    const res = await fetch(`${API_BASE}/ledger`);
    const data = await res.json();

    if (!data.success) return;

    ledgerList.innerHTML = '';
    
    if (!data.balances || data.balances.length === 0) {
      ledgerList.innerHTML = `<div class="txn-row" style="justify-content: center; color: var(--text-tertiary);">No friends or balances yet. Try typing "1000 dinner split with Rohan".</div>`;
      ledgerTotalBal.textContent = '₹0';
      ledgerTotalBal.style.color = '';
      ledgerTotalSub.textContent = 'You owe nothing!';
      return;
    }

    let totalOwedToYou = 0;
    let totalYouOwe = 0;

    data.balances.forEach(b => {
      const net = b.netBalance || 0;
      if (net > 0) totalOwedToYou += net;
      if (net < 0) totalYouOwe += Math.abs(net);

      if (net === 0) return; // Skip settled friends for now

      const isOwedToYou = net > 0;
      const color = isOwedToYou ? '#34d399' : '#ef4444';
      const text = isOwedToYou ? 'owes you' : 'you owe';
      
      const row = document.createElement('div');
      row.className = 'txn-row';
      row.innerHTML = `
        <div class="txn-row__icon" style="background: ${color}1f;">👤</div>
        <div class="txn-row__details">
          <div class="txn-row__note" style="text-transform: capitalize;">${escapeHtml(b.name)}</div>
          <div class="txn-row__meta">
            <span class="txn-row__category" style="color: ${color};">${text}</span>
          </div>
        </div>
        <div class="ledger-row__right">
          <span class="txn-row__amount" style="color: ${color};">₹${Math.abs(net).toLocaleString('en-IN')}</span>
          <button class="ledger-row__settle-btn" onclick="settleDebt(${b.friendId}, '${escapeAttr(b.name)}', ${Math.abs(net)})">Settle Up</button>
        </div>
      `;
      ledgerList.appendChild(row);
    });

    const netTotal = totalOwedToYou - totalYouOwe;
    ledgerTotalBal.textContent = `${netTotal > 0 ? '+' : ''}₹${netTotal.toLocaleString('en-IN')}`;
    ledgerTotalBal.style.color = netTotal > 0 ? '#34d399' : (netTotal < 0 ? '#ef4444' : '');
    
    if (netTotal > 0) ledgerTotalSub.textContent = `Overall, you are owed ₹${totalOwedToYou.toLocaleString('en-IN')}! 🤑`;
    else if (netTotal < 0) ledgerTotalSub.textContent = `Overall, you are in debt by ₹${totalYouOwe.toLocaleString('en-IN')}! 🚨`;
    else ledgerTotalSub.textContent = 'Books are perfectly balanced. ⚖️';

  } catch (err) {
    console.error('Ledger fetch error:', err);
  }
}

async function settleDebt(friendId, name, amount) {
  if (!confirm(`Mark ₹${amount} as settled with ${name}? This will log an income transaction.`)) return;

  try {
    const res = await fetch(`${API_BASE}/ledger/settle/${friendId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, friendName: name })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Settled up with ${name}!`);
      fetchLedger();
      fetchTransactions();
      fetchHealthScore();
    } else {
      showToast('Failed to settle debt', true);
    }
  } catch (err) {
    console.error('Settle error:', err);
    showToast('Failed to settle debt', true);
  }
}

// ═══════════════════════════════════════════════
// SPLIT PICKER (multi-friend, 4 split methods)
// ═══════════════════════════════════════════════
let splitFriendsCache = []; // [{ id, name, upiId }] — also powers text-path autocomplete
let selectedSplitFriends = []; // ordered list of display names
let activeSplitMethod = 'equally'; // 'equally' | 'exact' | 'percentage' | 'shares'
let splitParsedAmount = null;

async function fetchFriends() {
  try {
    const res = await fetch(`${API_BASE}/friends`);
    const data = await res.json();
    if (data.success && Array.isArray(data.friends)) {
      splitFriendsCache = data.friends;
    }
  } catch (err) {
    console.error('fetchFriends error:', err);
  }
}

function renderSplitFriendChips() {
  splitFriendChips.innerHTML = '';

  const renderChip = (name, selected) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `split-chip${selected ? ' split-chip--selected' : ''}`;
    chip.textContent = name;
    chip.addEventListener('click', () => toggleSplitFriend(name));
    splitFriendChips.appendChild(chip);
  };

  const knownNamesLower = new Set();
  splitFriendsCache.forEach(friend => {
    knownNamesLower.add(friend.name.toLowerCase());
    const isSelected = selectedSplitFriends.some(n => n.toLowerCase() === friend.name.toLowerCase());
    renderChip(friend.name, isSelected);
  });

  // Names typed fresh this session that aren't in the cached friend list yet
  selectedSplitFriends.forEach(name => {
    if (!knownNamesLower.has(name.toLowerCase())) renderChip(name, true);
  });


}

function toggleSplitFriend(name) {
  const idx = selectedSplitFriends.findIndex(n => n.toLowerCase() === name.toLowerCase());
  if (idx >= 0) selectedSplitFriends.splice(idx, 1);
  else selectedSplitFriends.push(name);

  renderSplitFriendChips();
  renderSplitRows();
}

function renderSplitRows() {
  splitRows.innerHTML = '';

  if (selectedSplitFriends.length === 0) {
    splitMethodField.style.display = 'none';
    splitSummary.style.display = 'none';
    splitSubmitBtn.disabled = true;
    return;
  }

  splitMethodField.style.display = 'block';
  splitSummary.style.display = 'block';

  selectedSplitFriends.forEach(name => {
    const row = document.createElement('div');
    row.className = 'split-row';

    const label = document.createElement('span');
    label.className = 'split-row__name';
    label.textContent = name;
    row.appendChild(label);

    const input = document.createElement('input');
    input.className = 'split-row__input';
    input.dataset.role = 'friend-input';
    input.dataset.friendName = name;
    input.min = '0';

    if (activeSplitMethod === 'equally') {
      input.type = 'text';
      input.disabled = true;
    } else {
      input.type = 'number';
      input.addEventListener('input', updateSplitSummary);
      if (activeSplitMethod === 'exact') {
        input.step = '0.01';
        input.placeholder = '₹';
      } else if (activeSplitMethod === 'percentage') {
        input.step = '0.1';
        input.placeholder = '%';
      } else if (activeSplitMethod === 'shares') {
        input.step = '1';
        input.value = '1';
      }
    }
    row.appendChild(input);
    splitRows.appendChild(row);
  });

  // "You" row — always shown, always a read-only computed remainder
  const youRow = document.createElement('div');
  youRow.className = 'split-row';
  const youLabel = document.createElement('span');
  youLabel.className = 'split-row__name';
  youLabel.textContent = 'You';
  const youInput = document.createElement('input');
  youInput.className = 'split-row__input';
  youInput.type = 'text';
  youInput.disabled = true;
  youInput.dataset.role = 'you-display';
  youRow.appendChild(youLabel);
  youRow.appendChild(youInput);
  splitRows.appendChild(youRow);

  updateSplitSummary();
}

/**
 * Computes each friend's ₹ amount (and your remainder share) for the active
 * split method. All four methods funnel into the same { friendName, amount }
 * shape that POST /api/transactions expects.
 */
function computeSplitBreakdown() {
  if (splitParsedAmount == null || selectedSplitFriends.length === 0) return null;

  const total = splitParsedAmount;
  const n = selectedSplitFriends.length;
  const friendInputs = Array.from(splitRows.querySelectorAll('[data-role="friend-input"]'));
  let friendAmounts = [];
  let error = null;

  if (activeSplitMethod === 'equally') {
    const share = Math.round((total / (n + 1)) * 100) / 100;
    friendAmounts = selectedSplitFriends.map(name => ({ name, amount: share }));
  } else if (activeSplitMethod === 'exact') {
    friendAmounts = friendInputs.map(input => ({ name: input.dataset.friendName, amount: parseFloat(input.value) }));
    if (friendAmounts.some(f => !Number.isFinite(f.amount) || f.amount < 0)) {
      error = 'Enter a valid ₹ amount for each friend';
    }
  } else if (activeSplitMethod === 'percentage') {
    const pcts = friendInputs.map(input => ({ name: input.dataset.friendName, pct: parseFloat(input.value) }));
    if (pcts.some(p => !Number.isFinite(p.pct) || p.pct < 0)) {
      error = 'Enter a valid percentage for each friend';
    } else if (pcts.reduce((sum, p) => sum + p.pct, 0) > 100.01) {
      error = 'Percentages add up to more than 100%';
    } else {
      friendAmounts = pcts.map(p => ({ name: p.name, amount: Math.round((total * p.pct / 100) * 100) / 100 }));
    }
  } else if (activeSplitMethod === 'shares') {
    const yourWeight = 1; // you always hold one share
    const weights = friendInputs.map(input => ({ name: input.dataset.friendName, weight: parseFloat(input.value) }));
    if (weights.some(w => !Number.isFinite(w.weight) || w.weight <= 0)) {
      error = 'Enter a valid share weight (greater than 0) for each friend';
    } else {
      const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0) + yourWeight;
      friendAmounts = weights.map(w => ({ name: w.name, amount: Math.round((total * w.weight / totalWeight) * 100) / 100 }));
    }
  }

  const friendTotal = friendAmounts.reduce((sum, f) => sum + (Number.isFinite(f.amount) ? f.amount : 0), 0);
  const yourShare = Math.round((total - friendTotal) * 100) / 100;

  if (!error) {
    if (friendTotal <= 0) error = 'At least one friend needs a positive share';
    else if (friendTotal > total + 0.01) error = 'Split amounts add up to more than the total';
  }

  return { total, friendAmounts, friendTotal, yourShare, error };
}

function updateSplitSummary() {
  const breakdown = computeSplitBreakdown();
  if (!breakdown) {
    splitSubmitBtn.disabled = true;
    return;
  }

  const youInput = splitRows.querySelector('[data-role="you-display"]');
  if (youInput) youInput.value = `₹${breakdown.yourShare.toLocaleString('en-IN')}`;

  if (breakdown.error) {
    splitSummary.classList.add('split-summary--invalid');
    splitSummary.textContent = breakdown.error;
    splitSubmitBtn.disabled = true;
    return;
  }

  splitSummary.classList.remove('split-summary--invalid');
  const parts = [`You pay ₹${breakdown.yourShare.toLocaleString('en-IN')}`]
    .concat(breakdown.friendAmounts.map(f => `${f.name} ₹${f.amount.toLocaleString('en-IN')}`));
  splitSummary.textContent = parts.join(' · ');
  splitSubmitBtn.disabled = false;
}

function resetSplitPicker() {
  selectedSplitFriends = [];
  activeSplitMethod = 'equally';

  splitMethodField.style.display = 'none';
  splitSummary.style.display = 'none';
  splitSummary.classList.remove('split-summary--invalid');
  splitRows.innerHTML = '';
  splitSubmitBtn.disabled = true;

  splitMethodSelector.querySelectorAll('.split-method-btn').forEach(b => b.classList.remove('split-method-btn--active'));
  const equallyBtn = splitMethodSelector.querySelector('[data-method="equally"]');
  if (equallyBtn) equallyBtn.classList.add('split-method-btn--active');
}

function openSplitPicker() {
  const parsed = parseInputLocally(mainInput.value);
  if (!parsed || parsed.amount == null) {
    showToast('Add an amount first, then split it', true);
    return;
  }

  splitParsedAmount = parsed.amount;
  resetSplitPicker();
  renderSplitFriendChips();
  splitBackdrop.style.display = 'flex';
}

function closeSplitPicker() {
  splitBackdrop.style.display = 'none';
}

async function submitSplit() {
  const breakdown = computeSplitBreakdown();
  if (!breakdown || breakdown.error) return;

  const input = mainInput.value.trim();
  if (!input) {
    showToast('Type the expense first', true);
    return;
  }

  const splits = breakdown.friendAmounts.map(f => ({ friendName: f.name, amount: f.amount }));

  splitSubmitBtn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, splits }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.error || 'Split failed', true);
      splitSubmitBtn.disabled = false;
      return;
    }

    closeSplitPicker();
    mainInput.value = '';
    preview.style.display = 'none';
    splitTriggerBtn.style.display = 'none';
    showToast('Split added! 🤝');
    fetchTransactions();
    fetchHealthScore();
    fetchLedger();
    fetchFriends();
  } catch (err) {
    console.error('Split submit error:', err);
    showToast('Network error', true);
    splitSubmitBtn.disabled = false;
  }
}

splitTriggerBtn.addEventListener('click', openSplitPicker);
if (splitAddFriendBtn) {
  splitAddFriendBtn.addEventListener('click', () => {
    // Hide split picker overlay and show add friend overlay
    closeSplitPicker();
    const addFriendOverlay = document.getElementById('add-friend-overlay');
    if (addFriendOverlay) addFriendOverlay.style.display = 'block';
  });
}
splitClose.addEventListener('click', closeSplitPicker);
splitBackdrop.addEventListener('click', (e) => {
  if (e.target === splitBackdrop) closeSplitPicker();
});
splitSubmitBtn.addEventListener('click', submitSplit);


splitMethodSelector.querySelectorAll('.split-method-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    splitMethodSelector.querySelectorAll('.split-method-btn').forEach(b => b.classList.remove('split-method-btn--active'));
    btn.classList.add('split-method-btn--active');
    activeSplitMethod = btn.dataset.method;
    renderSplitRows();
  });
});

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
function setActiveNav(btnId) {
  document.querySelectorAll('.bottom-nav__item').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(btnId);
  if (activeBtn) {
    activeBtn.classList.add('active');
    moveNavIndicator(activeBtn);
  }
}

function closeAllOverlays() {
  document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════
// 🔐 AUTH — login / signup gate, session, profile menu
// ═══════════════════════════════════════════════
const authOverlay       = document.getElementById('auth-overlay');
const authThemeToggle   = document.getElementById('auth-theme-toggle');
const authTabLogin      = document.getElementById('auth-tab-login');
const authTabSignup     = document.getElementById('auth-tab-signup');
const loginForm         = document.getElementById('login-form');
const loginIdentifier   = document.getElementById('login-identifier');
const loginPassword     = document.getElementById('login-password');
const loginError        = document.getElementById('login-error');
const loginSubmit       = document.getElementById('login-submit');
const signupForm        = document.getElementById('signup-form');
const signupUsername    = document.getElementById('signup-username');
const signupEmail       = document.getElementById('signup-email');
const signupDisplayName = document.getElementById('signup-displayname');
const signupPassword    = document.getElementById('signup-password');
const signupError       = document.getElementById('signup-error');
const signupSubmit      = document.getElementById('signup-submit');
const authDivider       = document.getElementById('auth-divider');
const authGoogleBtn     = document.getElementById('auth-google-btn');

const profileIcon       = document.getElementById('profile-icon');
const profileMenu       = document.getElementById('profile-menu');
const profileMenuAvatar = document.getElementById('profile-menu-avatar');
const profileMenuName   = document.getElementById('profile-menu-name');
const profileMenuEmail  = document.getElementById('profile-menu-email');
const profileMenuLogout = document.getElementById('profile-menu-logout');

const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
const avatarUploadInput = document.getElementById('avatar-upload-input');
const profileAvatarImg = document.getElementById('profile-avatar-img');
const profileAvatarPlaceholder = document.getElementById('profile-avatar-placeholder');
const topbarAvatarImg = document.getElementById('topbar-avatar-img');
const topbarAvatarText = document.getElementById('topbar-avatar-text');

function updateAvatarDisplay(avatarUrl, displayName) {
  const initial = (displayName || '?').charAt(0).toUpperCase();
  if (avatarUrl) {
    if (profileAvatarImg) {
      profileAvatarImg.src = avatarUrl;
      profileAvatarImg.style.display = 'block';
    }
    if (profileAvatarPlaceholder) profileAvatarPlaceholder.style.display = 'none';
    
    if (topbarAvatarImg) {
      topbarAvatarImg.src = avatarUrl;
      topbarAvatarImg.style.display = 'block';
    }
    if (topbarAvatarText) topbarAvatarText.style.display = 'none';
  } else {
    if (profileAvatarImg) profileAvatarImg.style.display = 'none';
    if (profileAvatarPlaceholder) {
      profileAvatarPlaceholder.textContent = initial;
      profileAvatarPlaceholder.style.display = 'flex';
    }

    if (topbarAvatarImg) topbarAvatarImg.style.display = 'none';
    if (topbarAvatarText) {
      topbarAvatarText.textContent = initial;
      topbarAvatarText.style.display = 'inline';
    }
  }
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('mad-theme', next);
}

function showAuthOverlay() {
  if (!authOverlay) return;
  document.body.classList.remove('authenticated');
  authOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (profileMenu) profileMenu.style.display = 'none';
}

function hideAuthOverlay() {
  if (!authOverlay) return;
  document.body.classList.add('authenticated');
  authOverlay.style.display = 'none';
  document.body.style.overflow = '';
}

function setAuthError(el, message) {
  if (!el) return;
  el.textContent = message || '';
  el.style.display = message ? 'block' : 'none';
}

let googleInitialized = false;

async function initGoogleSignIn() {
  if (!authGoogleBtn || !authDivider) return;
  try {
    const res = await fetch(`${API_BASE}/auth/config`);
    const data = await res.json();
    if (!data.googleClientId) return;

    // The GIS script tag uses async/defer, so it may not be loaded yet
    // when DOMContentLoaded fires — wait for it (up to ~5s).
    for (let i = 0; i < 50 && (typeof google === 'undefined' || !google.accounts?.id); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (typeof google === 'undefined' || !google.accounts?.id) return;

    if (!googleInitialized) {
      google.accounts.id.initialize({ client_id: data.googleClientId, callback: handleGoogleCredential });
      googleInitialized = true;
    }

    authDivider.style.display = 'flex';
    authGoogleBtn.style.display = 'flex';
    authGoogleBtn.innerHTML = '';
    google.accounts.id.renderButton(authGoogleBtn, {
      type: 'standard',
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
      size: 'large',
      width: 320,
      text: 'continue_with',
    });
  } catch (err) {
    console.error('initGoogleSignIn error:', err);
  }
}

async function handleGoogleCredential(response) {
  const activeError = signupForm && signupForm.style.display !== 'none' ? signupError : loginError;
  setAuthError(activeError, '');
  try {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setAuthError(activeError, data.error || 'Google sign-in failed, try again');
      return;
    }
    window.location.reload();
  } catch (err) {
    console.error('Google sign-in error:', err);
    setAuthError(activeError, 'Server error, try again');
  }
}

function populateProfileMenu(user) {
  if (!user) return;
  const label = (user.displayName || user.username || '?').trim();
  if (profileMenuAvatar) profileMenuAvatar.textContent = label.charAt(0).toUpperCase();
  if (profileMenuName) profileMenuName.textContent = user.displayName || user.username;
  if (profileMenuEmail) profileMenuEmail.textContent = user.email;
  
  updateAvatarDisplay(user.avatarUrl, label);
}

async function checkSession() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch (err) {
    console.error('checkSession error:', err);
    return null;
  }
}

// Tab switching between Log In / Sign Up
if (authTabLogin && authTabSignup && loginForm && signupForm) {
  authTabLogin.addEventListener('click', () => {
    authTabLogin.classList.add('active');
    authTabSignup.classList.remove('active');
    loginForm.style.display = 'flex';
    signupForm.style.display = 'none';
    setAuthError(loginError, '');
    setAuthError(signupError, '');
  });
  authTabSignup.addEventListener('click', () => {
    authTabSignup.classList.add('active');
    authTabLogin.classList.remove('active');
    signupForm.style.display = 'flex';
    loginForm.style.display = 'none';
    setAuthError(loginError, '');
    setAuthError(signupError, '');
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAuthError(loginError, '');
    const identifier = loginIdentifier.value.trim();
    const password = loginPassword.value;
    if (!identifier || !password) return;

    loginSubmit.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAuthError(loginError, data.error || 'Login failed, try again');
        return;
      }
      window.location.reload();
    } catch (err) {
      console.error('Login error:', err);
      setAuthError(loginError, 'Server error, try again');
    } finally {
      loginSubmit.disabled = false;
    }
  });
}

if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAuthError(signupError, '');
    const username = signupUsername.value.trim();
    const email = signupEmail.value.trim();
    const displayName = signupDisplayName.value.trim();
    const password = signupPassword.value;
    if (!username || !email || !password) return;

    signupSubmit.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, displayName: displayName || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAuthError(signupError, data.error || 'Signup failed, try again');
        return;
      }
      window.location.reload();
    } catch (err) {
      console.error('Signup error:', err);
      setAuthError(signupError, 'Server error, try again');
    } finally {
      signupSubmit.disabled = false;
    }
  });
}

// Profile menu — toggle on click, close on outside click
if (profileIcon && profileMenu) {
  profileIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    profileMenu.style.display = profileMenu.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', (e) => {
    if (profileMenu.style.display === 'block' && !profileMenu.contains(e.target) && e.target !== profileIcon) {
      profileMenu.style.display = 'none';
    }
  });
}

if (profileMenuLogout) {
  profileMenuLogout.addEventListener('click', async () => {
    profileMenuLogout.disabled = true;
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    window.location.reload();
  });
}

// ═══════════════════════════════════════════════
// 🌊 GLASS NAV — sliding pill indicator follows the active tab
// ═══════════════════════════════════════════════
function moveNavIndicator(activeBtn) {
  const indicator = document.getElementById('nav-indicator');
  const nav = activeBtn?.closest('.bottom-nav');
  if (!indicator || !nav) return;
  const navRect = nav.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  indicator.style.width = `${btnRect.width}px`;
  indicator.style.height = `${btnRect.height}px`;
  indicator.style.transform = `translateX(${btnRect.left - navRect.left}px)`;
}

window.addEventListener('resize', () => {
  const active = document.querySelector('.bottom-nav__item.active');
  if (active) moveNavIndicator(active);
});

// Re-sync once web fonts finish swapping in (display=swap reflows tab widths after initial measurement)
if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    const active = document.querySelector('.bottom-nav__item.active');
    if (active) moveNavIndicator(active);
  });
}

// ═══════════════════════════════════════════════
// 🎭 MOOD ENGINE — palette breathes with the live Health Score
// (Pulled forward from the planned Phase 6 "Emotion-Based UI")
// ═══════════════════════════════════════════════
function applyMoodFromScore(score) {
  let mood = 'calm';
  let badgeText = '🌊 Calm mode — smooth sailing';
  if (score < 55) {
    mood = 'alert';
    badgeText = '🔥 Alert mode — time to act';
  } else if (score < 80) {
    mood = 'caution';
    badgeText = '⚠️ Caution mode — keep an eye out';
  }
  document.documentElement.setAttribute('data-mood', mood);
  localStorage.setItem('mad-mood', mood);
  const badge = document.getElementById('health-mood-badge');
  if (badge) {
    badge.textContent = badgeText;
    badge.style.display = 'inline-flex';
  }
}

// ═══════════════════════════════════════════════
// ➕ FAB + QUICK ADD BOTTOM SHEET
// ═══════════════════════════════════════════════
const fabAddBtn        = document.getElementById('fab-add-btn');
const quickAddBackdrop = document.getElementById('quick-add-backdrop');
const quickAddSheet    = document.getElementById('quick-add-sheet');
const quickAddHandle   = document.getElementById('quick-add-handle');
const quickAddInput    = document.getElementById('quick-add-input');
const quickAddSubmit   = document.getElementById('quick-add-submit');
const quickAddClose    = document.getElementById('quick-add-close');
const quickAddChips    = document.getElementById('quick-add-chips');

let quickAddChipsLoaded = false;

function openQuickAddSheet() {
  quickAddBackdrop.classList.add('active');
  quickAddSheet.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => quickAddInput && quickAddInput.focus(), 320);
  if (!quickAddChipsLoaded) {
    quickAddChipsLoaded = true;
    populateQuickAddChips();
  }
}

function closeQuickAddSheet() {
  quickAddBackdrop.classList.remove('active');
  quickAddSheet.classList.remove('active');
  quickAddSheet.style.transition = '';
  quickAddSheet.style.transform = '';
  document.body.style.overflow = '';
  if (quickAddInput) {
    quickAddInput.value = '';
    quickAddInput.blur();
  }
}

async function populateQuickAddChips() {
  if (!quickAddChips) return;
  try {
    const res = await fetch(`${API_BASE}/automation/quick-logs`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.quickLogs) || data.quickLogs.length === 0) return;

    quickAddChips.innerHTML = data.quickLogs.slice(0, 4).map(log => {
      const emoji = CATEGORY_EMOJI[log.category] || '📦';
      const notePart = log.note ? ` ${log.note}` : '';
      const commandText = `${log.amount} ${log.category.toLowerCase()}${notePart}`;
      return `<button type="button" class="bottom-sheet__chip" data-fill="${escapeAttr(commandText)}">${emoji} ${escapeHtml(commandText)}</button>`;
    }).join('');

    quickAddChips.querySelectorAll('.bottom-sheet__chip').forEach(chip => {
      chip.addEventListener('click', () => {
        quickAddInput.value = chip.dataset.fill;
        quickAddInput.focus();
      });
    });
  } catch (err) {
    console.error('populateQuickAddChips error:', err);
  }
}

async function submitQuickAdd() {
  const text = quickAddInput.value.trim();
  if (!text) return;
  closeQuickAddSheet();
  mainInput.value = text;
  await submitTransaction();
}

if (fabAddBtn) fabAddBtn.addEventListener('click', openQuickAddSheet);
if (quickAddBackdrop) quickAddBackdrop.addEventListener('click', closeQuickAddSheet);
if (quickAddClose) quickAddClose.addEventListener('click', closeQuickAddSheet);
if (quickAddSubmit) quickAddSubmit.addEventListener('click', submitQuickAdd);
if (quickAddInput) {
  quickAddInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd(); }
  });
}

// Drag the handle down to dismiss — native bottom-sheet feel
(function enableSheetDragToDismiss() {
  if (!quickAddHandle || !quickAddSheet) return;
  let startY = 0, currentY = 0, dragging = false;

  function onMove(e) {
    if (!dragging) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    currentY = Math.max(0, y - startY);
    quickAddSheet.style.transition = 'none';
    quickAddSheet.style.transform = `translate(-50%, ${currentY}px)`;
  }
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    quickAddSheet.style.transition = '';
    if (currentY > 110) {
      closeQuickAddSheet();
    } else {
      quickAddSheet.style.transform = '';
    }
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onEnd);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onEnd);
  }
  function onStart(e) {
    dragging = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    currentY = 0;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }
  quickAddHandle.addEventListener('mousedown', onStart);
  quickAddHandle.addEventListener('touchstart', onStart, { passive: true });
})();

// ═══════════════════════════════════════════════
// 👈 SWIPE-TO-DELETE — drag a transaction row left (Mail-app style)
// ═══════════════════════════════════════════════
function enableSwipeToDelete(container) {
  if (!container || container.dataset.swipeBound) return;
  container.dataset.swipeBound = 'true';

  const SWIPE_THRESHOLD = 76;
  let activeRow = null;
  let activeAction = null;
  let txnId = null;
  let startX = 0, startY = 0, deltaX = 0;
  let axis = null; // 'x' (deleting) | 'y' (scrolling) | null (undecided)
  let suppressNextClick = false;

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const wrap = e.target.closest('.txn-swipe');
    const row = wrap ? wrap.querySelector('.txn-row') : null;
    if (!wrap || !row || e.target.closest('.txn-row__delete')) return;

    activeRow = row;
    activeAction = wrap.querySelector('.txn-swipe__action');
    txnId = wrap.dataset.txnId;
    startX = e.clientX;
    startY = e.clientY;
    deltaX = 0;
    axis = null;
    activeRow.style.transition = 'none';
  });

  container.addEventListener('pointermove', (e) => {
    if (!activeRow) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (axis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'x') {
        try { activeRow.setPointerCapture(e.pointerId); } catch (_) {}
        activeRow.style.userSelect = 'none';
        if (activeAction) activeAction.classList.add('txn-swipe__action--visible');
      } else {
        activeRow.style.transition = '';
        activeRow = null;
        activeAction = null;
        return;
      }
    }
    if (axis !== 'x') return;

    deltaX = Math.min(0, dx); // swipe-left only
    activeRow.style.transform = `translateX(${deltaX}px)`;
  });

  function release() {
    if (!activeRow) return;
    const row = activeRow;
    const action = activeAction;
    const id = txnId;
    row.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';

    if (deltaX < -SWIPE_THRESHOLD && id) {
      suppressNextClick = true;
      const onFadeEnd = (ev) => {
        if (ev.propertyName !== 'opacity') return;
        row.removeEventListener('transitionend', onFadeEnd);
        softDeleteTransaction(parseInt(id, 10));
      };
      row.addEventListener('transitionend', onFadeEnd);
      row.style.transform = 'translateX(-110%)';
      row.style.opacity = '0';
    } else {
      if (Math.abs(deltaX) > 6) suppressNextClick = true;
      row.style.transform = '';
      if (action) action.classList.remove('txn-swipe__action--visible');
    }

    row.style.userSelect = '';
    activeRow = null;
    activeAction = null;
    txnId = null;
    deltaX = 0;
    axis = null;
  }

  container.addEventListener('pointerup', release);
  container.addEventListener('pointercancel', release);

  // Block the click-to-edit from firing right after a swipe gesture
  container.addEventListener('click', (e) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

// ─── Pull to Refresh (native-feel: drag down at the top to reload) ───
function enablePullToRefresh() {
  const indicator = document.getElementById('pull-refresh');
  if (!indicator) return;
  const spinner = indicator.querySelector('.pull-refresh__spinner');
  const REST_Y = -56;
  const PULL_THRESHOLD = 64;
  const MAX_PULL = 100;

  let startX = 0, startY = 0;
  let axis = null;
  let dragging = false;
  let refreshing = false;
  let pull = 0;

  const setIndicator = (offsetY, opacity) => {
    indicator.style.transform = `translate(-50%, ${offsetY}px)`;
    indicator.style.opacity = `${opacity}`;
  };

  const settle = () => {
    indicator.style.transition = '';
    setIndicator(REST_Y, 0);
    pull = 0;
  };

  document.addEventListener('pointerdown', (e) => {
    if (refreshing || window.scrollY > 0) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.fab, .bottom-sheet, .sheet-backdrop, .overlay, .modal-backdrop')) return;
    startX = e.clientX;
    startY = e.clientY;
    axis = null;
    dragging = true;
  });

  document.addEventListener('pointermove', (e) => {
    if (!dragging || refreshing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      if (axis === 'x' || dy <= 0) { dragging = false; return; }
      indicator.style.transition = 'none';
    }
    if (dy <= 0) return;

    pull = dy < MAX_PULL ? dy : MAX_PULL + (dy - MAX_PULL) * 0.15;
    setIndicator(REST_Y + pull, Math.min(pull / PULL_THRESHOLD, 1));
    if (spinner) spinner.style.transform = `rotate(${pull * 2.6}deg)`;
    e.preventDefault();
  }, { passive: false });

  const release = async () => {
    if (!dragging) return;
    dragging = false;
    if (axis !== 'y') { axis = null; return; }
    axis = null;
    indicator.style.transition = '';

    if (pull >= PULL_THRESHOLD && !refreshing) {
      refreshing = true;
      indicator.classList.add('pull-refresh--loading');
      setIndicator(16, 1);
      if (spinner) spinner.style.transform = '';
      try { await Promise.all([fetchTransactions(), fetchHealthScore()]); } catch {}
      await new Promise(r => setTimeout(r, 280));
      indicator.classList.remove('pull-refresh--loading');
      settle();
      refreshing = false;
      showToast('Refreshed ✓');
    } else {
      settle();
    }
  };

  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Theme: apply the saved preference immediately — before the auth check —
  // so the login/signup screen matches it too, not just the app behind it.
  applyTheme(localStorage.getItem('mad-theme') || 'light');
  [themeToggle, authThemeToggle].forEach(btn => btn?.addEventListener('click', toggleTheme));

  // Mood accent: also apply the last-known mood up front so the auth screen's
  // accent color (red/amber/teal) matches what the user sees once logged in,
  // instead of always falling back to the default indigo/blue.
  const savedMood = localStorage.getItem('mad-mood');
  if (savedMood) document.documentElement.setAttribute('data-mood', savedMood);

  const user = await checkSession();
  if (!user) {
    showAuthOverlay();
    loginIdentifier?.focus();
    initGoogleSignIn();
    return;
  }
  hideAuthOverlay();
  populateProfileMenu(user);

  mainInput.focus();
  fetchTransactions();
  fetchHealthScore();
  fetchFriends();

  // Chart Toggle Listeners
  if (trendBtnDaily && trendBtnWeekly) {
    trendBtnDaily.addEventListener('click', () => {
      currentTrendView = 'daily';
      trendBtnDaily.classList.add('active');
      trendBtnWeekly.classList.remove('active');
      renderTrendChart();
    });
    trendBtnWeekly.addEventListener('click', () => {
      currentTrendView = 'weekly';
      trendBtnWeekly.classList.add('active');
      trendBtnDaily.classList.remove('active');
      renderTrendChart();
    });
  }

  // Ledger event listeners
  if (ledgerBtn) {
    ledgerBtn.addEventListener('click', () => {
      closeAllOverlays();
      ledgerOverlay.style.display = 'block';
      document.body.style.overflow = 'hidden';
      setActiveNav('ledger-btn');
      fetchLedger();
    });
  }
  if (ledgerBack) {
    ledgerBack.addEventListener('click', () => {
      closeAllOverlays();
      setActiveNav('nav-home');
    });
  }

  // Insights event listeners
  insightsBtn.addEventListener('click', () => {
    closeAllOverlays();
    insightsOverlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    setActiveNav('insights-btn');
    fetchInsightsOverview();
  });

  insightsBack.addEventListener('click', () => {
    closeAllOverlays();
    setActiveNav('nav-home');
  });

  // Home Nav Listener
  if (navHome) {
    navHome.addEventListener('click', () => {
      closeAllOverlays();
      setActiveNav('nav-home');
    });
  }

  // Goals Overlay event listeners
  viewAllGoalsBtn.addEventListener('click', () => {
    openGoalsOverlay();
  });

  goalsOverlayBack.addEventListener('click', () => {
    closeAllOverlays();
  });

  // Init new modules on DOM load
  fetchGoals();
  fetchJarvisAdvice();
  fetchQuickLogs();
  fetchBillAlerts();

  // Native-feel touches: swipe-to-delete + glass nav indicator placement
  enableSwipeToDelete(txnList);
  enableSwipeToDelete(viewAllList);
  enablePullToRefresh();
  requestAnimationFrame(() => {
    const activeNavBtn = document.querySelector('.bottom-nav__item.active');
    if (activeNavBtn) moveNavIndicator(activeNavBtn);
  });
});

// ═══════════════════════════════════════════════
  // GOALS ENGINE
  // ═══════════════════════════════════════════════

  // Open Goals Overlay
  function openGoalsOverlay() {
    goalsOverlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    fetchGoals();
  }
  window.openGoalsOverlay = openGoalsOverlay;

  // Fetch and render savings goals
  async function fetchGoals() {
    try {
      const res = await fetch(`${API_BASE}/goals`);
      const data = await res.json();

      if (!data.success || !data.goals) {
        return;
      }

      const goals = data.goals;

      // 1. RENDER OVERLAY CONTENT
      if (goals.length === 0) {
        goalsList.innerHTML = '';
        goalsList.appendChild(goalsEmpty);
        goalsEmpty.style.display = 'block';
        goalsOverlayAllocation.style.display = 'none';
      } else {
        goalsEmpty.style.display = 'none';
        goalsOverlayAllocation.style.display = 'block';

        const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
        const totalAllocated = goals.reduce((sum, g) => sum + g.currentAmount, 0);
        const surplus = data.netSavings || 0;
        const totalPct = totalTarget > 0 ? Math.min(100, Math.round((totalAllocated / totalTarget) * 100)) : 0;

        goalsOverlayAllocation.innerHTML = `
          <div style="background: rgba(139, 92, 246, 0.05); border: 1px solid rgba(139, 92, 246, 0.15); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 500;">Total Saved (Net Surplus):</span>
              <span style="font-size: 0.95rem; color: var(--accent-1); font-weight: 700;">₹${surplus.toLocaleString('en-IN')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 500;">Allocated to Goals:</span>
              <span style="font-size: 0.95rem; color: var(--accent-cyan); font-weight: 700;">₹${totalAllocated.toLocaleString('en-IN')} / ₹${totalTarget.toLocaleString('en-IN')}</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.04); border-radius: var(--radius-full); overflow: hidden; margin-top: 4px;">
              <div style="height: 100%; width: ${totalPct}%; background: var(--accent-gradient); border-radius: var(--radius-full);"></div>
            </div>
          </div>
        `;

        goalsList.innerHTML = goals.map((goal, i) => {
          const pct = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
          const required = Math.round(goal.monthlyRequired);
          const remainingMonths = Math.max(1, Math.ceil((goal.targetAmount - goal.currentAmount) / (goal.monthlyRequired || 1)));
          
          const priorityNames = { 3: '🔥 High', 2: '⚡ Medium', 1: '🌱 Low' };
          const prioText = priorityNames[goal.priority] || 'Low';

          const remainingText = pct >= 100 ? 'Completed! 🎉' : `${remainingMonths}m left`;
          const requiredText = pct >= 100 ? 'Goal Achieved! 🏆' : `Requires ₹${required.toLocaleString('en-IN')}/month`;
          const barFillStyle = pct >= 100 ? 'background: linear-gradient(135deg, #10b981 0%, #059669 100%);' : '';

          return `
            <div class="goal-card" id="goal-${goal.id}" style="animation-delay: ${i * 0.05}s">
              <div class="goal-card__header">
                <div>
                  <div class="goal-card__title">${escapeHtml(goal.title)}</div>
                  <div class="goal-card__required">${requiredText}</div>
                </div>
                <span class="goal-card__priority goal-card__priority--${goal.priority}">${prioText}</span>
              </div>
              <div class="goal-card__bar-wrapper">
                <div class="goal-card__bar-track">
                  <div class="goal-card__bar-fill" style="width: ${pct}%; ${barFillStyle}"></div>
                </div>
                <div class="goal-card__stats">
                  <span>₹${goal.currentAmount.toLocaleString('en-IN')} / ₹${goal.targetAmount.toLocaleString('en-IN')}</span>
                  <span>${pct}% (${remainingText})</span>
                </div>
              </div>
              <button class="goal-card__delete" onclick="deleteGoal(${goal.id})" aria-label="Remove goal" title="Goal delete karein?">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
                </svg>
              </button>
            </div>
          `;
        }).join('');
      }

      // 2. RENDER DASHBOARD SUMMARY WIDGET
      const activeGoals = goals.filter(g => !g.isCompleted);
      const completedGoals = goals.filter(g => g.isCompleted);
      const activeCount = activeGoals.length;
      const completedCount = completedGoals.length;
      const totalAllocated = goals.reduce((sum, g) => sum + g.currentAmount, 0);

      goalsSummaryStats.innerHTML = `
        <div class="goals-summary__stat">
          <span class="goals-summary__stat-dot" style="background: var(--accent-1);"></span>
          <span>${activeCount} Active</span>
        </div>
        <div class="goals-summary__stat">
          <span class="goals-summary__stat-dot" style="background: #10b981;"></span>
          <span>${completedCount} Done</span>
        </div>
        <div class="goals-summary__stat" style="margin-left: auto;">
          <span>₹${totalAllocated.toLocaleString('en-IN')} Allocated</span>
        </div>
      `;

      // Only show high-priority goals on dashboard summary (priority == 3)
      const highPriorityGoals = goals.filter(g => g.priority === 3);

      if (highPriorityGoals.length === 0) {
        goalsSummaryCards.innerHTML = '';
        goalsSummaryCards.appendChild(goalsSummaryEmpty);
        goalsSummaryEmpty.style.display = 'block';
      } else {
        goalsSummaryEmpty.style.display = 'none';
        goalsSummaryCards.innerHTML = highPriorityGoals.map(goal => {
          const pct = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
          const required = Math.round(goal.monthlyRequired);
          const requiredText = pct >= 100 ? 'Goal Achieved! 🏆' : `Requires ₹${required.toLocaleString('en-IN')}/month`;

          return `
            <div class="goal-mini-card" onclick="openGoalsOverlay()">
              <div class="goal-mini-card__info">
                <div class="goal-mini-card__title">${escapeHtml(goal.title)}</div>
                <div class="goal-mini-card__meta">${escapeHtml(requiredText)}</div>
              </div>
              <div class="goal-mini-card__progress">
                <span class="goal-mini-card__pct">${pct}%</span>
                <div class="goal-mini-card__bar">
                  <div class="goal-mini-card__bar-fill ${pct >= 100 ? 'goal-mini-card__bar-fill--done' : ''}" style="width: ${pct}%;"></div>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

    } catch (err) {
      console.error('fetchGoals error:', err);
    }
  }

  // Delete savings goal
  async function deleteGoal(id) {
    if (!confirm('Bhai! Sach me ye goal delete karna hai?')) return;

    const card = document.getElementById(`goal-${id}`);
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
    }

    try {
      const res = await fetch(`${API_BASE}/goals/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Goal deletion failed', true);
        if (card) { card.style.opacity = '1'; card.style.transform = 'scale(1)'; }
        return;
      }

      showToast('Goal hata diya ✓');
      fetchGoals();
    } catch (err) {
      console.error('Delete goal error:', err);
      showToast('Network error', true);
      if (card) { card.style.opacity = '1'; card.style.transform = 'scale(1)'; }
    }
  }

  // Feasibility Validation Helper
  let activeValidationResult = null;

  async function checkFeasibility() {
    const amount = parseFloat(goalAmount.value);
    const duration = parseInt(goalDuration.value, 10);

    if (isNaN(amount) || amount <= 0 || isNaN(duration) || duration <= 0) {
      goalFeasibility.style.display = 'none';
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/goals/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAmount: amount, durationMonths: duration })
      });
      const data = await res.json();

      if (!data.success) return;

      activeValidationResult = data;
      goalFeasibility.style.display = 'block';
      
      // Set dot color & status text based on state
      if (data.status === 'feasible') {
        feasibilityDot.style.backgroundColor = '#34d399';
        feasibilityStatus.textContent = 'Feasible Goal 🟢';
        feasibilityStatus.style.color = '#34d399';
        feasibilityDesc.textContent = `Required: ₹${data.monthlyRequired.toLocaleString('en-IN')}/month. Teri average savings ₹${data.averageSavings.toLocaleString('en-IN')}/month hai. Badiya plan hai!`;
        feasibilitySuggs.style.display = 'none';
        goalSubmitBtn.disabled = false;
        goalSubmitBtn.style.opacity = '1';
        goalSubmitBtn.style.cursor = 'pointer';
      } else if (data.status === 'stretch') {
        feasibilityDot.style.backgroundColor = '#fbbf24';
        feasibilityStatus.textContent = 'Stretch Goal 🟡';
        feasibilityStatus.style.color = '#fbbf24';
        feasibilityDesc.textContent = `Required: ₹${data.monthlyRequired.toLocaleString('en-IN')}/month. Teri average savings ₹${data.averageSavings.toLocaleString('en-IN')}/month hai. Ye tight budget rahega!`;
        feasibilitySuggs.style.display = 'none';
        goalSubmitBtn.disabled = false;
        goalSubmitBtn.style.opacity = '1';
        goalSubmitBtn.style.cursor = 'pointer';
      } else {
        feasibilityDot.style.backgroundColor = '#f87171';
        feasibilityStatus.textContent = 'Unrealistic Goal 🔴';
        feasibilityStatus.style.color = '#f87171';
        feasibilityDesc.textContent = `Required: ₹${data.monthlyRequired.toLocaleString('en-IN')}/month. Teri monthly income ₹${data.averageIncome.toLocaleString('en-IN')} ke limits ke bahar hai!`;
        
        // Render suggestion chips
        feasibilitySuggsList.innerHTML = `
          <button type="button" class="feasibility-suggestion-btn" onclick="applySuggestedDuration(${data.suggestedDuration})">
            Increase duration to <span>${data.suggestedDuration} months</span> ➔
          </button>
        `;
        feasibilitySuggs.style.display = 'block';
        goalSubmitBtn.disabled = true;
        goalSubmitBtn.style.opacity = '0.5';
        goalSubmitBtn.style.cursor = 'not-allowed';
      }
    } catch (err) {
      console.error('Validation error:', err);
    }
  }

  // Global functions for suggestions action
  window.applySuggestedDuration = (months) => {
    goalDuration.value = months;
    checkFeasibility();
  };

  window.deleteGoal = deleteGoal;

  // Listeners for inputs
  goalAmount.addEventListener('input', checkFeasibility);
  goalDuration.addEventListener('input', checkFeasibility);

  // Goal Modal Actions
  openGoalBtn.addEventListener('click', () => {
    goalForm.reset();
    goalFeasibility.style.display = 'none';
    goalSubmitBtn.disabled = false;
    goalSubmitBtn.style.opacity = '1';
    goalSubmitBtn.style.cursor = 'pointer';
    goalBackdrop.style.display = 'flex';
  });

  goalClose.addEventListener('click', () => {
    goalBackdrop.style.display = 'none';
  });

  goalBackdrop.addEventListener('click', (e) => {
    if (e.target === goalBackdrop) goalBackdrop.style.display = 'none';
  });

  // Submit Goal Form
  goalForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (activeValidationResult && activeValidationResult.status === 'unrealistic') {
      showToast('Unrealistic goal blocked. Please adjust parameters.', true);
      return;
    }

    const title = goalTitle.value.trim();
    const amount = parseFloat(goalAmount.value);
    const duration = parseInt(goalDuration.value, 10);
    const priority = parseInt(goalPriority.value, 10);

    if (activeValidationResult && activeValidationResult.status === 'stretch') {
      // Show stretch confirmation modal
      confirmMonthlyReq.textContent = `₹${activeValidationResult.monthlyRequired.toLocaleString('en-IN')}`;
      confirmMonthlyAvg.textContent = `₹${activeValidationResult.averageSavings.toLocaleString('en-IN')}`;
      goalConfirmBackdrop.style.display = 'flex';
      
      // Bind buttons
      goalConfirmYes.onclick = () => {
        goalConfirmBackdrop.style.display = 'none';
        saveGoalData(title, amount, duration, priority);
      };
      
      goalConfirmNo.onclick = () => {
        goalConfirmBackdrop.style.display = 'none';
      };
      return;
    }

    saveGoalData(title, amount, duration, priority);
  });

  async function saveGoalData(title, targetAmount, durationMonths, priority) {
    try {
      const res = await fetch(`${API_BASE}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, targetAmount, durationMonths, priority })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Goal creation failed', true);
        return;
      }

      goalBackdrop.style.display = 'none';
      showToast(`Goal "${title}" set successfully! 🎯`);
      fetchGoals();
    } catch (err) {
      console.error('Save goal error:', err);
      showToast('Network error', true);
    }
  }

  // ═══════════════════════════════════════════════
  // JARVIS ADVICE BOX
  // ═══════════════════════════════════════════════

  async function fetchJarvisAdvice() {
    try {
      const res = await fetch(`${API_BASE}/insights/overview`);
      const data = await res.json();

      if (!data.success || !data.jarvisAdvice) return;

      const advice = data.jarvisAdvice;
      
      // Update badge — only show if there are NEW (unread) items
      const readCount = parseInt(localStorage.getItem('jarvisReadCount') || '0', 10);
      if (advice.length > 0 && advice.length !== readCount) {
        jarvisBadge.style.display = 'block';
      } else {
        jarvisBadge.style.display = 'none';
      }
      jarvisCount.textContent = advice.length;

      if (advice.length === 0) {
        jarvisAdviceList.innerHTML = `
          <div style="text-align:center; padding: 40px; color: var(--text-tertiary); font-size: 0.85rem;">
            Sab control mein hai bhai! Jarvis ko koi problem nahi dikhi. 👍
          </div>
        `;
        return;
      }

      jarvisAdviceList.innerHTML = advice.map(item => {
        const cardClass = item.type === 'warning' ? 'warning' : 'tip';
        const label = item.type === 'warning' ? 'Warning 🚨' : 'Jarvis Advice 💡';
        return `
          <div class="jarvis-advice-card ${cardClass}">
            <div class="jarvis-advice-card__category">${label} (${item.category})</div>
            <div class="jarvis-advice-card__text">${escapeHtml(item.text)}</div>
          </div>
        `;
      }).join('');

      // Trigger auto-dismissing notifications for new warning cards on submission
      // We can show the first warning as a custom toast alert
      if (advice.some(item => item.type === 'warning')) {
        const warningText = advice.find(item => item.type === 'warning').text;
        // Triggers temporary Toast popup
        showToast(warningText);
      }
    } catch (err) {
      console.error('fetchJarvisAdvice error:', err);
    }
  }

  // Jarvis overlay listeners
  jarvisBtn.addEventListener('click', () => {
    closeAllOverlays();
    jarvisOverlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    // Mark as read
    const currentCount = jarvisCount.textContent || '0';
    localStorage.setItem('jarvisReadCount', currentCount);
    jarvisBadge.style.display = 'none';
    fetchJarvisAdvice();
  });

  jarvisBack.addEventListener('click', () => {
    closeAllOverlays();
  });

  // ═══════════════════════════════════════════════
  // AUTOMATION ENGINE (PHASE 4)
  // ═══════════════════════════════════════════════

  // Fetch and display Quick Log chips
  async function fetchQuickLogs() {
    try {
      const res = await fetch(`${API_BASE}/automation/quick-logs`);
      const data = await res.json();

      if (!data.success || !data.quickLogs || data.quickLogs.length === 0) {
        quickLogContainer.style.display = 'none';
        return;
      }

      quickLogContainer.style.display = 'flex';
      quickLogChips.innerHTML = data.quickLogs.map(log => {
        const emoji = CATEGORY_EMOJI[log.category] || '📦';
        const displayLabel = log.note ? log.note : log.category;
        const notePart = log.note ? ` ${log.note}` : '';
        const commandText = `${log.amount} ${log.category.toLowerCase()}${notePart}`;
        const escapedCommand = escapeAttr(commandText);
        
        return `
          <button class="quick-chip" onclick="applyQuickLog('${escapedCommand}')" title="Fill: '${commandText}'">
            <span>${emoji}</span> ${escapeHtml(displayLabel)} <strong style="color:var(--accent-cyan);">₹${log.amount}</strong>
          </button>
        `;
      }).join('');
    } catch (err) {
      console.error('fetchQuickLogs error:', err);
    }
  }

  // Pre-fill smart input field from Quick Chip
  window.applyQuickLog = (commandStr) => {
    mainInput.value = commandStr;
    // Dispatch input event to refresh NLP live preview
    mainInput.dispatchEvent(new Event('input'));
    mainInput.focus();
  };

  // Fetch and render Bill alerts banner
  async function fetchBillAlerts() {
    try {
      const res = await fetch(`${API_BASE}/automation/due-bills`);
      const data = await res.json();

      if (!data.success || !data.bills || data.bills.length === 0) {
        billAlertsSection.style.display = 'none';
        return;
      }

      billAlertsSection.style.display = 'flex';
      billAlertsList.innerHTML = data.bills.map(bill => {
        const emoji = CATEGORY_EMOJI[bill.category] || '📦';
        const name = bill.note ? bill.note : `Recurring ${bill.category}`;
        const cardClass = bill.isOverdue ? 'bill-alert-card bill-alert-card--overdue' : 'bill-alert-card';
        const statusClass = bill.isOverdue ? 'bill-alert-card__status--overdue' : 'bill-alert-card__status--due';
        
        return `
          <div class="${cardClass}" id="bill-${bill.id}">
            <div class="bill-alert-card__details">
              <div class="bill-alert-card__icon">${emoji}</div>
              <div class="bill-alert-card__info">
                <div class="bill-alert-card__title">${escapeHtml(name)}</div>
                <div class="bill-alert-card__meta">
                  <span>₹${bill.amount.toLocaleString('en-IN')}</span>
                  <span>•</span>
                  <span class="bill-alert-card__status ${statusClass}">${bill.statusText}</span>
                </div>
              </div>
            </div>
            <div class="bill-alert-card__actions">
              <button class="bill-alert-card__btn bill-alert-card__btn--log" onclick="logRecurringBill(${bill.id})">
                Log It ✓
              </button>
              <button class="bill-alert-card__btn bill-alert-card__btn--skip" onclick="skipRecurringBill(${bill.id})" title="Skip this cycle">
                Skip ✖
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('fetchBillAlerts error:', err);
    }
  }

  // Log pending recurring bill
  async function logRecurringBill(id) {
    const card = document.getElementById(`bill-${id}`);
    if (card) {
      card.style.opacity = '0.5';
      card.style.pointerEvents = 'none';
    }

    try {
      const res = await fetch(`${API_BASE}/automation/log-pending/${id}`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to log bill', true);
        if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
        return;
      }

      showToast('Bill expense logged successfully! ✓');
      // Full refresh
      fetchTransactions();
      fetchHealthScore();
      fetchGoals();
      fetchQuickLogs();
      fetchBillAlerts();
      fetchJarvisAdvice();
    } catch (err) {
      console.error('logRecurringBill error:', err);
      showToast('Network error', true);
      if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
    }
  }

  // Skip pending recurring bill
  async function skipRecurringBill(id) {
    const card = document.getElementById(`bill-${id}`);
    if (card) {
      card.style.opacity = '0.5';
      card.style.pointerEvents = 'none';
    }

    try {
      const res = await fetch(`${API_BASE}/automation/skip-pending/${id}`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to skip alert', true);
        if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
        return;
      }

      showToast('Alert skipped for this cycle');
      fetchBillAlerts();
    } catch (err) {
      console.error('skipRecurringBill error:', err);
      showToast('Network error', true);
      if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
    }
  }

  // Fetch list of recurring bills in drawer
  async function fetchAutomations() {
    try {
      const res = await fetch(`${API_BASE}/automation/recurring`);
      const data = await res.json();

      if (!data.success || !data.bills || data.bills.length === 0) {
        automationList.innerHTML = `
          <div style="text-align:center; padding:20px; color:rgba(240,240,245,0.2); font-size:0.8rem; border:1px dashed var(--border-subtle); border-radius: var(--radius-md);">
            No active automations yet.
          </div>
        `;
        return;
      }

      automationList.innerHTML = data.bills.map(bill => {
        const emoji = CATEGORY_EMOJI[bill.category] || '📦';
        const name = bill.note ? bill.note : `Recurring ${bill.category}`;
        const freqLabel = bill.frequency.charAt(0).toUpperCase() + bill.frequency.slice(1);
        
        return `
          <div class="automation-card" id="auto-card-${bill.id}">
            <div class="automation-card__details">
              <div class="automation-card__icon">${emoji}</div>
              <div class="automation-card__info">
                <div class="automation-card__title">${escapeHtml(name)}</div>
                <div class="automation-card__meta">${freqLabel} • Next: ${bill.dueDate}</div>
              </div>
            </div>
            <div class="automation-card__right">
              <span class="automation-card__amount">₹${bill.amount.toLocaleString('en-IN')}</span>
              <button class="automation-card__delete" onclick="deleteAutomation(${bill.id})" title="Delete Recurring template">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('fetchAutomations error:', err);
    }
  }

  // Delete recurring bill template
  async function deleteAutomation(id) {
    if (!confirm('Bhai! Sach me ye recurring billing template band karna hai?')) return;

    try {
      const res = await fetch(`${API_BASE}/automation/recurring/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Deactivation failed', true);
        return;
      }

      showToast('Recurring template deactivated ✓');
      fetchAutomations();
      fetchBillAlerts();
      fetchJarvisAdvice(); // update advice if recurring has changed
    } catch (err) {
      console.error('deleteAutomation error:', err);
      showToast('Network error', true);
    }
  }

  // Bind global window methods for inline clicks
  window.logRecurringBill = logRecurringBill;
  window.skipRecurringBill = skipRecurringBill;
  window.deleteAutomation = deleteAutomation;

  // Toggle Automation overlay
  automationBtn.addEventListener('click', () => {
    closeAllOverlays();
    // Default next due date to today
    autoDueDate.value = new Date().toISOString().split('T')[0];
    
    automationOverlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    setActiveNav('automation-btn');
    fetchAutomations();
  });

  automationBack.addEventListener('click', () => {
    closeAllOverlays();
    setActiveNav('nav-home');
  });

  // Submit Automation form
  automationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const note = autoNote.value.trim();
    const amount = parseFloat(autoAmount.value);
    const category = autoCategory.value;
    const frequency = autoFrequency.value;
    const dueDate = autoDueDate.value;

    if (!amount || amount <= 0) {
      showToast('Invalid amount', true);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/automation/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, category, note, frequency, dueDate })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to add recurring bill', true);
        return;
      }

      showToast('Recurring bill added successfully! ⚡');
      automationForm.reset();
      autoDueDate.value = new Date().toISOString().split('T')[0];
      fetchAutomations();
      fetchBillAlerts();
      fetchJarvisAdvice(); // pattern suggestion checks
    } catch (err) {
      console.error('Automation submit error:', err);
      showToast('Network error', true);
    }
  });

// ═══════════════════════════════════════════════
// PROFILE & SOCIAL LINKING (PHASE B)
// ═══════════════════════════════════════════════

// DOM Elements
const profileBtn         = document.getElementById('profile-menu-view');
const profileOverlay     = document.getElementById('profile-overlay');
const profileBack        = document.getElementById('profile-back');
const profileQrCanvas    = document.getElementById('profile-qr-canvas');

const editIncomeOverlay  = document.getElementById('edit-income-overlay');
const editIncomeForm     = document.getElementById('edit-income-form');
const editIncomeInput    = document.getElementById('edit-income-input');
const editIncomeBack     = document.getElementById('edit-income-back');
const profileUsername    = document.getElementById('profile-username-display');
const editProfileForm    = document.getElementById('edit-profile-form');
const editProfileName    = document.getElementById('edit-profile-displayname');
const editProfileEmail   = document.getElementById('edit-profile-email');
const editProfileIncome  = document.getElementById('edit-profile-income');
const changePasswordForm = document.getElementById('change-password-form');
const changePwdCurrent   = document.getElementById('change-pwd-current');
const changePwdNew       = document.getElementById('change-pwd-new');
const addFriendForm      = document.getElementById('add-friend-form');
const addFriendInput     = document.getElementById('add-friend-input');

const notificationsBtn   = document.getElementById('notifications-btn');
const notificationsMenu  = document.getElementById('notifications-menu');
const notificationsBadge = document.getElementById('notifications-badge');
const notificationsList  = document.getElementById('notifications-list');

// Toggle Profile Overlay
if (profileBtn) {
  profileBtn.addEventListener('click', async () => {
    profileMenu.style.display = 'none'; // hide top dropdown
    closeAllOverlays();
    
    // Fetch latest user details
    try {
      const res = await fetch(`${API_BASE}/auth/me`);
      const data = await res.json();
      if (data.success) {
        editProfileName.value = data.user.displayName || '';
        editProfileEmail.value = data.user.email || '';
        if (editProfileIncome) editProfileIncome.value = data.user.monthlyIncome || 0;
        profileUsername.textContent = `@${data.user.username}`;
        
        updateAvatarDisplay(data.user.avatarUrl, data.user.displayName || data.user.username);
        
        // Render QR Code
        if (window.QRCode && profileQrCanvas) {
          profileQrCanvas.innerHTML = '';
          new QRCode(profileQrCanvas, {
            text: data.user.username,
            width: 180,
            height: 180,
            colorDark: '#111827',
            colorLight: '#ffffff'
          });
        }
      }
    } catch (err) {
      console.error('Failed to load profile', err);
    }
    
    profileOverlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
  });
}

if (profileBack) {
  profileBack.addEventListener('click', () => {
    closeAllOverlays();
    setActiveNav('nav-home');
  });
}

// Update Profile Form
if (editProfileForm) {
  editProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = editProfileName.value;
    const email = editProfileEmail.value;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Profile updated successfully! ✓');
        // Update topbar visuals
        const label = data.user.displayName || data.user.username;
        const firstLetter = label.charAt(0).toUpperCase();
        document.getElementById('profile-menu-avatar').textContent = firstLetter;
        document.getElementById('profile-menu-name').textContent = label;
        document.getElementById('profile-menu-email').textContent = data.user.email;
        updateAvatarDisplay(data.user.avatarUrl, label);
      } else {
        showToast(data.error || 'Update failed', true);
      }
    } catch (err) {
      showToast('Network error', true);
    }
  });
}

// Change Password Form
if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = changePwdCurrent.value;
    const newPassword = changePwdNew.value;

    try {
      const res = await fetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Password updated successfully! 🔒');
        changePasswordForm.reset();
      } else {
        showToast(data.error || 'Password update failed', true);
      }
    } catch (err) {
      showToast('Network error', true);
    }
  });
}

// Send Friend Request
if (addFriendForm) {
  addFriendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = addFriendInput.value;

    try {
      const res = await fetch(`${API_BASE}/connections/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Friend request sent! 📨');
        addFriendForm.reset();
      } else {
        showToast(data.error || 'Failed to send request', true);
      }
    } catch (err) {
      showToast('Network error', true);
    }
  });
}

// Notifications Toggle
if (notificationsBtn) {
  notificationsBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isVisible = notificationsMenu.style.display === 'block';
    if (!isVisible) {
      notificationsMenu.style.display = 'block';
      await fetchNotificationsAndRequests();
      
      // Mark read
      fetch(`${API_BASE}/notifications/read`, { method: 'POST' });
      notificationsBadge.style.display = 'none';
    } else {
      notificationsMenu.style.display = 'none';
    }
  });
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  if (notificationsMenu && !notificationsBtn.contains(e.target) && !notificationsMenu.contains(e.target)) {
    notificationsMenu.style.display = 'none';
  }
});

// Fetch Notifications and Pending Requests
async function fetchNotificationsAndRequests() {
  try {
    const [notifRes, reqsRes] = await Promise.all([
      fetch(`${API_BASE}/notifications`),
      fetch(`${API_BASE}/connections/pending`)
    ]);
    const notifsData = await notifRes.json();
    const reqsData = await reqsRes.json();

    let html = '';

    if (reqsData.success && reqsData.requests.length > 0) {
      html += `<div style="font-size: 0.8rem; font-weight: 600; color: var(--accent-1); margin-top: 8px;">Pending Requests</div>`;
      reqsData.requests.forEach(req => {
        html += `
          <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
            <div>
              <div style="font-size: 0.85rem; font-weight: 500;">${escapeHtml(req.displayName || req.username)}</div>
              <div style="font-size: 0.75rem; color: var(--text-tertiary);">@${req.username}</div>
            </div>
            <button onclick="acceptFriendRequest(${req.connectionId})" style="background: var(--accent-1); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">Accept</button>
          </div>
        `;
      });
    }

    if (notifsData.success && notifsData.notifications.length > 0) {
      html += `<div style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-top: 12px;">Notifications</div>`;
      notifsData.notifications.forEach(n => {
        html += `
          <div style="font-size: 0.8rem; padding: 8px 0; border-bottom: 1px solid var(--border-subtle);">
            ${escapeHtml(n.message)}
          </div>
        `;
      });
      notificationsBadge.style.display = 'block';
    }

    if (!html) {
      html = `<div style="font-size: 0.8rem; color: var(--text-tertiary); text-align: center; padding: 12px 0;">No new notifications</div>`;
    }

    notificationsList.innerHTML = html;
  } catch (err) {
    console.error('Failed to load notifications', err);
  }
}

window.acceptFriendRequest = async function(connId) {
  try {
    const res = await fetch(`${API_BASE}/connections/accept/${connId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Friend request accepted! 🎉');
      fetchNotificationsAndRequests();
    } else {
      showToast(data.error || 'Failed to accept', true);
    }
  } catch (err) {
    showToast('Network error', true);
  }
};

// Start checking for new notifications (polling)
setInterval(async () => {
  if (!document.getElementById('auth-overlay') || document.getElementById('auth-overlay').style.display !== 'none') return;
  try {
    const [notifRes, reqsRes] = await Promise.all([
      fetch(`${API_BASE}/notifications`),
      fetch(`${API_BASE}/connections/pending`)
    ]);
    const notifsData = await notifRes.json();
    const reqsData = await reqsRes.json();
    
    if ((notifsData.success && notifsData.notifications.length > 0) || (reqsData.success && reqsData.requests.length > 0)) {
      notificationsBadge.style.display = 'block';
    }
  } catch (e) {}
}, 30000); // Check every 30 seconds

// Avatar Upload Listeners
if (uploadAvatarBtn) {
  uploadAvatarBtn.addEventListener('click', () => {
    avatarUploadInput.click();
  });
}

if (avatarUploadInput) {
  avatarUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 250;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const base64Str = canvas.toDataURL('image/jpeg', 0.85);

        try {
          const res = await fetch(`${API_BASE}/auth/avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatarBase64: base64Str })
          });
          const data = await res.json();
          if (data.success) {
            showToast('Profile picture updated! 📸');
            updateAvatarDisplay(data.user.avatarUrl, data.user.displayName || data.user.username);
            // Also update the popover
            populateProfileMenu(data.user);
          } else {
            showToast(data.error || 'Upload failed', true);
          }
        } catch (err) {
          showToast('Network error', true);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════
// Settings Dashboard UI Logic
// ═══════════════════════════════════════════════
const profileMenuView   = document.getElementById('profile-menu-view'); 



const editProfileOverlay = document.getElementById('edit-profile-overlay');
const editProfileBack    = document.getElementById('edit-profile-back');
const addFriendOverlay   = document.getElementById('add-friend-overlay');
const addFriendBack      = document.getElementById('add-friend-back');

const settingsProfileCard = document.getElementById('settings-profile-card');
const settingsAvatarImg   = document.getElementById('settings-avatar-img');
const settingsAvatarText  = document.getElementById('settings-avatar-text');
const settingsProfileName = document.getElementById('settings-profile-name');
const settingsProfileEmail= document.getElementById('settings-profile-email');
const settingsMonthlyIncome= document.getElementById('settings-monthly-income');

const settingsDarkmodeToggle = document.getElementById('settings-darkmode-toggle');
const settingsDarkmodeSwitch = document.getElementById('settings-darkmode-switch');
const settingsDarkmodeStatus = document.getElementById('settings-darkmode-status');

const settingsBillsBtn    = document.getElementById('settings-bills-btn');
const settingsSplitBtn    = document.getElementById('settings-split-btn');
const settingsReportsBtn  = document.getElementById('settings-reports-btn');
const settingsFutureBtn   = document.getElementById('settings-future-btn');
const settingsIncomeBtn   = document.getElementById('settings-income-btn');

if (profileMenuView) {
  profileMenuView.addEventListener('click', async () => {
    closeAllOverlays();
    profileMenu.style.display = 'none';
    profileOverlay.style.display = 'block';
    document.body.style.overflow = 'hidden';

    try {
      if (settingsMonthlyIncome) {
        const res = await fetch(`${API_BASE}/auth/me`);
        const data = await res.json();
        if (data.success && data.user) {
          settingsMonthlyIncome.textContent = `₹${(data.user.monthlyIncome || 0).toLocaleString('en-IN')}`;
        }
      }
    } catch (err) {
      console.error('Failed to load user income for settings', err);
    }
  });
}



if (profileBack) {
  profileBack.addEventListener('click', () => {
    profileOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
  });
}

if (settingsProfileCard) {
  settingsProfileCard.addEventListener('click', async () => {
    profileOverlay.style.display = 'none';
    editProfileOverlay.style.display = 'block';

    try {
      const res = await fetch(`${API_BASE}/auth/me`);
      const data = await res.json();
      if (data.success) {
        const label = data.user.displayName || data.user.username;
        const displayNameEl = document.getElementById('profile-display-name');
        if (displayNameEl) displayNameEl.textContent = label;
        if (profileUsername) profileUsername.textContent = `@${data.user.username}`;
        if (editProfileName) editProfileName.value = data.user.displayName || '';
        if (editProfileEmail) editProfileEmail.value = data.user.email || '';
        updateAvatarDisplay(data.user.avatarUrl, label);

        if (window.QRCode && profileQrCanvas) {
          profileQrCanvas.innerHTML = '';
          new QRCode(profileQrCanvas, {
            text: data.user.username,
            width: 180,
            height: 180,
            colorDark: '#111827',
            colorLight: '#ffffff'
          });
        }
      }
    } catch (err) {
      console.error('Failed to load profile details', err);
    }
  });
}

if (settingsIncomeBtn) {
  settingsIncomeBtn.addEventListener('click', async () => {
    editIncomeOverlay.classList.add('active');

    try {
      const res = await fetch(`${API_BASE}/auth/me`);
      const data = await res.json();
      if (data.success && editIncomeInput) {
        editIncomeInput.value = data.user.monthlyIncome || 0;
      }
    } catch (err) {
      console.error('Failed to load income details', err);
    }
  });
}

if (editIncomeOverlay) {
  editIncomeOverlay.addEventListener('click', (e) => {
    if (e.target === editIncomeOverlay) {
      editIncomeOverlay.classList.remove('active');
    }
  });
}

if (editIncomeBack) {
  editIncomeBack.addEventListener('click', () => {
    editIncomeOverlay.classList.remove('active');
  });
}

if (editIncomeForm) {
  editIncomeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const monthlyIncome = parseFloat(editIncomeInput.value) || 0;

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyIncome })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Income updated successfully! ✓');
        const incomeDisplay = document.getElementById('settings-monthly-income');
        if (incomeDisplay) {
          incomeDisplay.textContent = `₹${monthlyIncome.toLocaleString('en-IN')}`;
        }
        editIncomeOverlay.classList.remove('active');
      } else {
        showToast(data.error || 'Update failed', true);
      }
    } catch (err) {
      console.error('Income update error', err);
      showToast('Connection error', true);
    }
  });
}


if (editProfileBack) {
  editProfileBack.addEventListener('click', () => {
    editProfileOverlay.style.display = 'none';
    profileOverlay.style.display = 'block';
  });
}

if (addFriendBack) {
  addFriendBack.addEventListener('click', () => {
    addFriendOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
  });
}

if (settingsBillsBtn) {
  settingsBillsBtn.addEventListener('click', () => {
    profileOverlay.style.display = 'none';
    automationBtn.click();
  });
}

if (settingsSplitBtn) {
  settingsSplitBtn.addEventListener('click', () => {
    profileOverlay.style.display = 'none';
    document.getElementById('ledger-btn').click();
  });
}

if (settingsReportsBtn) {
  settingsReportsBtn.addEventListener('click', () => {
    profileOverlay.style.display = 'none';
    document.getElementById('insights-btn').click();
  });
}

if (settingsFutureBtn) {
  settingsFutureBtn.addEventListener('click', () => {
    showToast('Future Simulator is coming soon! 🚀');
  });
}

if (settingsDarkmodeToggle) {
  // Check initial state
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (!isDark) {
    settingsDarkmodeSwitch.classList.remove('active');
    settingsDarkmodeStatus.textContent = 'Off';
  }
  
  settingsDarkmodeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('mad_theme', newTheme);
    
    if (newTheme === 'dark') {
      settingsDarkmodeSwitch.classList.add('active');
      settingsDarkmodeStatus.textContent = 'On';
    } else {
      settingsDarkmodeSwitch.classList.remove('active');
      settingsDarkmodeStatus.textContent = 'Off';
    }
  });
}

// Override updateAvatarDisplay to also update the new Settings UI avatar
const originalUpdateAvatarDisplay = updateAvatarDisplay;
window.updateAvatarDisplay = function(avatarUrl, displayName) {
  originalUpdateAvatarDisplay(avatarUrl, displayName);
  const initial = (displayName || '?').charAt(0).toUpperCase();
  if (avatarUrl) {
    if (settingsAvatarImg) {
      settingsAvatarImg.src = avatarUrl;
      settingsAvatarImg.style.display = 'block';
    }
    if (settingsAvatarText) settingsAvatarText.style.display = 'none';
  } else {
    if (settingsAvatarImg) settingsAvatarImg.style.display = 'none';
    if (settingsAvatarText) {
      settingsAvatarText.textContent = initial;
      settingsAvatarText.style.display = 'inline';
    }
  }
};

// Override populateProfileMenu to update names in the new Settings UI
const originalPopulateProfileMenu = populateProfileMenu;
window.populateProfileMenu = function(user) {
  originalPopulateProfileMenu(user);
  if (settingsProfileName) settingsProfileName.textContent = user.displayName || user.username;
  if (settingsProfileEmail) settingsProfileEmail.textContent = user.email;
};
