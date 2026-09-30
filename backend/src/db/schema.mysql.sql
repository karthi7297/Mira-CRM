-- ============================================================================
-- EduNexus — MySQL 8 schema (db-prd.md blueprint, production target)
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
