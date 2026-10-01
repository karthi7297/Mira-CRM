/**
 * Rich-seed — makes the demo database genuinely rich:
 *   30 students per institution (CUST-001/002/003 → 90 total)
 *   8 trainers (TR-001..TR-008, every field filled)
 *   every student enrolled + multi-day attendance + scores on every assessment
 *   sessions + assessments + materials for EVERY batch (WEB/RDX had none)
 *   follow-ups for every lead, interests, certificates, finance top-ups
 *   repairs every empty value found in audit (invoice due_dates, MAT-001 url)
 *
 * Idempotent — safe to run repeatedly; existing rows are left untouched.
 * Works through the dialect facade, so SQLite dev and MySQL prod share it.
 */
const { hashPassword } = require('../utils/password');

const DATES = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'];

// Deterministic pseudo-random in [min,max] from integer seeds — stable reruns.
const pick = (a, b, salt) => a + ((salt * 2654435761 % 1000 + 1000) % 1000 % (b - a + 1));

async function ensure(db, table, id, sql, params) {
  const row = await db.get(`SELECT id FROM ${table} WHERE id = ?`, [id]);
  if (!row) await db.run(sql, params);
}

async function richSeed(db) {
  console.log('[rich-seed] expanding demo data…');

  // ---------- 1. Trainers: 2 → 8 (TR-001/002 already exist) ----------
  const trainers = [
    ['U-006', 'TR-003', 'Karthik Nair', 'Data Science', 'karthik.n@rampex.demo', '98400-23333'],
    ['U-007', 'TR-004', 'Meera Krishnan', 'Cloud & DevOps', 'meera.k@rampex.demo', '98400-24444'],
    ['U-008', 'TR-005', 'Sanjay Verma', 'Cybersecurity', 'sanjay.v@rampex.demo', '98400-25555'],
    ['U-009', 'TR-006', 'Anitha Desai', 'UI/UX Design', 'anitha.d@rampex.demo', '98400-26666'],
    ['U-010', 'TR-007', 'Vikram Reddy', 'AI/ML', 'vikram.r@rampex.demo', '98400-27777'],
    ['U-011', 'TR-008', 'Nisha Pillai', 'Python & Data Science', 'nisha.p@rampex.demo', '98400-28888'],
  ];
  for (const [uid, tid, name, expertise, email, phone] of trainers) {
    await ensure(db, 'users', uid,
      'INSERT INTO users (id,name,email,phone,password_hash,role,customer_id) VALUES (?,?,?,?,?,?,?)',
      [uid, name, email, phone, hashPassword('trainer123'), 'TRAINER', null]);
    await ensure(db, 'trainers', tid,
      'INSERT INTO trainers (id,user_id,name,expertise,email,phone) VALUES (?,?,?,?,?,?)',
      [tid, uid, name, expertise, email, phone]);
  }

  // ---------- 2. Students: bring every institution to 30 ----------
  // STU-001..016 exist. New IDs STU-017..STU-090.
  const newStudents = [
    // ABC College (CUST-001): 20 more → 30 total
    ['Dinesh K', 'CUST-001', 'dinesh.k@abccollege.edu'], ['Harini P', 'CUST-001', 'harini.p@abccollege.edu'],
    ['Jeeva S', 'CUST-001', 'jeeva.s@abccollege.edu'], ['Kavya N', 'CUST-001', 'kavya.n@abccollege.edu'],
    ['Manoj T', 'CUST-001', 'manoj.t@abccollege.edu'], ['Nandini R', 'CUST-001', 'nandini.r@abccollege.edu'],
    ['Oviya J', 'CUST-001', 'oviya.j@abccollege.edu'], ['Pradeep L', 'CUST-001', 'pradeep.l@abccollege.edu'],
    ['Revathi M', 'CUST-001', 'revathi.m@abccollege.edu'], ['Sanjay G', 'CUST-001', 'sanjay.g@abccollege.edu'],
    ['Shalini V', 'CUST-001', 'shalini.v@abccollege.edu'], ['Tharun E', 'CUST-001', 'tharun.e@abccollege.edu'],
    ['Vaishali D', 'CUST-001', 'vaishali.d@abccollege.edu'], ['Viknesh B', 'CUST-001', 'viknesh.b@abccollege.edu'],
    ['Yamini F', 'CUST-001', 'yamini.f@abccollege.edu'], ['Aditya H', 'CUST-001', 'aditya.h@abccollege.edu'],
    ['Bhuvana I', 'CUST-001', 'bhuvana.i@abccollege.edu'], ['Chetan J', 'CUST-001', 'chetan.j@abccollege.edu'],
    ['Divakar K', 'CUST-001', 'divakar.k@abccollege.edu'], ['Elango L', 'CUST-001', 'elango.l@abccollege.edu'],
    // XYZ Institute (CUST-002): 26 more → 30 total
    ['Aakash R', 'CUST-002', 'aakash.r@xyz.edu'], ['Bhavna S', 'CUST-002', 'bhavna.s@xyz.edu'],
    ['Chetna K', 'CUST-002', 'chetna.k@xyz.edu'], ['Danish M', 'CUST-002', 'danish.m@xyz.edu'],
    ['Esha P', 'CUST-002', 'esha.p@xyz.edu'], ['Farhan Q', 'CUST-002', 'farhan.q@xyz.edu'],
    ['Gita S', 'CUST-002', 'gita.s@xyz.edu'], ['Hemant T', 'CUST-002', 'hemant.t@xyz.edu'],
    ['Ipsita U', 'CUST-002', 'ipsita.u@xyz.edu'], ['Jatin V', 'CUST-002', 'jatin.v@xyz.edu'],
    ['Kirti W', 'CUST-002', 'kirti.w@xyz.edu'], ['Lokesh X', 'CUST-002', 'lokesh.x@xyz.edu'],
    ['Monika Y', 'CUST-002', 'monika.y@xyz.edu'], ['Naveen Z', 'CUST-002', 'naveen.z@xyz.edu'],
    ['Ojas A', 'CUST-002', 'ojas.a@xyz.edu'], ['Pooja B', 'CUST-002', 'pooja.b@xyz.edu'],
    ['Qasim C', 'CUST-002', 'qasim.c@xyz.edu'], ['Ritu D', 'CUST-002', 'ritu.d@xyz.edu'],
    ['Sahil E', 'CUST-002', 'sahil.e@xyz.edu'], ['Tarun F', 'CUST-002', 'tarun.f@xyz.edu'],
    ['Uma G', 'CUST-002', 'uma.g@xyz.edu'], ['Vinay H', 'CUST-002', 'vinay.h@xyz.edu'],
    ['Wasim I', 'CUST-002', 'wasim.i@xyz.edu'], ['Xenia J', 'CUST-002', 'xenia.j@xyz.edu'],
    ['Yash K', 'CUST-002', 'yash.k@xyz.edu'], ['Zoya L', 'CUST-002', 'zoya.l@xyz.edu'],
    // Rampex Direct (CUST-003): 28 more → 30 total
    ['Abhay S', 'CUST-003', 'abhay.s@rampex.direct'], ['Bina R', 'CUST-003', 'bina.r@rampex.direct'],
    ['Chandan P', 'CUST-003', 'chandan.p@rampex.direct'], ['Devika N', 'CUST-003', 'devika.n@rampex.direct'],
    ['Eknath M', 'CUST-003', 'eknath.m@rampex.direct'], ['Falguni L', 'CUST-003', 'falguni.l@rampex.direct'],
    ['Girish K', 'CUST-003', 'girish.k@rampex.direct'], ['Hema J', 'CUST-003', 'hema.j@rampex.direct'],
    ['Inder H', 'CUST-003', 'inder.h@rampex.direct'], ['Jaya G', 'CUST-003', 'jaya.g@rampex.direct'],
    ['Kishore F', 'CUST-003', 'kishore.f@rampex.direct'], ['Lalita E', 'CUST-003', 'lalita.e@rampex.direct'],
    ['Mahesh D', 'CUST-003', 'mahesh.d@rampex.direct'], ['Neha C', 'CUST-003', 'neha.c@rampex.direct'],
    ['Om B', 'CUST-003', 'om.b@rampex.direct'], ['Pallavi A', 'CUST-003', 'pallavi.a@rampex.direct'],
    ['Rakesh Z', 'CUST-003', 'rakesh.z@rampex.direct'], ['Seema Y', 'CUST-003', 'seema.y@rampex.direct'],
    ['Tejas X', 'CUST-003', 'tejas.x@rampex.direct'], ['Urmila W', 'CUST-003', 'urmila.w@rampex.direct'],
    ['Vivek V', 'CUST-003', 'vivek.v@rampex.direct'], ['Warda U', 'CUST-003', 'warda.u@rampex.direct'],
    ['Yatin T', 'CUST-003', 'yatin.t@rampex.direct'], ['Zara S', 'CUST-003', 'zara.s@rampex.direct'],
    ['Amit R', 'CUST-003', 'amit.r@rampex.direct'], ['Beena Q', 'CUST-003', 'beena.q@rampex.direct'],
    ['Chirag P', 'CUST-003', 'chirag.p@rampex.direct'], ['Disha O', 'CUST-003', 'disha.o@rampex.direct'],
  ];
  let n = 17;
  for (const [name, cust, email] of newStudents) {
    const sid = `STU-${String(n).padStart(3, '0')}`;
    const phone = `98400-${String(100 + n).padStart(5, '0')}`;
    await ensure(db, 'students', sid,
      'INSERT INTO students (id,user_id,name,email,phone,customer_id) VALUES (?,?,?,?,?,?)',
      [sid, null, name, email, phone, cust]);
    n += 1;
  }

  // ---------- 3. New batches so new trainers teach (additive, PLANNED) ----------
  const batches = [
    ['AIML-2026-02', 'PROG-001', 'CUST-001', 'TR-003', '2026-11-01', '2026-12-20', 40, 'PLANNED'],
    ['WEB-2026-03', 'PROG-002', 'CUST-002', 'TR-004', '2026-11-05', '2027-01-20', 40, 'PLANNED'],
    ['DS-2026-02', 'PROG-003', 'CUST-003', 'TR-005', '2026-11-08', '2026-12-13', 30, 'PLANNED'],
  ];
  for (const [id, prog, cust, tr, s, e, cap, st] of batches) {
    await ensure(db, 'batches', id,
      'INSERT INTO batches (id,program_id,customer_id,trainer_id,start_date,end_date,capacity,status) VALUES (?,?,?,?,?,?,?,?)',
      [id, prog, cust, tr, s, e, cap, st]);
  }

  // ---------- 4. Enroll EVERY student in their institution's primary batch ----------
  const primary = { 'CUST-001': 'AIML-2026-01', 'CUST-002': 'WEB-2026-02', 'CUST-003': 'RDX-2026-01' };
  const students = await db.query('SELECT id, customer_id FROM students');
  for (const s of students) {
    const batch = primary[s.customer_id];
    if (!batch) continue;
    const ex = await db.get('SELECT enrollment_key FROM enrollments WHERE student_id=? AND batch_id=?', [s.id, batch]);
    if (!ex) await db.run('INSERT INTO enrollments (student_id,batch_id) VALUES (?,?)', [s.id, batch]);
  }
  // First 10 of each institution also join that institution's new batch
  const extraEnroll = { 'AIML-2026-02': 'CUST-001', 'WEB-2026-03': 'CUST-002', 'DS-2026-02': 'CUST-003' };
  for (const [batch, cust] of Object.entries(extraEnroll)) {
    const ten = await db.query('SELECT id FROM students WHERE customer_id=? ORDER BY id LIMIT 10', [cust]);
    for (const s of ten) {
      const ex = await db.get('SELECT enrollment_key FROM enrollments WHERE student_id=? AND batch_id=?', [s.id, batch]);
      if (!ex) await db.run('INSERT INTO enrollments (student_id,batch_id) VALUES (?,?)', [s.id, batch]);
    }
  }

  // ---------- 5. Attendance: 6 days × every enrollment in primary batches ----------
  for (const [cust, batch] of Object.entries(primary)) {
    const enrolled = await db.query('SELECT student_id FROM enrollments WHERE batch_id=?', [batch]);
    for (const { student_id } of enrolled) {
      const num = Number(student_id.split('-')[1]);
      for (let d = 0; d < DATES.length; d += 1) {
        const ex = await db.get(
          'SELECT attendance_key FROM attendance WHERE student_id=? AND batch_id=? AND date=?',
          [student_id, batch, DATES[d]]);
        if (ex) continue;
        let status = 'PRESENT';
        if ((num + d) % 9 === 0) status = 'ABSENT';
        else if ((num + d) % 11 === 0) status = 'LATE';
        await db.run('INSERT INTO attendance (student_id,batch_id,date,status) VALUES (?,?,?,?)',
          [student_id, batch, DATES[d], status]);
      }
    }
  }
  // New batches: 3 days of attendance for their (smaller) rosters
  const newBatchDates = ['2026-11-01', '2026-11-02', '2026-11-03'];
  for (const batch of Object.keys(extraEnroll)) {
    const enrolled = await db.query('SELECT student_id FROM enrollments WHERE batch_id=?', [batch]);
    for (const { student_id } of enrolled) {
      const num = Number(student_id.split('-')[1]);
      for (let d = 0; d < newBatchDates.length; d += 1) {
        const ex = await db.get(
          'SELECT attendance_key FROM attendance WHERE student_id=? AND batch_id=? AND date=?',
          [student_id, batch, newBatchDates[d]]);
        if (!ex) {
          await db.run('INSERT INTO attendance (student_id,batch_id,date,status) VALUES (?,?,?,?)',
            [student_id, batch, newBatchDates[d], (num + d) % 10 === 0 ? 'ABSENT' : 'PRESENT']);
        }
      }
    }
  }

  // ---------- 6. Sessions for EVERY batch (WEB had none, RDX had one) ----------
  const sessions = [
    ['WEB-2026-02', '2026-10-06', '10:00', '13:00', 'XYZ Campus Lab 1', 'HTML & CSS foundations'],
    ['WEB-2026-02', '2026-10-08', '10:00', '13:00', 'XYZ Campus Lab 1', 'JavaScript deep-dive'],
    ['WEB-2026-02', '2026-10-10', '10:00', '13:00', 'XYZ Campus Lab 1', 'React components'],
    ['WEB-2026-02', '2026-10-13', '14:00', '17:00', 'Online (Meet)', 'Node APIs'],
    ['RDX-2026-01', '2026-10-12', '09:00', '12:00', 'Rampex Center Hall A', 'Data cleaning with Pandas'],
    ['RDX-2026-01', '2026-10-18', '09:00', '12:00', 'Rampex Center Hall A', 'Visualization with Matplotlib'],
    ['RDX-2026-01', '2026-10-19', '09:00', '12:00', 'Online (Meet)', 'Intro to ML models'],
    ['AIML-2026-02', '2026-11-01', '10:00', '13:00', 'ABC Campus Lab 2', 'Python refresher'],
    ['AIML-2026-02', '2026-11-03', '10:00', '13:00', 'ABC Campus Lab 2', 'NumPy essentials'],
    ['AIML-2026-02', '2026-11-05', '10:00', '13:00', 'Online (Meet)', 'GenAI overview'],
    ['WEB-2026-03', '2026-11-05', '10:00', '13:00', 'XYZ Campus Lab 1', 'MERN kickoff'],
    ['WEB-2026-03', '2026-11-07', '10:00', '13:00', 'XYZ Campus Lab 1', 'MongoDB basics'],
    ['WEB-2026-03', '2026-11-10', '14:00', '17:00', 'Online (Meet)', 'Express routing'],
    ['DS-2026-02', '2026-11-08', '09:00', '12:00', 'Rampex Center Hall B', 'Python for data'],
    ['DS-2026-02', '2026-11-09', '09:00', '12:00', 'Rampex Center Hall B', 'Statistics primer'],
    ['DS-2026-02', '2026-11-15', '09:00', '12:00', 'Online (Meet)', 'ML intro'],
  ];
  for (const [batch, date, st, et, loc, topic] of sessions) {
    const ex = await db.get('SELECT id FROM sessions WHERE batch_id=? AND date=? AND topic=?', [batch, date, topic]);
    if (!ex) {
      await db.run('INSERT INTO sessions (batch_id,date,start_time,end_time,location,topic) VALUES (?,?,?,?,?,?)',
        [batch, date, st, et, loc, topic]);
    }
  }

  // ---------- 7. Assessments + scores for every batch ----------
  const assessments = [
    ['ASM-003', 'WEB-2026-02', 'React fundamentals', 100, '2026-09-27'],
    ['ASM-004', 'WEB-2026-02', 'Node APIs', 100, '2026-09-29'],
    ['ASM-005', 'RDX-2026-01', 'Pandas basics', 100, '2026-09-27'],
    ['ASM-006', 'RDX-2026-01', 'Data visualization', 100, '2026-09-29'],
    ['ASM-007', 'AIML-2026-02', 'Python refresher', 100, '2026-11-02'],
    ['ASM-008', 'WEB-2026-03', 'MERN kickoff quiz', 100, '2026-11-06'],
    ['ASM-009', 'DS-2026-02', 'Statistics primer', 100, '2026-11-09'],
  ];
  for (const [id, batch, title, max, on] of assessments) {
    await ensure(db, 'assessments', id,
      'INSERT INTO assessments (id,batch_id,title,max_score,assessed_on,status) VALUES (?,?,?,?,?,?)',
      [id, batch, title, max, on, 'PUBLISHED']);
  }
  // Scores: every enrolled student × every assessment in their batch (keeps old 12 rows)
  const allAssess = await db.query('SELECT id, batch_id FROM assessments');
  for (const a of allAssess) {
    const enrolled = await db.query('SELECT student_id FROM enrollments WHERE batch_id=?', [a.batch_id]);
    const asmIdx = Number(a.id.split('-')[1]);
    for (const { student_id } of enrolled) {
      const ex = await db.get('SELECT id FROM scores WHERE assessment_id=? AND student_id=?', [a.id, student_id]);
      if (ex) continue;
      const num = Number(student_id.split('-')[1]);
      await db.run('INSERT INTO scores (assessment_id,student_id,score) VALUES (?,?,?)',
        [a.id, student_id, pick(55, 98, num * 31 + asmIdx * 17)]);
    }
  }

  // ---------- 8. Materials for every batch + repair MAT-001's empty url ----------
  await db.run(
    "UPDATE materials SET url=? WHERE id='MAT-001' AND (url IS NULL OR url='')",
    ['https://rampex.demo/materials/python-functions-cheatsheet']);
  const materials = [
    ['MAT-003', 'PROG-002', 'WEB-2026-02', 'React hooks guide', 'DOC', 'https://rampex.demo/materials/react-hooks', 'useState, useEffect, custom hooks'],
    ['MAT-004', 'PROG-002', 'WEB-2026-02', 'Node REST API video', 'VIDEO', 'https://rampex.demo/videos/node-rest', 'Week 2 recording with Q&A'],
    ['MAT-005', 'PROG-003', 'RDX-2026-01', 'Pandas cookbook', 'DOC', 'https://rampex.demo/materials/pandas-cookbook', 'GroupBy, merge, pivot tables'],
    ['MAT-006', 'PROG-003', 'RDX-2026-01', 'Matplotlib gallery', 'LINK', 'https://rampex.demo/materials/mpl-gallery', 'Chart-by-chart examples'],
    ['MAT-007', 'PROG-001', 'AIML-2026-02', 'NumPy essentials', 'DOC', 'https://rampex.demo/materials/numpy-essentials', 'Arrays, broadcasting, vectorization'],
    ['MAT-008', 'PROG-002', 'WEB-2026-03', 'MERN starter repo', 'LINK', 'https://rampex.demo/materials/mern-starter', 'Clone and run locally'],
    ['MAT-009', 'PROG-003', 'DS-2026-02', 'Statistics primer notes', 'NOTE', 'https://rampex.demo/materials/stats-primer', 'Mean, variance, distributions'],
    ['MAT-010', 'PROG-001', 'AIML-2026-01', 'Model evaluation checklist', 'NOTE', 'https://rampex.demo/materials/model-eval', 'Precision, recall, cross-validation'],
  ];
  for (const [id, prog, batch, title, type, url, notes] of materials) {
    await ensure(db, 'materials', id,
      'INSERT INTO materials (id,program_id,batch_id,title,mat_type,url,notes) VALUES (?,?,?,?,?,?,?)',
      [id, prog, batch, title, type, url, notes]);
  }

  // ---------- 9. Follow-ups so NO lead is left without one ----------
  const followups = [
    ['LEAD-003', '2026-09-27', 'Call', 'Spoke to Prof. Anita, elective confirmed for next term', 'Send syllabus', 'U-001'],
    ['LEAD-003', '2026-09-30', 'Email', 'Shared Python DS syllabus and pricing slab', 'Schedule demo class', 'U-001'],
    ['LEAD-004', '2026-09-28', 'Visit', 'Met Dean Kumar, campus-wide rollout discussed', 'Send proposal', 'U-001'],
    ['LEAD-004', '2026-09-30', 'Call', 'Proposal walkthrough done, awaiting board approval', 'Follow up next week', 'U-001'],
    ['LEAD-005', '2026-09-29', 'Email', 'D2C pipeline acknowledged, weekend batch nearly full', 'Push enrolment reminders', 'U-001'],
  ];
  for (const [lead, date, method, notes, next, by] of followups) {
    const ex = await db.get(
      'SELECT followup_key FROM lead_followups WHERE lead_id=? AND date=? AND notes=?', [lead, date, notes]);
    if (!ex) {
      await db.run('INSERT INTO lead_followups (lead_id,date,method,notes,next_action,created_by) VALUES (?,?,?,?,?,?)',
        [lead, date, method, notes, next, by]);
    }
  }

  // ---------- 10. Interests: 20 voices, not 2 ----------
  const interestTexts = [
    'Want advanced GenAI projects after this batch',
    'Interested in placement preparation workshops',
    'Requested extra doubt-clearing hours on weekends',
    'Wants internship referrals in data roles',
    'Keen on Kaggle competitions with classmates',
    'Asked for recorded revision sessions before assessments',
  ];
  const interestStudents = ['STU-002', 'STU-004', 'STU-009', 'STU-011', 'STU-013', 'STU-015',
    'STU-017', 'STU-020', 'STU-025', 'STU-030', 'STU-037', 'STU-040',
    'STU-045', 'STU-050', 'STU-063', 'STU-066', 'STU-070', 'STU-080'];
  for (let i = 0; i < interestStudents.length; i += 1) {
    const ex = await db.get('SELECT id FROM interests WHERE student_id=? AND body=?',
      [interestStudents[i], interestTexts[i % interestTexts.length]]);
    if (!ex) {
      await db.run('INSERT INTO interests (student_id,body) VALUES (?,?)',
        [interestStudents[i], interestTexts[i % interestTexts.length]]);
    }
  }

  // ---------- 11. Invoice due-date repairs (no NULLs left) ----------
  await db.run("UPDATE invoices SET due_date=? WHERE id='INV-001' AND (due_date IS NULL OR due_date='')", ['2026-10-30']);
  await db.run("UPDATE invoices SET due_date=? WHERE id='INV-002' AND (due_date IS NULL OR due_date='')", ['2026-11-05']);

  // ---------- 12. Finance top-ups: payments + trainer payouts ----------
  const payments = [
    ['PAY-006', 'INV-002', 'CUST-002', 100000, 'UPI', '2026-09-30', 'UPI-771204', 'First milestone for full stack batch'],
    ['PAY-007', 'INV-004', 'CUST-002', 50000, 'Bank Transfer', '2026-09-28', 'NEFT-90412', 'Partial settlement of milestone 2'],
  ];
  for (const [id, inv, cust, amt, method, date, ref, notes] of payments) {
    await ensure(db, 'payments', id,
      'INSERT INTO payments (id,invoice_id,customer_id,amount,method,date,reference,notes) VALUES (?,?,?,?,?,?,?,?)',
      [id, inv, cust, amt, method, date, ref, notes]);
  }
  const expenses = [
    ['EXP-011', '2026-09-30', 'Trainer', 'Karthik Nair', 'Payout AIML-2026-02 advance', 30000, 'TR-003', 'PAID'],
    ['EXP-012', '2026-09-30', 'Trainer', 'Meera Krishnan', 'Payout WEB-2026-03 advance', 30000, 'TR-004', 'APPROVED'],
    ['EXP-013', '2026-09-30', 'Trainer', 'Sanjay Verma', 'Payout DS-2026-02 advance', 25000, 'TR-005', 'PENDING'],
    ['EXP-014', '2026-09-30', 'Travel', 'City Cabs Express', 'Trainer commute XYZ campus October', 5200, 'TR-004', 'APPROVED'],
    ['EXP-015', '2026-09-30', 'Materials', 'PrintWell', 'Workbook reprint for 90 new enrolments', 18000, null, 'APPROVED'],
    ['EXP-016', '2026-09-30', 'Venue', 'XYZ Seminar Hall', 'Weekend lab rental October', 22000, null, 'PENDING'],
  ];
  for (const [id, date, cat, vendor, desc, amt, tid, st] of expenses) {
    await ensure(db, 'expenses', id,
      'INSERT INTO expenses (id,date,category,vendor,description,amount,trainer_id,status) VALUES (?,?,?,?,?,?,?,?)',
      [id, date, cat, vendor, desc, amt, tid, st]);
  }

  // ---------- 13. Certificates for every eligible student (attendance>=75, avg>=60) ----------
  let certN = (await db.query('SELECT COUNT(*) c FROM certificates'))[0].c;
  const batchesAll = await db.query('SELECT id FROM batches');
  for (const b of batchesAll) {
    const enrolled = await db.query('SELECT student_id FROM enrollments WHERE batch_id=?', [b.id]);
    for (const { student_id } of enrolled) {
      const ex = await db.get('SELECT id FROM certificates WHERE student_id=? AND batch_id=?', [student_id, b.id]);
      if (ex) continue;
      const att = await db.query('SELECT status, COUNT(*) c FROM attendance WHERE student_id=? AND batch_id=? GROUP BY status', [student_id, b.id]);
      const tot = att.reduce((s, r) => s + r.c, 0);
      if (!tot) continue;
      const pres = att.filter((r) => r.status !== 'ABSENT').reduce((s, r) => s + r.c, 0);
      const pct = Math.round((pres / tot) * 100);
      const avgRow = await db.get(
        `SELECT AVG(s.score) v FROM scores s JOIN assessments a ON a.id=s.assessment_id
         WHERE s.student_id=? AND a.batch_id=?`, [student_id, b.id]);
      const avg = avgRow && avgRow.v != null ? Number(avgRow.v) : null;
      if (pct >= 75 && avg != null && avg >= 60) {
        certN += 1;
        const cid = `CERT-${String(certN).padStart(3, '0')}`;
        await db.run(
          'INSERT INTO certificates (id,certificate_no,student_id,batch_id,attendance_pct,avg_score,issued_on) VALUES (?,?,?,?,?,?,?)',
          [cid, `RNX-2026-${String(certN).padStart(4, '0')}`, student_id, b.id, pct, Math.round(avg * 10) / 10, '2026-09-30 12:00:00']);
      }
    }
  }

  // ---------- 14. Backfill repairs: no lead row left with empty core fields ----------
  await db.run("UPDATE leads SET program='AI & Machine Learning' WHERE program IS NULL OR program=''");
  await db.run("UPDATE leads SET assigned_to='U-001' WHERE assigned_to IS NULL OR assigned_to=''");
  await db.run("UPDATE leads SET requirement='Training requirement discussion' WHERE requirement IS NULL OR requirement=''");
  await db.run("UPDATE leads SET source='Website' WHERE source IS NULL OR source=''");
  await db.run("UPDATE leads SET owner='Sales Exec' WHERE owner IS NULL OR owner=''");

  // ---------- 15. Feedback demo content (forms + sentiment-scored responses) ----------
  const { seedFeedback } = require('./feedback-seed');
  await seedFeedback(db);

  const counts = {};
  for (const t of ['users', 'trainers', 'students', 'enrollments', 'attendance', 'sessions', 'assessments', 'scores', 'materials', 'interests', 'certificates', 'batches', 'payments', 'expenses', 'lead_followups', 'feedback_forms', 'feedback_questions', 'feedback_responses', 'feedback_answers']) {
    counts[t] = (await db.query(`SELECT COUNT(*) c FROM ${t}`))[0].c;
  }
  console.log('[rich-seed] done:', JSON.stringify(counts));
}

if (require.main === module) {
  const db = require('./index');
  (async () => {
    await db.ready;
    await db.transaction((tx) => richSeed(tx));
    process.exit(0);
  })().catch((e) => { console.error('[rich-seed] failed:', e); process.exit(1); });
}

module.exports = { richSeed };
