# Mira — One Platform. Every EduTech Operation Connected.
## Pitch Deck Content (Markdown → PPT Source)

> How to use this file: each `Slide` below = one PPT slide.
> Copy into your PPT generator (Gamma / Tome / PowerPoint Copilot / Marp).
> `Visual:` = what to put on the slide. `Notes:` = what to say.

---

## Slide 1 — Title

**Mira — One Platform. Every EduTech Operation Connected.**
CRM + Training Delivery + Finance in a single workspace

- Tagline: *Rampex operates, institutions consume.*
- Stack: React 18 + Vite · Node.js + Express · SQLite (dev) / MySQL 8 (prod)
- Demo logins ready (org / institution / trainer / student)

**Visual:** Dark hero with lifecycle strip:
`ENQUIRY → LEAD → FOLLOW-UP → CONVERSION → CUSTOMER → PROGRAM → BATCH → STUDENTS → ATTENDANCE → QUOTATION → INVOICE → PAYMENT → DASHBOARD`

**Notes:** One customer, traceable from first enquiry to final payment. That traceability is the whole pitch.

---

## Slide 2 — Agenda

1. The problem with existing CRMs
2. What Mira is (and is not)
3. End-to-end lifecycle demo
4. Role-based access: the 4-role model
5. Key features by module
6. Extra innovations (beyond a standard CRM)
7. Impact & business outcomes
8. Architecture & engineering choices
9. Roadmap

---

## Slide 3 — Problems With Existing CRMs (Why Mira Exists)

**Generic CRMs (Salesforce, HubSpot, Zoho, spreadsheets) fail EduTech operators on 8 counts:**

| # | Problem in existing CRMs | Pain it causes |
|---|---|---|
| 1 | **Sales disconnected from delivery** — lead closes, then training happens in another tool / Excel | Re-entry, lost context, no traceability |
| 2 | **No education objects** — no programs, batches, enrollments, sessions, attendance, assessments | Teams hack it with custom fields that break |
| 3 | **Finance disconnected from training** — quotations/invoices don't know which batch/student they bill | Wrong bills, manual reconciliation |
| 4 | **No single customer view** — lead history, batches, invoices, payments live in 4 places | Manager cannot answer "how is ABC College doing?" |
| 5 | **Weak multi-party roles** — one login type; colleges, trainers, students all see the same thing (or nothing) | Data leaks, or everyone works over email |
| 6 | **Money math in the UI, not the database** — totals drift between screens | `total ≠ subtotal + tax − discount`, overpayments accepted |
| 7 | **Collections are manual** — no ranked follow-up list | Cash stuck in overdue invoices |
| 8 | **No trust layer** — certificates are PDFs anyone can forge; enquiries arrive by phone/DM and never enter the pipeline | Lost leads, unverifiable credentials |

**Visual:** Left = fragmented tools (4 disconnected boxes with red X between them). Right = Mira single pipeline.

**Notes:** Every EduTech team we looked at runs sales in one tool, attendance in sheets, billing in Tally. Mira replaces the glue work.

---

## Slide 4 — What Mira Is

**Mira is a full-stack EduTech operations platform, not just a lead tracker.**

```text
ENQUIRY → LEAD → FOLLOW-UP → CONVERSION → CUSTOMER / INSTITUTION
→ PROGRAM → BATCH → STUDENTS → TRAINING / ATTENDANCE
→ QUOTATION → INVOICE → PAYMENT → OUTSTANDING → MANAGEMENT DASHBOARD
```

- Data created once flows forward — no re-entry.
- A manager traces any customer: first enquiry → sales → conversion → training → attendance → invoice → payment → financial outcome.
- 4 logins, one backend, scope-enforced (`backend/src/middleware/scope.js`).

**What Mira is NOT:** not a full accounting suite, not payroll/HR, not a GST engine, not a mobile app, not microservices. Deliberately scoped to the operating lifecycle.

---

## Slide 5 — The 2-Minute Hero Demo

**"Here is one customer. Watch what happens throughout the organization."**

1. Public enquiry (`/enquire`) → auto-captured lead with AUTO badge
2. Lead `NEW → CONTACTED → QUALIFIED` → **1-click Convert** → `CUST-XXX` generated, `lead_id` preserved
3. Create Program → Create Batch (customer + trainer + dates + capacity)
4. Trainer enrolls student → marks attendance (`PRESENT / ABSENT / LATE`)
5. Create Quotation → **1-click Convert to Invoice** (line items carried over)
6. Record Payment → status flips `UNPAID → PARTIALLY_PAID → PAID`, overpayment rejected
7. Dashboard + **Customer 360** update live

