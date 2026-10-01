# EduNexus CRM Functionality Audit

**Audit date:** 2026-10-01  
**Scope:** `/home/ubuntu/edunexus` source, route manifest, production build, and all visible interaction handlers.  
**Build status:** `pnpm run build` passes.  
**Important:** A successful build only proves that the JavaScript bundles. It does not prove that every button performs the promised product action.

## Executive summary

The current application is a strong visual prototype with a working localStorage demo loop, but it is not functionally complete. The biggest issues are:

- Several create buttons open a generic form and then do nothing on submit.
- Many “Open” buttons only show a toast and do not navigate to a detail workspace.
- Attendance is implemented, but marks/assessments are not editable or publishable.
- Student learning cards contain hardcoded attendance, performance, and fee values.
- Several role scopes are too broad, especially Trainer and Institution finance access.
- Search exists on some list pages, but sorting, pagination, bulk actions, CSV export, and real PDF generation are absent.
- `window.print()` is used instead of a branded PDF download.
- The application is a client-only localStorage demo with hardcoded credentials, not a secure multi-user CRM backend.

## Severity legend

- **P0 — blocker:** breaks a core demo journey, creates incorrect data, or causes a runtime error.
- **P1 — major:** promised feature is fake/incomplete, or role/security behavior is wrong.
- **P2 — gap:** missing expected CRM capability or weak usability.
- **UNVERIFIED:** source suggests it may work, but a browser-level click test was not performed.

---

# A. Confirmed core workflow failures

## A1. Organization “New invoice” is non-functional — P0

**Location:** `src/main.jsx:55,61`  

The Organization Invoices page opens `setModal('invoice')`, but `Modal.submit()` has branches only for `lead`, `payment`, `quotation`, and `expense`. There is no `invoice` branch. The modal falls through to a generic `Name` form, and pressing **Save connected record** does not save or close anything.

**Result:** Invoice creation is a dead feature.

## A2. Program creation is non-functional — P0

**Location:** `src/main.jsx:51,61`

The Programs page opens `setModal('programs')`. The modal has no `programs` branch, so it renders the generic fallback form. Submit does not create a program.

## A3. Batch creation is non-functional — P0

**Location:** `src/main.jsx:51,61`

The Batches page opens `setModal('batches')`. There is no batch form or submit branch. A user cannot create a batch, assign a trainer, set capacity, or create a timetable.

## A4. Student creation is non-functional — P0

**Location:** `src/main.jsx:51,61`

The Students page opens `setModal('students')`. It renders the generic `Name` field and does not create a student or enrollment.

## A5. Trainer score/marks entry is missing — P0

**Location:** `src/main.jsx:22,52`

Assessments and scores exist in seed data and are displayed as “Latest score,” but there is no Trainer page or button to enter, edit, review, publish, or correct marks.

**Result:** The central requirement “trainer updates student marks” is not implemented.

## A6. Assessment publication flow is missing — P0

There is no draft/reviewed/published state, no score editor, no rubric input, no feedback editor, and no visibility transition from Trainer to Student/Institution.

## A7. Batch workspace is fake — P1

**Location:** `src/main.jsx:51`

**Open batch workspace →** only calls `show('Batch ... opened — Students · Schedule · Attendance · Performance')`. It does not navigate, open a batch detail view, or expose those tabs.

## A8. Customer 360 is fake — P1

**Location:** `src/main.jsx:50`

**Open full Customer 360 →** only shows a toast saying that tabs are ready. No Customer 360 detail page or tabs exist.

## A9. Student material “Open” is fake — P1

**Location:** `src/main.jsx:53`

**Open →** only shows `Study material opened`. The seed material URL is `#`, and there is no actual download, preview, or linked material page.

## A10. Student payment action is missing — P1

The Student workspace displays hardcoded fee values but provides no payment button, installment action, payment proof upload, receipt, or payment status workflow.

## A11. Institution requests/support workflow is missing — P1

The Institution navigation has no requests, support tickets, schedule-change requests, trainer-change requests, or student transfer actions, despite the PRD/capability blueprint requiring them.

## A12. Trainer expense claim is fake — P1

**Location:** `src/main.jsx:58`

