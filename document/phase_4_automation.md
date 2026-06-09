# Phase 4: Automation

This phase aims to reduce logging friction by auto-logging recurring commitments and recognizing input patterns to suggest automatic updates.

* **Status:** **Completed** ✅

---

## 🗄️ Database Layer

We implemented a `recurring_bills` table to track subscription commitments and automate alerts:

```sql
CREATE TABLE IF NOT EXISTS recurring_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL DEFAULT 'local-user',
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'monthly', 'yearly')),
  dueDate TEXT NOT NULL,
  lastLoggedDate TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

> [!NOTE]
> The `userId` column retains its original `TEXT NOT NULL DEFAULT 'local-user'` definition for backward compatibility. Since the **Phase A multi-user rebuild**, every recurring bill is created and fetched scoped to the real authenticated `req.session.userId` — each account manages only its own automation templates.

### Prepared Statements Implemented
* **`insertRecurringBill`**: Saves a new subscription template (e.g., Netflix subscription, House rent).
* **`getRecurringBills`**: Retrieves all active recurring templates.
* **`updateRecurringBillDueDate`**: Updates the due date and last logged date when a bill is paid/skipped.
* **`deleteRecurringBill`**: Soft-deletes (deactivates) a template.

---

## ⚙️ Backend Layer

### API Endpoints (`/api/automation`)
* **`GET /recurring`**: Lists all active recurring bills.
* **`POST /recurring`**: Registers a new automated recurring template.
* **`DELETE /recurring/:id`**: Soft-deletes (deactivates) a template.
* **`GET /due-bills`**: Evaluates active bills against the current date. Returns bills that are overdue or due within 3 days, accompanied by contextual Hinglish status text (e.g., "Due tomorrow bhai!").
* **`POST /log-pending/:id`**: Logs the pending bill as a transaction, updates its `lastLoggedDate`, and advances the `dueDate` to the next cycle.
* **`POST /skip-pending/:id`**: Skips the current cycle without creating a transaction and advances the `dueDate`.
* **`GET /quick-logs`**: Aggregates the last 30 days of transactions to find the top 4 most frequent (distinct category/note/amount combos) expenses for 1-click logging.

### Automation Engine Logic (in `insights.js`)
* **Pattern Detection**: The Jarvis engine analyzes the last 30 days of transactions. If a user logs the exact same amount, category, and note 3 or more times (and it's not already set as a recurring bill), Jarvis generates an actionable recommendation to automate it.

---

## 🎨 Frontend Layer

1. **Bill Alerts Bar**:
   * A dynamic banner appears on the dashboard (`#bill-alerts-section`) showing outstanding payments. Features gradient backgrounds and overdue red highlights, with dedicated "Log It" and "Skip" action buttons.
2. **"Quick Log" Suggestions**:
   * One-click chips render directly beneath the main smart input (`#quick-log-chips`), allowing the user to pre-fill the input with frequent expenses instantly.
3. **Automations Manager Overlay**:
   * A dedicated side-panel drawer accessed via the `⚡ Automation` header button. It provides an interface to view active templates, delete them, and add new recurring bills via a dedicated form.
