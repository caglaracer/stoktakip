# Monochrome Operations UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a compact monochrome inventory interface with filterable movement history and authenticated purchase order management.

**Architecture:** Preserve the existing single-file Apps Script backend and static single-page frontend. Extend the dashboard payload with normalized movement and order records, add two authenticated order actions, and keep both published HTML copies synchronized.

**Tech Stack:** Google Apps Script, HTML/CSS/vanilla JavaScript, Node.js built-in test runner

---

### Task 1: Backend Regression Tests

**Files:**
- Modify: `tests/inventory.test.js`

- [ ] Add a failing test asserting dashboard data includes `movements` and `orders`.
- [ ] Add a failing test asserting `orderCreate` requires token-authenticated POST routing.
- [ ] Add failing tests for positive quantities, known products, valid dates, and valid order statuses.
- [ ] Add a failing test asserting `orderStatus` updates the matching order only.
- [ ] Run `node --test tests/inventory.test.js` and verify failures correspond to missing order behavior.

### Task 2: Movement And Order Backend

**Files:**
- Modify: `outputs/Code.gs`

- [ ] Add `readMovements_()` that returns the newest 100 normalized records.
- [ ] Add `readOrders_()` that returns normalized order records.
- [ ] Include movements and orders in `getDashboardData_()`.
- [ ] Add `orderCreate` and `orderStatus` authenticated routes.
- [ ] Add validation and append/update operations using the existing sheet headers and lock pattern.
- [ ] Run `node --test tests/inventory.test.js` and verify backend tests pass.

### Task 3: Monochrome UI And New Views

**Files:**
- Modify: `index.html`
- Modify: `outputs/index.html`
- Test: `tests/inventory.test.js`

- [ ] Add failing source checks for monochrome design tokens, `history` and `orders` views, history filters, and order dialogs.
- [ ] Replace green-heavy styling with white, gray, graphite, black, and restrained red.
- [ ] Reduce spacing, radius, shadow, heading size, and table row height.
- [ ] Add sidebar entries and page titles for Stock History and Open Orders.
- [ ] Add the history table and date/product/type filters.
- [ ] Add the order table, creation modal, status controls, loading states, and cancellation confirmation.
- [ ] Keep both HTML copies byte-identical after changes.
- [ ] Run the test suite and syntax checks.

### Task 4: Documentation And Browser Verification

**Files:**
- Modify: `README.md`
- Modify: `outputs/README.md`

- [ ] Document stock history and open-order workflows.
- [ ] Document that delivered orders require a separate stock movement.
- [ ] Run `node --test tests/inventory.test.js`.
- [ ] Run syntax checks for Apps Script and browser JavaScript.
- [ ] Verify desktop navigation, filters, dialogs, order actions in demo-safe mode, and browser console.
- [ ] Verify the mobile breakpoint and horizontally scrollable tables.