**+ Claim expense** only shows a toast: `Expense claim form ready — category, date, amount, and receipt`. It does not open a form or persist a claim.

## A13. Quotation-to-invoice workflow is missing — P1

Quotations can be created, but there is no open detail, send, revise, approve, reject, expire, duplicate, or convert-to-invoice action.

## A14. Payment does not create a receipt — P1

**Location:** `src/main.jsx:61`

Recording a payment updates the invoice and payment array, but does not create a Receipt entity or provide a receipt download/view.

## A15. Payment does not update Customer 360 financial totals — P1

Payments update `invoices` and `payments`, but not `customers[].collected` or `customers[].billed`. Customer cards calculate outstanding from the stale customer fields, while finance pages calculate from invoices.

**Result:** Different screens can show different financial truth.

---

# B. Broken or misleading buttons and controls

## B1. Dashboard “Open” action buttons do nothing — P1

**Location:** `src/main.jsx:48`

`Action` renders a button without an `onClick` handler. The dashboard actions “Review attendance,” “View performance,” and “Open finance” are not navigable.

## B2. Profile button does nothing — P2

**Location:** `src/main.jsx:39`

The sidebar profile row is a button but has no click handler and does not open a profile/settings page.

## B3. Student learning tabs do nothing — P1

**Location:** `src/main.jsx:53`

Overview, Performance, Material, Interests, and Fee are plain buttons. Only Overview is visually active; clicking the others does not change the displayed content.

## B4. Notification items are not actionable — P2

**Location:** `src/main.jsx:40`

Notifications display text only. They do not link to the relevant invoice, payment, or task. Only Mark all as read works.

## B5. Export PDF is not a PDF download — P1

**Location:** `src/main.jsx:41`

The Export PDF button calls `window.print()`. This opens the browser print dialog rather than downloading a branded PDF. It is not scoped to the current report, does not generate a file name, and is not guaranteed to match the CRM design.

## B6. Export PDF is missing from most pages — P1

`Header` renders Export PDF only when the page has an `action`. Pages without a primary action have no PDF button, including Dashboard, Customers, Attendance, Student Learning, Reports, and Trainer Finance.

## B7. “Mark all present” is not explicit about unsaved state — P2

**Location:** `src/main.jsx:52`

Mark all present updates local component state only. Users can navigate away without warning and lose changes. There is no dirty-state indicator or unsaved-change protection.

## B8. Attendance lacks Excused status — P2

The capability blueprint requires Present, Late, Absent, Excused, and Not Marked. The UI only offers Present, Late, and Absent.

## B9. Attendance current-status display can be stale before save — P2

The status column reads from persisted `db.attendance`, while the mark buttons read from local state. After changing a status, the “Current status” column does not reflect the unsaved selection.

## B10. Attendance can show success without a valid session — P1

If there is no valid `sessionId`, `saveAttendance()` still attempts to save an activity with an undefined batch name and shows success. There is no empty-state guard.

## B11. Student performance is hardcoded — P0

**Location:** `src/main.jsx:53`

The Student Learning page always displays `92% attendance`, `Python functions 88/100`, and the same weak-area message regardless of the actual attendance and score records.

## B12. Student fee values are hardcoded — P0

**Location:** `src/main.jsx:53`

The Student page always displays ₹85,000 total, ₹73,000 paid, and ₹12,000 outstanding. These values are not derived from invoices or payments.

## B13. Student dashboard journey is hardcoded — P1

**Location:** `src/main.jsx:43`

Student dashboard journey items such as AI Foundations, 68% complete, score 88/100, and one workbook are hardcoded instead of derived from the student’s enrollments, attendance, scores, and materials.

## B14. Batch progress is hardcoded — P1

**Location:** `src/main.jsx:51`

Batch progress uses `68` for `BATCH-24` and `82` for every other batch. It is not calculated from attendance, completion, sessions, or assessments.

## B15. Trainer paid amount is hardcoded — P1

**Location:** `src/main.jsx:58`

“My finance” always shows ₹84,000 paid this month, regardless of payout records.

## B16. Report profitability is mathematically misleading — P1

**Location:** `src/main.jsx:60`

The report divides the entire expense total equally across all customers, regardless of which customer, batch, trainer, or program caused the expense. This is not customer profitability.

