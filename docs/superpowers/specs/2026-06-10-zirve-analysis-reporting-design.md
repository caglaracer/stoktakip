# Zirve Analysis And Reporting Design

## Goal

Convert Stok Pusulasi from a second inventory-management system into a read-only analysis and alerting layer fed by daily Zirve stock exports and monthly sales totals in Google Sheets.

## Operating Model

The user remains responsible for stock operations in Zirve. Once per day, the latest Zirve stock export is pasted into the Google Sheets `Guncel_Stok` tab, replacing its previous contents. Monthly product sales are maintained separately.

Stok Pusulasi does not create stock movements, purchase orders, or inventory adjustments. It calculates risk and recommended purchase quantities, displays the result, writes a daily analysis snapshot, and sends a daily summary email.

## Google Sheets Structure

### `Guncel_Stok`

Columns:

- `Urun_Kodu`
- `Urun_Adi`
- `Kategori`
- `Birim`
- `Guncel_Stok`
- `Veri_Tarihi`

The sheet is replaced on each Zirve import. `Urun_Kodu` is the stable join key. `Veri_Tarihi` records the export or paste date and appears in freshness warnings.

### `Aylik_Satislar`

Columns:

- `Yil`
- `Ay`
- `Urun_Kodu`
- `Satis_Miktari`

One row represents one product's total sales for one month. Duplicate rows for the same product/year/month are summed.

### `Urun_Ayarlari`

Columns:

- `Urun_Kodu`
- `Tedarik_Suresi_Gun`
- `Paket_Miktari`
- `Aktif`

Lead time is maintained per product. Package quantity is optional and defaults to `1`. Products marked `HAYIR` are omitted from analysis.

### `Analiz`

Columns:

- `Hesaplama_Tarihi`
- `Urun_Kodu`
- `Urun_Adi`
- `Guncel_Stok`
- `Aylik_Talep`
- `Talep_Sapmasi`
- `Guvenlik_Stogu`
- `Kritik_Esik`
- `Ay_1_Tahmin`
- `Ay_2_Tahmin`
- `Ay_3_Tahmin`
- `Onerilen_Alim`
- `Durum`
- `Veri_Tarihi`

The scheduled daily analysis replaces existing analysis rows with the latest result.

### `Ayarlar`

Keys:

- `UYARI_EPOSTALARI`: one or more comma-separated recipients.
- `UYARI_SAATI`: configurable `HH:mm` value.
- `VARSAYILAN_MODEL`: initially `weighted`.
- `TAHMIN_AY_SAYISI`: fixed default `3`.

## Calculation Rules

### Demand Forecast

- Use up to the latest 12 monthly sales values.
- Recent months receive greater weight through the existing exponential weighted-average model.
- If fewer than 12 months exist, use all available valid months.
- If no sales history exists, forecast demand as zero and mark the product `veri_yetersiz`.

### Demand Variability And Safety Stock

- Calculate the population standard deviation of the available monthly sales values.
- Convert lead time to months using `Tedarik_Suresi_Gun / 30`.
- Safety stock is:

```text
1.65 × monthly demand standard deviation × square root of lead-time months
```

`1.65` represents an approximately 95% one-sided service level. Results are rounded upward.

### Critical Threshold

```text
critical threshold =
monthly forecast × (lead-time days / 30)
+ safety stock
```

A product is:

- `critical` when current stock is at or below the critical threshold.
- `low` when current stock is at or below `critical threshold × 1.25`.
- `normal` otherwise.
- `veri_yetersiz` when no monthly sales history exists.

### Three-Month Purchase Recommendation

Calculate a forecast for each of the next three months using the selected model.

```text
recommended purchase =
month 1 forecast
+ month 2 forecast
+ month 3 forecast
+ safety stock
- current stock
```

Negative results become `0`. Positive results are rounded upward to the nearest `Paket_Miktari`.

Open purchase orders are not subtracted because this application no longer manages or imports order data.

## Dashboard

The monochrome compact design remains, but navigation becomes:

1. Genel Bakis
2. Stok Analizi
3. 3 Aylik Alim Plani
4. Veri Ve Baglanti

Removed:

- Stok movement entry and history.
- Open-order creation and status management.
- Write access token.

Dashboard content:

- Total active products.
- Critical, low-stock, and insufficient-data counts.
- Latest Zirve data date and a stale-data warning.
- Critical products table.
- Full stock analysis with product/status filters.
- Three-month forecasts and recommended purchase quantities.

The browser only sends read-only GET requests. Refreshing the dashboard calculates data without writing to Sheets.

## Daily Analysis And Email

`createDailyAnalysisTrigger` reads `UYARI_SAATI`, replaces any existing daily trigger, and schedules `runDailyAnalysisAndEmail`.

`runDailyAnalysisAndEmail`:

1. Calculates all products.
2. Replaces the `Analiz` sheet rows.
3. Sends an email every day, even when no product is critical.

Email content:

- Calculation timestamp and latest Zirve data date.
- Total, critical, low-stock, and insufficient-data counts.
- Critical product table with current stock, critical threshold, three-month requirement, and recommended purchase.
- Complete recommended-purchase table for products whose recommendation is greater than zero.
- A clear “no critical products” message when applicable.

No recipients means the analysis sheet is still updated, but email sending is skipped.

## Validation And Failure Handling

- Ignore blank product codes.
- Reject invalid months outside `1-12`.
- Treat invalid numeric cells as zero.
- Ignore inactive product settings.
- Display products missing `Urun_Ayarlari` with a warning and use lead time `30`, package quantity `1`.
- Warn when `Veri_Tarihi` is blank, inconsistent across rows, or older than one calendar day.
- Prevent trigger creation when `UYARI_SAATI` is invalid by falling back to `09:00`.
- Validate recipient strings before sending and report invalid addresses in the Apps Script execution log.

## Testing

- Regression tests for weighted demand, standard deviation, safety stock, critical threshold, status, and package rounding.
- Tests for duplicate monthly sales aggregation and missing-history behavior.
- Tests proving GET dashboard requests do not write.
- Tests for daily analysis sheet replacement and daily email composition.
- Source-level tests proving movement/order controls and token fields are removed.
- Desktop and mobile browser verification with no console errors.

## Migration

`setupAnalysisSystem` creates or repairs the five required tabs and their headers. Existing old tabs are not deleted automatically, preventing accidental data loss. The documentation identifies `Stok_Hareketleri`, `Acik_Siparisler`, `Gecmis_Satislar`, `Tahminler`, and `Urunler` as legacy tabs that may be archived manually after the new workflow is verified.

## Out Of Scope

- Automatic Zirve API/database integration.
- Drive folder import automation.
- Daily stock history archive.
- Purchase-order management.
- Editing Zirve stock from the web interface.
