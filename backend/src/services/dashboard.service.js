/**
 * Role-aware dashboard (master-prd §9, userflow FLOW B/C/D):
 *   ORGANIZATION  → platform-wide KPIs + pipeline + institutions overview
 *   INSTITUTION   → own-college overview (batches, dues, top students)
 *   TRAINER       → assigned batches + attendance + students
 *   STUDENT       → my-learning summary (attendance, scores, weak areas, fee/dues)
 * Every metric is computed at the caller's scope level. Async facade.
 */
const db = require('../db');
const { round2 } = require('../utils/numbers');
const { pct } = require('../utils/numbers');
const { outstandingOf } = require('../utils/money');
const { visibleBatchIds } = require('./scope.service');

// ---------- shared performance helpers (FLOW T/U) ----------
async function attendancePct(studentId, batchId = null) {
  let sql = `SELECT COUNT(*) AS t, SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS p
               FROM attendance WHERE student_id = ?`;
  const params = [studentId];
  if (batchId) { sql += ' AND batch_id = ?'; params.push(batchId); }
  const r = await db.get(sql, params);
  return pct(Number(r.p || 0), Number(r.t || 0));
}

async function avgScore(studentId, batchId = null) {
  let sql = `SELECT AVG(s.score * 1.0 / a.max_score) * 100 AS v
               FROM scores s JOIN assessments a ON a.id = s.assessment_id
              WHERE s.student_id = ?`;
  const params = [studentId];
  if (batchId) { sql += ' AND a.batch_id = ?'; params.push(batchId); }
  const r = await db.get(sql, params);
  return r.v == null ? null : Math.round(Number(r.v));
}

/** Top students = rank by attendance % then avg score (db-prd §3b). */
async function topStudents(studentIds, limit = 5) {
  if (!studentIds.length) return [];
  const ph = studentIds.map(() => '?').join(',');
  const rows = await db.query(`SELECT id, name FROM students WHERE id IN (${ph})`, studentIds);
  const names = Object.fromEntries(rows.map((s) => [s.id, s.name]));
  const enriched = await Promise.all(
    studentIds.map(async (sid) => ({
      student_id: sid,
      name: names[sid] || sid,
      attendance: await attendancePct(sid),
      avg_score: await avgScore(sid),
    }))
  );
  return enriched
    .sort((a, b) => (b.attendance - a.attendance) || ((b.avg_score || 0) - (a.avg_score || 0)))
    .slice(0, limit);
}

/** Weak areas = lowest (score/max) topics per student (db-prd §3b). */
function weakAreas(studentId) {
  return db.query(
    `SELECT a.title AS topic, ROUND(AVG(s.score * 1.0 / a.max_score) * 100) AS pct
       FROM scores s JOIN assessments a ON a.id = s.assessment_id
      WHERE s.student_id = ? GROUP BY a.title ORDER BY pct ASC`,
    [studentId]
  );
}

/** Per-student dues: institution outstanding prorated by enrolled program fees. */
async function studentDues(customerId) {
  const invoices = await db.count('SELECT COALESCE(SUM(outstanding),0) FROM invoices WHERE customer_id = ?', [customerId]);
  const studs = await db.query(
    `SELECT s.id, s.name, COALESCE(SUM(p.fee_per_student),0) AS fee
       FROM students s
       LEFT JOIN enrollments e ON e.student_id = s.id
       LEFT JOIN batches b ON b.id = e.batch_id
       LEFT JOIN programs p ON p.id = b.program_id
      WHERE s.customer_id = ? GROUP BY s.id`,
    [customerId]
  );
  const base = studs.reduce((x, r) => x + Number(r.fee || 0), 0);
  return {
    total_outstanding: round2(invoices),
    rows: studs.map((r) => ({ ...r, dues: base ? Math.round(invoices * Number(r.fee) / base) : 0 })),
  };
}