## B17. Report collection risk ignores role/source scope — P2

The report maps every invoice into a risk list but does not calculate overdue days, payment history, risk score, or date-based collection logic. It only maps status to HIGH/MEDIUM.

---

# C. Role and permission defects

## C1. Trainer can see all programs — P1

**Location:** `src/main.jsx:51`

For `page==='programs'`, no Trainer filter is applied. The page title says “Programs” or “My Programs,” but the data is not limited to programs connected to the trainer’s assigned batches.

## C2. Trainer can see all students — P0

**Location:** `src/main.jsx:51`

The student list is filtered for Institutions but not for Trainers. A Trainer can see every student in the seed database, including students from unrelated institutions and batches.

## C3. Trainer interests feed is not scoped to assigned batches — P0

**Location:** `src/main.jsx:54`

The Interests page renders every interest in `db.interests`. It does not filter by students enrolled in batches assigned to the current trainer.

## C4. Institution can record payment against another customer — P0

**Location:** `src/main.jsx:55,61`

The Institution Payments page opens a general payment modal whose invoice selector uses all unpaid invoices in `db.invoices`, not only invoices for `user.customerId`. An Institution can select another customer’s invoice.

## C5. General payment submit can crash when no invoice is selected — P0

**Location:** `src/main.jsx:61`

The code computes `inv.total - inv.paid` before checking `if (!inv)`. Submitting the general payment form without selecting an invoice causes a runtime TypeError instead of a validation message.

## C6. Organization can edit attendance without an explicit oversight rule — P2

The Organization has Attendance in its navigation and can save attendance for any session. The product needs a clear correction/oversight permission and audit reason rather than silently allowing ordinary edits.

## C7. Login is not real authentication — P1

**Location:** `src/main.jsx:5-10,37`

User credentials are hardcoded in the browser bundle. Anyone can inspect the source or localStorage and impersonate any role. This is acceptable only as a clearly labeled demo, not as a production CRM.

## C8. Session state is not secure — P1

The current user is stored in localStorage as a complete user object. There is no server session, token expiry, password reset, MFA, device/session management, or server-side authorization.

## C9. No user/role/permission management — P1

The Organization has no UI to create users, assign roles, deactivate users, configure permissions, or manage institution/trainer/student access.

## C10. No institution data-isolation test — P1

The UI filters several Institution pages by `customerId`, but there is no API/data-layer enforcement because there is no backend. A production implementation still needs server-side scope checks.

---

# D. Missing CRM features and list functionality

## D1. No sorting on list pages — P1

No table or card list implements sort by name, date, amount, status, due date, attendance, score, or priority.

## D2. No pagination — P1

All records render in one list. This will not scale for CRM-sized datasets.

## D3. No bulk actions — P1

There are no row checkboxes or bulk actions for assignment, status update, tags, export, archive, follow-up, attendance, or payment operations.

## D4. No CSV import/export — P1

There is no student import, lead import, batch roster import, score upload, or CSV export.

## D5. Search is inconsistent — P1

Global search filters Leads, Customers, Operations, and Finance pages, but does not filter Dashboard, Attendance, Reports, Student Learning, Interests, or Trainer Finance.

## D6. Search input inside Leads is read-only — P2

The Leads page shows a search field but sets `readOnly` and instructs the user to use global search. This is confusing and makes the visible field appear broken.

## D7. No saved views — P2

Users cannot save a filtered view such as “Overdue invoices,” “At-risk learners,” “My active batches,” or “Leads due today.”

## D8. No archive/delete/merge actions — P1

There are no operations to archive leads/customers/students, merge duplicates, restore records, or maintain record lifecycle states.

## D9. No follow-up task management — P1

Leads have activity records, but no real task entity, due date, owner, priority, reminder, completion state, or task list.

## D10. Lead activity is mostly hardcoded — P2

The seed lead has hardcoded activity dates and texts. The add-follow-up action always writes “qualification review” and cannot collect a follow-up date, owner, outcome, or note.

## D11. No lead owner reassignment — P2

Leads display an owner but have no assignment or reassignment action.

## D12. No lead lost/disqualified workflow — P1