**Visual:** Numbered flow with screenshots of Lead → Customer 360 → Invoice.

**Notes:** Run this live as `org@rampex.demo / org123`. It exercises every invariant: 18% tax math, outstanding calc, status transitions.

---

## Slide 6 — Role-Based Access (The Rampex 4-Role Model)

**"Rampex operates, institutions consume."** Enforced server-side — scope keys are nulled for roles that don't own them, so spoofed headers can't widen access.

| Role | Demo login | Scope | Can do |
|---|---|---|---|
| **Organization** (Rampex) | `org@rampex.demo / org123` | Everything, all institutions | Only role that creates/converts: leads, programs, batches, invoices, expenses. Student aggregates only |
| **Institution** (college / Rampex Direct) | `abc@college.edu / abc123` · `direct@rampex.demo / direct123` | Own `customer_id` | Own dashboard, batches, finance; view + pay invoices. No student management |
| **Trainer** (Rampex staff) | `trainer@rampex.demo / trainer123` | Assigned `trainer_id` batches | **Owns student management:** add students, attendance, assessments, per-student reports, own payouts |
| **Student** | `arun@student.edu / arun123` | Own `student_id` | My Learning: profile, attendance, scores + weak areas, materials, interests, fees & dues |

**Why this is unusual:** most CRMs have admin/user. Mira has 4 operationally distinct roles with different *levels of aggregation* (platform → college → batch → self).

**Visual:** Pyramid: Org (all) → Institution (one college) → Trainer (my batches) → Student (me).

---

## Slide 7 — Key Features: CRM Module

- Lead pipeline with enforced status flow: `NEW → CONTACTED → QUALIFIED → PROPOSAL → CONVERTED` (terminal: `LOST`, `CLOSED`)
- Search, filter, follow-up timeline (date, method, notes, next action)
- **1-click Lead → Customer conversion** (customer ID generated, originating `lead_id` preserved, lead marked `CONVERTED`, no duplicates)
- Auto-captured leads from public enquiry with AUTO badge + system follow-up entry
- Customer list + **Customer 360** (see Slide 10)

---

## Slide 8 — Key Features: Training Module

- Programs (name, duration, fee/student), Trainers (expertise, contact, batch assignment)
- Batches (program + customer + trainer + dates + capacity + status `PLANNED / ACTIVE / COMPLETED / CANCELLED`)
- Students + enrollments — **trainer-owned workflow** (org/institution get aggregates, never the enrol form)
- **Bulk student import** (CSV / Excel upload with preview)
- Session scheduling (date, time, location, topic)
- Attendance marking (`PRESENT | ABSENT | LATE`) per student/batch/date, batch % recalculated
- Assessments + scores, per-student report, **Top Students** report
- Trainer leave requests + org approval flow

---

## Slide 9 — Key Features: Finance Module

- Quotations with line items; **1-click Quotation → Invoice conversion**
- Invoice math enforced **in SQL triggers** (not just UI): `total = subtotal + tax − discount`, `outstanding = total − paid`
- Payment recording with **overpayment rejection**; status transitions `UNPAID → PARTIALLY_PAID → PAID` (+ `OVERDUE` by due date) — consistent on every read path
- Expenses with categories + trainer-linked payouts; trainer expense claims
- Printable receipts; per-invoice detail view
- Risk-ranked **Collections Queue** (see Innovations)

---

## Slide 10 — Signature Feature: Customer 360

**One screen answers: "How is this customer doing across sales, delivery, and money?"**

```text
ABC COLLEGE (CUST-001)
├── Lead origin (enquiry, follow-ups, conversion)
├── Training (programs, batches, attendance %, student count)
├── Finance (quotations, invoices, payments, outstanding)
└── Financial summary (revenue, collected, outstanding, net)
```

- Navigate customer → training → finance without manual search.
- Institution sees its own College 360; Org sees every institution + per-institution comparison table.
- Student roster inside 360 is **read-only** — the batch trainer owns the records.

**Visual:** Customer 360 screenshot with 3 tabs annotated.

---

## Slide 11 — Dashboards & Reports

