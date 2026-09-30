# Mira — DATABASE PRD (Backend Blueprint)

**Database:** MySQL 8 (production) · SQLite (dev, `backend/mira.db` — schema ports 1:1)
**Companion docs:** `master-prd.md` (product + rules) · `uiux.md` (screens) · `userflow.md` (flows A–P)
**Notation:** DBML-style. This file is the single source of truth for backend table design.

## 0. Role model (the 4 Rampex logins — nothing else)

```text
Rampex = ORGANIZATION (the EduTech company, full access)
  ├── INSTITUTION = customer (college, or "Rampex Direct" for individual learners)
  ├── TRAINER = Rampex staff, assigned to batches under institutions
  └── STUDENT = belongs to an institution, enrolled in batches
```

Scope rule enforced by every backend query (see `userflow.md` FLOW P):

| Role | Scope key | Sees |
|---|---|---|
| ORGANIZATION | — | all rows |
| INSTITUTION | `users.customer_id` | own customer + its batches/finance (**no student list — aggregate counts only**) |
| TRAINER | `trainers.user_id` → assigned batches | batches via `batch_trainers` + **their students (own + write)** + attendance |
| STUDENT | `enrollments.student_id` → `users.user_id` | own enrollments + attendance |

### Student write rule (binding)

Students are **owned by the trainer** delivering the batch. This is enforced in the API, not
just hidden in the UI:

| Endpoint | ORGANIZATION | INSTITUTION | TRAINER | STUDENT |
|---|---|---|---|---|
| `GET /api/students` | 403 | 403 | own roster | self only |
| `POST /api/students` | 403 | 403 | 200 (own batch only, else 403) | 403 |
| `POST /api/enrollments` | 403 | 403 | 200 (own batch only) | 403 |
| `POST /api/attendance` | 403 | 403 | 200 (own batch only) | 403 |
| `GET /api/students/:id/report` | 403 | 403 | own students | self only |

`GET /api/customers/:id` returns `students: []` to an INSTITUTION while keeping the
`summary.students` count, so a college still sees *how many* students it has but never the
roster. Rationale: at 100s of students per college, individual management is the trainer's
job — the institution reads aggregates and per-batch performance.

---

// ============================================================
// 1. IDENTITY & ACCESS
// ============================================================

Table users {
  user_id bigint [pk, increment]
  name varchar(150) [not null]
  email varchar(150) [not null, unique]
  phone varchar(20)
  password_hash varchar(255) [not null]
  role enum('ORGANIZATION','INSTITUTION','TRAINER','STUDENT') [not null, note: 'Only 4 logins. No SALES/OPERATIONS/FINANCE/MANAGEMENT.']
  customer_id bigint [ref: > customers.customer_id, note: 'Set ONLY for INSTITUTION logins (their college, or Rampex Direct). NULL for all other roles.']
  status enum('ACTIVE','INACTIVE','BLOCKED') [default: 'ACTIVE']
  created_at datetime
  updated_at datetime
}

// ============================================================
// 2. CRM (operated ONLY by ORGANIZATION)
// ============================================================

Table leads {
  lead_id bigint [pk, increment]
  assigned_to bigint [ref: > users.user_id, note: 'ORGANIZATION user only']
  lead_type enum('INSTITUTION','DIRECT') [not null, note: 'INSTITUTION = college prospect; DIRECT = individual-learner segment (feeds Rampex Direct)']
  name varchar(150) [not null]
  email varchar(150)
  phone varchar(20)
  organization_name varchar(200)
  source varchar(100)
  expected_students int
  status enum('NEW','CONTACTED','QUALIFIED','PROPOSAL','CONVERTED','LOST','CLOSED') [note: 'Lifecycle per master-prd §8. No FOLLOW_UP/NEGOTIATION states.']
  expected_value decimal(12,2)
  created_at datetime
  updated_at datetime
}

