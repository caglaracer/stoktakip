# Movement Weighted Stock Analysis Design

## Goal

Refine the stock analysis so the application prioritizes products that are
actually moving now, not products that only had old or one-off sales.

The analysis must answer this business question:

```text
Which products are likely to create a real stock problem in the next three
months, considering recent sales movement and the stock already on hand?
```

Products with no recent movement must not appear as automatic critical
purchase recommendations unless the user explicitly marks them as priority or
sets a manual minimum stock.

## Source Data

The existing Google Sheets structure remains the source of truth:

- `Guncel_Stok` for current stock and stock data date,
- `Aylik_Satislar` for monthly historical stock exits / sales,
- `Urun_Ayarlari` for lead time, pack size, active flag, tracking level, and
  optional manual minimum stock.

The calculation continues to use complete monthly history. The current
incomplete month is excluded from demand calculations.

## New Priority Principle

The engine evaluates every product in this order:

1. Manual business overrides.
2. Recent movement eligibility.
3. Demand pattern and forecast.
4. Current stock coverage.
5. Relative priority against other moving products.

This prevents old project sales from creating false critical stock alerts.

## Recent Movement Eligibility

Recent movement is the gate for automatic purchase recommendations.

Rules:

- If a product has no positive sale in the latest 12 complete months, it is
  classified as `MANUEL_TAKIP` or `HAREKETSIZ`, not `critical`.
- If a product has positive sales in only one or two months across the full
  analysis window, it is classified as `MANUEL_TAKIP`.
- If a product has no positive sale in the latest 24 complete months, it is
  classified as `HAREKETSIZ`.
- `TAKIP_ETME` products stay excluded from active dashboard and purchase
  totals.
- `ONCELIKLI` products may remain visible even when movement is weak, but the
  explanation must say that the recommendation is manual/business driven.

Example:

`R901113598 - 041149035605000-VSBN-08A-05`

- available history: 2022-01 through 2025-04,
- sales months: 2023-07, 2024-02, 2024-10, 2025-02,
- current stock: 1,
- latest 12 complete months in the provided history contain no repeated recent
  movement,
- automatic purchase recommendation: 0.

The correct class is `MANUEL_TAKIP`, not `critical`.

## Stock Coverage

For moving products, the analysis calculates stock coverage:

```text
stock coverage months =
current stock / recent monthly demand
```

Recent monthly demand uses the latest 12 complete months. When the product is
seasonal, the next three matching calendar months can influence the forecast,
but the product still needs recent movement to qualify for automatic purchase.

Coverage bands:

- `ACIL_ALIM`: stock coverage is less than or equal to 1 month.
- `YAKINDA_ALIM`: stock coverage is greater than 1 month and less than or
  equal to 3 months.
- `NORMAL`: stock coverage is greater than 3 months.
- `MANUEL_TAKIP`: movement is too sparse or too old for automatic purchase.
- `HAREKETSIZ`: no recent meaningful movement.

These business-facing statuses replace the current behavior where sparse
products can appear as `critical` purely because a statistical safety stock was
inflated by old demand spikes.

## Forecast And Purchase Recommendation

For eligible moving products, the three-month forecast remains pattern-aware:

- regular/variable products use recent weighted average demand,
- seasonal products use same-month history when enough data exists,
- intermittent products use decaying intermittent demand logic.

However, the forecast is capped by the recent movement gate:

- products with no sale in the latest 12 complete months receive zero automatic
  forecast and zero automatic purchase recommendation,
- products with one-off or very sparse history receive zero automatic purchase
  recommendation unless a manual minimum stock is set,
- manual minimum stock may create a recommendation only up to the configured
  minimum level.

For eligible products:

```text
recommended purchase =
next three months forecast
+ safety stock for moving products
- current stock
```

Negative results become zero. Positive results are rounded up to package size.

## Relative Priority Score

The dashboard should sort products by a movement-weighted risk score rather
than by purchase quantity alone.

The score uses:

- recent movement: sales in the latest 3, 6, and 12 months,
- continuity: number of months with positive sales,
- stock coverage: fewer months of stock means higher risk,
- shortage size: suggested purchase quantity,
- manual priority: `ONCELIKLI` lifts the product inside its eligible group.

Old products with large one-time demand spikes should not outrank products
that are actively selling and close to running out.

## UI Shape

The application should avoid adding many new tabs. The main stock analysis
screen should carry the decision workflow with filters.

Recommended filters:

- `Tumu`
- `Acil Alim`
- `Yakinda Alim`
- `Normal`
- `Manuel Takip`
- `Hareketsiz`
- `Oncelikli`
- `Takip Disi`

Recommended table columns:

1. `Urun_Kodu`
2. `Urun_Adi`
3. `Guncel_Stok`
4. `Son_Satis_Tarihi`
5. `Son_12_Ay_Satis`
6. `Hareket_Sikligi`
7. `Stok_Kac_Ay_Yeter`
8. `Uc_Ay_Tahmin`
9. `Onerilen_Alim`
10. `Durum`
11. `Aciklama`

The overview page should highlight only real action groups:

- urgent purchase,
- upcoming purchase,
- manual follow-up,
- stale/dormant count.

## Email And Excel Output

Daily email should stay short:

- summary cards,
- top urgent purchase products,
- top upcoming purchase products,
- manual follow-up count,
- stale/dormant count,
- attached Excel for the full detail.

The Excel export should use the same filtered rows currently visible in the
application, so the user can download exactly the view they are inspecting.

## Expected Behavior On Current Data

Given the current backend sample, many products currently shown as critical
have `monthsSinceLastSale >= 12`. Under this design, those products move out of
automatic critical purchase lists and into `MANUEL_TAKIP` or `HAREKETSIZ`
unless there is an explicit manual override.

This makes the purchase list shorter but more meaningful: active products with
real recent exits and insufficient stock rise to the top.

## Acceptance Criteria

- A product with no sale in the latest 12 complete months does not receive an
  automatic critical status or automatic purchase recommendation.
- `R901113598` is classified as manual follow-up with zero automatic purchase
  recommendation when using the provided history and current stock of 1.
- Products with recent sales and less than or equal to one month of stock are
  classified as urgent purchase.
- Products with recent sales and one to three months of stock are classified as
  upcoming purchase.
- Products with more than three months of stock are normal unless manually
  prioritized.
- The stock analysis screen can filter by the new business statuses.
- Email and Excel outputs use the same movement-weighted statuses and purchase
  recommendations.
