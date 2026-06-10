# Inventory Hardening Design

## Goal

Fix the reviewed authorization, side-effect, timezone, and alert scheduling issues without changing the existing Google Sheets data model or the public interface.

## Design

- GET routes are read-only. Only `dashboard` and `health` are allowed through `doGet`.
- Forecast calculation is pure by default. POST `forecast` requests may persist their result to `Tahminler` after token verification.
- Dashboard loading calculates forecasts without clearing or rewriting `Tahminler`.
- The browser derives the initial planning month in `Europe/Istanbul`, avoiding UTC month rollover errors.
- Daily alert trigger creation parses `UYARI_SAATI` and schedules the configured hour.
- A dependency-free Node test suite loads `Code.gs` in a VM with Apps Script mocks and checks the security and scheduling behavior. Source-level checks cover the browser timezone initialization.

## Error Handling

- Unsupported GET actions return the existing JSON error envelope.
- Invalid alert times fall back to `09:00`.
- Existing token errors remain unchanged for write requests.

## Verification

- Run the Node regression tests.
- Parse both JavaScript sources with Node.
- Serve `outputs` locally and verify the demo UI, modal, and console in the in-app browser.

