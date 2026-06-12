# Hybrid Demand Forecast And Filtered Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace false critical-stock results with demand-pattern-aware forecasts and let users download the currently filtered stock analysis as XLSX.

**Architecture:** Keep Apps Script as the calculation, authorization, and workbook-generation authority. Add pure helper functions inside `outputs/Code.gs` for 36-month series construction, classification, seasonal/TSB forecasting, and thresholds; expose the resulting explanation fields through the existing dashboard payload. Keep filtering in the browser, but send only visible product codes to a protected Apps Script export action so the server rebuilds trusted rows before returning a base64 XLSX file.

**Tech Stack:** Google Apps Script, Google Sheets/Drive export API, vanilla HTML/CSS/JavaScript, Node.js built-in test runner and VM mocks.

---

## File Map

- Modify `outputs/Code.gs`: forecasting helpers, analysis contract, sheet migration, filtered export API, and email/report compatibility.
- Modify `tests/inventory.test.js`: unit, routing, workbook, migration, and source-level UI tests.
- Modify `index.html`: new statuses, summary counts, tracking filter, Excel button, visible-row export flow.
- Modify `outputs/index.html`: published copy kept byte-for-byte equivalent to `index.html`.
- Modify `outputs/README.md`: deployment, `Minimum_Stok`, model behavior, and Excel download instructions.

### Task 1: Build Complete Monthly Series And Demand Metrics

**Files:**
- Modify: `tests/inventory.test.js`
- Modify: `outputs/Code.gs`

- [ ] **Step 1: Add failing tests for zero-filled history and metrics**

Add tests that use June 2026 as the analysis month and assert:

```js
test('monthly series contains the latest 36 complete months with zero-filled gaps', () => {
  const app = loadCode();
  const series = app.buildMonthlySeries_([
    {year: 2024, month: 6, quantity: 2, date: new Date(2024, 5, 1)}
  ], '2026-06', 36);

  assert.equal(series.length, 36);
  assert.deepEqual(
    {year: series[0].year, month: series[0].month},
    {year: 2023, month: 6}
  );
  assert.deepEqual(
    {year: series[35].year, month: series[35].month},
    {year: 2026, month: 5}
  );
  assert.equal(series.find(row => row.year === 2024 && row.month === 6).quantity, 2);
  assert.equal(series.filter(row => row.quantity > 0).length, 1);
});

test('demand metrics calculate non-zero months ADI CV2 and last sale age', () => {
  const app = loadCode();
  const series = app.buildMonthlySeries_([
    {year: 2024, month: 6, quantity: 2, date: new Date(2024, 5, 1)}
  ], '2026-06', 36);
  const metrics = app.calculateDemandMetrics_(series);

  assert.equal(metrics.nonZeroMonthCount, 1);
  assert.equal(metrics.monthsSinceLastSale, 23);
  assert.equal(metrics.lastSaleDate, '2024-06');
  assert.equal(metrics.adi, 36);
  assert.equal(metrics.cv2, 0);
});

test('history coverage counts complete source months without confusing zero sales', () => {
  const app = loadCode();
  const sales = {
    A: [{year: 2025, month: 10, quantity: 1}],
    B: [{year: 2026, month: 5, quantity: 2}]
  };
  assert.equal(app.availableHistoryMonths_(sales, '2026-06'), 8);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
node --test --test-name-pattern "monthly series|demand metrics" tests\inventory.test.js
```

Expected: FAIL because `buildMonthlySeries_` and `calculateDemandMetrics_` do not exist.

- [ ] **Step 3: Implement month parsing, zero filling, and metrics**

Add pure helpers near the existing forecast helpers:

