# Inventory Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make inventory reads side-effect free, protect forecast writes, honor Istanbul time, and use the configured alert hour.

**Architecture:** Keep the single-file Apps Script structure, but separate route authorization from forecast persistence using an explicit `persist` option. Add small pure helpers for alert-hour parsing and browser month formatting so behavior is testable without a live Google account.

**Tech Stack:** Google Apps Script, browser JavaScript, Node.js built-in test runner

---

### Task 1: Add Regression Tests

**Files:**
- Create: `tests/inventory.test.js`

- [ ] Test that GET forecast requests are rejected.
- [ ] Test that dashboard calculation does not request persistence.
- [ ] Test that authenticated POST forecast requests request persistence.
- [ ] Test configured alert-hour parsing and fallback behavior.
- [ ] Test that browser month initialization uses `Europe/Istanbul` instead of UTC conversion.
- [ ] Run `node --test tests/inventory.test.js` and confirm the tests fail for the reviewed defects.

### Task 2: Harden Apps Script Routing and Forecast Persistence

**Files:**
- Modify: `outputs/Code.gs`

- [ ] Restrict GET routes to `dashboard` and `health`.
- [ ] Pass `persist: true` only for authenticated POST forecast requests.
- [ ] Make dashboard forecast calculation explicitly non-persistent.
- [ ] Write `Tahminler` only when persistence is requested.
- [ ] Run the regression suite and confirm routing and persistence tests pass.

### Task 3: Honor Configured Alert Time

**Files:**
- Modify: `outputs/Code.gs`

- [ ] Add a parser accepting `HH:mm` values and falling back to 09:00.
- [ ] Schedule the trigger with the parsed hour and minute window.
- [ ] Run the regression suite and confirm scheduling tests pass.

### Task 4: Fix Browser Month Initialization

**Files:**
- Modify: `outputs/index.html`
- Modify: `work/index-script.js`

- [ ] Add a formatter that returns `YYYY-MM` in `Europe/Istanbul`.
- [ ] Replace UTC-based `toISOString()` month initialization.
- [ ] Run the regression suite and confirm the source check passes.

### Task 5: Documentation and Full Verification

**Files:**
- Modify: `outputs/README.md`

- [ ] Document GET/POST behavior and configured alert scheduling.
- [ ] Run `node --test tests/inventory.test.js`.
- [ ] Run syntax checks for `outputs/Code.gs` and `work/index-script.js`.
- [ ] Serve `outputs` locally and verify the main screen, stock modal, and browser console.