Table lead_activities {
  activity_id bigint [pk, increment]
  lead_id bigint [not null, ref: > leads.lead_id]
  performed_by bigint [ref: > users.user_id, note: 'ORGANIZATION user only']
  activity_type enum('CALL','EMAIL','MEETING','FOLLOW_UP','DEMO','NOTE')
  notes text
  scheduled_at datetime
  completed_at datetime
  created_at datetime
}

Table customers {
  customer_id bigint [pk, increment]
  lead_id bigint [ref: > leads.lead_id, note: 'Originating lead. Preserved on conversion; never duplicate. NULL allowed for Rampex Direct house account.']
  customer_type enum('INSTITUTION','DIRECT') [not null, note: 'DIRECT = Rampex itself acting as institution for individual learners']
  name varchar(150) [not null]
  email varchar(150)
  phone varchar(20)
  organization_name varchar(200)
  status enum('ACTIVE','INACTIVE')
  created_at datetime
  updated_at datetime
}

// ============================================================
// 3. TRAINING MANAGEMENT
// Trainers are Rampex (ORGANIZATION) staff. A trainer reaches an
// institution ONLY through batch_trainers (assignment), never by
// belonging to it. Students reach an institution via enrollments.
// ============================================================

Table courses {
  course_id bigint [pk, increment]
  course_code varchar(50) [not null, unique]
  name varchar(200) [not null]
  description text
  duration_hours decimal(6,2)
  level enum('BEGINNER','INTERMEDIATE','ADVANCED')
  status enum('ACTIVE','INACTIVE')
  created_at datetime
  updated_at datetime
}

Table programs {
  program_id bigint [pk, increment]
  course_id bigint [not null, ref: > courses.course_id]
  customer_id bigint [not null, ref: > customers.customer_id, note: 'Institution (or Rampex Direct) this program is delivered to']
  name varchar(200) [not null]
  delivery_mode enum('ONLINE','OFFLINE','HYBRID')
  status enum('PLANNED','ACTIVE','COMPLETED','CANCELLED')
  created_at datetime
  updated_at datetime
}

Table batches {
  batch_id bigint [pk, increment]
  program_id bigint [not null, ref: > programs.program_id]
  batch_code varchar(50) [not null, unique]
  start_date date
  end_date date
  capacity int
  status enum('PLANNED','ACTIVE','COMPLETED','CANCELLED')
  created_at datetime
  updated_at datetime
}

Table trainers {
  trainer_id bigint [pk, increment]
  user_id bigint [not null, unique, ref: > users.user_id, note: 'Links to users.role = TRAINER. Employer is always Rampex (ORGANIZATION).']
  specialization varchar(200)
  experience_years decimal(4,1)
  payment_rate decimal(12,2)
  status enum('ACTIVE','INACTIVE')
  created_at datetime
}

Table batch_trainers {
  batch_trainer_id bigint [pk, increment]
  batch_id bigint [not null, ref: > batches.batch_id]
  trainer_id bigint [not null, ref: > trainers.trainer_id]
  assigned_at datetime
  Note: 'THIS is how a Rampex trainer is scoped to an institution (via the batch). Trainer dashboard = batches joined here.'
}

Table training_sessions {
  session_id bigint [pk, increment]
  batch_id bigint [not null, ref: > batches.batch_id]
  trainer_id bigint [not null, ref: > trainers.trainer_id]
  session_date date
  start_time time
  end_time time
  topic varchar(200)
  location varchar(255)
  status enum('SCHEDULED','COMPLETED','CANCELLED')
  created_at datetime
}

Table enrollments {
  enrollment_id bigint [pk, increment]
  customer_id bigint [not null, ref: > customers.customer_id, note: 'The INSTITUTION the student belongs to (college or Rampex Direct)']
  batch_id bigint [not null, ref: > batches.batch_id]
  student_id bigint [ref: > users.user_id, note: 'Links to users.role = STUDENT. Student login sees only these rows. Enrolment rows are created by the assigned TRAINER — organization and institution get 403.']
  enrollment_date date
  status enum('ENROLLED','ACTIVE','COMPLETED','DROPPED')
  completion_percentage decimal(5,2) [default: 0]
  completed_at datetime
  created_at datetime
}