```js
function parseYearMonth_(value) {
  const match = clean_(value).match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error('Gecersiz analiz ayi: ' + clean_(value));
  return {year: Number(match[1]), month: Number(match[2])};
}

function shiftMonth_(year, month, offset) {
  const date = new Date(year, month - 1 + offset, 1);
  return {year: date.getFullYear(), month: date.getMonth() + 1};
}

function buildMonthlySeries_(history, startMonth, monthCount) {
  const start = parseYearMonth_(startMonth);
  const quantities = {};
  (history || []).forEach(function(row) {
    quantities[row.year + '-' + row.month] =
      number_(quantities[row.year + '-' + row.month]) + number_(row.quantity);
  });
  const result = [];
  for (let offset = -monthCount; offset < 0; offset += 1) {
    const item = shiftMonth_(start.year, start.month, offset);
    result.push({
      year: item.year,
      month: item.month,
      quantity: number_(quantities[item.year + '-' + item.month]),
      date: new Date(item.year, item.month - 1, 1)
    });
  }
  return result;
}

function monthKey_(row) {
  return row.year + '-' + String(row.month).padStart(2, '0');
}

function calculateDemandMetrics_(series) {
  const nonZero = series.filter(function(row) { return number_(row.quantity) > 0; });
  const quantities = nonZero.map(function(row) { return number_(row.quantity); });
  const mean = quantities.length ?
    quantities.reduce(function(sum, value) { return sum + value; }, 0) / quantities.length : 0;
  const cv2 = mean ? Math.pow(populationStdDev_(quantities) / mean, 2) : 0;
  const lastIndex = series.reduce(function(found, row, index) {
    return number_(row.quantity) > 0 ? index : found;
  }, -1);
  return {
    nonZeroMonthCount: nonZero.length,
    monthsSinceLastSale: lastIndex < 0 ? null : series.length - 1 - lastIndex,
    lastSaleDate: lastIndex < 0 ? '' : monthKey_(series[lastIndex]),
    adi: nonZero.length ? series.length / nonZero.length : Infinity,
    cv2: cv2
  };
}

function availableHistoryMonths_(salesByProduct, startMonth) {
  const start = parseYearMonth_(startMonth);
  let earliest = null;
  Object.keys(salesByProduct || {}).forEach(function(code) {
    (salesByProduct[code] || []).forEach(function(row) {
      const ordinal = row.year * 12 + row.month - 1;
      if (earliest == null || ordinal < earliest) earliest = ordinal;
    });
  });
  if (earliest == null) return 0;
  const startOrdinal = start.year * 12 + start.month - 1;
  return Math.max(0, Math.min(36, startOrdinal - earliest));
}
```

- [ ] **Step 4: Run the focused tests**

Run the Step 2 command.

Expected: both new tests PASS.

- [ ] **Step 5: Commit the metrics foundation**

```powershell
git add tests/inventory.test.js outputs/Code.gs
git commit -m "feat: add complete demand history metrics"
```

### Task 2: Classify Demand Patterns

**Files:**
- Modify: `tests/inventory.test.js`
- Modify: `outputs/Code.gs`

- [ ] **Step 1: Add failing classification tests**

Cover precedence and statistical classes:

```js
test('demand classification prioritizes insufficient dormant and manual rules', () => {
  const app = loadCode();
  assert.equal(app.classifyDemand_({availableMonths: 11}), 'YETERSIZ_VERI');
  assert.equal(app.classifyDemand_({
    availableMonths: 36, nonZeroMonthCount: 3, monthsSinceLastSale: 24,
    adi: 12, cv2: 0, lag12Correlation: 0.9
  }), 'HAREKETSIZ');
  assert.equal(app.classifyDemand_({
    availableMonths: 36, nonZeroMonthCount: 1, monthsSinceLastSale: 23,
    adi: 36, cv2: 0, lag12Correlation: null
  }), 'MANUEL_TAKIP');
});

test('demand classification separates seasonal smooth erratic intermittent and lumpy', () => {
  const app = loadCode();
  const base = {availableMonths: 36, nonZeroMonthCount: 12, monthsSinceLastSale: 0};
  assert.equal(app.classifyDemand_({...base, adi: 3, cv2: 0.2, lag12Correlation: 0.7}), 'MEVSIMSEL');
  assert.equal(app.classifyDemand_({...base, adi: 1.1, cv2: 0.2, lag12Correlation: 0.1}), 'DUZENLI');
  assert.equal(app.classifyDemand_({...base, adi: 1.1, cv2: 0.7, lag12Correlation: 0.1}), 'DEGISKEN');
  assert.equal(app.classifyDemand_({...base, adi: 2, cv2: 0.2, lag12Correlation: 0.1}), 'KESIKLI');
  assert.equal(app.classifyDemand_({...base, adi: 2, cv2: 0.7, lag12Correlation: 0.1}), 'YIGINSAL');
});
```

