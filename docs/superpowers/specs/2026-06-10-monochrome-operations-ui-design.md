# Monochrome Operations UI Design

## Goal

Turn Stok Pusulasi into a compact monochrome operations dashboard and add two missing workflows: searchable stock movement history and open purchase order management.

## Visual Direction

- Use white, warm light gray, graphite, and black as the main palette.
- Reserve muted red only for critical or destructive states.
- Reduce card shadows, corner radii, whitespace, and oversized headings.
- Use thin borders, compact controls, tabular numbers, sticky table headers, and denser rows.
- Keep the current responsive single-page layout. On mobile, navigation becomes horizontal and tables remain horizontally scrollable.
- Apply the same production HTML to root `index.html` and `outputs/index.html`.

## Navigation And Screens

The sidebar contains:

1. Genel Bakis
2. Stok Listesi
3. Stok Gecmisi
4. Acik Siparisler
5. 3 Aylik Tedarik
6. Baglanti Ayarlari

### Stock History

- Display movement date, product, transaction type, quantity, previous stock, new stock, note, and user.
- Filter by start date, end date, product, and transaction type.
- Default to the latest 100 movements.
- Filters operate in the browser on data returned by the dashboard endpoint.

### Open Orders

- Display order ID, order date, product, quantity, expected delivery, status, and note.
- Create an order from a modal.
- Change an order status to `BEKLIYOR`, `YOLDA`, `TESLIM`, or `IPTAL`.
- Creating and updating orders requires the access token.
- Marking an order `TESLIM` does not alter inventory. The user records the physical receipt separately through Stok Hareketi.
- The dashboard and forecast count only orders that are not `TESLIM` or `IPTAL`.

## Backend API

Read-only dashboard data adds:

- `movements`: latest 100 stock movements.
- `orders`: all current order records needed by the interface.

Authenticated POST actions add:

- `orderCreate`: validate and append a new order.
- `orderStatus`: validate and update an existing order status.

Order creation requires product code, positive quantity, order date, expected delivery date, and a valid status. Order status updates require a known order ID and valid status.

## Error Handling

- Invalid products, quantities, dates, order IDs, or statuses return the existing JSON error envelope.
- UI requests show a concise toast and retain the current screen.
- Save buttons are disabled while requests are running to reduce duplicate writes.
- Destructive cancellation requires confirmation.

## Testing

- Extend Node VM regression tests for order creation, status transitions, validation, and dashboard payloads.
- Add source-level checks for the new views, filters, modals, and monochrome tokens in both HTML copies.
- Run JavaScript syntax checks.
- Verify desktop and mobile layouts, navigation, filters, dialogs, and console output in the browser.

## Out Of Scope

- Automatic stock entry when an order is delivered.
- CSV export.
- Product creation and editing.
- Multi-user roles or server-side authentication beyond the existing token.

