# Mira — COMPLETE USER FLOW (Behavioral Contract)

## GLOBAL FLOW
```text
LOGIN → ROLE DETECTION → DASHBOARD → ROLE-SPECIFIC MODULES
```

## FLOW A — LOGIN
Invalid credentials → error. Valid → identify role → dashboard. Demo users (Rampex model — 4 roles, staff logins removed):
```text
org@rampex.demo / org123 (Organization — Rampex, full access)
abc@college.edu / abc123 (Institution — ABC College, own data)
direct@rampex.demo / direct123 (Institution — Rampex Direct, D2C learners)
trainer@rampex.demo / trainer123 (Trainer — TR-001, assigned batches)
arun@student.edu / arun123 (Student — STU-001, own record)
```
UI shows active role.

## FLOW B — CREATE LEAD (Organization)
Dashboard → CRM → Leads → + New Lead → form → validation → create → status NEW → list.

## FLOW C — FOLLOW-UP (Organization)
Lead list → open lead → Activity → + Add Follow-up (date, method, notes, next action) → timeline updated.

## FLOW D — QUALIFY LEAD (Organization)
Lead → edit status → QUALIFIED → save → page shows "✓ Qualified" + [Convert to Customer].

## FLOW E — CONVERT LEAD (Organization, critical)
Qualified lead → Convert → confirm → create customer → generate CUST-XXX → lead CONVERTED → Customer 360. **No duplicate unrelated customer; preserve lead_id.**

## FLOW F — CREATE PROGRAM (Organization)
Customer → Training → Create Program → details → save.

## FLOW G — CREATE BATCH (Organization)
Program → Create Batch → select customer + trainer + dates + capacity → save → ACTIVE.

## FLOW H — ENROL STUDENT (assigned Trainer only)
Batch → Students → + Add Student → details → enrol → enrollment created → batch count +1.
The trainer is blocked from batches not assigned to them (403). Organization and
Institution have no enrol form and no student list — `POST /api/students` returns 403
for both. This is the single entry point for student records.

## FLOW I — ATTENDANCE (assigned Trainer, or Rampex as fallback)

Batch → Attendance → select date → load enrolled → mark PRESENT/ABSENT/LATE → save → % recalculated. The delivering trainer marks their own batches; Rampex can mark any batch as a fallback. Trainers are blocked from batches not assigned to them (403), and the institution has no attendance marking at all.

## FLOW J — QUOTATION (Organization creates; Institution views own)
Customer → Finance → Quotation → select customer → add items → subtotal − discount + tax = total → save. Optional: Accepted → Create Invoice.

## FLOW K — INVOICE (Organization creates; Institution views own)
Customer → Invoice → create → select quotation/program → items → totals → save → UNPAID.

## FLOW L — PAYMENT (Organization anywhere; Institution own invoices only)
Invoice → Record Payment → amount ≤ outstanding → create payment → recalc total_paid + outstanding → update status:
```text
paid==0 → UNPAID; 0<paid<total → PARTIALLY_PAID; paid>=total → PAID
```

## FLOW M — EXPENSE (Organization)
Finance → Expenses → Add (category, vendor, amount, date) → save → dashboard total updated.

## FLOW N - DASHBOARD UPDATE (scope-aware per role)
On Lead Created, Converted, Enrolled, Invoice, Payment, Expense → metrics recalc. E.g. Invoice 5,00,000 + Payment 2,00,000 → Revenue 5L, Collected 2L, Outstanding 3L.

## FLOW O — CUSTOMER 360 (hero)
Customer → original lead, follow-ups, programs, batches, attendance, quotations, invoices, payments, expenses. Navigate customer → training → finance without manual search.
The student roster appears here for the Organization only (the Institution's own college view
omits the tab) and is always **read-only** — the batch trainer owns student records.

## FLOW P — ROLE-BASED ACCESS (Rampex model)

## Organization (Rampex)
```text
EVERYTHING (only role that creates/converts)
```

## Institution (college / Rampex Direct — scoped to own customer_id)
```text
Dashboard (own college) → My College 360 → Batches → Quotations → Invoices → Payments (view + pay)
```
No Students module and no attendance marking. Students are managed by the trainer delivering
the batch; the college sees a student count on its dashboard, a read-only roster inside a
batch, and attendance only as an aggregate (batch attendance %).

## Trainer (Rampex staff — scoped to assigned trainer_id)
```text
Dashboard (my batches) → Programs → Batches → My Students → Attendance
```
My Students lists only the students inside this trainer's own batches.

## Student (scoped to own student_id)
```text
My Learning (profile, programs, attendance, performance, material, interests, fee)
```

## ORG VS INSTITUTION — NEVER CONFUSE (binding rule)
```text
ORGANIZATION (Rampex) OPERATES the platform across ALL institutions.
INSTITUTION (college / Rampex Direct) CONSUMES training for ONE college.
Same screen, different level: org dashboard aggregates everyone,
institution dashboard aggregates one college. Backend enforces via
customer_id / trainer_id / student_id scoping (403 otherwise).

STUDENT MANAGEMENT — the third rule (binding):
  TRAINER owns students. Only the trainer delivering a batch adds,
  views or reports on its students, and only that trainer marks its
  attendance. ORGANIZATION and INSTITUTION get aggregate student
  figures and a read-only batch roster — never a student list, an
  enrol form or a per-student drill-down.
```