- [ ] **Step 2: Run classification tests and verify failure**

```powershell
node --test --test-name-pattern "demand classification" tests\inventory.test.js
```

Expected: FAIL because `classifyDemand_` does not exist.

- [ ] **Step 3: Implement lag-12 correlation and classification**

Add:

```js
function correlation_(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = left.reduce(function(sum, value) { return sum + value; }, 0) / left.length;
  const rightMean = right.reduce(function(sum, value) { return sum + value; }, 0) / right.length;
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  left.forEach(function(value, index) {
    const a = value - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftSquare += a * a;
    rightSquare += b * b;
  });
  const denominator = Math.sqrt(leftSquare * rightSquare);
  return denominator ? numerator / denominator : null;
}

function lag12Correlation_(series) {
  if (series.length < 24) return null;
  const quantities = series.map(function(row) { return number_(row.quantity); });
  return correlation_(
    quantities.slice(0, quantities.length - 12),
    quantities.slice(12)
  );
}

function classifyDemand_(metrics) {
  if (metrics.availableMonths < 12) return 'YETERSIZ_VERI';
  if (metrics.monthsSinceLastSale == null || metrics.monthsSinceLastSale >= 24) {
    return 'HAREKETSIZ';
  }
  if (metrics.nonZeroMonthCount <= 2) return 'MANUEL_TAKIP';
  if (metrics.availableMonths >= 24 &&
      metrics.lag12Correlation != null &&
      metrics.lag12Correlation >= 0.50) return 'MEVSIMSEL';
  if (metrics.adi < 1.32) return metrics.cv2 < 0.49 ? 'DUZENLI' : 'DEGISKEN';
  return metrics.cv2 < 0.49 ? 'KESIKLI' : 'YIGINSAL';
}
```

Set `lag12Correlation` on the metrics object before classification. In
`calculateAnalysis_`, compute `availableHistoryMonths_(sales, request.startMonth)`
once and pass it into each `analyzeProduct_` request. Set
`metrics.availableMonths` from that request value, defaulting to `36` only in
direct unit tests that omit it. The zero-filled series remains 36 rows long;
coverage and zero demand are intentionally separate concepts.

- [ ] **Step 4: Run classification and regression tests**

```powershell
node --test tests\inventory.test.js
```

Expected: new classification tests PASS; existing tests may still fail only where old analysis expectations must be replaced in Task 4.

- [ ] **Step 5: Commit classification**

```powershell
git add tests/inventory.test.js outputs/Code.gs
git commit -m "feat: classify product demand patterns"
```

### Task 3: Implement Weighted, Seasonal, And TSB Forecasts

**Files:**
- Modify: `tests/inventory.test.js`
- Modify: `outputs/Code.gs`

- [ ] **Step 1: Add failing forecast tests**

Use deterministic series and decimal assertions:

```js
test('seasonal forecast weights matching calendar months 3 2 1', () => {
  const app = loadCode();
  const series = app.buildMonthlySeries_([
    {year: 2023, month: 6, quantity: 10},
    {year: 2024, month: 6, quantity: 20},
    {year: 2025, month: 6, quantity: 40}
  ], '2026-06', 36);
  const forecast = app.seasonalForecast_(series, '2026-06', 3);
  assert.ok(Math.abs(forecast.months[0] - 28.3333333) < 0.0001);
});

test('TSB forecast decays demand probability across zero months', () => {
  const app = loadCode();
  const result = app.tsbForecast_([10, 0, 0, 0], 0.20, 0.10);
  assert.ok(result.forecast > 0);
  assert.ok(result.forecast < 10);
  assert.equal(result.errors.length, 4);
});

test('regular forecast preserves decimals until final purchasing', () => {
  const app = loadCode();
  const result = app.forecastDemand_('DUZENLI', [
    {quantity: 1}, {quantity: 2}, {quantity: 2}
  ], '2026-06');
  assert.notEqual(result.months[0], Math.ceil(result.months[0]));
});
```

- [ ] **Step 2: Run forecast tests and verify failure**

```powershell
node --test --test-name-pattern "seasonal forecast|TSB forecast|regular forecast" tests\inventory.test.js
```

