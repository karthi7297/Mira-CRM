-- ============================================================================
-- Mira — MySQL 8 schema (db-prd.md blueprint, production target)
--
-- Mirrors backend/src/db/schema.js (the SQLite dev port) column-for-column:
--   - surrogate BIGINT AUTO_INCREMENT pks + unique VARCHAR business codes (`id`)
--   - enum → VARCHAR + CHECK (MySQL 8.0.16+ enforces CHECK constraints)
--   - DECIMAL(12,2) money (SQLite REAL maps to this on the MySQL side)
--   - same FK behaviour; Phase-2 tables (proposals, agreements, payment
--     schedules/allocations, receipts) intentionally absent — db-prd §8
-- Applied automatically on boot when DB_DRIVER=mysql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_key      BIGINT PRIMARY KEY AUTO_INCREMENT,
  id            VARCHAR(50)  NOT NULL UNIQUE,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  phone         VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('ORGANIZATION','INSTITUTION','TRAINER','STUDENT')),
  customer_id   VARCHAR(50),
  status        VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED')),
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME,
  CONSTRAINT fk_users_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leads (
  lead_key          BIGINT PRIMARY KEY AUTO_INCREMENT,
  id                VARCHAR(50)  NOT NULL UNIQUE,
  assigned_to       VARCHAR(50),
  lead_type         VARCHAR(12)  NOT NULL DEFAULT 'INSTITUTION' CHECK (lead_type IN ('INSTITUTION','DIRECT')),
  organization      VARCHAR(200) NOT NULL,
  contact_person    VARCHAR(150) NOT NULL,
  email             VARCHAR(150),
  phone             VARCHAR(20),
  requirement       TEXT,
  program           VARCHAR(200),
  expected_students INT          NOT NULL DEFAULT 0,
  expected_value    DECIMAL(12,2) NOT NULL DEFAULT 0,
  source            VARCHAR(100),
  owner             VARCHAR(100),
  status            VARCHAR(12)  NOT NULL DEFAULT 'NEW'
                    CHECK (status IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','CONVERTED','LOST','CLOSED')),
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME,
  CONSTRAINT fk_leads_assignee FOREIGN KEY (assigned_to) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_followups (
  followup_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  lead_id      VARCHAR(50) NOT NULL,
  date         DATE,
  method       VARCHAR(30) NOT NULL DEFAULT 'Call',
  notes        TEXT,
  next_action  VARCHAR(200),
  created_by   VARCHAR(50),
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_followups_lead   FOREIGN KEY (lead_id)    REFERENCES leads (id) ON DELETE CASCADE,
  CONSTRAINT fk_followups_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  customer_key   BIGINT PRIMARY KEY AUTO_INCREMENT,
  id             VARCHAR(50)  NOT NULL UNIQUE,
  lead_id        VARCHAR(50) UNIQUE,
  name           VARCHAR(150) NOT NULL,
  contact_person VARCHAR(150),
  email          VARCHAR(150),
  phone          VARCHAR(20),
  type           VARCHAR(12)  NOT NULL DEFAULT 'Enterprise' CHECK (type IN ('Enterprise','SMB','Direct')),
  status         VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customers_lead FOREIGN KEY (lead_id) REFERENCES leads (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trainers (
  trainer_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id          VARCHAR(50)  NOT NULL UNIQUE,
  user_id     VARCHAR(50) UNIQUE,
  name        VARCHAR(150) NOT NULL,
  expertise   VARCHAR(200),
  email       VARCHAR(150),
  phone       VARCHAR(20),
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trainers_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS programs (
  program_key     BIGINT PRIMARY KEY AUTO_INCREMENT,
  id              VARCHAR(50)  NOT NULL UNIQUE,
  name            VARCHAR(200) NOT NULL,
  duration        VARCHAR(50),
  description     TEXT,
  fee_per_student DECIMAL(12,2) NOT NULL DEFAULT 5000,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS batches (
  batch_key   BIGINT PRIMARY KEY AUTO_INCREMENT,
  id          VARCHAR(50) NOT NULL UNIQUE,
  program_id  VARCHAR(50) NOT NULL,
  customer_id VARCHAR(50) NOT NULL,
  trainer_id  VARCHAR(50),
  start_date  DATE,
  end_date    DATE,
  capacity    INT         NOT NULL DEFAULT 50,
  status      VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PLANNED','ACTIVE','COMPLETED','CANCELLED')),
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batches_program   FOREIGN KEY (program_id)  REFERENCES programs (id),
  CONSTRAINT fk_batches_customer  FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_batches_trainer   FOREIGN KEY (trainer_id)  REFERENCES trainers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  student_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id          VARCHAR(50)  NOT NULL UNIQUE,
  user_id     VARCHAR(50) UNIQUE,
  name        VARCHAR(150) NOT NULL,
  email       VARCHAR(150),
  phone       VARCHAR(20),
  customer_id VARCHAR(50) NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_students_user     FOREIGN KEY (user_id)     REFERENCES users (id),
  CONSTRAINT fk_students_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS enrollments (
  enrollment_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id     VARCHAR(50) NOT NULL,
  batch_id       VARCHAR(50) NOT NULL,
  enrolled_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment (student_id, batch_id),
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_batch   FOREIGN KEY (batch_id)   REFERENCES batches (id)  ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  attendance_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id     VARCHAR(50) NOT NULL,
  batch_id       VARCHAR(50) NOT NULL,
  date           DATE        NOT NULL,
  status         VARCHAR(10) NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE')),
  marked_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance (student_id, batch_id, date),
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_batch   FOREIGN KEY (batch_id)   REFERENCES batches (id)  ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotations (
  quotation_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id            VARCHAR(50) NOT NULL UNIQUE,
  customer_id   VARCHAR(50) NOT NULL,
  program       VARCHAR(200),
  subtotal      DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax           DECIMAL(12,2) NOT NULL DEFAULT 0,
  total         DECIMAL(12,2) NOT NULL DEFAULT 0,
  status        VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quotations_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotation_items (
  item_key     BIGINT PRIMARY KEY AUTO_INCREMENT,
  quotation_id VARCHAR(50) NOT NULL,
  description  VARCHAR(255),
  qty          INT          NOT NULL DEFAULT 1,
  rate         DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_quote_items_quote FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
  invoice_key  BIGINT PRIMARY KEY AUTO_INCREMENT,
  id           VARCHAR(50) NOT NULL UNIQUE,
  customer_id  VARCHAR(50) NOT NULL,
  quotation_id VARCHAR(50),
  program      VARCHAR(200),
  subtotal     DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount     DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax          DECIMAL(12,2) NOT NULL DEFAULT 0,
  total        DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid         DECIMAL(12,2) NOT NULL DEFAULT 0,
  outstanding  DECIMAL(12,2) NOT NULL DEFAULT 0,
  status       VARCHAR(16) NOT NULL DEFAULT 'UNPAID'
               CHECK (status IN ('UNPAID','PARTIALLY_PAID','PAID','OVERDUE')),
  due_date     DATE,
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoices_customer  FOREIGN KEY (customer_id)  REFERENCES customers (id),
  CONSTRAINT fk_invoices_quotation FOREIGN KEY (quotation_id) REFERENCES quotations (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_items (
  item_key   BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_id VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  qty        INT          NOT NULL DEFAULT 1,
  rate       DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  payment_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id          VARCHAR(50) NOT NULL UNIQUE,
  invoice_id  VARCHAR(50) NOT NULL,
  customer_id VARCHAR(50) NOT NULL,
  amount      DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  method      VARCHAR(30) NOT NULL DEFAULT 'Bank Transfer',
  date        DATE,
  reference   VARCHAR(100),
  notes       VARCHAR(255),
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_invoice  FOREIGN KEY (invoice_id)  REFERENCES invoices (id),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expenses (
  expense_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id          VARCHAR(50) NOT NULL UNIQUE,
  date        DATE,
  category    VARCHAR(20) NOT NULL DEFAULT 'Other'
              CHECK (category IN ('Trainer','Venue','Travel','Accommodation','Materials','Marketing','Operations','Other')),
  vendor      VARCHAR(200),
  description TEXT,
  amount      DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  trainer_id  VARCHAR(50),
  status      VARCHAR(10) NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING','APPROVED','REJECTED','PAID')),
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_expenses_trainer FOREIGN KEY (trainer_id) REFERENCES trainers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  session_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id          BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  batch_id    VARCHAR(50) NOT NULL,
  date        DATE,
  start_time  VARCHAR(10),
  end_time    VARCHAR(10),
  location    VARCHAR(255),
  topic       VARCHAR(200),
  CONSTRAINT fk_sessions_batch FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS materials (
  material_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id           VARCHAR(50) NOT NULL UNIQUE,
  program_id   VARCHAR(50),
  batch_id     VARCHAR(50),
  title        VARCHAR(200) NOT NULL,
  mat_type     VARCHAR(6) NOT NULL DEFAULT 'NOTE' CHECK (mat_type IN ('VIDEO','DOC','LINK','NOTE')),
  url          VARCHAR(500),
  notes        TEXT,
  created_by   VARCHAR(50),
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_materials_program FOREIGN KEY (program_id) REFERENCES programs (id),
  CONSTRAINT fk_materials_batch   FOREIGN KEY (batch_id)   REFERENCES batches (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS interests (
  interest_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id           BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  student_id   VARCHAR(50) NOT NULL,
  body         TEXT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_interests_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assessments (
  assessment_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id             VARCHAR(50) NOT NULL UNIQUE,
  batch_id       VARCHAR(50) NOT NULL,
  title          VARCHAR(200) NOT NULL,
  max_score      DECIMAL(6,2) NOT NULL DEFAULT 100,
  assessed_on    DATE,
  created_by     VARCHAR(50),
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessments_batch FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scores (
  score_key     BIGINT PRIMARY KEY AUTO_INCREMENT,
  id            BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  assessment_id VARCHAR(50) NOT NULL,
  student_id    VARCHAR(50) NOT NULL,
  score         DECIMAL(6,2) NOT NULL,
  marked_at     DATETIME,
  UNIQUE KEY uq_score (assessment_id, student_id),
  CONSTRAINT fk_scores_assessment FOREIGN KEY (assessment_id) REFERENCES assessments (id) ON DELETE CASCADE,
  CONSTRAINT fk_scores_student    FOREIGN KEY (student_id)    REFERENCES students (id)    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS certificates (
  certificate_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id              VARCHAR(50)  NOT NULL UNIQUE,
  certificate_no  VARCHAR(50)  NOT NULL UNIQUE,
  student_id      VARCHAR(50)  NOT NULL,
  batch_id        VARCHAR(50)  NOT NULL,
  attendance_pct  INT          NOT NULL DEFAULT 0,
  avg_score       DECIMAL(6,2),
  issued_on       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificates_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_certificates_batch   FOREIGN KEY (batch_id)   REFERENCES batches (id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- OUTREACH / COLD MAIL (ORGANIZATION only)
-- Mirrors schema.js. The suppression list and unsubscribe footer are required
-- for deliverability, not optional — Gmail suspends accounts that keep mailing
-- recipients who opted out.
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
  template_key BIGINT PRIMARY KEY AUTO_INCREMENT,
  id           VARCHAR(50)  NOT NULL UNIQUE,
  name         VARCHAR(160) NOT NULL,
  category     VARCHAR(30)  NOT NULL DEFAULT 'COLD_OUTREACH',
  subject      VARCHAR(255) NOT NULL,
  body         MEDIUMTEXT   NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaigns (
  campaign_key   BIGINT PRIMARY KEY AUTO_INCREMENT,
  id             VARCHAR(50)  NOT NULL UNIQUE,
  name           VARCHAR(160) NOT NULL,
  template_id    VARCHAR(50)  NOT NULL,
  followup_template_id VARCHAR(50),
  status         VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
  from_name      VARCHAR(120),
  daily_limit    INT          NOT NULL DEFAULT 40,
  window_start   INT          NOT NULL DEFAULT 10,
  window_end     INT          NOT NULL DEFAULT 18,
  follow_up_days VARCHAR(120) NOT NULL DEFAULT '[0,3,7]',
  max_followups  INT          NOT NULL DEFAULT 2,
  created_by     VARCHAR(50),
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME,
  CONSTRAINT fk_campaigns_template FOREIGN KEY (template_id) REFERENCES email_templates (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_recipients (
  recipient_key   BIGINT PRIMARY KEY AUTO_INCREMENT,
  id              VARCHAR(50)  NOT NULL UNIQUE,
  campaign_id     VARCHAR(50)  NOT NULL,
  lead_id         VARCHAR(50),
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(160),
  organization    VARCHAR(200),
  step            INT          NOT NULL DEFAULT 0,
  scheduled_at    DATETIME     NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'QUEUED',
  attempts        INT          NOT NULL DEFAULT 0,
  sent_at         DATETIME,
  last_error      TEXT,
  message_id      VARCHAR(255),
  open_token      VARCHAR(64) UNIQUE,
  open_count      INT          NOT NULL DEFAULT 0,
  first_opened_at DATETIME,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_recipients_due (status, scheduled_at),
  KEY idx_recipients_campaign (campaign_id, status),
  CONSTRAINT fk_recipients_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_events (
  event_key    BIGINT PRIMARY KEY AUTO_INCREMENT,
  recipient_id VARCHAR(50),
  campaign_id  VARCHAR(50),
  type         VARCHAR(20) NOT NULL,
  detail       TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_events_recipient (recipient_id),
  CONSTRAINT fk_events_recipient FOREIGN KEY (recipient_id) REFERENCES campaign_recipients (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppressions (
  email      VARCHAR(255) PRIMARY KEY,
  reason     VARCHAR(30)  NOT NULL DEFAULT 'UNSUBSCRIBED',
  detail     TEXT,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS automation_settings (
  `key`  VARCHAR(60) PRIMARY KEY,
  value  TEXT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_tickets (
  ticket_key   INT AUTO_INCREMENT PRIMARY KEY,
  id           VARCHAR(24) NOT NULL UNIQUE,
  kind         VARCHAR(16) NOT NULL DEFAULT 'SUPPORT',
  category     VARCHAR(60),
  subject      VARCHAR(200) NOT NULL,
  body         TEXT,
  priority     VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  status       VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  created_by   VARCHAR(24),
  created_role VARCHAR(16),
  customer_id  VARCHAR(24),
  batch_id     VARCHAR(24),
  response     TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS announcements (
  announcement_key INT AUTO_INCREMENT PRIMARY KEY,
  id               VARCHAR(24) NOT NULL UNIQUE,
  title            VARCHAR(200) NOT NULL,
  body             TEXT,
  audience         VARCHAR(16) NOT NULL DEFAULT 'ALL',
  customer_id      VARCHAR(24),
  batch_id         VARCHAR(24),
  created_by       VARCHAR(24),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_contacts (
  contact_key  INT AUTO_INCREMENT PRIMARY KEY,
  id           VARCHAR(24) NOT NULL UNIQUE,
  customer_id  VARCHAR(24) NOT NULL,
  name         VARCHAR(160) NOT NULL,
  title        VARCHAR(120),
  email        VARCHAR(160),
  phone        VARCHAR(40),
  is_primary   TINYINT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contacts_customer (customer_id)
) ENGINE=InnoDB;

-- Notifications (audit B4 / F7): actionable in-app inbox read by the topbar bell.
CREATE TABLE IF NOT EXISTS notifications (
  notification_key INT AUTO_INCREMENT PRIMARY KEY,
  id               VARCHAR(24) NOT NULL UNIQUE,
  audience_user    VARCHAR(24),
  audience_role    VARCHAR(16),
  kind             VARCHAR(16) NOT NULL DEFAULT 'INFO',
  title            VARCHAR(200) NOT NULL,
  body             TEXT,
  link             VARCHAR(200),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_role (audience_role, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id VARCHAR(24) NOT NULL,
  user_id         VARCHAR(24) NOT NULL,
  read_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id)
) ENGINE=InnoDB;

-- ================= Feedback (forms → responses → sentiment) =================
-- Mirrors backend/src/db/schema.js column-for-column.
--   audience STUDENT     → students answer, the form's owner reads
--   audience INSTITUTION → institutions/Rampex answer, Rampex reads all
-- Visibility lives in services/feedback.service.js, never in the client:
--   organization → all forms + all responses
--   institution  → only its own forms and their responses
--   student      → STUDENT forms addressed to it, plus its own submissions
CREATE TABLE IF NOT EXISTS feedback_forms (
  form_key        INT AUTO_INCREMENT PRIMARY KEY,
  id              VARCHAR(24) NOT NULL UNIQUE,
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  audience        VARCHAR(16) NOT NULL DEFAULT 'STUDENT',
  created_by_role VARCHAR(16) NOT NULL,
  created_by      VARCHAR(24),
  customer_id     VARCHAR(24),
  status          VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME,
  CONSTRAINT chk_feedback_forms_audience CHECK (audience IN ('STUDENT','INSTITUTION')),
  CONSTRAINT chk_feedback_forms_creator  CHECK (created_by_role IN ('ORGANIZATION','INSTITUTION','TRAINER')),
  CONSTRAINT chk_feedback_forms_status   CHECK (status IN ('OPEN','CLOSED')),
  INDEX idx_feedback_forms_owner (created_by_role, customer_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS feedback_questions (
  question_key INT AUTO_INCREMENT PRIMARY KEY,
  id           VARCHAR(24) NOT NULL UNIQUE,
  form_id      VARCHAR(24) NOT NULL,
  text         VARCHAR(400) NOT NULL,
  qtype        VARCHAR(16) NOT NULL DEFAULT 'RATING',
  options      TEXT,
  order_index  INT NOT NULL DEFAULT 0,
  CONSTRAINT chk_feedback_questions_type CHECK (qtype IN ('RATING','TEXT','CHOICE')),
  INDEX idx_feedback_questions_form (form_id, order_index)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS feedback_responses (
  response_key    INT AUTO_INCREMENT PRIMARY KEY,
  id              VARCHAR(24) NOT NULL UNIQUE,
  form_id         VARCHAR(24) NOT NULL,
  submitted_by    VARCHAR(24),
  submitted_role  VARCHAR(16),
  student_id      VARCHAR(24),
  customer_id     VARCHAR(24),
  sentiment       VARCHAR(16),
  sentiment_score DECIMAL(5,4),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_feedback_responses_sentiment CHECK (sentiment IN ('POSITIVE','NEUTRAL','NEGATIVE')),
  UNIQUE KEY uq_feedback_one_per_user (form_id, submitted_by),
  INDEX idx_feedback_responses_form (form_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS feedback_answers (
  answer_key      INT AUTO_INCREMENT PRIMARY KEY,
  response_id     VARCHAR(24) NOT NULL,
  question_id     VARCHAR(24) NOT NULL,
  value           TEXT,
  rating          INT,
  sentiment       VARCHAR(16),
  sentiment_score DECIMAL(5,4),
  CONSTRAINT chk_feedback_answers_sentiment CHECK (sentiment IN ('POSITIVE','NEUTRAL','NEGATIVE')),
  UNIQUE KEY uq_feedback_answer (response_id, question_id)
) ENGINE=InnoDB;
