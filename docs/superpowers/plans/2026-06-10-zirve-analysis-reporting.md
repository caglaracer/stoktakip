# Zirve Analysis And Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inventory and order management with a read-only Google Sheets analysis system that calculates critical stock and three-month purchase recommendations from daily Zirve stock and monthly sales data, then sends a configurable daily email.

**Architecture:** Keep one Apps Script backend and one static HTML dashboard. Separate pure calculation helpers from Sheets I/O so Node VM tests can prove forecast, safety-stock, status, email, and migration behavior without a live spreadsheet. The browser calls only `GET?action=dashboard`.

**Tech Stack:** Google Apps Script, Google Sheets, HTML/CSS/vanilla JavaScript, Node.js built-in test runner

---

### Task 1: Replace Legacy Tests With Analysis Math Tests

**Files:**
- Modify: `tests/inventory.test.js`

- [ ] **Step 1: Remove tests tied to stock movements and orders**

Delete tests for `orderCreate`, `orderStatus`, `validateOrder_`, `updateOrderStatus_`, movement history, history views, order dialogs, and access-token write routing.

- [ ] **Step 2: Add a failing weighted-demand test**

Add a test with monthly quantities `[100, 80, 60]` ordered newest-first and assert:

```js
assert.equal(Math.round(app.weightedAverage_([
  {quantity: 100},
  {quantity: 80},
  {quantity: 60}
])), 82);
```

- [ ] **Step 3: Add a failing standard-deviation and safety-stock test**

Use quantities `[10, 20, 30]` and assert population deviation is approximately `8.165`. With a 30-day lead time, assert safety stock is `14`:

```js
assert.ok(Math.abs(app.populationStdDev_([10, 20, 30]) - 8.1649658) < 0.0001);
assert.equal(app.calculateSafetyStock_([10, 20, 30], 30), 14);
```

- [ ] **Step 4: Add failing product-analysis tests**

Test:

- Critical threshold equals forecast lead-time demand plus safety stock.
- No sales history returns `veri_yetersiz`.
- Recommended purchase is rounded to package quantity.
- Normal, low, and critical statuses follow the design thresholds.

- [ ] **Step 5: Add a failing duplicate-sales aggregation test**

Provide two rows for the same product/year/month and assert their quantities are summed into one history point.

- [ ] **Step 6: Run the tests and verify RED**

Run:

```powershell
node --test tests\inventory.test.js
```

Expected: failures for missing `populationStdDev_`, `calculateSafetyStock_`, analysis functions, and new sheet semantics.

### Task 2: Implement New Sheet Schema And Analysis Engine

**Files:**
- Modify: `outputs/Code.gs`
- Test: `tests/inventory.test.js`

- [ ] **Step 1: Replace configuration and headers**

Set required sheets to:

```js
SHEETS: {
  STOCK: 'Guncel_Stok',
  SALES: 'Aylik_Satislar',
  PRODUCT_SETTINGS: 'Urun_Ayarlari',
  ANALYSIS: 'Analiz',
  SETTINGS: 'Ayarlar'
}
```

Define the exact headers from the approved design.

- [ ] **Step 2: Add `setupAnalysisSystem`**

Create or repair only the five required sheets, set timezone, seed settings, add `EVET/HAYIR` validation to `Urun_Ayarlari!D2:D`, and do not delete legacy sheets.

- [ ] **Step 3: Implement normalized readers**

Add:

```js
readCurrentStock_()
readMonthlySales_()
readProductSettings_()
```

Aggregate duplicate sales rows by `Urun_Kodu + Yil + Ay`, sort chronologically, and ignore invalid months.

- [ ] **Step 4: Implement pure analysis helpers**

Add:

```js
populationStdDev_(values)
calculateSafetyStock_(quantities, leadTimeDays)
analyzeProduct_(stock, history, settings, request)
calculateAnalysis_(request)
```

Use the formulas in the approved design and round forecasts and thresholds upward.

- [ ] **Step 5: Add data freshness calculation**

Return:

```js
{
  latestDate,
  missing,
  inconsistent,
  stale,
  message
}
```

Treat the stock data as stale when the latest date is more than one calendar day behind Istanbul’s current date.

- [ ] **Step 6: Make the dashboard read-only**

Allow only `dashboard` and `health` GET routes. Remove `doPost`, token verification, stock movement, order, and forecast-write actions. `getDashboardData_()` returns:

```js
{
  products,
  summary,
  freshness,
  calculatedAt
}
```

- [ ] **Step 7: Run tests and verify GREEN**

Run:

```powershell
node --test tests\inventory.test.js
```

Expected: all analysis and existing alert-time tests pass.

- [ ] **Step 8: Commit**

```powershell
git add outputs/Code.gs tests/inventory.test.js
git commit -m "feat: add Zirve stock analysis engine"
```

### Task 3: Daily Analysis Sheet And Email

**Files:**
- Modify: `outputs/Code.gs`
- Modify: `tests/inventory.test.js`

- [ ] **Step 1: Add failing analysis-sheet replacement test**

Mock the `Analiz` sheet and assert `writeAnalysis_()` clears rows below the header and writes one row per analyzed product with all 14 columns.

- [ ] **Step 2: Add failing email composition tests**

Assert `buildDailyEmail_()` contains:

- Calculation and data dates.
- Summary counts.
- “Kritik ürün bulunmuyor” when none are critical.
- Critical products and every product with `suggestedPurchase > 0`.