Expected: FAIL for missing forecast helpers.

- [ ] **Step 3: Implement model-specific helpers**

Implement:

```js
function seasonalForecast_(series, startMonth, horizon) {
  const start = parseYearMonth_(startMonth);
  const weights = [3, 2, 1];
  const months = [];
  let fallbackUsed = false;
  for (let offset = 0; offset < horizon; offset += 1) {
    const target = shiftMonth_(start.year, start.month, offset);
    const matches = series.filter(function(row) {
      return row.month === target.month && row.year < target.year;
    }).slice(-3).reverse();
    if (matches.length < 2) {
      fallbackUsed = true;
      months.push(weightedAverage_(series.slice(-12).reverse()));
      continue;
    }
    const usedWeights = weights.slice(0, matches.length);
    const totalWeight = usedWeights.reduce(function(sum, value) { return sum + value; }, 0);
    months.push(matches.reduce(function(sum, row, index) {
      return sum + number_(row.quantity) * usedWeights[index];
    }, 0) / totalWeight);
  }
  return {months: months, fallbackUsed: fallbackUsed, errors: []};
}

function tsbForecast_(quantities, alpha, beta) {
  let size = 0;
  let probability = 0;
  const errors = [];
  quantities.forEach(function(quantity, index) {
    const demand = number_(quantity);
    const forecast = probability * size;
    errors.push(demand - forecast);
    const occurred = demand > 0 ? 1 : 0;
    if (index === 0 && occurred) {
      size = demand;
      probability = 1;
    } else {
      probability = probability + beta * (occurred - probability);
      if (occurred) size = size + alpha * (demand - size);
    }
  });
  return {forecast: probability * size, errors: errors};
}

function forecastDemand_(demandClass, series, startMonth) {
  if (['HAREKETSIZ', 'MANUEL_TAKIP', 'YETERSIZ_VERI'].indexOf(demandClass) >= 0) {
    return {months: [0, 0, 0], errors: [], explanation: ''};
  }
  if (demandClass === 'MEVSIMSEL') {
    const seasonal = seasonalForecast_(series, startMonth, 3);
    seasonal.explanation = seasonal.fallbackUsed ?
      'Mevsimsel talep; eksik aylarda agirlikli ortalama kullanildi.' :
      'Mevsimsel talep: gecmis yillarin ayni aylari kullanildi.';
    return seasonal;
  }
  if (demandClass === 'KESIKLI' || demandClass === 'YIGINSAL') {
    const tsb = tsbForecast_(series.map(function(row) { return row.quantity; }), 0.20, 0.10);
    return {
      months: [tsb.forecast, tsb.forecast, tsb.forecast],
      errors: tsb.errors,
      explanation: 'Seyrek talep: TSB tahmini kullanildi.'
    };
  }
  const monthly = weightedAverage_(series.slice(-12).reverse());
  return {
    months: [monthly, monthly, monthly],
    errors: [],
    explanation: 'Duzenli talep: son 12 ay agirlikli ortalamasi kullanildi.'
  };
}
```

- [ ] **Step 4: Run forecast tests**

Run the Step 2 command.

Expected: all three forecast tests PASS.

- [ ] **Step 5: Commit forecast models**

```powershell
git add tests/inventory.test.js outputs/Code.gs
git commit -m "feat: add seasonal and intermittent forecasts"
```

### Task 4: Integrate Classification, Thresholds, And Manual Minimum Stock

**Files:**
- Modify: `tests/inventory.test.js`
- Modify: `outputs/Code.gs`

- [ ] **Step 1: Replace old product-analysis tests with new contract tests**

Add fixtures for:

```js
test('sparse product has no false critical threshold or purchase recommendation', () => {
  const app = loadCode();
  const result = app.analyzeProduct_(
    {code: 'R900571012', name: '4WE 6 R6X/EG24N9K4', stock: 2, dataDate: '2026-06-12'},
    [{year: 2024, month: 6, quantity: 2, date: new Date(2024, 5, 1)}],
    {leadTime: 30, packSize: 1, minimumStock: 0, active: true, missing: false},
    {startMonth: '2026-06'}
  );
  assert.equal(result.demandClass, 'MANUEL_TAKIP');
  assert.equal(result.criticalLevel, null);
  assert.equal(result.status, 'manuel_takip');
  assert.equal(result.suggestedPurchase, 0);
  assert.equal(result.lastSaleDate, '2024-06');
});

test('manual minimum stock creates threshold and package-rounded shortage', () => {
  const app = loadCode();
  const result = app.analyzeProduct_(
    {code: 'SPARE', name: 'Strategic spare', stock: 2, dataDate: '2026-06-12'},
    [],
    {leadTime: 30, packSize: 4, minimumStock: 7, active: true, missing: false},
    {startMonth: '2026-06'}
  );
  assert.equal(result.demandClass, 'HAREKETSIZ');
  assert.equal(result.criticalLevel, 7);
  assert.equal(result.status, 'critical');
  assert.equal(result.suggestedPurchase, 8);
});
```

Update regular-product expectations so monthly forecast decimals are preserved and only the final purchase is pack-rounded.

- [ ] **Step 2: Run product-analysis tests and verify failure**

```powershell
node --test --test-name-pattern "sparse product|manual minimum|product analysis" tests\inventory.test.js
```

Expected: FAIL because `analyzeProduct_` still uses the old 12-month formula.

- [ ] **Step 3: Rewrite `analyzeProduct_` around the new model**

The function must:

```js
const series = buildMonthlySeries_(history, request.startMonth, 36);
const metrics = calculateDemandMetrics_(series);
metrics.availableMonths = request.availableMonths == null ?
  36 : request.availableMonths;
metrics.lag12Correlation = lag12Correlation_(series);
const demandClass = classifyDemand_(metrics);
const forecast = forecastDemand_(demandClass, series, request.startMonth);
```

Then calculate:

```js
const automatic = ['HAREKETSIZ', 'MANUEL_TAKIP', 'YETERSIZ_VERI']
  .indexOf(demandClass) === -1;
const monthlyDemand = automatic ? forecast.months[0] : 0;
const variabilityValues =
  demandClass === 'KESIKLI' || demandClass === 'YIGINSAL' ?
    forecast.errors :
    series.slice(-12).map(function(row) { return row.quantity; });
const demandDeviation = automatic ? populationStdDev_(variabilityValues) : 0;
const leadTimeMonths = Math.max(0, number_(settings.leadTime)) / 30;
const safetyStock = automatic ?
  CONFIG.SERVICE_LEVEL_Z * demandDeviation * Math.sqrt(leadTimeMonths) : 0;
const modelThreshold = automatic ?
  monthlyDemand * leadTimeMonths + safetyStock : null;
const manualMinimum = Math.max(0, number_(settings.minimumStock));
const criticalLevel = manualMinimum > 0 ?
  Math.max(number_(modelThreshold), manualMinimum) :
  modelThreshold;
```

Use nullable thresholds in `stockStatus_`, compare the statistical purchase
with `manualMinimum - stock`, choose the greater shortage, then call
`roundToPack_` once. Return all new analysis contract fields and a clear
`forecastExplanation`.

- [ ] **Step 4: Update aggregate summary counts**

In `calculateAnalysis_`, add:

```js
manualCount: products.filter(function(p) { return p.status === 'manuel_takip'; }).length,
dormantCount: products.filter(function(p) { return p.status === 'hareketsiz'; }).length,
```

Keep `insufficientCount` for `veri_yetersiz`.

- [ ] **Step 5: Run the full suite**

```powershell
node --test tests\inventory.test.js
```

Expected: all calculation tests PASS; migration/writer/UI tests may remain pending for later tasks.

- [ ] **Step 6: Commit integrated analysis**

```powershell
git add tests/inventory.test.js outputs/Code.gs
git commit -m "feat: apply hybrid inventory analysis"
```

### Task 5: Migrate Sheets And Persist Analysis Explanations

**Files:**
- Modify: `tests/inventory.test.js`
- Modify: `outputs/Code.gs`

- [ ] **Step 1: Add failing settings and writer tests**

Assert `HEADERS.Urun_Ayarlari` includes `Minimum_Stok`, `readProductSettings_`
maps it to `minimumStock`, and `HEADERS.Analiz`/`writeAnalysis_` include:

```text
Tahmin_Sinifi
Son_Satis_Tarihi
Pozitif_Satis_Ayi
Son_Satistan_Beri_Ay
Tahmin_Aciklamasi
```

