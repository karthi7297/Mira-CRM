# Mira — UI/UX SPECIFICATION

## 1. Design Direction

Modern B2B SaaS dashboard, not a college project. Clean, professional, dense but readable, minimal animation, strong hierarchy, desktop-first, responsive, data-oriented.

Avoid: excessive gradients, huge heroes, cartoonish UI, glassmorphism, giant cards everywhere.

User feeling: "This is software an organization could actually use."

## 2. Global Layout

```text
┌────────────────────────────────────────────────┐
│ Logo Mira       Search        🔔      User     │
├──────────┬─────────────────────────────────────┤
│ Dashboard│                                     │
│ CRM      │           MAIN CONTENT              │
│ Customers│                                     │
│ Training │                                     │
│ My Students │  (trainer only)                    │
│ Finance  │                                     │
│ Expenses │                                     │
│ Reports  │                                     │
│ Settings │                                     │
└──────────┴─────────────────────────────────────┘
```

## 3. Sidebar

Main: Dashboard, Leads, Institutions, My College, My Learning, Programs, Batches, My Students, Attendance, Quotations, Invoices, Payments, Collections, Certificates, Expenses, Reports. Bottom: Profile, Logout. Items filter by role — the sidebar never shows modules the role cannot open.

Role map (Rampex 4-role model — the ONLY logins):
- Organization (Rampex): everything **except student management** — Dashboard, Leads, Institutions, Programs, Batches, **Attendance**, Quotations, Invoices, Payments, Collections, Certificates, Expenses, Reports
- Institution (college / Rampex Direct): Dashboard (own college), My College, Batches, Quotations, Invoices, Payments, Collections, Certificates
- Trainer (Rampex staff): Dashboard (my batches), Programs, Batches, **My Students**, Attendance, Certificates, My Finance
- Student: My Learning only

> **Student management is trainer-only.** `My Students` appears for the Trainer role and
> nobody else. `Attendance` appears for the Trainer and for Organization — Rampex can mark
> any batch as a fallback. Organization and Institution never see a student list, an enrol
> form or a per-student report — at 100s of students that is not their workflow. They read
> aggregate student counts on the dashboard and a read-only roster inside a batch.
> Direct URL access to `/students` renders "Access Denied" for them, and the API returns 403.

Top bar always shows the active role badge (e.g. `INSTITUTION · ABC College Office`). Unauthorized direct URLs render "Access Denied".

## 4. Dashboard UI (role-shaped — same route, different data)

Organization (Rampex): Header "Good afternoon, {name} — Here's what's happening today."
KPI row: Total Leads, Conversion, Students, Revenue (+ deltas). Second row: Revenue & Collections chart, Lead Pipeline funnel. Third row: Active Batches list, Outstanding Payments list.

Institution (college portal): "{College name} — training delivered by Rampex." Cards: Students, Batches, Billed, Paid, Outstanding. Lists: My Batches (with Rampex trainer names), Outstanding Invoices. Link: "Open full College 360 →".

Trainer: "Your assigned batches across institutions." Cards: My Batches, Students, Avg Attendance. List: batches with institution names. Link: "Mark attendance →".

Student: greeting + single "Open My Learning →" button (dashboard redirects to §11b content).

## 4b. Organization insights (platform level — org dashboard extension)

Per-institution table: Institution | Students | Batches | Billed | Collected | Outstanding | Avg attendance. Top students across platform (by attendance % + avg score). These aggregate ALL institutions — the same cards at institution level show ONE college only. That level difference is the org-vs-institution rule made visible.

## 5. CRM — Leads (Organization only)

Header: `Leads [Search...] [Filter] [+ New Lead]`. Table: Lead ID | Company | Contact | Program | Status | Owner | Action. Status chips: NEW, CONTACTED, QUALIFIED, PROPOSAL, CONVERTED, LOST.

## 6. Lead Creation (modal/drawer)

Fields: Organization*, Contact Person*, Email, Phone, Requirement*, Program, Expected Students, Expected Value, Source, Assigned To. → "✓ Lead created successfully".

## 7. Lead Details

Header with status chip, contact info, requirement, value, owner. Timeline of events. Follow-ups list + [+ Add Follow-up]. Prominent [Convert to Customer] button (enabled when QUALIFIED/PROPOSAL).

## 8. Customer 360 (hero screen — Organization sees all; Institution sees own as "My College")

`ABC COLLEGE / CUST-001 / Enterprise`. Tabs: Overview | Training | Trainers | Finance | Activity — plus **Students** for the Organization only. Trainers tab = Rampex trainers assigned to this college's batches (institution sees them, manages nothing). Overview: contact, active programs, students, revenue, outstanding. Timeline: lead converted → training → batch → invoice → payment.

> Institution logins do **not** get the Students tab — a college does not manage students, and
> a name-by-name roster is not a useful view at their scale. The API likewise returns an empty
> `students` array for them while keeping the `summary.students` aggregate count.