- [ ] **Step 3: Add failing recipient validation test**

Assert comma-separated valid addresses are returned and invalid values are omitted.

- [ ] **Step 4: Implement daily analysis workflow**

Add:

```js
writeAnalysis_(analysis)
parseRecipients_(value)
buildDailyEmail_(analysis)
runDailyAnalysisAndEmail()
```

Always write `Analiz`. Send email only when at least one valid recipient exists.

- [ ] **Step 5: Replace the trigger functions**

Add `createDailyAnalysisTrigger()` that removes triggers for both old `sendCriticalStockAlert` and new `runDailyAnalysisAndEmail`, then schedules the new handler using `UYARI_SAATI` and `Europe/Istanbul`.

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```powershell
node --test tests\inventory.test.js
```

Expected: all daily analysis, email, recipient, and trigger tests pass.

- [ ] **Step 7: Commit**

```powershell
git add outputs/Code.gs tests/inventory.test.js
git commit -m "feat: add daily stock analysis email"
```

### Task 4: Replace The Web Interface With Read-Only Reporting

**Files:**
- Modify: `index.html`
- Modify: `outputs/index.html`
- Modify: `tests/inventory.test.js`

- [ ] **Step 1: Add failing source-level UI tests**

Assert both HTML copies:

- Include views `dashboard`, `analysis`, `forecast`, and `settings`.
- Include freshness warning, status filter, product search, and analysis tables.
- Do not include `movement`, `orderCreate`, `orderStatus`, `Stok Geçmişi`, `Açık Siparişler`, `accessToken`, or `doPost` references.
- Remain byte-identical after newline normalization.

- [ ] **Step 2: Simplify navigation and header actions**

Use:

```text
Genel Bakis
Stok Analizi
3 Aylik Alim Plani
Veri Ve Baglanti
```

Keep only the `Yenile` action.

- [ ] **Step 3: Rebuild demo data**

Use the new dashboard payload shape with stock, demand, deviation, safety stock, critical threshold, three monthly forecasts, recommendation, status, warnings, and freshness.

- [ ] **Step 4: Build the dashboard views**

Implement:

- KPI cards for total, critical, low, and insufficient data.
- Freshness notice.
- Critical products table.
- Full analysis table with text and status filters.
- Three-month purchase plan table.
- Read-only connection instructions showing only the Apps Script `/exec` URL field.

- [ ] **Step 5: Remove all browser write flows**

Remove movement/order dialogs, access-token storage, POST API calls, confirmation logic, and save handlers. Preserve read-only `dashboard` loading and demo fallback.

- [ ] **Step 6: Keep HTML copies synchronized**

Copy the verified root `index.html` to `outputs/index.html`.

- [ ] **Step 7: Run tests and syntax checks**

Run:

```powershell
node --test tests\inventory.test.js
```

Then parse each inline script with Node and run `node --check` against a temporary `.js` copy of `outputs/Code.gs`.

- [ ] **Step 8: Commit**

```powershell
git add index.html outputs/index.html tests/inventory.test.js
git commit -m "feat: simplify dashboard for Zirve reporting"
```

### Task 5: Rewrite Setup Documentation

**Files:**
- Modify: `README.md`
- Modify: `outputs/README.md`

- [ ] **Step 1: Document the daily manual workflow**

Explain:

1. Export current stock from Zirve.
2. Replace all data rows in `Guncel_Stok`.
3. Preserve the header row.
4. Fill `Veri_Tarihi`.
5. Maintain monthly totals in `Aylik_Satislar`.

- [ ] **Step 2: Document product settings**

Explain `Tedarik_Suresi_Gun`, optional `Paket_Miktari`, and `Aktif`.

- [ ] **Step 3: Document setup and trigger functions**

Replace old setup instructions with:

```text
setupAnalysisSystem
createDailyAnalysisTrigger
runDailyAnalysisAndEmail
```

Explain comma-separated recipients and configurable time.

- [ ] **Step 4: Document migration**

List old tabs as legacy and explicitly instruct users not to delete them until the new dashboard and email have been verified.

- [ ] **Step 5: Commit**

```powershell
git add README.md outputs/README.md
git commit -m "docs: explain Zirve reporting workflow"
```

### Task 6: Full Verification And Delivery

**Files:**
- Verify all changed files

- [ ] **Step 1: Run the full automated test suite**

```powershell
node --test tests\inventory.test.js
```

Expected: zero failures.

- [ ] **Step 2: Run syntax and consistency checks**

Verify:

- Both HTML inline scripts parse.
- `outputs/Code.gs` parses as JavaScript.
- Root and output HTML copies match.
- `git diff --check` returns no errors.

- [ ] **Step 3: Verify desktop behavior in the browser**

Check:

- Four navigation views.
- Demo data renders.
- Search and status filters work.
- Freshness warning renders.
- No write controls appear.
- Browser console has no errors.

- [ ] **Step 4: Verify mobile behavior**

At `390x844`, confirm horizontal navigation and scrollable tables.

- [ ] **Step 5: Review against the approved specification**

Confirm every in-scope requirement is represented in code, tests, or documentation and no order/movement workflow remains.

- [ ] **Step 6: Commit any verification fixes and push the feature branch**

```powershell
git push -u origin codex/zirve-analysis-reporting
```