Assert a null threshold is written as `''`, not `0`.

- [ ] **Step 2: Run migration tests and verify failure**

```powershell
node --test --test-name-pattern "settings|analysis writer|headers" tests\inventory.test.js
```

Expected: FAIL on old header lengths and missing fields.

- [ ] **Step 3: Extend headers and settings reads**

Change settings headers to:

```js
[
  'Urun_Kodu', 'Tedarik_Suresi_Gun', 'Paket_Miktari',
  'Aktif', 'Takip_Seviyesi', 'Minimum_Stok'
]
```

Append the five analysis columns listed in Step 1. Read:

```js
minimumStock: Math.max(0, number_(row.Minimum_Stok))
```

Default missing settings to `minimumStock: 0`. Update `updateTrackingLevels_`
so new rows include a blank sixth cell and existing minimum-stock values are
preserved.

- [ ] **Step 4: Update analysis row serialization**

Write a blank threshold when nullable:

```js
product.criticalLevel == null ? '' : product.criticalLevel
```

Append demand class, last sale, non-zero count, months since last sale, and
explanation in the same order as `HEADERS.Analiz`.

- [ ] **Step 5: Run the full suite**

```powershell
node --test tests\inventory.test.js
```

Expected: writer, tracking update, and calculation tests PASS.

- [ ] **Step 6: Commit sheet migration**

```powershell
git add tests/inventory.test.js outputs/Code.gs
git commit -m "feat: persist forecast classifications"
```

### Task 6: Add Protected Filtered XLSX Export

**Files:**
- Modify: `tests/inventory.test.js`
- Modify: `outputs/Code.gs`

- [ ] **Step 1: Add failing authorization and row-selection tests**

Add tests for `handleAnalysisExport_`:

```js
test('analysis export requires token and preserves requested code order', () => {
  const app = loadCode({
    PropertiesService: {
      getScriptProperties: () => ({getProperty: () => 'secret'})
    }
  });
  app.getDashboardData_ = () => ({
    calculatedAt: '2026-06-12 10:00:00',
    products: [
      {code: 'A', name: 'Alpha'},
      {code: 'B', name: 'Beta'}
    ]
  });
  app.createFilteredAnalysisReport_ = (analysis, products) => ({
    fileName: 'Stok_Analizi_2026-06-12.xlsx',
    base64: 'ZmFrZQ==',
    codes: products.map(product => product.code)
  });

  assert.throws(() => app.handleAnalysisExport_({
    token: 'wrong', codes: ['B']
  }), /erisim anahtari/i);
  const result = app.handleAnalysisExport_({
    token: 'secret', codes: ['B', 'A', 'B', 'UNKNOWN']
  });
  assert.deepEqual(Array.from(result.codes), ['B', 'A']);
});
```

Add a workbook-row test asserting the eight specified columns, blank nullable
threshold, and displayed order.

- [ ] **Step 2: Run export tests and verify failure**

```powershell
node --test --test-name-pattern "analysis export|filtered analysis report" tests\inventory.test.js
```

Expected: FAIL for missing handlers.

- [ ] **Step 3: Share token validation and route POST actions**

Extract:

```js
function requireAccessToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  if (!expected) throw new Error('ACCESS_TOKEN Apps Script ozelligi tanimli degil.');
  if (!constantTimeEqual_(clean_(token), clean_(expected))) {
    throw new Error('Gecersiz erisim anahtari.');
  }
}
```

Use it in tracking updates. Change `doPost` to switch between
`updateTrackingLevels` and `exportAnalysis`.

- [ ] **Step 4: Implement trusted row selection**

`handleAnalysisExport_` must:

1. require the token,
2. require `codes` to be a non-empty array of at most 5,000 values,
3. trim and deduplicate codes while preserving order,
4. recalculate `getDashboardData_()`,
5. map requested codes to server-owned product objects,
6. reject requests with no valid rows,
7. call `createFilteredAnalysisReport_`.

- [ ] **Step 5: Implement XLSX creation and cleanup**

Create rows with:

```js
[
  product.code,
  product.name,
  number_(product.stock),
  demandClassLabel_(product.demandClass),
  product.criticalLevel == null ? '' : number_(product.criticalLevel),
  number_(product.suggestedPurchase),
  product.lastSaleDate,
  product.forecastExplanation
]
```

Create a temporary sheet named `Stok_Analizi`, style/freeze/resize it, export
through `UrlFetchApp`, base64-encode bytes with
`Utilities.base64Encode(response.getContent())`, and return:

```js
{
  fileName: 'Stok_Analizi_' + dateLabel + '.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  base64: encoded
}
```

Trash the temporary Drive file in `finally`.

- [ ] **Step 6: Run backend and cleanup tests**

```powershell
node --test --test-name-pattern "analysis export|filtered analysis report|temporary spreadsheet" tests\inventory.test.js
```

Expected: PASS, including cleanup when export throws.

- [ ] **Step 7: Commit export API**

```powershell
git add tests/inventory.test.js outputs/Code.gs
git commit -m "feat: add protected filtered analysis export"
```

### Task 7: Update Dashboard Statuses, Filters, And Excel Download

**Files:**
- Modify: `tests/inventory.test.js`
- Modify: `index.html`
- Modify: `outputs/index.html`

- [ ] **Step 1: Add failing source-level UI tests**

Assert both HTML copies contain:

```text
id="manualCount"
id="dormantCount"
id="analysisTracking"
id="downloadAnalysis"
exportAnalysis
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

Also assert new status labels and CSS classes exist for `manuel_takip` and
`hareketsiz`.

- [ ] **Step 2: Run UI source tests and verify failure**

```powershell
node --test --test-name-pattern "browser copies|published and output" tests\inventory.test.js
```

Expected: FAIL for missing controls.

- [ ] **Step 3: Add summary cards and analysis controls**

Expand the summary grid with manual and dormant counts. Change the analysis
filter block to include:

```html
<select id="analysisTracking">
  <option value="">Tum takip seviyeleri</option>
  <option value="ONCELIKLI">Oncelikli</option>
  <option value="NORMAL">Normal</option>
</select>
<button class="btn primary" id="downloadAnalysis">Excel Indir</button>
```

Add `manuel_takip`, `hareketsiz`, and `veri_yetersiz` options to the status
filter.

- [ ] **Step 4: Centralize visible analysis rows**

Add:

```js
function visibleAnalysisProducts() {
  const query = $("analysisSearch").value.toLocaleLowerCase("tr");
  const status = $("analysisStatus").value;
  const tracking = $("analysisTracking").value;
  return (state.data.products || []).filter(product =>
    (!query || `${product.code} ${product.name}`.toLocaleLowerCase("tr").includes(query)) &&
    (!status || product.status === status) &&
    (!tracking || product.trackingLevel === tracking)
  );
}
```

Make `renderAnalysis()` consume this function so export and table visibility
cannot drift. Display `-` for null thresholds and add demand class, last sale,
and explanation columns.

- [ ] **Step 5: Implement browser XLSX download**

Add:

```js
function base64Blob(base64, mimeType) {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  return new Blob([bytes], {type: mimeType});
}