The status filter includes several states, but there is no action to mark a lead lost, capture lost reason, competitor, expected reactivation date, or nurture list.

## D13. No customer contacts management — P1

Customer cards display a single email/location but there is no contacts list, billing contact, coordinator, principal, payer, or contact-level permission.

## D14. No batch enrollment management — P0

Existing enrollments are seeded, but there is no action to enroll, transfer, pause, resume, withdraw, replace, or waitlist a student.

## D15. No timetable/session management — P1

Sessions are seeded only. There is no create, reschedule, cancel, substitute trainer, room/link change, or notification action.

## D16. No materials management — P1

There is no upload, versioning, publish/unpublish, module assignment, learner access tracking, or real file storage.

## D17. No support ticket management — P1

No support ticket creation, SLA, owner, severity, escalation, resolution, or linked record exists.

## D18. No announcements or messaging — P1

There is no batch announcement, student message, institution message, trainer communication, email, WhatsApp, or in-app conversation system.

## D19. No certificate workflow — P1

Students can see a certificate-related area conceptually, but there is no eligibility rule, approval, generation, verification code, or download.

## D20. No trainer payout workflow — P1

Trainer Finance lists expenses but has no actual payout calculation, approval, payout line items, paid-period lock, or discrepancy workflow.

## D21. Expense records have no customer/batch/trainer relation — P1

New expenses are saved with category, vendor, amount, date, and status only. They are not linked to a customer, program, batch, trainer, receipt, or approval.

## D22. No quotation line items — P1

The quotation modal only has subtotal, discount, and tax fields. There is no line-item editor, quantity, unit price, program/batch link, payment terms, validity, or notes.

## D23. No invoice line items — P0

Invoice creation is missing entirely, and there is no invoice line-item editor, tax, discount, due-date, payment-plan, or late-fee configuration.

## D24. No partial-payment receipt or allocation UI — P1

Payments can be recorded, but there is no allocation screen, receipt screen, refund, reversal, credit note, or payment proof verification.

## D25. No date/range filters — P1

Reports and finance pages do not support date range, due date, created date, program, batch, customer, trainer, or status combinations beyond the simple global string search.

---

# E. Data integrity and calculation defects

## E1. Hardcoded dates are stale — P2

Many created activities, interests, payments, and expenses use `2026-09-30` rather than the current date or a user-selected date.

## E2. Payment does not validate missing invoice safely — P0

See C5. The null check occurs after dereferencing `inv`.

## E3. Quotation permits invalid totals — P1

Discount can exceed subtotal plus tax, producing a negative total. There is no non-negative validation or required numeric minimum.

## E4. Expense permits zero/negative/blank amount — P1

Expense amount has no `required`, minimum, or numeric validation. A zero or negative expense can be saved.

## E5. New trainer expense is not associated with trainer — P1

Trainer expense claims, if implemented later using the current branch, need `trainerId`. The current expense creation branch does not include it.

## E6. New lead email/phone validation is missing — P2

Email and phone fields have no format validation, duplicate check, consent state, or required phone rule.

## E7. Duplicate detection is missing — P1

There is no duplicate check for leads, customers, students, contacts, or imported records.

## E8. Customer summary fields become stale — P1

The customer object stores students, batches, billed, and collected as static summary fields while related records can change.

## E9. No relational cascade rules — P1

Because records are stored as a single localStorage object, there is no database-level protection against deleting a customer with batches, removing a student with attendance, or changing a batch relationship incorrectly.

## E10. No data reset or migration mechanism — P2

If old localStorage data has a previous schema, the app does not migrate it or provide a safe demo reset button.

## E11. No persistence conflict handling — P1

Multiple tabs/users can overwrite the entire `edunexus-db` localStorage object. There is no revision, conflict detection, backend write, or optimistic update reconciliation.

---

# F. Navigation, routing, and runtime limitations

## F1. Route manifest does not create actual routes — P1

The application uses React state for `page`; it does not read the browser URL or implement route handling. Deep links, refreshable page URLs, browser back/forward navigation, and shareable detail URLs are missing.

## F2. `window.__setPage` is never initialized — P1

**Location:** `src/main.jsx:39,42`

