# Phase 1: Foundation (Data + Control)

This phase establishes the base logging mechanics, parser operations, and CRUD capabilities to ensure transactions are safely recorded and editable.

* **Status:** **Completed** ✅

---

## 🗄️ Database Layer

### Schema Definition
Phase 1 sets up the core database schema inside [db.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/db.js).
```sql
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL DEFAULT 'local-user',
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  category TEXT NOT NULL,
  note TEXT,
  date TEXT NOT NULL,
  isIncorrect INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

> [!NOTE]
> The `userId` column retains its original `TEXT NOT NULL DEFAULT 'local-user'` definition for backward compatibility with pre-auth rows. Since the **Phase A multi-user rebuild**, every new transaction is written with the real authenticated `req.session.userId` (the integer `users.id`) and every read query filters on it — so each account only ever sees its own data.

### Prepared Statements
The following prepared statements handle storage operations in Phase 1:
* **`insertTransaction`**:
  ```sql
  INSERT INTO transactions (userId, amount, type, category, note, date)
  VALUES (@userId, @amount, @type, @category, @note, @date)
  ```
* **`getRecentTransactions`**: Pulls the last 5 active transactions:
  ```sql
  SELECT id, amount, type, category, note, date, createdAt
  FROM transactions
  WHERE isIncorrect = 0
  ORDER BY createdAt DESC
  LIMIT 5
  ```
* **`getAllTransactions`**: Pulls all active transactions:
  ```sql
  SELECT id, amount, type, category, note, date, createdAt
  FROM transactions
  WHERE isIncorrect = 0
  ORDER BY createdAt DESC
  ```
* **`updateTransaction`**: Edits fields for a single record:
  ```sql
  UPDATE transactions
  SET amount = @amount, note = @note, category = @category, type = @type
  WHERE id = @id AND userId = @userId AND isIncorrect = 0
  ```
* **`softDeleteTransaction`**: Flags incorrect rows instead of dropping them:
  ```sql
  UPDATE transactions SET isIncorrect = 1 WHERE id = @id AND userId = @userId
  ```

---

## ⚙️ Backend Layer

### Endpoints
Defined in [transactions.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/routes/transactions.js):
* **`POST /api/transactions`**: Receives raw string, parses it, inserts to DB, and returns the transaction object.
* **`GET /api/transactions`**: Returns list of the 5 most recent transactions.
* **`GET /api/transactions/all`**: Returns the list of all active transactions for the "View All" display.
* **`PUT /api/transactions/:id`**: Accepts updated `amount`, `note`, `category`, and `type` fields to override an active transaction.
* **`PATCH /api/transactions/:id/incorrect`**: Soft-deletes a record.

### Parsing Engine
[parseInput](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/parser.js#L186) parses natural language queries:
1. Strips out leading `+` (forces the transaction to `income`).
2. Extracts the numeric value (integer or decimal) as the `amount`.
3. Isolates the remaining string as the `note`.
4. Checks each word in the note against the categories mapped in `CATEGORY_MAP`.
5. Checks words against `INCOME_KEYWORDS` to auto-detect income vs. expense.

---

## 🎨 Frontend Layer

### Components & Structures
All layouts are loaded in [index.html](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/frontend/index.html) and controlled by [app.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/frontend/app.js):

1. **Hero Input**:
   * Text field (`#main-input`) configured with autofocus and custom placeholder `250 swiggy`.
   * Action button (`#add-btn`) triggering submission on click or when `Enter` is pressed.
2. **Inline Live Preview**:
   * Runs [parseInputLocally](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/frontend/app.js#L120) to generate real-time feedback (amount, color-coded tag, note) as the user types.
3. **Recent Transactions Feed**:
   * Displays the latest 5 entries with category-specific emojis, formatted currency, delete buttons, and relative timestamps (e.g. `2m ago`).
4. **Edit Modal**:
   * Pre-fills inputs with amount, note, type, and category selections. Validates fields and triggers the `PUT` API.
5. **View All Overlay**:
   * A full-screen overlay panel showing the entire transaction count and history with scroll mechanics.
6. **Toast Notification System**:
   * Dynamically mounts toast elements to alert the user of status updates (e.g., *"₹250 swiggy added ✓"*).