## 9. Training — Programs

`Training Programs [Search] [+ Create Program]`. Cards: name, duration, active batches.

## 10. Batch

`Batch AIML-2026-01`: program, customer, trainer, dates, students count, attendance %. Tabs: Students | Schedule | Attendance. Schedule tab = sessions with location + timing (org adds, everyone in scope reads). [+ Create Batch] and the **Enrol Student form render for the assigned Trainer only**; organization and institution see the roster read-only, with a note saying the trainer adds students.

## 10b. My Students (Trainer only)

The trainer's own roster — only the students inside the batches assigned to this trainer.
Two KPI cards: `My Students` and `Below 75% Attendance`. A search box appears once the roster
exceeds three students. Table: ID | Name | Batch | Program | Attendance (chip, green ≥75%,
amber ≥50%, red below) | Contact. Empty state points the trainer at their batches to enrol
their first student.

Organization and Institution have no equivalent screen. They see a student *count* on their
dashboard and a read-only roster inside a batch.

## 11. Attendance (assigned Trainer, or Rampex as fallback)

Fast table for date: Student | Status (Present/Absent/Late). [Mark All Present] + [Save Attendance]. The batch selector lists the trainer's own batches (Rampex sees every batch), and the date defaults to today. The institution has no Attendance screen.

## 11b. My Learning (Student only — self level)

Tabs: Overview | Performance | Material | Interests | Fee.
- Overview: profile (name, college, batches), learning progress (attendance % + completion bar).
- Performance: my scores per assessment, attendance %, weak areas = lowest-scoring topics with "improve" hints.
- Material: study material for my batches (title, type, link/notes).
- Interests: share interests (text) — **visible ONLY to my trainers + Rampex org, never to institution logins**. List my own past shares.
- Fee: my fee (program fee × my enrollments), dues = my share of college outstanding, shown labeled.

## 11c. Trainer hub (assigned-batches level)

- Programs: my assigned programs + program list (read-only cards).
- Batch view: overall progress (attendance %, avg score), per-student report (attendance, scores, interests), Schedule (location + timing), Attendance mark.
- Interests: read-only feed of my students' shared interests.
- My Finance: my payouts (Rampex → me), my expense claims (travel, accommodation, others) + [+ Claim Expense]. Never another trainer's, never college finance.

## 11d. Study material & interests (shared entities, level-gated reads)

Material: org creates (program/batch, title, type, URL/notes). Reads: student (own batches), trainer (own batches), institution (own college), org (all).
Interests: student shares (own only). Reads: assigned trainers + org ONLY. Institution logins are explicitly excluded — enforced by API (403), not just hidden UI.

## 12. Finance (Organization full; Institution sees own rows, view + pay only)

Finance dashboard: Revenue | Collected | Outstanding. Tabs: Quotations, Invoices, Payments, Expenses. [+ Create] buttons render for Organization only.

## 13. Invoice Screen

INV-001: customer, program, line items (qty × rate), subtotal, discount, tax, TOTAL, paid, outstanding, [Record Payment]. Institution sees this for its own invoices and CAN pay (view + pay); only Organization can create invoices.

## 14. Payment Modal

Invoice, Amount*, Method, Date, Reference, Notes → "Payment recorded. Outstanding updated: ₹X".

## 15. Expenses (Organization only)

`Expenses [Search][Filter][+ Add Expense]`. Columns: Date | Category | Vendor | Description | Amount. Categories: Trainer, Venue, Travel, Accommodation, Materials, Marketing, Operations, Other.

## 16. Reports (Organization only)

Revenue, Collection, Outstanding, Training Performance, Customer Profitability, Expense reports. Visual dashboard views suffice for demo.

## 19. Hackathon surfaces (same design language, new wow)

- Public /enquire: centered card on the login backdrop. No nav, no auth. Success shows reference ID.
- Collections: risk chips reuse status-chip styles (HIGH=red, MEDIUM=amber, LOW=green) + reason text + Export CSV.
- Certificates: bordered paper card, print-only styling via @media print (sidebar/top/buttons hidden). /verify reuses the login backdrop + paper.
- Command palette: modal shell reuse, full-width input, row navigation. Trigger: Ctrl/⌘K or the Search button in the top bar.
- Trend chart: pure CSS bars (blue billed / green collected), no chart library.
- Toasts: bottom-right dark pills, auto-dismiss 3.2s, used for create/issue/pay confirmations.

## 17. Responsive

Desktop priority. Small widths: sidebar collapsible, tables horizontal scroll, cards 2-col/1-col, forms stacked.

## 18. UX Rules

Every mutation: Loading / Success / Error / Empty states. Empty: "No customers yet. [+ Add Customer]". Errors human-readable: "Unable to create invoice. Check items and try again." Never fake success on API failure.
