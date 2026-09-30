# Mira — MASTER PRD

**Tagline:** One platform. Every EduTech operation connected.

## Product Definition

Mira is a unified EduTech operations platform connecting:

**CRM → Customer → Training → Students → Attendance → Billing → Payments → Financial visibility**

The product must avoid feeling like separate CRUD modules. Information created in one module becomes available to the next without unnecessary re-entry.

Core lifecycle:

```text
ENQUIRY → LEAD → FOLLOW-UP → CONVERSION → CUSTOMER / INSTITUTION
→ PROGRAM → BATCH → STUDENTS → TRAINING / ATTENDANCE
→ QUOTATION → INVOICE → PAYMENT → OUTSTANDING → MANAGEMENT DASHBOARD
```

This lifecycle is the heart of the prototype.

## 1. Problem

EduTech organizations manage: sales enquiries, leads, customers/institutions, follow-ups, training programs, batches, trainers, students, schedules, attendance, quotations, invoices, payments, expenses, vendors, collections, management reporting, role-based access.

The system must provide a unified operational view, covering CRM + Training + Finance with an end-to-end lifecycle demo.

## 2. Product Goal

Working SaaS-style platform where a manager can trace a customer from first enquiry → sales → conversion → training delivery → student participation → invoice → payment → outstanding → financial outcome.

> **Core differentiator: End-to-end operational and financial traceability.**

## 3. Target Users (4 logins — Rampex model)

**Rampex is the Organization** — the EduTech company running the platform. Institutions (colleges) are its customers. Rampex itself is also an institution (`Rampex Direct`) for individual learners. Trainers are Rampex staff delivering batches under institutions. Students belong to an institution, but they are **managed by the trainer who delivers their batch** — see §3b.

### Organization — Rampex management (org@rampex.demo)
Everything except direct student management: Dashboard, Leads, Institutions, Programs, Batches, Trainers, Quotations, Invoices, Payments, Expenses, Reports. Only role that creates/converts. Sees student totals as aggregates — never manages individual students.

### Institution — college management (abc@college.edu → ABC College; direct@rampex.demo → Rampex Direct)
Own data only, scoped by customer_id: My College 360, own batches (with trainer + student counts), own quotations/invoices/payments (view + pay). View-only otherwise. **No student management** — with 100s of students per college, individual records are not their workflow; they see aggregate student counts and per-batch performance.

### Trainer — Rampex staff (trainer@rampex.demo → TR-001)
Assigned batches only, scoped by trainer_id: my batches across institutions, **my students (add / view / per-student report)**, attendance marking, my finance. The trainer is the **only** role that manages students directly — a trainer owns a short roster, so name-by-name management is the right granularity there.

### Student (arun@student.edu → STU-001)
Own record only, scoped by student_id: My Learning (profile, programs, batches, attendance, performance + weak areas, study material, interests, learning progress, fee + dues).

### Organization vs Institution — the rule (never mix these)

```text
ORGANIZATION = Rampex, the EduTech company that OWNS the platform.
  Operates ACROSS all institutions. Creates everything (leads, programs,
  batches, invoices). Revenue = all institutions combined.

INSTITUTION = a customer (college, or Rampex Direct for individuals).
  CONSUMES training. Sees ONLY its own college. Creates nothing
  (view + pay invoices). Does NOT manage students — it reads the
  student count and batch performance of its own college.

STUDENT MANAGEMENT = the trainer's job, always. Rampex and the
  institution see aggregate student figures; neither adds, edits or
  drills into an individual student record.
```

One sentence: **Rampex operates, institutions consume.**

### 3b. Basic actions per login (level-scoped — every metric is computed at the user's level)

**STUDENT (self level):** login · student profile · my course/program · my batch ·
attendance (own) · performance (own scores) · weak-area improvement (lowest topics) ·
study material (own batches) · interests (share; visible ONLY to trainers) ·
learning progress (attendance % + completion) · my fee · outstanding dues.

**TRAINER (assigned-batches level) — owns student management:** login · assigned programs
+ program list · **my students (add a student, view my roster, per-student report)** ·
overall progress (my batches) · individual student report (attendance + scores + interests) ·
attendance mark (view & update, own batches only) · student interests (view) ·
batches & schedules (location + timing) · MY finance (my payouts, my expense claims,
accommodation/others linked to me).

**INSTITUTION (own-college level):** login · dashboard + overall insights aggregated
from own tabs (finance summary, top students, batch performance) · training (active
programs, trainers assigned to me, batch performance, overall batch performance) ·
finance (total fees billed to me, paid, outstanding student dues).
**No student management** — no roster, no per-student drill-down. Aggregate counts only.