- **Role-scoped dashboards:** org sees platform totals; institution sees own college; trainer sees my batches; student sees My Learning.
- KPI cards: leads, conversion rate, active batches, students, revenue, collected, outstanding, expenses, net.
- Revenue-vs-collection trend chart + live activity feed.
- CSV exports (students, finance), printable receipts & certificates.
- Institution insights: batch performance, top students of my college, per-student dues.
- Organization insights: per-institution table (students, batches, billed, collected, outstanding, attendance).

---

## Slide 12 — Extra Innovations (Beyond a Standard CRM) — Part 1

These are the slides that differentiate Mira from Zoho/Sheets. Each one is implemented, not a mockup.

### IN-1. Public Enquiry → Auto-Lead Capture (FLOW W)
- No-login `/enquire` form → lead created (`source = Website`, status `NEW`) + system follow-up logged.
- Zero-friction demand capture; hackathon demo starts here.

### IN-2. Risk-Ranked Collections Queue (FLOW X)
- Outstanding invoices ranked `HIGH / MEDIUM / LOW` by **explicit rules** (overdue days + ticket size + payment history), with reasons shown per row.
- Honestly rule-based — never claimed as ML. One click through to record payment.

### IN-3. Certificates + Public Verification (FLOW Y)
- Org issues certificates (`CERT-XXX`, code `RNX-YYYY-NNNN`) only when batch attendance ≥ 75% (else `422` with reason).
- Anyone verifies at `/verify` with no login. Printable certificate paper. Solves credential forgery.

### IN-4. ⌘K Command Palette (FLOW Z)
- `Ctrl/⌘K` anywhere → fuzzy search own-scope leads, colleges, batches, invoices → Enter jumps.
- Respects role scoping (same APIs, same 403s). Trainers alone see students in results.

---

## Slide 13 — Extra Innovations — Part 2

