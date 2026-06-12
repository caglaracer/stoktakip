# Daily Email XLSX Report Design

## Goal

Replace the long plain-text daily email with a compact management summary and an
attached Excel report.

## Email

The email body will contain:

- calculation and Zirve data dates,
- total, critical, low-stock, insufficient-data, and purchase totals,
- the five most urgent critical products,
- a note that the complete purchase list is attached.

Critical products will be ordered by stock deficit, then suggested purchase
quantity.

## Excel Attachment

The attachment will be named `Stok_Alim_Onerileri_YYYY-MM-DD.xlsx`.

It will include only products whose `suggestedPurchase` is greater than zero,
ordered from highest to lowest suggested purchase. Columns:

1. Product code
2. Product name
3. Current stock
4. Critical level
5. Three-month need
6. Suggested purchase
7. Status

The Apps Script will create a temporary Google Spreadsheet, populate and format
the report, export it as XLSX, then move the temporary file to trash.

## Delivery And Failure Handling

`runDailyAnalysisAndEmail` will continue to calculate and write the `Analiz`
sheet before sending email. If recipients are configured, it will build the
summary and XLSX attachment and send both through `MailApp`.

Temporary spreadsheet cleanup will run even if export or email delivery fails.
The analysis calculations and trigger schedule remain unchanged.

## Testing

Automated tests will verify:

- the email contains no full critical/purchase dump,
- at most five critical products appear in the body,
- only positive purchase recommendations are written to the report,
- report rows are sorted descending by suggested purchase,
- the sent email includes an XLSX attachment,
- the temporary spreadsheet is trashed after use.