Table attendance {
  attendance_id bigint [pk, increment]
  enrollment_id bigint [not null, ref: > enrollments.enrollment_id]
  session_id bigint [not null, ref: > training_sessions.session_id]
  status enum('PRESENT','ABSENT','LATE','EXCUSED') [note: 'MVP uses PRESENT/ABSENT/LATE per master-prd §8; EXCUSED reserved']
  marked_by bigint [ref: > users.user_id, note: 'the assigned TRAINER only — attendance is per-student work, so it follows student ownership']
  marked_at datetime
}

Table completions {
  completion_id bigint [pk, increment]
  enrollment_id bigint [not null, unique, ref: > enrollments.enrollment_id]
  completion_date date
  completion_status enum('COMPLETED','NOT_COMPLETED')
  certificate_no varchar(100) [unique]
}

// ---- 3b. LEARNING SUPPORT (Phase: role hubs) ----
// Materials: org creates per program/batch; read gated by batch visibility.
// Interests: student shares; readable ONLY by assigned trainers + org.
// Assessments/scores: org/trainer record; drive performance, weak areas, top students.

Table materials {
  material_id bigint [pk, increment]
  program_id bigint [ref: > programs.program_id]
  batch_id bigint [ref: > batches.batch_id, note: 'Either program or batch scope; batch wins if both set']
  title varchar(200) [not null]
  mat_type enum('VIDEO','DOC','LINK','NOTE')
  url varchar(500)
  notes text
  created_by bigint [ref: > users.user_id, note: 'ORGANIZATION user only']
  created_at datetime
}

Table interests {
  interest_id bigint [pk, increment]
  student_id bigint [not null, ref: > users.user_id, note: 'users.role = STUDENT; author only (plus org) can write']
  body text [not null]
  created_at datetime
  Note: 'READ RULE: assigned trainers of the student batches + ORGANIZATION. INSTITUTION logins → 403. Enforced in API, not just UI.'
}

Table assessments {
  assessment_id bigint [pk, increment]
  batch_id bigint [not null, ref: > batches.batch_id]
  title varchar(200) [not null, note: 'Topic name doubles as weak-area label (e.g. "Python functions")']
  max_score decimal(6,2) [default: 100]
  assessed_on date
  created_by bigint [ref: > users.user_id, note: 'ORGANIZATION or assigned TRAINER']
  created_at datetime
}

Table scores {
  score_id bigint [pk, increment]
  assessment_id bigint [not null, ref: > assessments.assessment_id]
  student_id bigint [not null, ref: > users.user_id]
  score decimal(6,2) [not null]
  recorded_at datetime
  Note: 'Weak area = lowest (score/max) topics per student. Top students = rank by attendance % then avg score.'
}

// ============================================================
// 4. SALES (quotations = MVP; proposals/agreements = Phase-2)
// ============================================================

Table quotations {
  quotation_id bigint [pk, increment]
  customer_id bigint [not null, ref: > customers.customer_id]
  quotation_no varchar(50) [not null, unique]
  issue_date date
  valid_until date
  subtotal decimal(12,2)
  discount_amount decimal(12,2)
  tax_amount decimal(12,2)
  total_amount decimal(12,2) [note: 'subtotal + tax − discount (master-prd §8)']
  status enum('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')
  created_at datetime
}

Table quotation_items {
  item_id bigint [pk, increment]
  quotation_id bigint [not null, ref: > quotations.quotation_id]
  course_id bigint [ref: > courses.course_id]
  description varchar(255)
  quantity int
  unit_price decimal(12,2)
  discount decimal(12,2)
  tax_rate decimal(5,2)
  total decimal(12,2)
}

