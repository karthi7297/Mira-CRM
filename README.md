# Mira — One platform. Every EduTech operation connected.

Mira is a full-stack **EduTech operations platform** that connects the entire
business lifecycle in one place:

```text
ENQUIRY → LEAD → FOLLOW-UP → CONVERSION → CUSTOMER / INSTITUTION
→ PROGRAM → BATCH → STUDENTS → TRAINING / ATTENDANCE
→ QUOTATION → INVOICE → PAYMENT → OUTSTANDING → MANAGEMENT DASHBOARD
```

Data created in one module flows into the next without re-entry — a manager can
trace a customer from first enquiry → sales → conversion → training delivery →
student participation → invoice → payment → financial outcome.

---

## ✨ Features

### CRM (Organization only)
- Lead pipeline with status flow `NEW → CONTACTED → QUALIFIED → PROPOSAL → CONVERTED` (terminal: `LOST`, `CLOSED`)
- Search, filter, follow-up history, and one-click **lead → customer conversion**
  (customer ID generated, originating `lead_id` preserved, lead marked `CONVERTED`)
- Public enquiry form that auto-captures leads (FLOW W)

### Training
- Programs, trainers (Rampex staff), batches, students, enrollments
- Session schedules (date, time, location, topic)
- Attendance marking (`PRESENT | ABSENT | LATE`) per student/batch/date
- Assessments, scores, per-student reports, top-students report

### Finance
- Quotations with line items and **1-click quotation → invoice conversion**
- Invoice math enforced everywhere: `total = subtotal + tax − discount`,
  `outstanding = total − paid`
- Payment recording with overpayment rejection; status transitions
  `UNPAID → PARTIALLY_PAID → PAID` (+ `OVERDUE` by due date) — kept consistent
  by database triggers
- Expenses with categories and trainer-linked payouts
- Risk-ranked **collections queue** (HIGH / MEDIUM / LOW, rule-based — FLOW X)

### Dashboards & Reports
- Role-scoped dashboard (leads, conversion rate, active batches, students, revenue, collected, outstanding, expenses, net)
- Revenue vs. collection trend, live activity feed, CSV exports
- **Customer 360**: one view of a customer's lead history, training, finance, and financial summary

### Showcase
- Public certificate verification by code (FLOW Y)
- ⌘K command palette, toasts, printable receipts (FLOW Z)

---

## 👥 Role-based access (Rampex 4-role model)

Access is enforced in the backend (`backend/src/middleware/scope.js`) — scope
keys are nulled out for roles that don't own them, so a spoofed header cannot
widen access. **"Rampex operates, institutions consume."**

| Role | Scope | Can do |
|---|---|---|
| **Organization** (Rampex) | everything across all institutions | Only role that creates/converts: leads, programs, batches, invoices, expenses. Reads student aggregates only |
| **Institution** (college / Rampex Direct) | own `customer_id` only | View own dashboard, batches, finance; pay invoices. No student management |
| **Trainer** (Rampex staff) | assigned `trainer_id` batches | Owns student management: add students, mark attendance, assessments, per-student reports, own payouts |
| **Student** | own `student_id` record | My Learning: profile, attendance, scores + weak areas, materials, interests, fees & dues |

### Demo logins

| Email | Password | Role |
|---|---|---|
| org@rampex.demo | org123 | Organization (Rampex) |
| abc@college.edu | abc123 | Institution (ABC College) |
| direct@rampex.demo | direct123 | Institution (Rampex Direct) |
| trainer@rampex.demo | trainer123 | Trainer (Rampex staff) |
| arun@student.edu | arun123 | Student |

---

## 🧱 Tech stack & architecture

```text
React 18 + Vite (frontend/)
        │  /api proxy → :4000
        ▼
Node.js + Express (backend/)
        │  services → dialect-agnostic db facade
        ▼
SQLite (dev, zero-setup)  │  MySQL 8 (production, docker-compose.yml)
```

```text
backend/
├── server.js                  # entry: boot driver → schema → seed → listen
├── .env.example               # all config options
└── src/
    ├── app.js                 # app factory: every REST route, { success, data } envelope
    ├── config/index.js        # env-overridable config (DB driver, tax rate, risk thresholds)
    ├── middleware/scope.js    # header-based role scoping (x-role / x-customer / x-trainer / x-student)
    ├── db/
    │   ├── connection.js      # dialect-aware facade: query/get/run/exec/count/transaction
    │   ├── sqlite.js          # SQLite driver (better-sqlite3-style sync API, async-wrapped)
    │   ├── mysql.js           # MySQL 8 driver (mysql2 pool)
    │   ├── schema.js          # SQLite DDL (mirrors the MySQL blueprint 1:1)
    │   ├── schema.mysql.sql   # MySQL 8 DDL (applied automatically when DB_DRIVER=mysql)
    │   └── seed.js            # idempotent demo data (both dialects)
    ├── services/              # business logic: auth, leads, customers, training,
    │                          # learning, finance, dashboard, showcase, scope
    └── utils/                 # http helpers, money math, ids, password hashing, validation

frontend/
└── src/
    ├── api.js                 # typed-ish fetch client, { success, data } unwrapping, CSV export
    ├── auth.jsx / Layout.jsx  # login state + shell
    ├── widgets.jsx            # shared UI components
    └── pages/                 # Login, Dashboard, CRM, Training, Finance,
                               # MyLearning, Showcase, Public (enquiry + verify)
```

