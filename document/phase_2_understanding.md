# Phase 2: Understanding (Analytics)

This phase categorizes expenditures with high specificity and builds an analytical dashboard featuring a dynamic score ring, a donut breakdown chart, and a daily spending trend line.

* **Status:** **Completed** ✅

---

## 🗄️ Database Layer

### Prepared Statements
Phase 2 relies on SQL aggregate queries inside [db.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/db.js):
* **`getCurrentMonthTotals`**:
  ```sql
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS totalIncome,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpense
  FROM transactions
  WHERE isIncorrect = 0
    AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')
  ```
* **`getCategoryBreakdown`**:
  ```sql
  SELECT category, SUM(amount) AS total
  FROM transactions
  WHERE isIncorrect = 0
    AND type = 'expense'
    AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')
  GROUP BY category
  ```
* **`getActiveDays`**:
  ```sql
  SELECT COUNT(DISTINCT date(createdAt)) AS activeDays
  FROM transactions
  WHERE isIncorrect = 0
    AND strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')
  ```
* **`getDailySpending`**: Gets spending over the last 30 calendar days to render the line chart:
  ```sql
  SELECT date(createdAt) AS day,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income
  FROM transactions
  WHERE isIncorrect = 0
    AND createdAt >= datetime('now', 'localtime', '-30 days')
  GROUP BY date(createdAt)
  ORDER BY day ASC
  ```
* **`getAllCategoryBreakdown`**: Groups all types of spending for the donut breakdown legends.

---

## ⚙️ Backend Layer

### Endpoints
Defined in [insights.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/routes/insights.js):
* **`GET /api/insights/health-score`**: Computes the financial health rating of the user and returns score breakdown with custom comments.
* **`GET /api/insights/overview`**: Returns full insights dataset (30-day daily spend trends, savings rates, category divisions, total income, total expense, and score metrics).

### Money Health Score Equations
Calculated in [healthScore.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/services/healthScore.js#L30) as a weighted average:

$$\text{Health Score} = 0.35 \times \text{Savings} + 0.20 \times \text{Diversity} + 0.25 \times \text{Consistency} + 0.20 \times \text{Control}$$

* **Savings Rate (35%)**: $\frac{\text{Income} - \text{Expenses}}{\text{Income}}$. A rate $\ge 20\%$ returns a score of $100$. Rates under $0\%$ return $0 \text{ to } 30$.
* **Spending Diversity (20%)**: Counts unique expense categories logged this month. $1 \text{ category} = 35$, $2 = 55$, $3 = 75$, $\ge 4 = 80 \text{ to } 100$.
* **Consistency (25%)**: $\frac{\text{Active Logging Days}}{\text{Days Elapsed in Month}}$. Ratio $\ge 80\% = 100$, ratio $< 20\% \le 35$.
* **Expense Control (20%)**: Ratio of essential (`Housing`, `Health`, `Travel`) to non-essential spending. Essential ratio $\ge 60\%$ yields $E \ge 90$.

* **Contextual Hinglish Output**: Evaluates the score to choose a status tip ([generateSubtitle](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/backend/services/healthScore.js#L178)):
  * $\ge 85$: *"Zabardast! Financial game strong hai 🔥"*
  * $\ge 70$: *"Control mein hai, thoda aur better ho sakta hai 💪"*
  * $\ge 55$: Identifies and warns of the weakest area (e.g. *"Savings badhane pe focus kar 💰"*).
  * $\ge 40$: *"Paisa leak ho raha hai bhai, sambhal ja 🚨"*
  * $< 40$: *"Financial emergency mode — abhi se control le! 🆘"*

---

## 🎨 Frontend Layer

### Components & Structures
Dashboard panels implemented in [index.html](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/frontend/index.html) and plotted in [app.js](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/frontend/app.js):

1. **Dashboard Score Ring**:
   * Uses an SVG circle element (`.health-card__progress`) styled with `stroke-dasharray="326.73"` to animate the circle arc using the formula:
     $$\text{offset} = \text{circumference} \times \left(1 - \frac{\text{score}}{100}\right)$$
   * Animates numbers using an easing counter function ([animateNumber](file:///d:/Project/My-Mini-Projects/M.A.D%28Money%20Analysis%20and%20Decisions%29/frontend/app.js#L549)).
   * Shifts color dynamically: Green for score $\ge 70$, yellow for $\ge 45$, and red for $< 45$.
2. **Insights Overlay Drawer**:
   * A sliding modal screen loaded on `#insights-overlay` triggering data updates.
3. **Donut Category Chart**:
   * Created using pure CSS `conic-gradient()` dynamically applied to the `.donut-chart` background style with slice coordinates mapped from data categories.
4. **SVG Daily Trend Chart**:
   * Evaluates the last 30 days of data, defines dynamic SVG coordinates, and draws paths:
     * Area path styled with transparent cyan/purple gradients.
     * Stroke path mapping trend lines.
     * SVG `<circle>` nodes with custom tooltips representing day-by-day aggregate spend values.
