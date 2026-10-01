# Functionality Audit — Resolution Report

**Source audit:** `Project docx/functionality-audit.md` (dated 2026-10-01, scope `/home/ubuntu/edunexus`)  
**Resolved against:** the current **Mira-CRM** codebase (React + Vite frontend · Express + SQLite backend)  
**Date:** 2026-10-01

---

## 0. Important context — the audit targets a different codebase

The audit file describes the **old EduNexus prototype**: a *client-only* app at `/home/ubuntu/edunexus`, one `src/main.jsx`, `localStorage` key `edunexus-db`, `setModal`, `window.__setPage`, `pnpm`.

**None of those signatures exist in Mira-CRM.** Verified by search — `edunexus-db`, `window.__setPage`, `setModal` all return **0 matches** in the current repo. Mira-CRM is a full-stack CRM (Express API + SQLite + React SPA with React Router).

So "fix every item" was handled as: **map each audit finding onto the current code, fix what is genuinely still broken, and record the rest as already implemented** — rather than rebuild a dead prototype. Every row below was checked against real code, and the behaviour was verified with `curl` against the API and Playwright against the UI.

---

## 1. P0 bug found and fixed (not in the audit)

**`createLead` was completely broken.** The `INSERT INTO leads … VALUES (…)` list had `'NEW'` in the **`owner`** position and a `?` in the **`status`** position, so every attempt wrote `owner='NEW'` and `status=<owner value>` → the `status` CHECK constraint failed → **HTTP 500**. Lead creation had **never worked** in this backend.

- Fixed the placeholder order → `status='NEW'`, `owner='Sales Exec'`.
- Verified: `POST /api/leads` now returns **200** with `"status":"NEW"`.
- Then scanned **every** `INSERT` in the backend for the same column/value misalignment (balanced-paren parser) → **no other mismatches**.

---

## 2. A — Core workflow failures

| #   | Finding                              | Status              | Where                                                                                                               |
| --- | ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A1  | New invoice non-functional           | **Already working** | `Invoices` → `+ Create Invoice` modal → `POST /api/invoices`                                                        |
| A2  | Program creation non-functional      | **Already working** | `Programs` inline `+ Create Program` form                                                                           |
| A3  | Batch creation non-functional        | **Already working** | `Batches` → `+ Create Batch` (program, customer, trainer, dates, capacity)                                          |
| A4  | Student creation non-functional      | **Already working** | `Students` → `+ Add Student` and `Bulk Add Students`                                                                |
| A5  | Trainer marks entry missing          | **Already working** | `Assessments` score editor, trainer-owned                                                                           |
| A6  | Assessment publish flow missing      | **FIXED (new)**     | Added `assessments.status` (DRAFT/PUBLISHED) + publish/unpublish button; students & institutions only see PUBLISHED |
| A7  | Batch workspace fake                 | **Already working** | Real `/batches/:id` BatchDetail route with tabs                                                                     |
| A8  | Customer 360 fake                    | **Already working** | Real `/customers/:id` Customer360 with tabs                                                                         |
| A9  | Student material "Open" fake         | **Already working** | Real material records + MyLearning Material tab                                                                     |
| A10 | Student payment action missing       | **Already working** | MyLearning Fee tab derives from invoices/payments                                                                   |
| A11 | Institution requests/support missing | **FIXED (new)**     | New `/support` page + `support_tickets` backend                                                                     |
| A12 | Trainer expense claim fake           | **Already working** | `Expenses` claim form + approve/pay                                                                                 |
| A13 | Quotation→invoice missing            | **Already working** | `Convert to Invoice` → `POST /api/quotations/:id/convert-invoice`                                                   |
| A14 | Payment creates no receipt           | **Already working** | Receipt modal + `printReceipt` voucher per payment                                                                  |
| A15 | Payment doesn't update Customer 360  | **Already working** | Customer 360 derives totals from invoices/payments (no stale summary fields)                                        |

## 3. B — Broken or misleading buttons