**ORGANIZATION (platform level):** login · dashboard + overall insights across ALL
institutions · CRM (leads incl. automated capture, follow-ups/conversion, quotation &
proposal, program/batch setup) · training (institution performance metrics, per-batch
roster read-only, attendance marking as a fallback for any batch) · finance (all
institutions, trainers, all expenses).
**No student management** — student records stay with the delivering trainer; Rampex
reads aggregate student figures only.

## 4. MVP Scope — MUST WORK

**CRM:** create/view/search/filter leads, lead status, follow-up, convert lead, customer creation, customer details, customer history.
**Training:** programs/courses, trainers, batches, students, enrollment, schedule, attendance.
**Finance:** quotations, invoices, payments, outstanding calculation, expenses.
**Dashboard:** total leads, conversion rate, active batches, total students, revenue, collected, outstanding, expenses, net.

## 5. Secondary Features (if time permits)

Discounts, taxes, payment schedules, trainer payments, vendors, receipts. Must not delay core lifecycle.

> Done in MVP: 4-role login (Organization / Institution / Trainer / Student) with backend scope enforcement — see `db-prd.md` §0 and `userflow.md` FLOW P.
> Done in showcase pass: public enquiry → AUTO leads (FLOW W), risk-ranked collections queue (FLOW X, rule-based), certificates + public verification (FLOW Y), ⌘K command palette (FLOW Z), revenue trend + activity feed, CSV exports, printable receipts, toasts.

## 6. Explicitly OUT OF MVP

Full payroll, full accounting, GST engine, complex taxation, procurement, full HR, multi-company accounting, notification infra, mobile app, microservices.

## 7. Core Data Model

Normalized relational entities:

```text
users, roles,
leads, lead_followups,
customers, customer_contacts,
programs, batches, trainers,
students, enrollments, schedules, attendance,
quotations, quotation_items,
invoices, invoice_items, payments,
expenses, expense_categories, vendors
```

Relationship:

```text
Rampex (organization)
  └── Institution (customer: college, or Rampex Direct for individuals)
        └── Program / Batch (trainer = Rampex staff assigned to institution)
              └── Enrollment (student of that institution)
                    └── Training → Invoice → Payment
```

Never put student, course, batch, trainer and payment info in one giant table.

## 8. Critical Business Rules

### Lead
```text
NEW → CONTACTED → QUALIFIED → PROPOSAL → CONVERTED
Terminal: LOST, CLOSED
```

### Conversion
```text
Lead → Customer created → Customer ID generated → Lead marked CONVERTED
```
Do not duplicate customer info. Preserve originating lead_id.

### Invoice
```text
subtotal + tax − discount = total
outstanding = invoice_total − total_paid
UNPAID | PARTIALLY_PAID | PAID | OVERDUE
```

### Attendance
Each record = Student + Batch + Session/Date. States: PRESENT | ABSENT | LATE.
Marked by the trainer delivering that batch, **or by Rampex (Organization) as a fallback** —
a batch must never go unrecorded if the delivering trainer is unavailable. Attendance is
per-student work, so the delivering trainer is the default marker and owns the record; Rampex
holds the override. The institution reads attendance as an aggregate (batch attendance %),
never record by record, and cannot mark it at all.

## 9. Dashboard

Must answer: "How is this EduTech organization performing?"

Top cards: Total Leads, Conversion, Students, Revenue, Collected, Outstanding. Then: revenue vs collection chart, lead conversion chart, active batches, expense summary, outstanding invoices, recent payments. Demo numbers are simulated prototype data.

## 10. Signature Feature — Traceability (Customer 360)

```text
ABC COLLEGE (CUST-001)
├── Lead (enquiry, follow-ups, conversion)
├── Training (programs, batches, attendance %, student count)
│   └── Students are managed by the batch trainer, not by the college
├── Finance (quotations, invoices, payments, outstanding)
└── Financial Summary (revenue, expenses, net)
```

## 11. Optional Intelligence

Only after core works. Collection Risk = Outstanding + Overdue Days + Payment History → HIGH / MEDIUM / LOW. Rule-based prioritization, not ML.

## 12. Technical Architecture

```text
React/Vite (frontend) → REST API → Node.js/Express (CRM|Training|Finance) → SQLite (dev) / MySQL (prod) → Dashboard/Reports
```

Do not introduce unnecessary complexity for the 1-hour build. This repo uses SQLite (`backend/mira.db`) with a MySQL-compatible schema so it can be ported without logic changes.
