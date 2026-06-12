# Hybrid Demand Forecast And Filtered Excel Export Design

## Goal

Replace the single weighted-average calculation with a demand-pattern-aware
forecasting system. Products with regular, seasonal, intermittent, dormant, or
insufficient demand must not be evaluated by the same formula.

Add an Excel download button to the stock analysis screen. The downloaded
workbook must contain exactly the products visible after the current search,
status, and tracking-priority filters are applied.

## Historical Window

The analysis uses the latest 36 complete calendar months. Missing
product-month combinations are treated as zero sales, not as missing records.
The current incomplete month is excluded.

For each product, the engine calculates:

- number of complete months available,
- number of non-zero sales months,
- months since the last positive sale,
- average demand interval (ADI),
- squared coefficient of variation of non-zero demand (CV2),
- lag-12 correlation when at least 24 complete months are available.

Intermediate forecasts retain decimal precision. Rounding occurs only when the
final purchase recommendation is adjusted to the product package quantity.

## Demand Classes

Business overrides are evaluated before statistical classes:

1. `YETERSIZ_VERI`: fewer than 12 complete months are available.
2. `HAREKETSIZ`: no positive sale occurred in the latest 24 complete months.
3. `MANUEL_TAKIP`: at most two months contain positive sales in the 36-month
   window.
4. `MEVSIMSEL`: at least 24 months are available, the product is not sparse,
   and lag-12 correlation is at least `0.50`.
5. `DUZENLI`: `ADI < 1.32` and `CV2 < 0.49`.
6. `DEGISKEN`: `ADI < 1.32` and `CV2 >= 0.49`.
7. `KESIKLI`: `ADI >= 1.32` and `CV2 < 0.49`.
8. `YIGINSAL`: `ADI >= 1.32` and `CV2 >= 0.49`.

`HAREKETSIZ` takes precedence over `MANUEL_TAKIP`. `MANUEL_TAKIP` takes
precedence over seasonal and ADI/CV2 classification. This prevents a single
old sale from creating a false monthly demand. An undefined lag-12 correlation
does not qualify a product as seasonal.

## Forecast Methods

### Regular And Variable Demand

`DUZENLI` and `DEGISKEN` products use the existing recent-month weighted
average over the latest 12 complete months. The result is not rounded upward
during forecasting.

### Seasonal Demand

`MEVSIMSEL` products forecast each of the next three calendar months from the
same month in previous years. The most recent, second-most-recent, and oldest
available observations receive weights `3`, `2`, and `1`.

If a target month has fewer than two historical observations, the calculation
falls back to the regular weighted average and records that fallback in the
product explanation.

### Intermittent And Lumpy Demand

`KESIKLI` and `YIGINSAL` products use the TSB method. TSB updates demand size
when a sale occurs and updates demand probability every month, including zero
months. This allows the forecast to decline when a product stops selling.

Initial smoothing constants are:

- demand-size alpha: `0.20`,
- demand-probability beta: `0.10`.

These constants are system defaults and are not added to the user interface in
this version.

### Dormant, Manual, And Insufficient Products

`HAREKETSIZ`, `MANUEL_TAKIP`, and `YETERSIZ_VERI` products receive:

- zero automatic forecast,
- no automatic critical threshold,
- zero automatic purchase recommendation,
- an explanatory status instead of `Kritik`.

For example, `R900571012` has only one sale of two units in June 2024 and a
current stock of two. Because June 2024 is inside the June 2024-May 2026
24-month window but only one month contains a sale, it is classified as
`MANUEL_TAKIP`. It has no automatic critical threshold and receives a purchase
recommendation of zero.

## Manual Minimum Stock Override

Add optional `Minimum_Stok` to `Urun_Ayarlari`.

When `Minimum_Stok` is greater than zero, it acts as an explicit business rule
for strategic parts:

- it supplies a threshold even for dormant, manual, or insufficient products,
- the effective critical threshold is the greater of the model threshold and
  `Minimum_Stok`,
- a shortage is rounded to the configured package quantity,
- the explanation states that the result includes a manual minimum-stock
  override.

A blank or zero value means that no manual minimum is enforced.

## Critical Threshold And Purchase Recommendation

For statistically forecasted products:

```text
critical threshold =
expected demand during lead time
+ service-level safety stock
```

Safety stock uses a `1.65` service factor. `DUZENLI`, `DEGISKEN`, and
`MEVSIMSEL` products use the population standard deviation of the latest 12
complete monthly quantities. `KESIKLI` and `YIGINSAL` products use the
population standard deviation of their one-step TSB forecast errors across the
36-month window. The lead-time multiplier uses
`sqrt(Tedarik_Suresi_Gun / 30)`.

Status rules:

- `critical`: stock is at or below the effective critical threshold,
- `low`: stock is above critical and at or below `threshold * 1.25`,
- `normal`: stock is above the low-stock boundary,
- `manuel_takip`, `hareketsiz`, or `veri_yetersiz`: no effective threshold
  exists.