## FLOW Q — STUDENT HUB (Student, self only)
Login → My Learning → tabs: Overview (profile, progress) · Performance (scores, weak areas) · Material (my batches) · Interests (share; trainers-only visibility) · Fee (my fee + dues share).

## FLOW R — INTERESTS (Student shares → Trainer reads)
Student → Interests → share text → saved → visible to assigned trainers + org. Institution requests → 403. Never rendered on college screens.

## FLOW S — TRAINER HUB (Trainer, own batches only)
Login → Dashboard (my batches) → open batch → overall progress + per-student report (attendance, scores, interests) → Schedule (location/timing) → Attendance mark → My Finance (payouts + claim expense).

## FLOW T — INSTITUTION INSIGHTS (Institution, own college only)
Login → Dashboard (own totals, top students of my college, batch performance) → My College 360 (Trainers tab = Rampex staff assigned to me) → Finance (total billed, paid, outstanding + per-student dues).

## FLOW U — ORGANIZATION INSIGHTS (Organization, platform level)
Login → Dashboard → per-institution table (students, batches, billed, collected, outstanding, attendance) → top students platform-wide → Reports (individual + institution performance metrics).

## FLOW V — AUTOMATED LEAD (Organization)
Enquiry arrives (source Website/Online) → lead auto-created (status NEW) → system auto-logs "enquiry auto-captured" follow-up → org qualifies → FLOW E. UI marks auto-captured leads with an AUTO badge.

## FLOW W — PUBLIC ENQUIRY (no login → AUTO lead)
Outsider opens /enquire → fills college/name/need → POST /api/public/enquire → lead created (source Website, AUTO badge, system follow-up) → visible in org Leads. The hackathon demo opens here: capture demand with zero friction.

## FLOW X — COLLECTIONS QUEUE (Organization all / Institution own)
Finance → Collections → outstanding invoices ranked HIGH/MEDIUM/LOW by rule (overdue days + ticket size + reasons shown) → Collect → → FLOW L. Explicitly rule-based prioritization, never claimed as ML.

## FLOW Y — CERTIFICATES (Organization issues; public verifies)
Batch attendance ≥75% → org Issues certificate (CERT-XXX, code RNX-YYYY-NNNN) → printable paper → anyone verifies at /verify with the code (no login). Ineligible (<75%) → 422 with reason.

## FLOW Z — COMMAND PALETTE (all logged-in roles)
Ctrl/⌘K anywhere → fuzzy search own-scope leads, colleges, batches, invoices → Enter jumps. Respects role scoping (same APIs, same 403s). Students appear in the palette for **trainers only**, because `/students` is a trainer route.

---

# VIBE-CODING CONTRACT (implementation order)

0–5 min: scaffold `frontend/ backend/`, React+Vite + Express + SQLite.
5–15 min: Login, Sidebar, Header, Dashboard, Routing, Role state (mock data OK).
15–30 min: Dashboard, Leads, Lead Details, Customers, Customer 360, Programs, Batches, Students, Attendance, Invoices, Payments, Expenses.
30–45 min: backend APIs:
```text
POST/GET /api/leads, GET/PATCH /api/leads/:id,
POST /api/leads/:id/followups, POST /api/leads/:id/convert,
GET /api/customers, GET /api/customers/:id,
POST /api/programs, POST /api/batches,
POST /api/students, POST /api/enrollments,                             <- trainer-only, 403 for org + institution
POST /api/attendance,                                                  <- assigned trainer OR Rampex fallback; 403 for institution
POST /api/quotations, POST /api/invoices, POST /api/payments,
POST /api/expenses, GET /api/dashboard
```
45–55 min: connect hero flow Lead→Customer→Batch→Enroll→Attendance→Invoice→Payment→Dashboard.
55–60 min: harden demo — fix crashes/nav/forms/API, seed data, verify calculations.

# MOST IMPORTANT RULE
Do not over-engineer. No microservices. No extra libs. No DB redesign mid-build. No out-of-PRD features. Prioritize working lifecycle over quantity. UI placeholder over broken core. Always maintain:
```text
Lead → Customer → Program → Batch → Enrollment → Attendance → Invoice → Payment → Outstanding → Dashboard
```
Proper relational IDs, no duplicated customer/student info, never fake success on failed API.

# CUT ORDER (if short on time)
Cut: advanced reports, vendors, trainer payments, advanced quotations, complex permissions, analytics, collection intelligence. NEVER cut: Login, Dashboard, Leads, Conversion, Programs/Batches, Students, Attendance, Invoice, Payment, Outstanding, Customer 360.

Demo story: "Here is one customer. Watch what happens throughout the organization."
```text
EDU NEXUS: CRM + TRAINING + FINANCE → CUSTOMER 360 → RAMPEX ORG VIEW
```