// ---------- Institution dashboard ----------
async function institutionDashboard(customerId) {
  const customer = await db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
  const batches = await db.query(
    `SELECT b.*, p.name AS program_name, t.name AS trainer_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) AS student_count
       FROM batches b
       LEFT JOIN programs p ON p.id = b.program_id
       LEFT JOIN trainers t ON t.id = b.trainer_id
      WHERE b.customer_id = ?`,
    [customerId]
  );
  const invoices = await db.query('SELECT * FROM invoices WHERE customer_id = ?', [customerId]);
  const payments = await db.query(
    `SELECT p.* FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.customer_id = ? ORDER BY p.created_at DESC LIMIT 5`,
    [customerId]
  );
  const studentCount = await db.count('SELECT COUNT(*) FROM students WHERE customer_id = ?', [customerId]);
  const revenue = round2(invoices.reduce((x, i) => x + Number(i.total || 0), 0));
  const outstanding = round2(invoices.reduce((x, i) => x + outstandingOf(i.total, i.paid), 0));
  const collected = round2(payments.reduce((x, p) => x + Number(p.amount || 0), 0));
  const studIds = (await db.query('SELECT id FROM students WHERE customer_id = ?', [customerId])).map((r) => r.id);

  const batchPerf = await Promise.all(batches.map(async (b) => {
    const r = await db.get(
      `SELECT COUNT(*) AS t, SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS p
         FROM attendance WHERE batch_id = ?`,
      [b.id]
    );
    return {
      batch_id: b.id, program: b.program_name, students: b.student_count,
      attendance: pct(Number(r.p || 0), Number(r.t || 0)),
    };
  }));

  return {
    role: 'institution', customer, batches, studentCount, revenue, collected, outstanding,
    outstandingInvoices: invoices.filter((i) => outstandingOf(i.total, i.paid) > 0.01),
    recentPayments: payments,
    top_students: await topStudents(studIds),
    batch_performance: batchPerf,
    dues: await studentDues(customerId),
  };
}

// ---------- Trainer dashboard ----------
async function trainerDashboard(trainerId) {
  const batches = await db.query(
    `SELECT b.*, p.name AS program_name, c.name AS customer_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) AS student_count
       FROM batches b
       LEFT JOIN programs p ON p.id = b.program_id
       LEFT JOIN customers c ON c.id = b.customer_id
      WHERE b.trainer_id = ?`,
    [trainerId]
  );
  const ids = batches.map((b) => b.id);
  let totalStudents = 0;
  let avgAttendance = 0;
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    totalStudents = await db.count(`SELECT COUNT(*) FROM enrollments WHERE batch_id IN (${ph})`, ids);
    const r = await db.get(
      `SELECT COUNT(*) AS t, SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS p
         FROM attendance WHERE batch_id IN (${ph})`,
      ids
    );
    avgAttendance = pct(Number(r.p || 0), Number(r.t || 0));
  }
  return { role: 'trainer', batches, totalStudents, activeBatches: batches.length, avgAttendance };
}