// Phase-2 (table exists, no UI/API in MVP):
Table proposals {
  proposal_id bigint [pk, increment]
  customer_id bigint [not null, ref: > customers.customer_id]
  quotation_id bigint [ref: > quotations.quotation_id]
  proposal_no varchar(50) [not null, unique]
  title varchar(200)
  status enum('DRAFT','SENT','ACCEPTED','REJECTED')
  created_at datetime
}

// Phase-2:
Table agreements {
  agreement_id bigint [pk, increment]
  customer_id bigint [not null, ref: > customers.customer_id]
  proposal_id bigint [ref: > proposals.proposal_id]
  agreement_no varchar(50) [not null, unique]
  start_date date
  end_date date
  status enum('DRAFT','ACTIVE','COMPLETED','TERMINATED')
  created_at datetime
}

// ============================================================
// 5. FINANCE & BILLING
// Invoices/payments = MVP. Schedules/allocations/receipts = Phase-2.
// INSTITUTION may pay own invoices; only ORGANIZATION creates.
// ============================================================

Table invoices {
  invoice_id bigint [pk, increment]
  customer_id bigint [not null, ref: > customers.customer_id]
  agreement_id bigint [ref: > agreements.agreement_id]
  invoice_no varchar(50) [not null, unique]
  issue_date date
  due_date date
  subtotal decimal(12,2)
  discount_amount decimal(12,2)
  tax_amount decimal(12,2)
  total_amount decimal(12,2)
  paid_amount decimal(12,2) [default: 0, note: 'outstanding = total_amount − paid_amount']
  status enum('UNPAID','PARTIALLY_PAID','PAID','OVERDUE') [note: 'MVP statuses per master-prd §8. paid==0 → UNPAID; 0<paid<total → PARTIALLY_PAID; paid>=total → PAID']
  created_at datetime
}

Table invoice_items {
  item_id bigint [pk, increment]
  invoice_id bigint [not null, ref: > invoices.invoice_id]
  course_id bigint [ref: > courses.course_id]
  description varchar(255)
  quantity int
  unit_price decimal(12,2)
  discount decimal(12,2)
  tax_rate decimal(5,2)
  total decimal(12,2)
}

Table payments {
  payment_id bigint [pk, increment]
  customer_id bigint [not null, ref: > customers.customer_id]
  invoice_id bigint [not null, ref: > invoices.invoice_id, note: 'Every payment allocates to one invoice in MVP (single-invoice payment)']
  payment_no varchar(50) [not null, unique]
  amount decimal(12,2) [note: 'Must be > 0 and ≤ invoice outstanding, else reject']
  payment_date datetime
  payment_method enum('CASH','UPI','BANK_TRANSFER','CARD','CHEQUE','ONLINE')
  reference_no varchar(100)
  status enum('PENDING','SUCCESS','FAILED','REFUNDED')
  created_at datetime
}

// Phase-2 (tables exist, no UI/API in MVP):
Table payment_schedules {
  schedule_id bigint [pk, increment]
  invoice_id bigint [not null, ref: > invoices.invoice_id]
  installment_no int
  due_date date
  amount decimal(12,2)
  status enum('PENDING','PARTIALLY_PAID','PAID','OVERDUE')
}

Table payment_allocations {
  allocation_id bigint [pk, increment]
  payment_id bigint [not null, ref: > payments.payment_id]
  invoice_id bigint [not null, ref: > invoices.invoice_id]
  schedule_id bigint [ref: > payment_schedules.schedule_id]
  allocated_amount decimal(12,2)
}

Table receipts {
  receipt_id bigint [pk, increment]
  payment_id bigint [not null, unique, ref: > payments.payment_id]
  receipt_no varchar(50) [not null, unique]
  issued_at datetime
}

// ============================================================
// 6. EXPENSE MANAGEMENT (ORGANIZATION only)
// ============================================================