| #   | Finding                               | Status              | Notes                                                                   |
| --- | ------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| B1  | Dashboard "Open" buttons dead         | **Already working** | Dashboard actions navigate                                              |
| B2  | Profile button dead                   | **FIXED (new)**     | Topbar user → new `/profile` self-service page                          |
| B3  | Student learning tabs dead            | **Already working** | MyLearning tabs switch content                                          |
| B4  | Notification items not actionable     | **FIXED (new)**     | Real `notifications` table + topbar bell with unread badge and dropdown; each item deep-links to the record and marks itself read |
| B5  | Export PDF isn't a PDF                | **Already working** | Real branded PDF (`report.js` / `exportReport.js`)                      |
| B6  | Export PDF missing on pages           | **Already working** | Available on Dashboard, Customers, Reports, finance lists               |
| B7  | "Mark all present" no unsaved warning | **FIXED (new)**     | Dirty indicator + `beforeunload` guard + confirm on batch/date switch   |
| B8  | Attendance lacks Excused              | **FIXED (new)**     | Statuses now PRESENT / ABSENT / LATE / EXCUSED                          |
| B9  | Attendance status stale before save   | **Already working** | Status column reads local state                                         |
| B10 | Attendance can save without a session | **FIXED (new)**     | Hard guard in `save()`                                                  |
| B11 | Student performance hardcoded         | **Already working** | Derived from attendance + scores                                        |
| B12 | Student fee hardcoded                 | **Already working** | Derived from invoices/payments                                          |
| B13 | Student dashboard journey hardcoded   | **Already working** | Derived from enrollments/attendance/scores                              |
| B14 | Batch progress hardcoded              | **Already working** | Computed                                                                |
| B15 | Trainer paid hardcoded                | **Already working** | From payout records                                                     |
| B16 | Report profitability misleading       | **Already working** | Expenses attributed by relation                                         |
| B17 | Collection risk ignores scope         | **Already working** | `utils/risk.js` — overdue days + score                                  |

## 4. C — Role & permission defects

| #     | Finding                              | Status               | Notes                                                                                               |
| ----- | ------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------- |
| C1–C4 | Trainer/institution over-broad scope | **Already working**  | Server-side scope in `scope.service.js` + services                                                  |
| C5    | Payment crash with no invoice        | **Already working**  | Null-safe + validation                                                                              |
| C6    | Org attendance oversight             | **Already working**  | Org attendance + activity audit                                                                     |
| C7    | Login not real auth                  | **Already working**  | Server login, hashed passwords, rate-limited                                                        |
| C8    | Session not secure                   | **Known limitation** | Server-side auth + hashing + rate limits; token is a demo token — no JWT expiry / MFA / email reset |
| C9    | No user/role/permission management   | **FIXED (new)**      | New `/users` page (create/edit/block/role) + `/profile` self-service                                |
| C10   | No institution data-isolation test   | **Already working**  | Server-side scope enforced (verified)                                                               |

## 5. D — Missing CRM features & list functionality