// ---------- Student dashboard ----------
async function studentDashboard(studentId) {
  const student = await db.get(
    `SELECT s.*, c.name AS customer_name FROM students s
      LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [studentId]
  );
  const enrollments = await db.query(
    `SELECT b.*, p.name AS program_name, t.name AS trainer_name
       FROM enrollments e
       JOIN batches b ON b.id = e.batch_id
       LEFT JOIN programs p ON p.id = b.program_id
       LEFT JOIN trainers t ON t.id = b.trainer_id
      WHERE e.student_id = ?`,
    [studentId]
  );
  const att = await db.query(
    'SELECT batch_id, date, status FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 20',
    [studentId]
  );
  const p = att.filter((a) => a.status === 'PRESENT').length;
  const feeRows = await db.query(
    `SELECT COALESCE(SUM(p.fee_per_student),0) AS fee
       FROM enrollments e
       JOIN batches b ON b.id = e.batch_id
       JOIN programs p ON p.id = b.program_id
      WHERE e.student_id = ?`,
    [studentId]
  );
  const myDues = student.customer_id
    ? ((await studentDues(student.customer_id)).rows.find((r) => r.id === studentId) || { dues: 0 }).dues
    : 0;
  return {
    role: 'student', student, enrollments, attendance: att,
    attendancePct: pct(p, att.length),
    avg_score: await avgScore(studentId),
    weak_areas: await weakAreas(studentId),
    fee: round2(Number(feeRows[0].fee || 0)),
    dues: myDues,
  };
}

// ---------- Organization dashboard ----------
async function organizationDashboard() {
  const totalLeads = await db.count('SELECT COUNT(*) FROM leads');
  const converted = await db.count(`SELECT COUNT(*) FROM leads WHERE status = 'CONVERTED'`);
  const activeBatches = await db.count(`SELECT COUNT(*) FROM batches WHERE status = 'ACTIVE'`);
  const totalStudents = await db.count('SELECT COUNT(*) FROM students');
  const revenue = round2(await db.count('SELECT COALESCE(SUM(total),0) FROM invoices'));
  const collected = round2(await db.count('SELECT COALESCE(SUM(amount),0) FROM payments'));
  const expenses = round2(await db.count('SELECT COALESCE(SUM(amount),0) FROM expenses'));
  const outstanding = round2(await db.count('SELECT COALESCE(SUM(outstanding),0) FROM invoices'));
  const byStatus = await db.query('SELECT status, COUNT(*) AS count FROM leads GROUP BY status');
  const recentPayments = await db.query(
    `SELECT p.*, i.customer_id FROM payments p
      LEFT JOIN invoices i ON i.id = p.invoice_id
      ORDER BY p.created_at DESC LIMIT 5`
  );
  const outstandingInvoices = await db.query(
    `SELECT i.*, c.name AS customer_name FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.outstanding > 0 ORDER BY i.outstanding DESC LIMIT 5`
  );
  const batches = await db.query(
    `SELECT b.*, p.name AS program_name, c.name AS customer_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) AS student_count
       FROM batches b
       LEFT JOIN programs p ON p.id = b.program_id
       LEFT JOIN customers c ON c.id = b.customer_id
      ORDER BY b.batch_key DESC LIMIT 5`
  );
  const institutions = await db.query('SELECT id, name, type FROM customers');
  const instEnriched = await Promise.all(institutions.map(async (x) => {
    const st = await db.count('SELECT COUNT(*) FROM students WHERE customer_id = ?', [x.id]);
    const ba = await db.count('SELECT COUNT(*) FROM batches WHERE customer_id = ?', [x.id]);
    const fin = await db.get(
      'SELECT COALESCE(SUM(total),0) AS t, COALESCE(SUM(outstanding),0) AS o FROM invoices WHERE customer_id = ?',
      [x.id]
    );
    const col = await db.count(
      `SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE i.customer_id = ?`,
      [x.id]
    );
    const at = await db.get(
      `SELECT COUNT(*) AS t, SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS p
         FROM attendance a
         JOIN enrollments e ON e.student_id = a.student_id AND e.batch_id = a.batch_id
         JOIN students st ON st.id = e.student_id
        WHERE st.customer_id = ?`,
      [x.id]
    );
    return {
      ...x, students: st, batches: ba,
      billed: round2(Number(fin.t || 0)), collected: round2(col), outstanding: round2(Number(fin.o || 0)),
      attendance: pct(Number(at.p || 0), Number(at.t || 0)),
    };
  }));

  return {
    role: 'organization',
    totalLeads,
    conversionRate: totalLeads ? Math.round((converted / totalLeads) * 100) : 0,
    activeBatches, totalStudents, revenue, collected, outstanding, expenses,
    net: round2(collected - expenses),
    byStatus, recentPayments, outstandingInvoices, batches,
    institutions: instEnriched,
  };
}

async function dashboard(scope) {
  if (scope.role === 'institution' && scope.customer_id) return institutionDashboard(scope.customer_id);
  if (scope.role === 'trainer' && scope.trainer_id) return trainerDashboard(scope.trainer_id);
  if (scope.role === 'student' && scope.student_id) return studentDashboard(scope.student_id);
  return organizationDashboard();
}

module.exports = {
  dashboard, topStudents, weakAreas, attendancePct, avgScore, studentDues,
  organizationDashboard, institutionDashboard, trainerDashboard, studentDashboard,
};