When a manual minimum creates an effective threshold, the product uses the
standard `critical`, `low`, or `normal` status while retaining its original
`demandClass`.

The three-month purchase recommendation remains:

```text
next three monthly forecasts
+ safety stock
- current stock
```

Negative results become zero. Only the final positive result is rounded upward
to `Paket_Miktari`. A manual minimum-stock shortage can raise the result when
it is greater than the statistical recommendation.

## Analysis Data Contract

Each product result adds:

- `demandClass`,
- `lastSaleDate`,
- `nonZeroMonthCount`,
- `monthsSinceLastSale`,
- `forecastExplanation`,
- nullable `criticalLevel`.

The `Analiz` sheet adds matching columns so daily snapshots preserve why a
forecast was produced. A missing threshold is written as a blank cell, not
zero.

Dashboard summaries separately count:

- critical,
- low,
- manual follow-up,
- dormant,
- insufficient-data products.

## Filtered Excel Download

The `Stok Analizi` screen gains:

- a tracking-priority filter with `Tumu`, `Oncelikli`, and `Normal`,
- an `Excel Indir` button next to the filters.

The existing product search and status filter remain. The button exports the
same rows currently visible after all three filters are applied. Sort order in
the workbook matches the table.

The workbook is named:

`Stok_Analizi_YYYY-MM-DD.xlsx`

Columns:

1. `Urun_Kodu`
2. `Urun_Adi`
3. `Guncel_Stok`
4. `Tahmin_Sinifi`
5. `Kritik_Esik`
6. `Onerilen_Alim`
7. `Son_Satis_Tarihi`
8. `Aciklama`

When no row matches the filters, the application shows a message and does not
create a workbook.

## Export Data Flow And Security

The browser sends a protected `exportAnalysis` POST request containing the
visible product codes in their displayed order. `ACCESS_TOKEN` is required,
as it is for tracking-priority updates.

Apps Script recalculates the analysis, selects only requested codes that still
exist in the authorized analysis result, creates a temporary Google
Spreadsheet, exports it to XLSX, and returns the file as base64 JSON. The
browser converts the response into a Blob and starts the download.

The temporary spreadsheet is moved to trash in a `finally` block whether
export succeeds or fails. The client-provided product values are never trusted;
only product codes are used to select fresh server-calculated rows.

The existing daily email attachment remains a purchase-only report. It uses
the new forecast results but does not inherit browser filters.

## User Interface Behavior

Products without an automatic threshold display `-` in the critical-threshold
column. Their status badges use:

- `Manuel takip`,
- `Hareketsiz`,
- `Yetersiz veri`.

The explanation describes the selected method in plain Turkish, for example:

- `Duzenli talep: son 12 ay agirlikli ortalamasi kullanildi.`
- `Mevsimsel talep: gecmis yillarin ayni aylari kullanildi.`
- `Seyrek talep: TSB tahmini kullanildi.`
- `Son 24 ayda satis yok; otomatik alim onerisi olusturulmadi.`

The Excel button is disabled while an export is being prepared and restores
its normal state after success or failure.

## Failure Handling

- Invalid or missing access token returns an authorization error.
- Unknown product codes are ignored.
- Duplicate requested codes are exported once.
- An export request with no valid rows returns a clear validation error.
- Excel generation or export failure is shown without clearing current
  filters.
- Temporary Drive files are always trashed.
- Invalid manual minimum values are treated as blank and produce a warning.
- A seasonal calculation that lacks enough same-month history falls back to
  the regular model instead of failing the whole analysis.

## Testing

Automated tests cover:

- zero-filled 36-month history construction,
- ADI, CV2, months-since-last-sale, and lag-12 calculations,
- precedence of dormant and manual classes,
- regular, seasonal, and TSB forecasts,
- no false threshold for sparse or dormant products,
- manual minimum-stock override,
- no intermediate upward rounding,
- final package rounding,
- nullable threshold serialization,
- new dashboard summary counts and status labels,
- combined search, status, and tracking filtering,
- preservation of visible row order in export requests,
- protected export authorization,
- server-side code validation and row selection,
- workbook columns and formatting,
- temporary spreadsheet cleanup on success and failure,
- unchanged purchase-only scope of the daily email attachment.

The existing regression suite remains in place. Browser verification covers
desktop and mobile filtering, download state, successful XLSX download, empty
filter results, and visible error messages.

## Migration

`setupAnalysisSystem` adds `Minimum_Stok` and the new `Analiz` columns without
deleting existing rows or sheets.

Existing products default to blank `Minimum_Stok`. Therefore dormant and very
sparse products stop receiving automatic critical thresholds after the new
model is deployed unless the user explicitly assigns a minimum.

## Out Of Scope

- automatic model tuning per product,
- supplier order quantities or open-purchase-order integration,
- automatic Zirve database/API connection,
- editing sales or stock data from the dashboard,
- changing the daily email report into a filtered report,
- exposing smoothing constants in the user interface.
