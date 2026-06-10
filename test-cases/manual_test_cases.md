# M.A.D Manual Test Cases Checklist

This document details the step-by-step user journeys and manual validation checks to verify frontend UI rendering, dynamic states, and integrations.

---

## 🔐 1. Authentication & Session Management

### Test Case 1.1: Authentication Gate (FOUC Prevention)
- **Precondition**: Clear browser cookies/cache (session destroyed).
- **Steps**:
  1. Navigate to `http://localhost:3002`.
  2. Verify that the Dashboard does not briefly flash (FOUC).
  3. Verify that the `#auth-overlay` screen is shown instantly.
- **Expected Result**: No dashboard content is visible; only the Login/Signup screen is rendered.

### Test Case 1.2: Username Validation Rules
- **Precondition**: Open `#auth-overlay` -> "Sign Up" tab.
- **Steps**:
  1. Try signing up with username `sh` (under 3 characters). Verify error.
  2. Try signing up with username `thisusernameislongerthantwentycharacters` (over 20 characters). Verify error.
  3. Try signing up with username `Prasanna  Tulapurkar` (double internal space). Verify error.
  4. Try signing up with username `Prasanna_Tulapurkar` (valid characters).
- **Expected Result**: Username rules are enforced matching `/^(?=.{3,20}$)[a-zA-Z0-9_]+(?: [a-zA-Z0-9_]+)*$/`.

### Test Case 1.3: Theme & Mood Persistence
- **Precondition**: Logged out, localStorage has `mad-theme="dark"` and `mad-mood="alert"`.
- **Steps**:
  1. Navigate to `http://localhost:3002`.
  2. Verify the Login screen has dark background and red accents instantly before session check finishes.
- **Expected Result**: Theme and mood attributes apply on `DOMContentLoaded` before any API response.

---

## 🍔 2. Smart Input & Transaction Parser

### Test Case 2.1: Live Preview Updates
- **Steps**:
  1. Type `250 swiggy` in the main smart input.
     * Verify preview: `₹250` (cyan), category emoji: `🍔 Food`, note: `swiggy`.
  2. Type `+5000 freelance bonus` in the smart input.
     * Verify preview: `+₹5,000` (green), category emoji: `💰 Income`, note: `freelance bonus`.
  3. Type `120 rapido split with Rohan`.
     * Verify preview: `₹120` (cyan), category emoji: `🚗 Travel`, note: `rapido`, split intent highlighted: `(Splitting with Rohan)`.
- **Expected Result**: Preview matches local parsing instantaneously as the user types.

### Test Case 2.2: Soft Deletes
- **Steps**:
  1. Click the trash icon on any transaction card in the "Recent Entries" feed.
  2. Verify the card slides out smoothly (translateX transition) and vanishes.
  3. Verify that the total monthly spending and Health Score recalculate and animate.
- **Expected Result**: Transaction is removed from the visible DOM, backend registers it as `isIncorrect = 1`.

---

## 🤝 3. Split Picker & Ledger

### Test Case 3.1: Inline Split Picker Opening
- **Steps**:
  1. Type `600 pizza` in the smart input.
  2. Click the **"🤝 Split"** button that appears in the live preview.
  3. Verify the **Split Picker Modal** overlays the screen.
- **Expected Result**: Modal displays the total amount (₹600) and lists current friends.

### Test Case 3.2: Custom Split Methods & Real-time Validation
- **Steps**:
  1. Select friends `Rohan` and `Amit`.
  2. Select **Equally** method:
     * Verify: User share is ₹200, Rohan is ₹200, Amit is ₹200.
  3. Switch to **Exact** method:
     * Enter Rohan: `250`, Amit: `200`.
     * Verify: User share automatically calculates to `150`.
     * Change Amit to `400` (total 650 exceeds 600):
       * Verify: Red validation message pops up, "Add Split" button is disabled.
  4. Switch to **Percentage** method:
     * Enter Rohan: `40%` (₹240), Amit: `30%` (₹180).
     * Verify: User share is `30%` (₹180).
     * Set Rohan to `80%` (total exceeds 100%):
       * Verify: Red validation message appears, submit button locks.
  5. Switch to **Shares** method:
     * Enter User: `2`, Rohan: `1`, Amit: `1` (total 4 shares).
     * Verify: User share is ₹300, Rohan is ₹150, Amit is ₹150.
- **Expected Result**: UI validates inputs on every keyup/change and correctly locks/unlocks the submit action.

---

## 📈 4. Insights & Health Score Mood shifting

### Test Case 4.1: Insights Drawer Render
- **Steps**:
  1. Open the "Insights" drawer panel from bottom nav.
  2. Verify income, expense, and savings calculations are correct.
  3. Verify that the Donut chart renders clean conic gradients representing categories.
  4. Verify that the SVG trendline displays a line connecting the last 30 days of data.
- **Expected Result**: Drawer displays detailed, responsive graphs and metrics.

### Test Case 4.2: Health Score Mood Engine Shift
- **Steps**:
  1. Log a massive expense (e.g., `45000 party`).
  2. Check the Health Score (should drop below 55).
  3. Verify that the app accents immediately change to **Alert Mode** (red glows, red buttons, red borders).
  4. Log a massive income (e.g., `+100000 salary`).
  5. Check the Health Score (should climb above 80).
  6. Verify that the app shifts back to **Calm Mode** (teal gradients, green indicators).
- **Expected Result**: App palette shift aligns instantly with calculated health score.

---

## 🎯 5. Goals & Automation

### Test Case 5.1: Goal Feasibility Estimator
- **Steps**:
  1. Open "Add Goal" modal.
  2. Type Title: `Laptop`, Amount: `50000`, Duration: `10` months.
  3. Verify the feasibility badge indicator (Feasible / Stretch / Unrealistic) updates dynamically.
  4. Close the modal, open the goals detail overlay, and verify that the target allocation bars render correctly.
- **Expected Result**: Real-time calculations verify if surplus can cover the monthly target requirement.

### Test Case 5.2: Automation Bill Logging
- **Steps**:
  1. Add a recurring bill: Amount: `150`, Category: `Subscription`, Note: `Spotify`, Frequency: `monthly`.
  2. Advance system date or simulate due date to today/overdue.
  3. Verify that the "Bill Alerts Banner" displays `Spotify is overdue`.
  4. Click **"Log It"** directly on the banner.
  5. Verify that the banner is dismissed, the transaction is logged to the feed, and the bill's next due date shifts forward by 1 month.
- **Expected Result**: 1-click execution updates both the billing template and transactions database.

---

## 🔔 6. Connections & Notifications

### Test Case 6.1: Friend Requests & Approval Flow
- **Steps**:
  1. Open Account A. View QR Code (shows `@userA`).
  2. Open Account B. In the profile section, type `userA` in "Send Friend Request" and submit.
  3. Switch back to Account A. Verify that the topbar bell icon displays a red dot badge.
  4. Click the bell icon, open the notifications dropdown, and verify `userB sent you a friend request` is listed.
  5. Click **"Accept"** on the request inside the dropdown.
  6. Verify that the request changes state, connection status is accepted, and they appear in each other's connection directories.
- **Expected Result**: Real-time polling updates notifications, and bidirectional statuses update securely in database.
