# Phase 6: Advanced Intelligence

This phase implements sophisticated financial planning tools (SIP/EMI advisors, surplus forecasts) and a score-driven Mood Engine that visually responds to the user's financial status.

* **Status (Mood Engine):** **Completed** ✅
* **Status (Financial Planning Tools):** **Pending / Not Yet Implemented** ⏳

---

## 🎭 Mood Engine — Emotion-Based Dynamic UI (Implemented)

The Mood Engine shifts the entire app's colour palette in real-time based on the user's live Money Health Score. It is the first sub-feature of Phase 6 to ship and is fully operational.

### How it works

`applyMoodFromScore(score)` runs every time `fetchHealthScore()` returns a result (`frontend/app.js`). It:
1. Maps the score to one of three moods:
   | Mood | Score Range | Palette |
   | :--- | :--- | :--- |
   | **Calm** | ≥ 80 | Teal/cyan/green — smooth sailing |
   | **Caution** | 55–79 | Amber/orange — keep an eye out |
   | **Alert** | < 55 | Red/crimson — time to act |
2. Sets `document.documentElement.setAttribute('data-mood', mood)` on `<html>`.
3. Saves the mood to `localStorage` under `mad-mood` so it survives page reloads and is available immediately on the next visit — including while the auth/login overlay is still visible (applied before the session check in `DOMContentLoaded`).
4. Updates the `#health-mood-badge` label in the UI.

### CSS implementation

`[data-mood]` attribute selectors in `frontend/index.css` override the accent CSS custom properties for every matching rule:

```css
/* Default (no mood set yet) */
:root {
  --accent-1: #6366f1;          /* indigo */
  --accent-2: #06b6d4;
  --accent-gradient: linear-gradient(135deg, #6366f1, #06b6d4);
  --accent-gradient-vibrant: linear-gradient(135deg, #818cf8, #22d3ee);
  --mood-glow: rgba(99, 102, 241, 0.35);
  --mood-glow-soft: rgba(99, 102, 241, 0.12);
}

[data-mood="calm"] {
  --accent-1: #22d3ee;          /* teal */
  --accent-gradient: linear-gradient(135deg, #22d3ee, #818cf8, #34d399);
  --mood-glow: rgba(34, 211, 238, 0.4);
  --mood-glow-soft: rgba(52, 211, 153, 0.18);
}

[data-mood="caution"] {
  --accent-1: #f59e0b;          /* amber */
  --accent-gradient: linear-gradient(135deg, #f59e0b, #fb923c, #fb7185);
  --mood-glow: rgba(245, 158, 11, 0.4);
  --mood-glow-soft: rgba(251, 146, 60, 0.18);
}

[data-mood="alert"] {
  --accent-1: #ef4444;          /* red */
  --accent-gradient: linear-gradient(135deg, #ef4444, #b91c1c, #1f2937);
  --mood-glow: rgba(239, 68, 68, 0.45);
  --mood-glow-soft: rgba(239, 68, 68, 0.2);
}
```

Because every brand/accent element in the app consumes these variables — 40+ CSS rules including the FAB button, the "M.A.D" wordmark gradient, the hero-input focus glow, active-tab pill glow, modal save buttons, focus borders, split-picker badge, and the Jarvis advice card accents — a single attribute change on `<html>` recolours the entire UI atomically.

### What deliberately does NOT shift with mood

Semantic colours that convey universal financial meaning are hardcoded and intentionally excluded from the mood cascade so they remain unambiguous at all times:

| Colour | Elements | Reason |
| :--- | :--- | :--- |
| Green (`#10b981`) | Income amounts, trend-up indicators, settled ledger | Income = green is a universal financial convention |
| Red (`#ef4444`) | Expense amounts, error messages, delete hover, overdue bills | Expense/danger = red is a universal convention |
| Category badge colours | Travel (blue), Housing (teal), Health (purple) etc. | Must distinguish categories *from each other*; collapsing them all into one mood colour would make charts/lists unreadable |

### Auth screen consistency

Prior to this fix the login/signup overlay always showed the default indigo accent because `applyMoodFromScore` only ran post-login. Now the saved `mad-mood` from `localStorage` is applied to `<html>` as the first operation in `DOMContentLoaded` (before `checkSession()`), so the auth screen's accent always matches what the user will see inside the app.

---

## 🗄️ Database Layer (Proposed Schemas)

To support the remaining financial planning tools, the following table is planned:

```sql
CREATE TABLE IF NOT EXISTS user_financial_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL DEFAULT 'local-user',
  monthlyIncomeTarget REAL,
  savingsRatioTarget REAL DEFAULT 0.20,
  emergencyFundTarget REAL,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

---

## ⚙️ Backend Layer (Proposed Endpoints & Engines)

### API Endpoints
* **`GET /api/intelligence/surplus-forecast`**: Runs a moving average forecast of income versus expense history to calculate investible surplus.
* **`POST /api/intelligence/emi-advisor`**: Analyses the impact of a proposed EMI payment on the user's weekly and monthly cash flow patterns.

### Planning Algorithms
1. **Surplus Forecaster**:
   * Evaluates the last 3 months of transaction history, applies a seasonal decay rate, and determines standard deviations to suggest how much cash can be committed to fixed SIPs without cash-flow risks.
2. **EMI Plan Check**:
   * If a user queries *"buy laptop on 5000 EMI"*, the engine computes the impact on their current Savings Index. If it drops their health score below $55$, it issues a warning advice.

---

## 🎨 Frontend Layer (Proposed UI Elements)

1. **Surplus Widget**:
   * Displays target savings and suggests mutual fund or fixed deposit allocation routes.
2. **Interactive EMI Estimator**:
   * Allows inputting proposed credit purchases to preview a simulated health score before committing to buy.