async function downloadAnalysis() {
  const products = visibleAnalysisProducts();
  if (!products.length) {
    toast("Excel icin uygun kayit bulunamadi.");
    return;
  }
  $("downloadAnalysis").disabled = true;
  try {
    const result = await postApi({
      action: "exportAnalysis",
      codes: products.map(product => product.code)
    });
    if (!result.ok) throw new Error(result.error || "Excel raporu olusturulamadi.");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(base64Blob(result.data.base64, result.data.mimeType));
    link.download = result.data.fileName;
    link.click();
    URL.revokeObjectURL(link.href);
    toast(`${products.length} urun Excel olarak indirildi.`);
  } catch (error) {
    toast(`Excel hatasi: ${error.message}`);
  } finally {
    $("downloadAnalysis").disabled = false;
  }
}
```

Register change/click listeners for `analysisTracking` and `downloadAnalysis`.

- [ ] **Step 6: Synchronize the published HTML copy**

After editing `index.html`, copy it mechanically:

```powershell
Copy-Item -LiteralPath index.html -Destination outputs\index.html -Force
```

- [ ] **Step 7: Run UI and full tests**

```powershell
node --test tests\inventory.test.js
```

Expected: all tests PASS and the HTML equality test confirms identical copies.

- [ ] **Step 8: Commit the browser feature**

```powershell
git add index.html outputs/index.html tests/inventory.test.js
git commit -m "feat: download filtered stock analysis"
```

### Task 8: Update Email Compatibility And Documentation

**Files:**
- Modify: `tests/inventory.test.js`
- Modify: `outputs/Code.gs`
- Modify: `outputs/README.md`

- [ ] **Step 1: Add failing email/report compatibility tests**

Assert:

- purchase XLSX still includes only `suggestedPurchase > 0`,
- nullable thresholds become blank cells,
- `MANUEL_TAKIP`/`HAREKETSIZ` products without manual minimum do not enter the
  purchase attachment,
- summary email includes manual and dormant counts without dumping their full
  product lists.

- [ ] **Step 2: Run email tests and verify failure**

```powershell
node --test --test-name-pattern "daily email|purchase report" tests\inventory.test.js
```

Expected: FAIL on missing counts or nullable threshold handling.

- [ ] **Step 3: Make reports understand the new contract**

Update status and demand-class label helpers. In purchase report rows, serialize
`criticalLevel == null ? '' : number_(criticalLevel)`. Add compact manual and
dormant totals to text and HTML email summary cards. Keep top-five details
restricted to status `critical`.

- [ ] **Step 4: Document deployment and operation**

Update `outputs/README.md` with:

1. replace Apps Script with the full new `Code.gs`,
2. run `setupAnalysisSystem`,
3. confirm `Minimum_Stok` was added without deleting existing settings,
4. redeploy the web application as a new version,
5. explain automatic classes and manual minimum overrides,
6. explain that `Excel Indir` exports current filters and needs `ACCESS_TOKEN`,
7. state that the email attachment remains purchase-only.

- [ ] **Step 5: Run the full suite**

```powershell
node --test tests\inventory.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit compatibility and docs**

```powershell
git add tests/inventory.test.js outputs/Code.gs outputs/README.md
git commit -m "docs: explain hybrid forecasting workflow"
```

### Task 9: Final Verification

**Files:**
- Verify: `outputs/Code.gs`
- Verify: `index.html`
- Verify: `outputs/index.html`
- Verify: `tests/inventory.test.js`
- Verify: `outputs/README.md`

- [ ] **Step 1: Run all automated tests**

```powershell
node --test tests\inventory.test.js
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Parse Apps Script as JavaScript**

```powershell
Copy-Item -LiteralPath outputs\Code.gs -Destination work\Code-check.js -Force
node --check work\Code-check.js
Remove-Item -LiteralPath work\Code-check.js
```

Expected: `node --check` exits with code `0`.

- [ ] **Step 3: Parse the inline browser script**

Extract the final inline script and parse it:

```powershell
@'
const fs = require('node:fs');
const source = fs.readFileSync('index.html', 'utf8');
const matches = [...source.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
if (!matches.length) throw new Error('Inline script bulunamadi.');
fs.writeFileSync('work/index-script-check.js', matches[matches.length - 1][1]);
'@ | node
node --check work\index-script-check.js
Remove-Item -LiteralPath work\index-script-check.js
```

Expected: exit code `0`.

- [ ] **Step 4: Confirm published copies and clean diff**

```powershell
node --test --test-name-pattern "published and output" tests\inventory.test.js
git diff --check
git status --short
```

Expected: HTML equality test PASS; no whitespace errors; only intentional
changes and the user's existing untracked spreadsheet files are present.

- [ ] **Step 5: Verify in the browser**

Open the page through the configured local/static target and verify:

1. manual/dormant status badges render,
2. null thresholds show `-`,
3. search + status + tracking filters combine,
4. Excel button disables during export,
5. downloaded workbook preserves visible row order and columns,
6. empty filters do not create a workbook,
7. desktop and mobile layouts have no horizontal control overlap,
8. browser console has no errors.

- [ ] **Step 6: Final commit if verification required corrections**

If verification caused no edits, do not create an empty commit. Otherwise:

```powershell
git add outputs/Code.gs index.html outputs/index.html tests/inventory.test.js outputs/README.md
git commit -m "fix: finalize hybrid stock analysis"
```