Dashboard passes a setter using `window.__setPage?.(x)`, but no code assigns `window.__setPage`. Any future dashboard action wired to this helper would silently do nothing.

## F3. Duplicate Quotations navigation entry — P2

**Location:** `src/main.jsx:38`

Organization navigation includes `['quotations','Quotations']` twice.

## F4. No modal keyboard accessibility — P2

Modals do not close on Escape, trap focus, return focus to the trigger, or expose dialog semantics.

## F5. No backdrop-close behavior — P2

Clicking the modal backdrop does not close the modal. Only close/cancel buttons work.

## F6. No loading/error/empty states for most views — P1

The app renders local seed data immediately. There are no loading, network error, retry, empty roster, empty search, or unavailable-record states for most pages.

## F7. No persistent notifications state separation — P2

Notifications are saved globally in the same localStorage database, not scoped to a user or role.

## F8. No real backend or API — P1

All records and credentials live in the client bundle/localStorage. This prevents real multi-user collaboration, secure authorization, backups, server validation, audit integrity, and external integrations.

---

# G. Verified passing items

These items are supported by source inspection and a successful production build, but they are not a substitute for complete browser testing:

1. `pnpm run build` completes successfully.
2. Demo login form validates the hardcoded email/password pairs.
3. Quick-login buttons populate the login form.
4. Sign out removes the stored demo user.
5. Sidebar navigation changes the in-memory page state.
6. Global search filters the pages that consume the `query` prop.
7. Lead status filter changes the displayed lead rows.
8. Lead row opens a detail modal.
9. Lead follow-up action appends an activity record.
10. Qualified/Proposal lead conversion creates a customer and changes the lead status to Converted.
11. Attendance status buttons update local state.
12. Save attendance replaces the selected session’s attendance records and appends an activity.
13. Mark all present updates local attendance state.
14. Student Share interest persists an interest record when the textarea is non-empty.
15. Notification Mark all as read persists read state.
16. Payment with a valid invoice and amount updates invoice paid/status and adds a payment record.
17. Quotation creation with numeric fields adds a draft quotation.
18. Expense creation with fields adds a pending expense.
19. CSS contains print rules, although the UI does not generate a real PDF file.

## Items still unverified without browser execution

- Actual pixel-level clickability and responsive behavior across desktop/mobile widths.
- Whether the print dialog is usable in the target environment.
- Whether localStorage survives refresh in the user’s browser.
- Whether all seeded role logins render without a browser console error.
- Whether form focus, modal scroll, table overflow, and notification layering behave correctly.

---

# Prioritized remediation order

## P0 — fix before claiming a working prototype

1. Implement invoice creation.
2. Implement program, batch, student, and enrollment creation.
3. Implement trainer assessment/marks entry and publish flow.
4. Derive Student attendance, marks, and fees from connected records.
5. Fix Institution payment scope and missing-invoice crash.
6. Filter Trainer students, programs, and interests by assigned batches.
7. Replace fake batch/customer/detail actions with real navigation or detail views.

## P1 — fix before final evaluation

8. Replace `window.print()` with actual branded PDF export.
9. Add search, sort, pagination, and date/status filters consistently.
10. Add quotation-to-invoice and receipt workflows.
11. Add enrollment, schedule/session, materials, support, and certificate flows.
12. Remove hardcoded dashboard/report/finance metrics.
13. Add validation for amounts, duplicate records, dates, emails, and permissions.
14. Add real routing and browser-refreshable URLs.
15. Add backend persistence and server-side authorization before production claims.

## P2 — polish and hardening

16. Add modal Escape/focus management and backdrop behavior.
17. Add empty, loading, error, retry, and unsaved-change states.
18. Add audit detail, saved views, bulk actions, CSV exports, and notification deep links.
19. Add profile/settings and user/role management.
20. Add responsive and accessibility verification.

## Final verdict

**Build status:** Passes compilation.  
**Prototype status:** Partially working demo.  
**Core trainer attendance:** Partially working.  
**Trainer marks workflow:** Not implemented.  
**Connected CRM completeness:** Not achieved.  
**Production readiness:** Not achieved.  
**Main risk:** The UI visually implies many features that currently only show a toast, render hardcoded values, or do not persist connected records.
