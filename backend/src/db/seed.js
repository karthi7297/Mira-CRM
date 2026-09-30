const { apply: applySqliteSchema } = require('./schema');
const mysqlDdl = require('fs').readFileSync(require('path').join(__dirname, 'schema.mysql.sql'), 'utf8');
const { nid } = require('../utils/ids');
const { docTotals } = require('../utils/money');
const { hashPassword } = require('../utils/password');

/**
 * Seed — db-prd §7 demo story, one async implementation for both dialects:
 *   Rampex (ORGANIZATION) · ABC College + XYZ Institute + Rampex Direct
 *   · 2 Rampex trainers · 6 college + 2 D2C students, enrollments + attendance
 *   · QUO-001 → INV-001 (PARTIALLY_PAID via PAY-001) · INV-002 (UNPAID) · 3 expenses
 * Demo logins (userflow.md FLOW A):
 *   org@rampex.demo/org123 · abc@college.edu/abc123 · direct@rampex.demo/direct123
 *   trainer@rampex.demo/trainer123 · arun@student.edu/arun123
 * Frontend-contract constants (hardcoded in Training.jsx): batch AIML-2026-01, date 2026-09-30.
 */

const insertUser = `INSERT INTO users (id,name,email,phone,password_hash,role,customer_id) VALUES (?,?,?,?,?,?,?)`;
const insertTrainer = `INSERT INTO trainers (id,user_id,name,expertise,email,phone) VALUES (?,?,?,?,?,?)`;
const insertProgram = `INSERT INTO programs (id,name,duration,description,fee_per_student) VALUES (?,?,?,?,?)`;
const insertLead = `INSERT INTO leads (id,assigned_to,lead_type,organization,contact_person,email,phone,requirement,program,
                    expected_students,expected_value,source,owner,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const insertFollowup = `INSERT INTO lead_followups (lead_id,date,method,notes,next_action,created_by) VALUES (?,?,?,?,?,?)`;
const insertCustomer = `INSERT INTO customers (id,lead_id,name,contact_person,email,phone,type) VALUES (?,?,?,?,?,?,?)`;
const insertBatch = `INSERT INTO batches (id,program_id,customer_id,trainer_id,start_date,end_date,capacity,status) VALUES (?,?,?,?,?,?,?,?)`;
const insertStudent = `INSERT INTO students (id,user_id,name,email,phone,customer_id) VALUES (?,?,?,?,?,?)`;
const insertEnrollment = `INSERT INTO enrollments (student_id,batch_id) VALUES (?,?)`;
const insertAttendance = `INSERT INTO attendance (student_id,batch_id,date,status) VALUES (?,?,?,?)`;
const insertPayment = `INSERT INTO payments (id,invoice_id,customer_id,amount,method,date,reference,notes) VALUES (?,?,?,?,?,?,?,?)`;
const insertExpense = `INSERT INTO expenses (id,date,category,vendor,description,amount,trainer_id,status) VALUES (?,?,?,?,?,?,?,?)`;

/** Persist a quotation/invoice with items; totals per master-prd §8. */
async function insertDocument(db, table, { id, customer_id, program, items, discount = 0, status }) {
  const { lines, subtotal, discount: disc, tax, total } = docTotals(items, { discount_amount: discount });
  await db.run(
    `INSERT INTO ${table} (id,customer_id,program,subtotal,discount,tax,total,status) VALUES (?,?,?,?,?,?,?,?)`,
    [id, customer_id, program || null, subtotal, disc, tax, total, status]
  );
  // Schema names the child tables in the singular: quotation_items / invoice_items.
  const singular = table === 'quotations' ? 'quotation' : 'invoice';
  const stmt = `INSERT INTO ${singular}_items (${singular}_id,description,qty,rate,amount) VALUES (?,?,?,?,?)`;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await db.run(stmt, [id, it.description || 'Training', it.qty || 1, it.rate || 0, lines[i]]);
  }
}

/** Apply the dialect's DDL (idempotent). */
async function applySchema(db) {
  if (db.driver === 'mysql') {
    // Split on statement-ending semicolons that are not inside CHECK(...) etc.
    // The schema file keeps one statement per block, so a simple split is safe.
    const statements = mysqlDdl
      .split(/;\s*\n/)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    for (const stmt of statements) await db.exec(stmt);
  } else {
    applySqliteSchema(db);
  }
}

async function seedDemoData(db) {
  // Circular FK chain: leads.assigned_to → users(id), users.customer_id → customers(id),
  // customers.lead_id → leads(id). No single ordering satisfies all three, so insert the
  // users first with a NULL customer_id, then back-fill once the customers exist.
  const USERS = {
    org: ['U-001', 'Rampex Admin', 'org@rampex.demo', null, 'org123', 'ORGANIZATION', null],
    abc: ['U-002', 'ABC College Office', 'abc@college.edu', null, 'abc123', 'INSTITUTION', 'CUST-001'],
    direct: ['U-003', 'Rampex Direct Office', 'direct@rampex.demo', null, 'direct123', 'INSTITUTION', 'CUST-003'],
    trainer: ['U-004', 'Arun Kumar', 'trainer@rampex.demo', null, 'trainer123', 'TRAINER', null],
    student: ['U-005', 'Arun V', 'arun@student.edu', null, 'arun123', 'STUDENT', null],
  };
  for (const [id, name, email, phone, pw, role] of Object.values(USERS)) {
    await db.run(insertUser, [id, name, email, phone, hashPassword(pw), role, null]);
  }

  // Leads + follow-ups (assigned_to → users, which now exist)
  const lStmt = [
    ['LEAD-001', 'U-001', 'INSTITUTION', 'ABC College', 'Dr. Meena', 'meena@abccollege.edu',
      '98410-12345', 'AI/ML training for 3rd year', 'AI & Machine Learning', 100, 500000, 'Referral', 'Sales Exec', 'QUALIFIED'],
    ['LEAD-002', 'U-001', 'INSTITUTION', 'XYZ Institute', 'Ravi Shankar', 'ravi@xyz.edu',
      '98410-54321', 'Full stack bootcamp', 'Full Stack Development', 60, 270000, 'Website', 'Sales Exec', 'CONTACTED'],
    ['LEAD-003', 'U-001', 'INSTITUTION', 'DEF College', 'Prof. Anita', 'anita@def.edu',
      '98410-99999', 'Python data science elective', 'Python for Data Science', 40, 160000, 'Event', 'Sales Exec', 'NEW'],
    ['LEAD-004', 'U-001', 'INSTITUTION', 'GHI University', 'Dean Kumar', 'dean@ghi.edu',
      '98410-77777', 'Campus-wide AI program', 'AI & Machine Learning', 200, 1000000, 'LinkedIn', 'Sales Exec', 'PROPOSAL'],
    ['LEAD-005', 'U-001', 'DIRECT', 'Rampex Direct Learners', 'Admissions Desk', 'admissions@rampex.demo',
      '98410-00000', 'Individual learner pipeline (D2C)', 'Python for Data Science', 30, 120000, 'Website', 'Sales Exec', 'CONTACTED'],
  ];
  for (const row of lStmt) await db.run(insertLead, row);

  const fStmt = [
    ['LEAD-001', '2026-09-28', 'Call', 'Called contact, requirement qualified', 'Send quotation', 'U-001'],
    ['LEAD-001', '2026-09-29', 'Visit', 'Campus visit done, met principal', 'Convert to customer', 'U-001'],
    ['LEAD-002', '2026-09-29', 'Email', 'Sent brochure', 'Follow-up call', 'U-001'],
  ];
  for (const row of fStmt) await db.run(insertFollowup, row);

  // Conversion (FLOW E): originating lead preserved on the customer, lead marked CONVERTED
  await db.run(insertCustomer, ['CUST-001', 'LEAD-001', 'ABC College', 'Dr. Meena', 'meena@abccollege.edu', '98410-12345', 'Enterprise']);
  await db.run(insertCustomer, ['CUST-002', 'LEAD-002', 'XYZ Institute', 'Ravi Shankar', 'ravi@xyz.edu', '98410-54321', 'SMB']);
  await db.run(insertCustomer, ['CUST-003', null, 'Rampex Direct', 'Admissions Desk', 'admissions@rampex.demo', '98410-00000', 'Direct']);
  await db.run(`UPDATE leads SET status='CONVERTED' WHERE id IN ('LEAD-001','LEAD-002')`);

  // Customers exist now — link the institution logins to their college (db-prd §1)
  await db.run(`UPDATE users SET customer_id = 'CUST-001' WHERE id = 'U-002'`);
  await db.run(`UPDATE users SET customer_id = 'CUST-003' WHERE id = 'U-003'`);

  // Rampex staff trainers; TR-001 linked to the trainer login (db-prd §3)
  await db.run(insertTrainer, ['TR-001', 'U-004', 'Arun Kumar', 'AI/ML', 'arun@rampex.demo', '98400-11111']);
  await db.run(insertTrainer, ['TR-002', null, 'Divya Rao', 'Full Stack', 'divya@rampex.demo', '98400-22222']);

  await db.run(insertProgram, ['PROG-001', 'AI & Machine Learning', '8 weeks', 'Python, ML, GenAI foundations', 5000]);
  await db.run(insertProgram, ['PROG-002', 'Full Stack Development', '12 weeks', 'MERN + deployment', 4500]);
  await db.run(insertProgram, ['PROG-003', 'Python for Data Science', '6 weeks', 'Pandas, viz, intro ML', 4000]);

  const bStmt = [
    ['AIML-2026-01', 'PROG-001', 'CUST-001', 'TR-001', '2026-10-01', '2026-11-30', 100, 'ACTIVE'],
    ['WEB-2026-02', 'PROG-002', 'CUST-002', 'TR-002', '2026-10-05', '2026-12-30', 60, 'ACTIVE'],
    ['RDX-2026-01', 'PROG-003', 'CUST-003', 'TR-002', '2026-10-11', '2026-11-22', 30, 'ACTIVE'],
  ];
  for (const row of bStmt) await db.run(insertBatch, row);

  const sStmt = [];
  ['Arun V', 'Priya S', 'Rahul K', 'Kavin M', 'Deepa R', 'Sathvee S'].forEach((name, i) => {
    const sid = `STU-00${i + 1}`;
    const uid = sid === 'STU-001' ? 'U-005' : null; // student login ↔ STU-001
    sStmt.push([sid, uid, name, `${name.split(' ')[0].toLowerCase()}@student.edu`, `98400-0000${i + 1}`, 'CUST-001']);
  });
  sStmt.push(['STU-007', null, 'Ishaan P', 'ishaan@student.edu', '98400-00007', 'CUST-003']);
  sStmt.push(['STU-008', null, 'Sara T', 'sara@student.edu', '98400-00008', 'CUST-003']);
  for (const row of sStmt) await db.run(insertStudent, row);

  const eStmt = [
    ...['STU-001', 'STU-002', 'STU-003', 'STU-004', 'STU-005', 'STU-006'].map((sid) => [sid, 'AIML-2026-01']),
    ['STU-007', 'RDX-2026-01'],
    ['STU-008', 'RDX-2026-01'],
  ];
  for (const row of eStmt) await db.run(insertEnrollment, row);

  const aStmt = [
    ...['STU-001', 'STU-002', 'STU-004', 'STU-005', 'STU-006'].map((sid) => [sid, 'AIML-2026-01', '2026-09-30', 'PRESENT']),
    ['STU-003', 'AIML-2026-01', '2026-09-30', 'ABSENT'],
    ['STU-007', 'RDX-2026-01', '2026-09-30', 'PRESENT'],
    ['STU-008', 'RDX-2026-01', '2026-09-30', 'LATE'],
  ];
  for (const row of aStmt) await db.run(insertAttendance, row);

  // Finance story: quotation accepted → invoice partially paid → invoice unpaid
  await insertDocument(db, 'quotations', {
    id: 'QUO-001', customer_id: 'CUST-001', program: 'AI/ML Training',
    items: [{ description: 'AI/ML Training (100 students)', qty: 100, rate: 5000 }],
    discount: 20000, status: 'ACCEPTED',
  });
  await insertDocument(db, 'invoices', {
    id: 'INV-001', customer_id: 'CUST-001', program: 'AI/ML Training',
    items: [{ description: 'AI/ML Training (100 students)', qty: 100, rate: 5000 }],
    discount: 20000, status: 'UNPAID',
  });
  await db.run('UPDATE invoices SET quotation_id=? WHERE id=?', ['QUO-001', 'INV-001']);
  await insertDocument(db, 'invoices', {
    id: 'INV-002', customer_id: 'CUST-002', program: 'Full Stack Bootcamp',
    items: [{ description: 'Full Stack Bootcamp (60 students)', qty: 60, rate: 4500 }],
    status: 'UNPAID',
  });
  await db.run(insertPayment, ['PAY-001', 'INV-001', 'CUST-001', 200000, 'Bank Transfer', '2026-09-28', 'NEFT-88231', 'Advance']);

  const xStmt = [
    ['EXP-001', '2026-09-25', 'Trainer', 'Arun Kumar', 'Trainer payout - Sep', 80000, 'TR-001', 'PAID'],
    ['EXP-002', '2026-09-26', 'Venue', 'City Hall', 'Lab rental', 35000, null, 'PAID'],
    ['EXP-003', '2026-09-27', 'Materials', 'PrintWell', 'Workbooks', 12000, null, 'PAID'],
    ['EXP-004', '2026-09-28', 'Trainer', 'Arun Kumar', 'Payout AIML-2026-01 (40%)', 40000, 'TR-001', 'PAID'],
    ['EXP-005', '2026-09-29', 'Accommodation', 'Grand Stay', 'Trainer stay - Oct batch', 15000, 'TR-001', 'PENDING'],
  ];
  for (const row of xStmt) await db.run(insertExpense, row);

  // Sessions = schedule with location + timing (SQLite: sessions.id is the rowid alias)
  const seStmt = [
    ['AIML-2026-01', '2026-10-03', '10:00', '13:00', 'ABC Campus Lab 2', 'Python functions'],
    ['AIML-2026-01', '2026-10-05', '10:00', '13:00', 'ABC Campus Lab 2', 'ML basics'],
    ['AIML-2026-01', '2026-10-07', '14:00', '17:00', 'Online (Meet)', 'Model evaluation'],
    ['RDX-2026-01', '2026-10-11', '09:00', '12:00', 'Rampex Center Hall A', 'Pandas kickoff'],
  ];
  for (const [batch_id, date, start_time, end_time, location, topic] of seStmt) {
    await db.run(
      'INSERT INTO sessions (batch_id,date,start_time,end_time,location,topic) VALUES (?,?,?,?,?,?)',
      [batch_id, date, start_time, end_time, location, topic]
    );
  }

  // Assessments + scores (drive performance, weak areas, top students)
  await db.run('INSERT INTO assessments (id,batch_id,title,max_score,assessed_on) VALUES (?,?,?,?,?)',
    ['ASM-001', 'AIML-2026-01', 'Python functions', 100, '2026-09-27']);
  await db.run('INSERT INTO assessments (id,batch_id,title,max_score,assessed_on) VALUES (?,?,?,?,?)',
    ['ASM-002', 'AIML-2026-01', 'ML basics', 100, '2026-09-29']);
  const scoreSeed = {
    'STU-001': [92, 88], 'STU-002': [78, 85], 'STU-003': [45, 52],
    'STU-004': [88, 91], 'STU-005': [70, 66], 'STU-006': [95, 93],
  };
  for (const [sid, [a, b]] of Object.entries(scoreSeed)) {
    await db.run('INSERT INTO scores (assessment_id,student_id,score) VALUES (?,?,?)', ['ASM-001', sid, a]);
    await db.run('INSERT INTO scores (assessment_id,student_id,score) VALUES (?,?,?)', ['ASM-002', sid, b]);
  }

  // Study material
  await db.run('INSERT INTO materials (id,program_id,batch_id,title,mat_type,url,notes) VALUES (?,?,?,?,?,?,?)',
    ['MAT-001', 'PROG-001', 'AIML-2026-01', 'Python functions cheat-sheet', 'DOC', '', 'Closures, decorators, generators']);
  await db.run('INSERT INTO materials (id,program_id,batch_id,title,mat_type,url,notes) VALUES (?,?,?,?,?,?,?)',
    ['MAT-002', 'PROG-001', 'AIML-2026-01', 'ML basics video', 'VIDEO', 'https://example.edu/ml-basics', 'Week 2 recording']);

  // Student interests (trainers + org only)
  await db.run('INSERT INTO interests (student_id,body) VALUES (?,?)', ['STU-001', 'Want advanced GenAI projects after this batch']);
  await db.run('INSERT INTO interests (student_id,body) VALUES (?,?)', ['STU-003', 'Struggling with statistics; need extra help']);
}

/** Wipe all rows but keep schema — used by reseed scripts/tests. */
async function clearDb(db) {
  const tables = [
    'scores', 'assessments', 'interests', 'materials', 'sessions',
    'payments', 'invoice_items', 'invoices', 'quotation_items', 'quotations',
    'expenses', 'attendance', 'enrollments', 'students', 'batches',
    'programs', 'trainers', 'customers', 'lead_followups', 'leads', 'users',
  ];
  for (const t of tables) await db.exec(`DELETE FROM ${t}`);
}

/** Boot: apply schema, seed demo rows when empty. */
async function initialize(db) {
  await applySchema(db);
  const c = await db.count('SELECT COUNT(*) FROM users');
  if (c === 0) {
    await db.transaction((tx) => seedDemoData(tx));
    console.log(`[db] seeded demo data (db-prd §7) on ${db.driver}`);
  }
}

module.exports = { initialize, seedDemoData, clearDb, insertDocument };
