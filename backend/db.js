const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'mira.db'));
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

function init() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, role TEXT NOT NULL,
    linked_type TEXT, linked_id TEXT
  );
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, organization TEXT NOT NULL, contact_person TEXT NOT NULL,
    email TEXT, phone TEXT, requirement TEXT, program TEXT,
    expected_students INTEGER DEFAULT 0, expected_value REAL DEFAULT 0,
    source TEXT, owner TEXT, status TEXT DEFAULT 'NEW',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS lead_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    date TEXT, method TEXT, notes TEXT, next_action TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_person TEXT,
    email TEXT, phone TEXT, type TEXT DEFAULT 'Enterprise',
    lead_id TEXT REFERENCES leads(id), created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS trainers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, expertise TEXT, email TEXT, phone TEXT
  );
  CREATE TABLE IF NOT EXISTS programs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, duration TEXT, description TEXT, fee_per_student REAL DEFAULT 5000
  );
  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY, program_id TEXT REFERENCES programs(id),
    customer_id TEXT REFERENCES customers(id), trainer_id TEXT REFERENCES trainers(id),
    start_date TEXT, end_date TEXT, capacity INTEGER DEFAULT 50, status TEXT DEFAULT 'ACTIVE'
  );
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, customer_id TEXT REFERENCES customers(id)
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
    batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE, enrolled_at TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, batch_id)
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
    batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
    date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PRESENT','ABSENT','LATE')),
    UNIQUE(student_id, batch_id, date)
  );
  CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id),
    program TEXT, subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, tax REAL DEFAULT 0,
    total REAL DEFAULT 0, status TEXT DEFAULT 'DRAFT', created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, quotation_id TEXT REFERENCES quotations(id) ON DELETE CASCADE,
    description TEXT, qty INTEGER DEFAULT 1, rate REAL DEFAULT 0, amount REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id),
    quotation_id TEXT REFERENCES quotations(id), program TEXT,
    subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, tax REAL DEFAULT 0,
    total REAL DEFAULT 0, paid REAL DEFAULT 0, outstanding REAL DEFAULT 0,
    status TEXT DEFAULT 'UNPAID', due_date TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT, qty INTEGER DEFAULT 1, rate REAL DEFAULT 0, amount REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, invoice_id TEXT REFERENCES invoices(id),
    customer_id TEXT, amount REAL NOT NULL, method TEXT, date TEXT,
    reference TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, date TEXT, category TEXT, vendor TEXT,
    description TEXT, amount REAL DEFAULT 0, trainer_id TEXT REFERENCES trainers(id),
    status TEXT DEFAULT 'APPROVED', created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    date TEXT, start_time TEXT, end_time TEXT, location TEXT, topic TEXT
  );
  CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY, program_id TEXT, batch_id TEXT,
    title TEXT NOT NULL, mat_type TEXT DEFAULT 'NOTE', url TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    body TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    title TEXT NOT NULL, max_score REAL DEFAULT 100, assessed_on TEXT
  );
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score REAL NOT NULL, UNIQUE(assessment_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY, certificate_no TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    attendance_pct INTEGER DEFAULT 0, avg_score REAL,
    issued_on TEXT DEFAULT (datetime('now'))
  );
  `);

  const hasUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (hasUsers === 0) seed();
}

function nid(prefix, table) {
  const row = db.prepare(`SELECT COUNT(*) c FROM ${table}`).get();
  return `${prefix}-${String(row.c + 1).padStart(3, '0')}`;
}

function seed() {
  // ---- Role model: Rampex (organization) > institutions (customers, incl. Rampex Direct) > trainers (Rampex staff) > students (of an institution)
  const u = db.prepare('INSERT INTO users (id,name,email,password,role,linked_type,linked_id) VALUES (?,?,?,?,?,?,?)');
  u.run('U-001', 'Rampex Admin', 'org@rampex.demo', 'org123', 'organization', null, null);
  u.run('U-002', 'ABC College Office', 'abc@college.edu', 'abc123', 'institution', 'customer', 'CUST-001');
  u.run('U-003', 'Rampex Direct Office', 'direct@rampex.demo', 'direct123', 'institution', 'customer', 'CUST-003');
  u.run('U-004', 'Arun Kumar', 'trainer@rampex.demo', 'trainer123', 'trainer', 'trainer', 'TR-001');
  u.run('U-005', 'Arun V', 'arun@student.edu', 'arun123', 'student', 'student', 'STU-001');

  db.prepare("INSERT INTO trainers (id,name,expertise,email,phone) VALUES ('TR-001','Arun Kumar','AI/ML','arun@mira.demo','98400-11111')").run();
  db.prepare("INSERT INTO trainers (id,name,expertise,email,phone) VALUES ('TR-002','Divya Rao','Full Stack','divya@mira.demo','98400-22222')").run();

  db.prepare("INSERT INTO programs (id,name,duration,description,fee_per_student) VALUES ('PROG-001','AI & Machine Learning','8 weeks','Python, ML, GenAI foundations',5000)").run();
  db.prepare("INSERT INTO programs (id,name,duration,description,fee_per_student) VALUES ('PROG-002','Full Stack Development','12 weeks','MERN + deployment',4500)").run();
  db.prepare("INSERT INTO programs (id,name,duration,description,fee_per_student) VALUES ('PROG-003','Python for Data Science','6 weeks','Pandas, viz, intro ML',4000)").run();

  const L = db.prepare('INSERT INTO leads (id,organization,contact_person,email,phone,requirement,program,expected_students,expected_value,source,owner,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  L.run('LEAD-001', 'ABC College', 'Dr. Meena', 'meena@abccollege.edu', '98410-12345', 'AI/ML training for 3rd year', 'AI & Machine Learning', 100, 500000, 'Referral', 'Sales Exec', 'QUALIFIED');
  L.run('LEAD-002', 'XYZ Institute', 'Ravi Shankar', 'ravi@xyz.edu', '98410-54321', 'Full stack bootcamp', 'Full Stack Development', 60, 270000, 'Website', 'Sales Exec', 'CONTACTED');
  L.run('LEAD-003', 'DEF College', 'Prof. Anita', 'anita@def.edu', '98410-99999', 'Python data science elective', 'Python for Data Science', 40, 160000, 'Event', 'Sales Exec', 'NEW');
  L.run('LEAD-004', 'GHI University', 'Dean Kumar', 'dean@ghi.edu', '98410-77777', 'Campus-wide AI program', 'AI & Machine Learning', 200, 1000000, 'LinkedIn', 'Sales Exec', 'PROPOSAL');

  db.prepare("INSERT INTO lead_followups (lead_id,date,method,notes,next_action) VALUES ('LEAD-001','2026-09-28','Call','Called contact, requirement qualified','Send quotation')").run();
  db.prepare("INSERT INTO lead_followups (lead_id,date,method,notes,next_action) VALUES ('LEAD-001','2026-09-29','Visit','Campus visit done, met principal','Convert to customer')").run();
  db.prepare("INSERT INTO lead_followups (lead_id,date,method,notes,next_action) VALUES ('LEAD-002','2026-09-29','Email','Sent brochure','Follow up call')").run();

  const C = db.prepare('INSERT INTO customers (id,name,contact_person,email,phone,type,lead_id) VALUES (?,?,?,?,?,?,?)');
  C.run('CUST-001', 'ABC College', 'Dr. Meena', 'meena@abccollege.edu', '98410-12345', 'Enterprise', 'LEAD-001');
  C.run('CUST-002', 'XYZ Institute', 'Ravi Shankar', 'ravi@xyz.edu', '98410-54321', 'SMB', 'LEAD-002');
  // Rampex itself acts as an institution for individual (D2C) learners
  C.run('CUST-003', 'Rampex Direct', 'Admissions Desk', 'admissions@rampex.demo', '98410-00000', 'Direct', null);
  db.prepare("UPDATE leads SET status='CONVERTED' WHERE id='LEAD-001'").run();

  db.prepare("INSERT INTO batches (id,program_id,customer_id,trainer_id,start_date,end_date,capacity,status) VALUES ('AIML-2026-01','PROG-001','CUST-001','TR-001','2026-10-01','2026-11-30',100,'ACTIVE')").run();
  db.prepare("INSERT INTO batches (id,program_id,customer_id,trainer_id,start_date,end_date,capacity,status) VALUES ('WEB-2026-02','PROG-002','CUST-002','TR-002','2026-10-05','2026-12-30',60,'ACTIVE')").run();
  // D2C weekend batch under Rampex Direct (individual learners), taught by Rampex trainer
  db.prepare("INSERT INTO batches (id,program_id,customer_id,trainer_id,start_date,end_date,capacity,status) VALUES ('RDX-2026-01','PROG-003','CUST-003','TR-002','2026-10-11','2026-11-22',30,'ACTIVE')").run();

  const S = db.prepare('INSERT INTO students (id,name,email,phone,customer_id) VALUES (?,?,?,?,?)');
  const E = db.prepare('INSERT OR IGNORE INTO enrollments (student_id,batch_id) VALUES (?,?)');
  const names = ['Arun V', 'Priya S', 'Rahul K', 'Kavin M', 'Deepa R', 'Sathvee S'];
  names.forEach((n, i) => {
    const sid = `STU-00${i + 1}`;
    S.run(sid, n, `${n.split(' ')[0].toLowerCase()}@student.edu`, `98400-0000${i}`, 'CUST-001');
    E.run(sid, 'AIML-2026-01');
  });

  const A = db.prepare('INSERT OR IGNORE INTO attendance (student_id,batch_id,date,status) VALUES (?,?,?,?)');
  ['STU-001', 'STU-002', 'STU-004', 'STU-005', 'STU-006'].forEach(s => A.run(s, 'AIML-2026-01', '2026-09-30', 'PRESENT'));
  A.run('STU-003', 'AIML-2026-01', '2026-09-30', 'ABSENT');
  // Individual learners under Rampex Direct
  S.run('STU-007', 'Ishaan P', 'ishaan@student.edu', '98400-00007', 'CUST-003');
  S.run('STU-008', 'Sara T', 'sara@student.edu', '98400-00008', 'CUST-003');
  E.run('STU-007', 'RDX-2026-01');
  E.run('STU-008', 'RDX-2026-01');
  A.run('STU-007', 'RDX-2026-01', '2026-09-30', 'PRESENT');
  A.run('STU-008', 'RDX-2026-01', '2026-09-30', 'LATE');

  db.prepare("INSERT INTO quotations (id,customer_id,program,subtotal,discount,tax,total,status) VALUES ('QUO-001','CUST-001','AI/ML Training',500000,20000,86400,566400,'ACCEPTED')").run();
  db.prepare("INSERT INTO quotation_items (quotation_id,description,qty,rate,amount) VALUES ('QUO-001','AI/ML Training (100 students)',100,5000,500000)").run();

  db.prepare("INSERT INTO invoices (id,customer_id,quotation_id,program,subtotal,discount,tax,total,paid,outstanding,status,due_date) VALUES ('INV-001','CUST-001','QUO-001','AI/ML Training',500000,20000,86400,566400,200000,366400,'PARTIALLY_PAID','2026-10-30')").run();
  db.prepare("INSERT INTO invoice_items (invoice_id,description,qty,rate,amount) VALUES ('INV-001','AI/ML Training (100 students)',100,5000,500000)").run();
  db.prepare("INSERT INTO invoices (id,customer_id,program,subtotal,discount,tax,total,paid,outstanding,status,due_date) VALUES ('INV-002','CUST-002','Full Stack Bootcamp',270000,0,48600,318600,0,318600,'UNPAID','2026-11-05')").run();

  db.prepare("INSERT INTO payments (id,invoice_id,customer_id,amount,method,date,reference,notes) VALUES ('PAY-001','INV-001','CUST-001',200000,'Bank Transfer','2026-09-28','NEFT-88231','Advance')").run();

  const X = db.prepare('INSERT INTO expenses (id,date,category,vendor,description,amount,trainer_id,status) VALUES (?,?,?,?,?,?,?,?)');
  X.run('EXP-001', '2026-09-25', 'Trainer', 'Arun Kumar', 'Trainer payout - Sep', 80000, 'TR-001', 'PAID');
  X.run('EXP-002', '2026-09-26', 'Venue', 'City Hall', 'Lab rental', 35000, null, 'PAID');
  X.run('EXP-003', '2026-09-27', 'Materials', 'PrintWell', 'Workbooks', 12000, null, 'PAID');
  const XE = db.prepare('INSERT INTO expenses (id,date,category,vendor,description,amount,trainer_id,status) VALUES (?,?,?,?,?,?,?,?)');
  XE.run('EXP-004', '2026-09-28', 'Trainer', 'Arun Kumar', 'Payout AIML-2026-01 (40%)', 40000, 'TR-001', 'PAID');
  XE.run('EXP-005', '2026-09-29', 'Accommodation', 'Grand Stay', 'Trainer stay - Oct batch', 15000, 'TR-001', 'PENDING');

  // Sessions = schedule with location + timing
  const SE = db.prepare('INSERT INTO sessions (batch_id,date,start_time,end_time,location,topic) VALUES (?,?,?,?,?,?)');
  SE.run('AIML-2026-01', '2026-10-03', '10:00', '13:00', 'ABC Campus Lab 2', 'Python functions');
  SE.run('AIML-2026-01', '2026-10-05', '10:00', '13:00', 'ABC Campus Lab 2', 'ML basics');
  SE.run('AIML-2026-01', '2026-10-07', '14:00', '17:00', 'Online (Meet)', 'Model evaluation');
  SE.run('RDX-2026-01', '2026-10-11', '09:00', '12:00', 'Rampex Center Hall A', 'Pandas kickoff');

  // Assessments + scores (drive performance, weak areas, top students)
  db.prepare("INSERT INTO assessments (id,batch_id,title,max_score,assessed_on) VALUES ('ASM-001','AIML-2026-01','Python functions',100,'2026-09-27')").run();
  db.prepare("INSERT INTO assessments (id,batch_id,title,max_score,assessed_on) VALUES ('ASM-002','AIML-2026-01','ML basics',100,'2026-09-29')").run();
  const SC = db.prepare('INSERT OR IGNORE INTO scores (assessment_id,student_id,score) VALUES (?,?,?)');
  const scoreSeed = { 'STU-001': [92, 88], 'STU-002': [78, 85], 'STU-003': [45, 52], 'STU-004': [88, 91], 'STU-005': [70, 66], 'STU-006': [95, 93] };
  Object.entries(scoreSeed).forEach(([sid, [a, b]]) => { SC.run('ASM-001', sid, a); SC.run('ASM-002', sid, b); });

  // Study material
  const M = db.prepare('INSERT INTO materials (id,program_id,batch_id,title,mat_type,url,notes) VALUES (?,?,?,?,?,?,?)');
  M.run('MAT-001', 'PROG-001', 'AIML-2026-01', 'Python functions cheat-sheet', 'DOC', '', 'Closures, decorators, generators');
  M.run('MAT-002', 'PROG-001', 'AIML-2026-01', 'ML basics video', 'VIDEO', 'https://example.edu/ml-basics', 'Week 2 recording');

  // Student interests (trainers + org only)
  const IN = db.prepare('INSERT INTO interests (student_id,body) VALUES (?,?)');
  IN.run('STU-001', 'Want advanced GenAI projects after this batch');
  IN.run('STU-003', 'Struggling with statistics; need extra help');
}

module.exports = { db, init, nid };