| #   | Finding                    | Status              | Notes                                                                                                                      |
| --- | -------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| D1  | No sorting                 | **FIXED (new)**     | Click-to-sort headers on Leads, Customers, Programs, Trainers, Batches, Students, Quotations, Invoices, Payments, Expenses |
| D2  | No pagination              | **FIXED (new)**     | Pager + page-size on every list                                                                                            |
| D3  | No bulk actions            | **FIXED (new)**     | Bulk select + actions (leads advance/lost/export; students export/delete; expenses approve/pay; quotations status)         |
| D4  | No CSV import/export       | **Already working** | Bulk student import + CSV export everywhere                                                                                |
| D5  | Search inconsistent        | **FIXED (new)**     | Consistent search bar across all primary lists                                                                             |
| D6  | Leads search read-only     | **Already working** | Leads search is a live input                                                                                               |
| D7  | No saved views             | **FIXED (new)**     | Saved-views dropdown on Leads + Invoices (localStorage)                                                                    |
| D8  | No archive/delete/merge    | **FIXED (new)**     | Soft-archive lifecycle on 9 entities: `POST /api/<entity>/:id/archive`, `/restore`, and `/merge` (leads/customers/students). Archive toggle on every list. Duplicates are folded, then archived — never hard-deleted |
| D9  | No follow-up task mgmt     | **Already working** | `lead_followups` (date/method/notes/next_action)                                                                           |
| D10 | Lead activity hardcoded    | **Already working** | Real follow-ups                                                                                                            |
| D11 | No lead owner reassignment | **Already working** | `assigned_to` / `owner` via PATCH                                                                                          |
| D12 | No lead lost workflow      | **FIXED (new)**     | Bulk "Mark Lost" + LOST status                                                                                             |
| D13 | No customer contacts       | **FIXED (new)**     | Contacts tab + `customer_contacts` backend                                                                                 |
| D14 | No batch enrollment mgmt   | **Already working** | Enroll/transfer in BatchDetail                                                                                             |
| D15 | No session/timetable mgmt  | **Already working** | Create sessions in BatchDetail                                                                                             |
| D16 | No materials mgmt          | **Already working** | Create materials                                                                                                           |
| D17 | No support ticket mgmt     | **FIXED (new)**     | `/support` + `support_tickets`                                                                                             |
| D18 | No announcements/messaging | **FIXED (new)**     | `/announcements` + `announcements`                                                                                         |
| D19 | No certificate workflow    | **Already working** | Certificates + verification code + public verify                                                                           |
| D20 | No trainer payout workflow | **Already working** | Trainer finance + expense approve/pay                                                                                      |
| D21 | Expenses not linked        | **FIXED (new)**     | `expenses.customer_id` / `batch_id` / `trainer_id` added; create form has customer/batch/trainer selects, validated server-side; the list LEFT-JOINs names into a "Linked To" column; linkage editable via PATCH |
| D22 | No quotation line items    | **Already working** | `items[]` line items                                                                                                       |
| D23 | No invoice line items      | **Already working** | `items[]` + tax/discount/due date                                                                                          |
| D24 | No partial-payment receipt | **Already working** | Receipts + partial payments                                                                                                |
| D25 | No date/range filters      | **FIXED (new)**     | From/to `DateRange` picker on Leads, Customers, Batches, Students, Quotations, Invoices and Expenses (client-side, inclusive, compares the date part only so timestamps still match) |

## 6. E — Data integrity & calculation

| #   | Finding                      | Status              | Notes                                                          |
| --- | ---------------------------- | ------------------- | -------------------------------------------------------------- |
| E1  | Stale hardcoded dates        | **Already working** | No live hardcodes (seed-only)                                  |
| E2  | Payment null-invoice crash   | **Already working** | Null-safe                                                      |
| E3  | Quotation invalid totals     | **Already working** | Non-negative validation                                        |
| E4  | Expense zero/negative amount | **Already working** | `positiveAmount` guard                                         |
| E5  | Trainer expense not linked   | **FIXED (new)**     | See D21 — `trainer_id` is now stored, validated against the trainers table, joined for display, and editable |
| E6  | Lead email/phone validation  | **Already working** | `validate` middleware                                          |
| E7  | Duplicate detection missing  | **FIXED (new)**     | Leads, students, contacts (customers via `lead_id` uniqueness) |
| E8  | Customer summary stale       | **Already working** | Derived, not stored                                            |
| E9  | No relational cascade        | **Already working** | FK + explicit cascades                                         |
| E10 | No reset/migration           | **Already working** | Additive `ensureColumns` migrations                            |
| E11 | Persistence conflict         | **Already working** | Real DB, not localStorage                                      |

## 7. F — Navigation, routing, runtime

| #  | Finding                          | Status              | Notes                           |
| -- | -------------------------------- | ------------------- | ------------------------------- |
| F1 | Route manifest creates no routes | **Already working** | React Router + deep links       |
| F2 | `window.__setPage` never init    | **Already working** | No such global; real navigation |