### IN-5. Cold-Mail Outreach Engine (built-in lead generation)
- Org-only module: **Templates → Campaigns → Audience → Throttled send queue**.
- Server-side scheduler (closing the browser never stops a campaign) with `DRAFT → RUNNING → PAUSED → COMPLETED` lifecycle.
- Deliverability hygiene: **suppression list**, 2-step unsubscribe (link scanners can't opt people out), open-tracking pixel, bounce/reply handling, send throttling + connection health check.
- Replaces Mailchimp-for-prospecting for early-stage teams.

### IN-6. Mira AI — Role-Scoped Read-Only Assistant
- Floating "Ask Mira AI" panel on every screen with role-shaped starter prompts.
- Client sends only the conversation; **scope resolves server-side** from auth headers — a student can never ask about another student's data.
- Read-only by design: answers from data your role can already see (leads, batches, attendance, dues, payouts).

### IN-7. Trainer-First Student Ownership + Leave & Payout Hubs
- Inverted vs. typical CRMs: the **trainer** (not back-office) owns the roster, attendance, assessments, per-student reports.
- Trainer leave applications + org approve/reject; trainer finance view (payouts + claims).

### IN-8. Engineering Innovations (invisible but load-bearing)
- Money/status invariants in **SQL triggers** — every read path agrees.
- Dialect-agnostic DB facade: `DB_DRIVER=sqlite|mysql` with zero logic changes; MySQL 8 DDL mirrors SQLite 1:1.
- Security posture: helmet headers, restricted CORS, 100 KB JSON cap, input sanitization + validation, tiered rate limits (global/auth/public/AI).

---

## Slide 14 — Mira vs. Typical CRMs (Comparison Table)

| Capability | Excel / Sheets | Generic CRM (Zoho/HubSpot) | **Mira** |
|---|---|---|---|
| Lead → customer conversion | Manual | Yes | **Yes, 1-click, `lead_id` preserved** |
| Programs / batches / enrollments | No | Custom-field hack | **Native objects** |
| Attendance + assessments | Sheets | No | **Native, trainer-owned** |
| Quotation → invoice 1-click | No | Add-on | **Native** |
| Money math guaranteed by DB | No | No | **SQL triggers** |
| Customer 360 (sales+delivery+finance) | No | Paid add-on | **Core screen** |
| Collections priority queue | No | No | **Rule-based, built-in** |
| Public enquiry auto-capture | Form only | Integration needed | **Built-in (FLOW W)** |
| Certificate issuance + verification | No | No | **Built-in (FLOW Y)** |
| Built-in cold-mail engine | No | Separate product | **Built-in** |
| Role-scoped AI assistant | No | $$$ tier | **Built-in, read-only** |
| 4 edu-specific roles, server-enforced | No | Admin/user | **Org/Institution/Trainer/Student** |
| Self-hostable, zero license cost | Free but fragile | Per-seat $ | **MIT, SQLite→MySQL** |

---

## Slide 15 — Impact & Business Outcomes

**Time & effort**
- Single entry, zero re-entry: enquiry typed once flows to lead → customer → batch → invoice.
- 1-click conversions (lead→customer, quotation→invoice) remove the two most error-prone copy-paste jobs.
- Bulk CSV/Excel import onboards whole batches in minutes; ⌘K kills menu-hunting.

**Revenue & cash**
- Public enquiry capture stops lead leakage (every website visitor becomes a tracked lead).
- Cold-mail engine creates pipeline without a separate prospecting tool.
- Collections queue focuses effort on HIGH-risk dues first → faster recovery, fewer write-offs.
- Overpayment rejection + trigger-guaranteed math → bills trusted on first send.

**Quality & trust**
- 75%-attendance certificate gate + public verification makes credentials checkable by employers.
- Per-student reports + weak-area detection improve training outcomes; top-students report feeds marketing.
- Role scoping means colleges see proof of delivery (attendance %, batch performance) without seeing other colleges' data.

**Governance**
- Every number reconciles: dashboard = sum of invoices − payments; activity feed audits who did what.
- Printable receipts, CSV exports, and certificate codes keep the system audit-friendly.

> Measure after rollout: lead→conversion %, enquiry capture count, days-to-collect, overdue %, attendance %, billing-error rate.

---

## Slide 16 — Architecture (One Slide, Technical Audience)

```text
React 18 + Vite (frontend/)  —  /api proxy → :4000
        ▼
Node.js + Express (backend/) — services → dialect-agnostic db facade
        ▼
SQLite (dev, zero-setup)  │  MySQL 8 (prod, docker-compose.yml)
```

- `backend/server.js`: boot driver → schema → seed → listen. First boot creates `mira.db` + demo dataset; delete file to reset.
- Responses always `{ success, data | error }`; all handlers async through a central error handler.
- Config via `backend/.env` (`PORT`, `DB_DRIVER`, `MYSQL_*`, `DEFAULT_TAX_RATE=18`).

**Visual:** 3-layer diagram + file-tree excerpt.

---

## Slide 17 — Roadmap (Credible Next Steps)

1. Payment-gateway & reminders (UPI/cards + WhatsApp/email dunning on the collections queue)
2. Timetable clash detection + trainer workload balancing
3. Fee-installment plans + automated receipts
4. Mobile-first attendance + parent/institution portal polish
5. Deeper Mira AI (anomaly alerts: "Batch B-104 attendance dropped 12%") — still scoped + read-only
6. GST-ready invoicing when moving beyond the 18% default

---

## Slide 18 — Closing

**Mira replaces 4 tools (lead tracker + attendance sheets + billing + mail tool) with one traceable pipeline.**

Live demo accounts:

| Email | Password | Role |
|---|---|---|
| `org@rampex.demo` | `org123` | Organization |
| `abc@college.edu` | `abc123` | Institution |
| `trainer@rampex.demo` | `trainer123` | Trainer |
| `arun@student.edu` | `arun123` | Student |

**One-line takeaway:** *From first enquiry to final payment — one platform, every EduTech operation connected.*

---

## Appendix A — Slide-to-Screenshot Map (for the deck builder)

| Slide | Screenshot to capture |
|---|---|
| 5 | `/enquire` form → Leads list with AUTO badge → Convert button → Customer 360 |
| 6 | Login screen + role sidebar for each of the 4 users |
| 10 | `Customers/:id` full page (lead + training + finance tabs) |
| 11 | Dashboard (org) + Reports trend + Activity feed |
| 12 | Collections queue, `/verify` page, ⌘K palette open |
| 13 | Cold-Mail Campaigns tab, Mira AI panel open, Trainer Finance |
| 16 | Architecture diagram (draw from the code block) |

## Appendix B — Claims Policy (keep the pitch honest)

- Collections ranking is **rule-based** (overdue days + amount + history) — do not call it ML/AI.
- Mira AI is **read-only Q&A over scoped data** — do not claim it takes actions.
- Demo numbers are seeded prototype data; money-math *rules* are production-grade (triggers), figures are illustrative.
