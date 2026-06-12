# Product Tracking Priority Design

## Goal

Allow users to classify products as priority, normal, or excluded directly from
the web panel. Persist the selection in Google Sheets and apply it consistently
to the dashboard, purchase plan, daily email, and Excel attachment.

## Data Model

Add `Takip_Seviyesi` to `Urun_Ayarlari`:

- `ONCELIKLI`
- `NORMAL`
- `TAKIP_ETME`

Missing or invalid values default to `NORMAL`. Existing `Aktif = HAYIR` rows
remain excluded for backward compatibility.

## Analysis Behaviour

- `TAKIP_ETME` products are removed before summary and recommendation output.
- `ONCELIKLI` products are calculated normally but sorted before normal
  products in dashboard lists, purchase plans, daily email, and XLSX reports.
- Priority does not alter demand, safety stock, critical threshold, or purchase
  mathematics.

## Write API And Security

Add a POST endpoint for updating product tracking levels.

The request contains:

- `action: updateTrackingLevels`
- `token`
- `updates: [{code, trackingLevel}]`

The token is compared with the `ACCESS_TOKEN` Apps Script property using a
constant-time comparison. Invalid actions, tokens, product codes, and levels
return structured JSON errors. Existing read endpoints remain GET-only.

## User Interface

Add an `Ürün Takibi` view containing:

- product-code/name search,
- tracking-level filter,
- row selection,
- per-row tracking-level selector,
- bulk change buttons,
- save button.

The API URL and access token are stored in browser local storage. Unsaved
changes are visually marked. After save, the panel refreshes its analysis data.

## Reporting

Daily email shows priority critical products first. The XLSX attachment includes
`Takip_Seviyesi` and sorts priority products before normal products, then by
suggested purchase descending.

## Testing

Tests cover:

- level normalization and backward compatibility,
- exclusion from analysis,
- priority sorting,
- protected POST updates,
- report ordering and tracking-level column,
- UI controls and POST request source.