Table expense_categories {
  category_id bigint [pk, increment]
  category_name enum(
    'TRAINER_PAYMENT',
    'EMPLOYEE_EXPENSE',
    'TRAVEL',
    'ACCOMMODATION',
    'MATERIAL',
    'VENUE',
    'MARKETING',
    'VENDOR_PAYMENT',
    'OTHER'
  ) [not null]
}

Table expenses {
  expense_id bigint [pk, increment]
  category_id bigint [not null, ref: > expense_categories.category_id]
  batch_id bigint [ref: > batches.batch_id]
  trainer_id bigint [ref: > trainers.trainer_id]
  vendor_id bigint [ref: > vendors.vendor_id]
  expense_no varchar(50) [not null, unique]
  amount decimal(12,2)
  expense_date date
  description text
  status enum('PENDING','APPROVED','REJECTED','PAID')
  approved_by bigint [ref: > users.user_id, note: 'ORGANIZATION user only']
  created_by bigint [ref: > users.user_id, note: 'ORGANIZATION, or TRAINER filing own claim (starts PENDING; trainer_id = self)']
  created_at datetime
}

Table vendors {
  vendor_id bigint [pk, increment]
  name varchar(200) [not null]
  email varchar(150)
  phone varchar(20)
  address varchar(255)
  status enum('ACTIVE','INACTIVE')
  created_at datetime
}

---

## 7. Seed data (dev + demo)

```text
users: org@rampex.demo/ORGANIZATION · abc@college.edu/INSTITUTION(customer: ABC College)
       · direct@rampex.demo/INSTITUTION(customer: Rampex Direct) · trainer@rampex.demo/TRAINER
       · arun@student.edu/STUDENT
customers: ABC College (INSTITUTION) · XYZ Institute (INSTITUTION) · Rampex Direct (DIRECT, house account)
trainers: TR-001 Arun Kumar, TR-002 Divya Rao (Rampex staff; assigned via batch_trainers concept → batches.trainer_id in dev)
batches: AIML-2026-01 (ABC) · WEB-2026-02 (XYZ) · RDX-2026-01 (Rampex Direct, D2C)
students: 6 college + 2 Rampex Direct learners, each with enrollments + attendance
finance: QUO-001 → INV-001 (PARTIALLY_PAID) · INV-002 (UNPAID) · PAY-001 · 3 expenses
learning: 2 assessments (AIML batch) + scores for 6 students · 2 materials · 2 interests ·
  3 sessions (AIML: location+timing) · trainer payout expense (TR-001) + claim (PENDING)
showcase: certificates table ships EMPTY (issued live in demo: STU-006 eligible ≥75%, STU-003 blocked) ·
  collections/activity/trend are computed live, no tables
```

## 8. MVP vs Phase-2 (maps to master-prd §4/§6)

```text
MVP (build now): users, leads, lead_activities, customers, courses, programs,
  batches, trainers, batch_trainers, training_sessions, enrollments, attendance,
  completions, quotations(+items), invoices(+items), payments, expenses(+categories), vendors,
  materials, interests, assessments, scores, certificates
Phase-2 (schema only): proposals, agreements, payment_schedules, payment_allocations, receipts
NEVER (out of scope): payroll, GST engine, procurement, HR, multi-company accounting
```

## 9. MySQL → dev-SQLite porting notes

- `bigint auto_increment` → dev uses TEXT codes (`CUST-001`, `INV-001`…); logic identical, surrogate keys swap on migration.
- `enum` → TEXT + CHECK constraints in dev.
- `payment_allocations`/`payment_schedules`/`receipts`/`proposals`/`agreements` have no dev tables yet — create on Phase-2.
- Dev `invoice.paid/outstanding` columns mirror `paid_amount` / computed outstanding here.
- Dev `users` uses generic `linked_type`/`linked_id` instead of `users.customer_id`
  (`customer`→customer_id, `trainer`→trainers.user_id, `student`→enrollments.student_id) — same links, one table.
