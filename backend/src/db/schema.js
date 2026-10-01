/**
 * Mira dev schema — the db-prd.md blueprint ported to SQLite (db-prd §9):
 *   - surrogate INTEGER pks (auto-increment), business codes in TEXT `id` (unique)
 *   - enum → TEXT + CHECK
 *   - links per db-prd §0 scope rule:
 *       users.customer_id → customers(id)   [INSTITUTION logins only]
 *       trainers.user_id  → users(id)       [TRAINER = Rampex staff]
 *       enrollments.student_id → users(id)  [STUDENT logins]
 * Phase-2 tables (proposals, agreements, payment_schedules, payment_allocations,
 * receipts) are intentionally NOT created in dev — db-prd §8.
 */
function apply(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_key      INTEGER PRIMARY KEY AUTOINCREMENT,
    id            TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    phone         TEXT,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('ORGANIZATION','INSTITUTION','TRAINER','STUDENT')),
    customer_id   TEXT REFERENCES customers(id),
    status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT
  );

  -- ================= CRM (ORGANIZATION only) =================
  CREATE TABLE IF NOT EXISTS leads (
    lead_key          INTEGER PRIMARY KEY AUTOINCREMENT,
    id                TEXT NOT NULL UNIQUE,
    assigned_to       TEXT REFERENCES users(id),
    lead_type         TEXT NOT NULL DEFAULT 'INSTITUTION' CHECK (lead_type IN ('INSTITUTION','DIRECT')),
    organization      TEXT NOT NULL,
    contact_person    TEXT NOT NULL,
    email             TEXT,
    phone             TEXT,
    requirement       TEXT,
    program           TEXT,
    expected_students INTEGER NOT NULL DEFAULT 0,
    expected_value    REAL NOT NULL DEFAULT 0,
    source            TEXT,
    owner             TEXT,
    status            TEXT NOT NULL DEFAULT 'NEW'
                      CHECK (status IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','CONVERTED','LOST','CLOSED')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT
  );

  CREATE TABLE IF NOT EXISTS lead_followups (
    followup_key INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id      TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    date         TEXT,
    method       TEXT NOT NULL DEFAULT 'Call',
    notes        TEXT,
    next_action  TEXT,
    created_by   TEXT REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    customer_key    INTEGER PRIMARY KEY AUTOINCREMENT,
    id              TEXT NOT NULL UNIQUE,
    lead_id         TEXT UNIQUE REFERENCES leads(id),
    name            TEXT NOT NULL,
    contact_person  TEXT,
    email           TEXT,
    phone           TEXT,
    type            TEXT NOT NULL DEFAULT 'Enterprise' CHECK (type IN ('Enterprise','SMB','Direct')),
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ================= TRAINING =================
  CREATE TABLE IF NOT EXISTS trainers (
    trainer_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    user_id     TEXT UNIQUE REFERENCES users(id),
    name        TEXT NOT NULL,
    expertise   TEXT,
    email       TEXT,
    phone       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS programs (
    program_key     INTEGER PRIMARY KEY AUTOINCREMENT,
    id              TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    duration        TEXT,
    description     TEXT,
    fee_per_student REAL NOT NULL DEFAULT 5000,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS batches (
    batch_key   INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    program_id  TEXT NOT NULL REFERENCES programs(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    trainer_id  TEXT REFERENCES trainers(id),
    start_date  TEXT,
    end_date    TEXT,
    capacity    INTEGER NOT NULL DEFAULT 50,
    status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PLANNED','ACTIVE','COMPLETED','CANCELLED')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS students (
    student_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    user_id     TEXT UNIQUE REFERENCES users(id),
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_key INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id     TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id       TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    enrolled_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (student_id, batch_id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    attendance_key INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id     TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id       TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    date           TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE')),
    marked_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (student_id, batch_id, date)
  );

  -- ================= FINANCE =================
  CREATE TABLE IF NOT EXISTS quotations (
    quotation_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id            TEXT NOT NULL UNIQUE,
    customer_id   TEXT NOT NULL REFERENCES customers(id),
    program       TEXT,
    subtotal      REAL NOT NULL DEFAULT 0,
    discount      REAL NOT NULL DEFAULT 0,
    tax           REAL NOT NULL DEFAULT 0,
    total         REAL NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotation_items (
    item_key     INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    description  TEXT,
    qty          INTEGER NOT NULL DEFAULT 1,
    rate         REAL NOT NULL DEFAULT 0,
    amount       REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS invoices (
    invoice_key  INTEGER PRIMARY KEY AUTOINCREMENT,
    id           TEXT NOT NULL UNIQUE,
    customer_id  TEXT NOT NULL REFERENCES customers(id),
    quotation_id TEXT REFERENCES quotations(id),
    program      TEXT,
    subtotal     REAL NOT NULL DEFAULT 0,
    discount     REAL NOT NULL DEFAULT 0,
    tax          REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL DEFAULT 0,
    paid         REAL NOT NULL DEFAULT 0,
    outstanding  REAL NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PARTIALLY_PAID','PAID','OVERDUE')),
    due_date     TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    item_key    INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT,
    qty         INTEGER NOT NULL DEFAULT 1,
    rate        REAL NOT NULL DEFAULT 0,
    amount      REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS payments (
    payment_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    invoice_id  TEXT NOT NULL REFERENCES invoices(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    amount      REAL NOT NULL CHECK (amount > 0),
    method      TEXT NOT NULL DEFAULT 'Bank Transfer',
    date        TEXT,
    reference   TEXT,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    expense_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    date        TEXT,
    category    TEXT NOT NULL DEFAULT 'Other'
                CHECK (category IN ('Trainer','Venue','Travel','Accommodation','Materials','Marketing','Operations','Other')),
    vendor      TEXT,
    description TEXT,
    amount      REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
    trainer_id  TEXT REFERENCES trainers(id),
    status      TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING','APPROVED','REJECTED','PAID')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ================= LEARNING SUPPORT (db-prd §3b) =================
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id    TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    date        TEXT,
    start_time  TEXT,
    end_time    TEXT,
    location    TEXT,
    topic       TEXT
  );

  CREATE TABLE IF NOT EXISTS materials (
    material_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id           TEXT NOT NULL UNIQUE,
    program_id   TEXT REFERENCES programs(id),
    batch_id     TEXT REFERENCES batches(id),
    title        TEXT NOT NULL,
    mat_type     TEXT NOT NULL DEFAULT 'NOTE' CHECK (mat_type IN ('VIDEO','DOC','LINK','NOTE')),
    url          TEXT,
    notes        TEXT,
    created_by   TEXT REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS interests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assessments (
    assessment_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id             TEXT NOT NULL UNIQUE,
    batch_id       TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    max_score      REAL NOT NULL DEFAULT 100,
    assessed_on    TEXT,
    created_by     TEXT REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scores (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score         REAL NOT NULL,
    marked_at     TEXT,
    UNIQUE (assessment_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS certificates (
    certificate_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id              TEXT NOT NULL UNIQUE,
    certificate_no  TEXT UNIQUE NOT NULL,
    student_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id        TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    attendance_pct  INTEGER DEFAULT 0,
    avg_score       REAL,
    issued_on       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ============ OUTREACH / COLD MAIL (ORGANIZATION only) ============
  -- Automated lead generation: reusable templates, throttled campaigns, a send
  -- queue with follow-up steps, open tracking, and a suppression list. The
  -- suppression list and unsubscribe footer are not optional extras — Gmail
  -- will suspend an account that keeps mailing people who opted out.

  CREATE TABLE IF NOT EXISTS email_templates (
    template_key INTEGER PRIMARY KEY AUTOINCREMENT,
    id           TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT 'COLD_OUTREACH'
                 CHECK (category IN ('COLD_OUTREACH','FOLLOW_UP','NURTURE','RE_ENGAGE')),
    subject      TEXT NOT NULL,
    body         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    campaign_key   INTEGER PRIMARY KEY AUTOINCREMENT,
    id             TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    template_id    TEXT NOT NULL REFERENCES email_templates(id),
    -- Optional second template for follow-up steps. Null -> follow-ups reuse
    -- template_id with a "Re:" subject, which is what most outreach tools do.
    followup_template_id TEXT REFERENCES email_templates(id),
    status         TEXT NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','RUNNING','PAUSED','COMPLETED')),
    from_name      TEXT,
    daily_limit    INTEGER NOT NULL DEFAULT 40,
    window_start   INTEGER NOT NULL DEFAULT 10,
    window_end     INTEGER NOT NULL DEFAULT 18,
    follow_up_days TEXT NOT NULL DEFAULT '[0,3,7]',
    max_followups  INTEGER NOT NULL DEFAULT 2,
    created_by     TEXT REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS campaign_recipients (
    recipient_key   INTEGER PRIMARY KEY AUTOINCREMENT,
    id              TEXT NOT NULL UNIQUE,
    campaign_id     TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id         TEXT REFERENCES leads(id),
    email           TEXT NOT NULL,
    name            TEXT,
    organization    TEXT,
    step            INTEGER NOT NULL DEFAULT 0,
    scheduled_at    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'QUEUED'
                    CHECK (status IN ('QUEUED','SENDING','SENT','FAILED','SKIPPED','UNSUBSCRIBED','BOUNCED','REPLIED')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    sent_at         TEXT,
    last_error      TEXT,
    message_id      TEXT,
    open_token      TEXT UNIQUE,
    open_count      INTEGER NOT NULL DEFAULT 0,
    first_opened_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_events (
    event_key    INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id TEXT REFERENCES campaign_recipients(id) ON DELETE CASCADE,
    campaign_id  TEXT,
    type         TEXT NOT NULL,
    detail       TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS suppressions (
    email      TEXT PRIMARY KEY,
    reason     TEXT NOT NULL DEFAULT 'UNSUBSCRIBED',
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS automation_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_recipients_due
    ON campaign_recipients (status, scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_recipients_campaign
    ON campaign_recipients (campaign_id, status);
  CREATE INDEX IF NOT EXISTS idx_events_recipient
    ON email_events (recipient_id);

  -- ============ Invoice status bookkeeping (master-prd §8) ============
  -- Recompute paid / outstanding / status whenever money or due dates move,
  -- so every read path sees one consistent derivation.
  CREATE TRIGGER IF NOT EXISTS trg_payments_after_insert
  AFTER INSERT ON payments
  BEGIN
    UPDATE invoices
       SET paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = NEW.invoice_id),
           status = CASE
             WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = NEW.invoice_id) >= total THEN 'PAID'
             WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = NEW.invoice_id) > 0 THEN 'PARTIALLY_PAID'
             ELSE 'UNPAID' END
     WHERE id = NEW.invoice_id;
    UPDATE invoices
       SET outstanding = MAX(0, total - paid)
     WHERE id = NEW.invoice_id;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_payments_after_delete
  AFTER DELETE ON payments
  BEGIN
    UPDATE invoices
       SET paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = OLD.invoice_id),
           outstanding = MAX(0, total - (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = OLD.invoice_id)),
           status = CASE
             WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = OLD.invoice_id) >= total THEN 'PAID'
             WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = OLD.invoice_id) > 0 THEN 'PARTIALLY_PAID'
             ELSE 'UNPAID' END
     WHERE id = OLD.invoice_id;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_invoices_after_update_refresh_status
  AFTER UPDATE OF due_date, total ON invoices
  WHEN NEW.status <> 'PAID'
  BEGIN
    UPDATE invoices
       SET status = CASE
         WHEN NEW.due_date IS NOT NULL AND NEW.due_date <> '' AND date('now') > NEW.due_date THEN 'OVERDUE'
         WHEN NEW.paid >= NEW.total THEN 'PAID'
         WHEN NEW.paid > 0 THEN 'PARTIALLY_PAID'
         ELSE 'UNPAID' END
     WHERE id = NEW.id;
  END;
  `);
}

module.exports = { apply };