**Design decisions worth knowing**
- Every service talks only to the async DB facade — switching `DB_DRIVER` between
  `sqlite` and `mysql` requires **zero logic changes** (identical column layout).
- Money/status invariants live in **SQL triggers** (`backend/src/db/schema.js`),
  so every read path sees one consistent derivation of `paid / outstanding / status`.
- Responses always use the `{ success, data | error }` envelope; all handlers are
  async and route through a central error handler.

---

## 🚀 Getting started

### Prerequisites
- Node.js 18+
- Optional: Docker (for the MySQL production profile)

### 1. Backend

```bash
cd backend
npm install
npm start          # http://localhost:4000
```

On first boot it creates `backend/mira.db` (SQLite), applies the schema, and
seeds the full demo dataset. Delete the file to reset.

To run against MySQL instead:

```bash
docker compose up -d          # MySQL 8 with edunexus DB + user (see docker-compose.yml)
cp backend/.env.example backend/.env
# edit backend/.env: DB_DRIVER=mysql
cd backend && npm start
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api → :4000)
```

### 3. Sign in
Use any demo login from the table above. Quickest demo: sign in as
`org@rampex.demo / org123` and explore the dashboard, CRM pipeline, and finance.

---

## 🎬 Hero demo flow (2 min)

Create Lead → QUALIFIED → Convert to Customer → Create Batch → Enroll Student →
Attendance → Create Invoice → Record Payment → Dashboard + Customer 360 update.

Verified end-to-end: invoice math (subtotal + 18% tax − discount), outstanding
calculation, payment status transitions, overpayment rejection, Customer 360
aggregation, and collection risk scoring.

---

## 📚 API overview

Base URL: `http://localhost:4000/api` — all responses use
`{ success: true, data }` or `{ success: false, error }`.
Role scope is sent via headers: `x-role`, `x-customer`, `x-trainer`, `x-student`.

| Area | Endpoints |
|---|---|
| Auth | `POST /login`, `GET /users` (org) |
| Dashboard | `GET /dashboard` (scope-aware) |
| Leads (org) | `GET/POST /leads`, `GET/PATCH /leads/:id`, `POST /leads/:id/followups`, `POST /leads/:id/convert` |
| Customers | `GET /customers`, `GET /customers/:id` (Customer 360) |
| Training | `GET/POST /programs`, `GET/POST /trainers`, `GET/POST /batches`, `GET/POST /students`, `POST /enrollments`, `GET/POST /attendance` |
| Learning | `GET/POST /sessions`, `/materials`, `/interests`, `/assessments`, `/scores`, `GET /students/:id/report`, `GET /reports/top-students` |
| Finance | `GET/POST /quotations`, `GET/POST /invoices`, `GET /invoices/:id`, `GET/POST /payments`, `GET/POST /expenses`, `POST /quotations/:id/convert-invoice`, `GET /trainer-finance` |
| Showcase | `POST /public/enquire`, `GET /public/verify/:code`, `GET/POST /certificates`, `GET /collections`, `GET /reports/trend`, `GET /activity` |

---

## 🗄️ Data model

Normalized relational entities (see `Project docx/db-prd.md`):

```text
users · leads · lead_followups · customers
programs · trainers · batches · students · enrollments · attendance
quotations · quotation_items · invoices · invoice_items · payments · expenses
sessions · materials · interests · assessments · scores · certificates
```

```text
Rampex (organization)
  └── Institution (customer: college, or Rampex Direct for individuals)
        └── Program / Batch (trainer = Rampex staff)
              └── Enrollment (student of that institution)
                    └── Training → Invoice → Payment
```

---

## ⚙️ Configuration (backend/.env)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API port |
| `DB_DRIVER` | `sqlite` | `sqlite` (dev) or `mysql` (prod) |
| `DB_FILE` | `./mira.db` | SQLite file path |
| `MYSQL_HOST` / `MYSQL_PORT` | `127.0.0.1` / `3306` | MySQL connection |
| `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | `edunexus` | MySQL credentials |
| `DEFAULT_TAX_RATE` | `18` | Invoice tax % |
| `NODE_ENV` | `development` | — |

---

## 📁 Project documents

Full product specs live in [`Project docx/`](Project%20docx/):

- [`master-prd.md`](Project%20docx/master-prd.md) — product definition, roles, scope, business rules
- [`db-prd.md`](Project%20docx/db-prd.md) — database blueprint & porting notes
- [`userflow.md`](Project%20docx/userflow.md) — end-to-end user flows (FLOW A…Z)
- [`uiux.md`](Project%20docx/uiux.md) — UI/UX guidelines

---

## 📄 License

MIT — see [LICENSE](LICENSE).
