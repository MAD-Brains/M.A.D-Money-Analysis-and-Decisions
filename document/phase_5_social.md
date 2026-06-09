# Phase 5: Social

This phase introduces shared expenses, letting the user split a bill with a friend in natural language and track who owes whom via a running ledger.

* **Status (MVP below):** **Completed** ✅
* **Status (account-linked rebuild):** 🚧 **In Progress** — see [Account-Linked Rebuild (Phases B–F)](#-account-linked-rebuild-in-progress-) at the bottom of this document.

> [!NOTE]
> The social features have been expanded from the basic 1:1 50/50 split MVP. Users can now split a single transaction with **multiple friends simultaneously** and choose from **four distinct split methods** (Equally, Exact, Percentage, and Shares) using an interactive, real-time validating **Split Picker UI**.

> [!WARNING]
> **The MVP described in this document is single-player theater.** A "friend" is just a free-text label privately owned by one account — `friends`/`splits` have no concept of the *other* person's account. If you type `"500 dinner split with Rohan"` and a real person named Rohan also uses M.A.D, he never sees this entry, can't confirm the amount, and can't mark his side settled. The Phase A account-system rebuild (see [project_documentation.md](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/docs/project_documentation.md)) fixed the *cross-account isolation* bug — each account's friends/splits are now correctly scoped to `req.session.userId` and never leak into another account's view — but it intentionally left this one-sided design in place. Replacing it with real account-to-account linking and a single shared, bidirectionally-visible ledger is the subject of the **in-progress rebuild** documented at the end of this file.

---

## 🗄️ Database Layer (Implemented)

Two new tables back the feature, defined in [db.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/db.js):

```sql
-- Friends Table
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL DEFAULT 'local-user',  -- now holds the real authenticated req.session.userId
  name TEXT NOT NULL,
  upiId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Splits Table
CREATE TABLE IF NOT EXISTS splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transactionId INTEGER NOT NULL,
  friendId INTEGER NOT NULL,
  splitAmount REAL NOT NULL,
  isSettled INTEGER NOT NULL DEFAULT 0,
  settledDate TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY(transactionId) REFERENCES transactions(id),
  FOREIGN KEY(friendId) REFERENCES friends(id)
);
```

Each split row links one transaction to one friend — there is no separate `groups` or `group_members` table; multi-friend splits are recorded as individual 1-to-1 rows in the `splits` table.

### Prepared Statements Implemented
* **`insertFriend`**: Creates a friend record on first mention.
* **`getFriendByName`**: Case-insensitive lookup (`lower(name) = lower(@name)`) used to dedupe friends by name.
* **`getAllFriends`**: Fetches all friends of the user, ordered alphabetically (`ORDER BY name ASC`).
* **`insertSplit`**: Records a friend's share of a transaction.
* **`getLedgerBalances`**: Aggregates each friend's net unsettled balance (`SUM(splitAmount)` over `isSettled = 0`, left-joined so friends with zero splits still appear).
* **`settleFriendDebts`**: Bulk-marks all of a friend's unsettled splits as `isSettled = 1` and stamps `settledDate`.

---

## 🧠 Parsing & Detection Logic (Implemented)

1. **Text-based Detection**: [parser.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/parser.js#L218) (mirrored client-side in `parseInputLocally`) detects split intent in the smart input:
   * **Pattern**: `/split with\s+([a-zA-Z0-9_]+)/i` — matches phrases like `"680 dinner split with Rohan"`.
   * The matched name is captured as `splitWith` and stripped out of the note before category detection runs, so `"dinner"` is matched against `CATEGORY_MAP`.
   * Live preview displays a purple badge: `🤝 Split with Rohan (50/50)`.
2. **Interactive UI Entry (Split Picker)**: If a numeric amount is entered, a **"🤝 Split"** button appears in the live preview panel. Clicking it opens the interactive Split Picker modal.

---

## ⚙️ Backend Layer (Implemented)

### Split creation — `POST /api/transactions`
Modified in [routes/transactions.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/routes/transactions.js#L28) to handle both quick text-based 50/50 splits and structured multi-friend splits:
1. **Payload Structure**: Accepts optional `splits` array: `{ input: "...", splits: [{ friendName: "Rohan", amount: 200 }] }`.
2. **SQLite Database Transaction**: Inserts the transaction and all corresponding split records inside an atomic `db.transaction()` block for database consistency.
3. **Remainder Deduction**: Calculates the total split amount assigned to friends and subtracts it from the original transaction amount. Only the user's remaining share (`finalAmount`) is saved in the `transactions` table, meaning only the user's net expense affects their balance, charts, and Money Health Score.
4. **Validation**: Checks that all friend split amounts are positive, friend names are present, and the sum of splits does not exceed the total transaction amount.

### Friends API (`/api/friends`) — [routes/friends.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/routes/friends.js)
* **`GET /`**: Fetches all friends sorted alphabetically for autocomplete suggestions and friend chip rendering.

### Ledger API (`/api/ledger`) — [routes/ledger.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/routes/ledger.js)
* **`GET /`**: Returns each friend's net balance via `getLedgerBalances`.
* **`POST /settle/:friendId`**: Marks all outstanding splits for that friend as settled and inserts a balancing `income` transaction (category `Others`, note `"Settled up with <name>"`) to reconcile the user's account.

---

## 🎨 Frontend Layer (Implemented)

1. **Live Preview Trigger**: Clicking the purple **"🤝 Split"** button on the transaction preview drawer opens the **Split Picker Modal**.
2. **Interactive Friend Chips**:
   * Displays chips for all previously logged friends. Clicking a chip toggles their inclusion in the split.
   * Includes a dynamic `+ Add` button that opens a text input to instantly add new friend names to the list.
3. **Friend Autocomplete Suggestions**: While typing in the name input, an autocomplete dropdown (`#split-suggestions`) queries known friends, supporting keyboard navigation (`ArrowUp`/`ArrowDown`/`Enter`) and mouse clicks.
4. **Custom Split Methods**:
   * **Equally**: Divides the total cost equally among all selected friends + the user.
   * **Exact**: Lets the user specify precise rupee amounts for each friend; the user's share is the remaining amount.
   * **Percentage**: Lets the user enter percentage shares for each friend (e.g. 30%, 40%); the user's share is the remaining percentage.
   * **Shares**: Lets the user assign share weights (e.g. friend A gets 2 shares, friend B gets 1, user gets 1); calculates amounts proportionally.
5. **Live Calculated Breakdown & Validation**:
   * Dynamically renders input fields based on the selected method.
   * Renders a read-only **"You"** row displaying the user's calculated share.
   * Displays a live summary (e.g. *"You pay ₹300 · Rohan ₹200 · Amit ₹100"*).
   * Displays validation error messages in red and disables the "Add Split" button if values are invalid (e.g. inputs are empty, percentages exceed 100%, or split total exceeds total expense).
6. **Ledger Drawer Overlay**: Shows outstanding net balances (color-coded green/red), empty states with Hinglish tips, and one-click settlements.

---

## ⏳ Remaining / Not Yet Implemented

* **Groups Registry**: No explicit `groups` or `group_members` database tables — multi-friend splitting is handled at the transaction-split level.
* **Debt Minimization / Settlement Simplification**: No algorithm to optimize chain debts across multiple friends (e.g., A owes B, B owes C -> A owes C).
* **UPI Deep Links & QR Codes**: Settlements are marked locally only; there is no generation of UPI payment URIs (`upi://pay`) or QR codes for scanning.
* **Dedicated Friend Management UI**: No central dashboard to edit friend profiles, merge duplicates, or explicitly save `upiId` values (the column remains in the database schema but is not exposed in the UI).

---

## 🚧 Account-Linked Rebuild (In Progress)

Now that Phase A has given M.A.D real, password-protected accounts (see [project_documentation.md § Account System](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/docs/project_documentation.md)), the social MVP above is being rebuilt from the ground up so that "splitting with a friend" means splitting with another **real account** — a single shared ledger row both sides can see, confirm, and settle. This directly addresses the "single-player theater" limitation called out at the top of this document. The rebuild is broken into five independently-shippable phases:

* **Phase B — Friend-to-Friend Account Linking** *(pending)*: A new `connections` table replaces free-text `friends` for the purpose of *linking* — users search by username/email, send/accept/reject connection requests, building a real social graph (`requesterId`, `addresseeId`, `status: pending|accepted|rejected|blocked`).
* **Phase C — Shared Expense Schema + Migration** *(pending)*: The one-directional `splits` table (no `userId` column at all — settlement was guarded only by `friendId`) is replaced by `expenses` + `expense_participants`, a bidirectionally-visible model where one row is queryable from either party's side. A one-off migration script (`migrate_shared_expenses.js`) carries forward the live `friends`/`splits` data as `legacyFriendName`-tagged, "local only" entries so nothing is lost.
* **Phase D — Split-Creation & Ledger UI Rework** *(pending)*: The Split Picker's friend chips become linked-account chips (validated server-side against the `connections` table so you can't split with a stranger), and the ledger queries both directions of the new shared schema — proving "Bob owes Alice ₹500" and "Alice owes Bob... wait, you owe Alice ₹500" render identically from both accounts' perspectives.
* **Phase E — Notifications** *(pending)*: A `notifications` table + polling-based badge/toast (mirroring the existing Jarvis-badge pattern) tells the other party the moment they're added to a split, get a connection request, or have a debt settled.
* **Phase F — Synced Settle-Up** *(pending)*: Marking a debt settled flips the ONE shared `expense_participants` row (not a private copy), records `settledByUserId` so both sides see who acted, and is enforced server-side so either party — payer or ower — can mark it settled.

#### What stays the same for legacy data
Migrated pre-rebuild splits will continue to display in the ledger, visually tagged **"local only"**, retaining their original one-sided settle behavior — they can't be retroactively synced to a real account because the original "friend" may never have been a real M.A.D user. New splits going forward will only be creatable with linked accounts.

#### Full plan & verification checklist
The complete phase-by-phase design (schema sketches, endpoint specs, UI changes, and an 18-point two-account verification plan) lives in the approved rebuild plan; ping the maintainer for the working doc if you need the detailed sketches while a phase is in flight.