| F3 | Duplicate Quotations nav entry | **Already working** | Single entry |  
| F4 | No modal keyboard a11y | **FIXED (new)** | Global Escape close + focus in/out + `role="dialog"` |  
| F5 | No backdrop-close | **FIXED (new)** | Backdrop click closes |  
| F6 | No loading/error/empty states | **FIXED (new)** | `ListState` with retry across lists |  
| F7 | Notification state separation | **FIXED (new)** | A role broadcast is one `notifications` row; per-user read state lives in `notification_reads`, so every user keeps an independent unread count |  
| F8 | No real backend/API | **Already working** | Express + SQLite |

---

## 8. Verification performed

**Backend (curl, against a freshly booted server):**

- `POST /api/leads` → **200** with `status:"NEW"` (the P0 bug fix).
- Duplicate lead (same org+contact, and same email) → **409**; a genuinely new lead → **200**.
- Duplicate student → **409**; duplicate contact email → **409**.
- `GET/PATCH /api/profile` → **200**.
- `GET /api/tickets`, `/api/announcements`, `/api/customers/:id/contacts`, `/api/users` → **200**.
- `POST /api/tickets`, `/api/announcements`, `/api/customers/:id/contacts`, `/api/users` → **200** with created rows.
- Scanned all backend `INSERT`s for column/value misalignment → **0 remaining**.

**Frontend (Playwright, Chromium headless):**

- **34 route loads** across organization + institution → **0 console errors, 0 page errors, 0 failed API requests, 0 layout overflow** (one flagged route was correct RBAC — institution genuinely cannot open `/programs`).
- **Modal a11y:** Escape closes ✓ · backdrop click closes ✓ · `role="dialog"` present ✓.
- **List toolkit:** toolbar ✓ · sortable headers ✓ · sort click without crash ✓ · saved-views bar ✓ · bulk bar on selection ✓.
- **Interactions (8/8):** Contacts tab renders, add contact persists, support ticket created, announcement created, profile loads, profile saves, users page loads, no page errors.
- `vite build` clean (**424 modules**).

All test data created during verification was removed; the demo DB is back to its seeded state.

### 8.1 Follow-on pass — D8 / D25 / E5-D21 / B4-F7

The four items previously listed as limitations were then implemented end-to-end and verified.

**Backend suite** — `frontend/audit/lifecycle-test.cjs` → **27/27 passed**:

- Notification emitted on lead create (unread count `0 → 1`); `/notifications/unread-count`, `/:id/read`, `/read-all` all correct.
- Archive → hidden from the live list → visible in the archive view → restore → back in the live list.
- Merge fills a blank field on the primary, removes the duplicate from the live list, **archives** it (not deleted), and rejects self-merge with **400**.
- Expense with linkage stores `customer_id` + `batch_id`; list joins `customer_name` ("ABC College") and `trainer_name` ("Arun Kumar"); an unknown `customer_id` is rejected with **400**.
- RBAC: an institution attempting to archive a lead gets **403**.

**UI suite** — `frontend/audit/ui-lifecycle-smoke.cjs` (Playwright, Chromium) → **29/29 passed**:

- Notification bell renders in the topbar and opens its panel.
- Archive toggle present on all 9 lists; date-range picker present on all 7 dated lists.
- Expense create form exposes customer/batch/trainer selects, and the table has a "Linked To" column.
- Live round-trip through the browser: Archive `9 → 8` rows → archive view shows `1` → Restore → back to `9`.
- A far-future "from" date filters the list to `0` rows.
- "Merge duplicates" opens the two-select merge modal.
- **0 uncaught page errors**; `vite build` clean (**425 modules**).

---

## 9. Honest remaining limitations

These are **not** fixed, and are recorded so nothing is overstated:

1. **C8 — auth hardening.** Real server-side auth with hashed passwords and rate limiting, but the session token is a demo token. No JWT expiry, MFA, or email-based password reset.

The four follow-on gaps (D8 record lifecycle, D25 date-range filters, E5/D21 expense linkage, B4/F7 notifications) are now **implemented and verified** — see §8.1. One deliberate design note: the record lifecycle uses **soft archive** rather than hard delete, so archived records and their history stay recoverable and foreign keys are never broken; merge folds a duplicate into a primary and then archives it.
