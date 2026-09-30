/**
 * Showcase Service:
 *   - FLOW W: Public Enquiry -> AUTO lead creation with automated system follow-up
 *   - FLOW Y: Certificates (attendance >= 75% rule, 422 if ineligible, public verification)
 *   - FLOW X: Rule-based Collections Queue (HIGH/MEDIUM/LOW priority + human-readable reasons + CSV export)
 *   - Revenue Trend: Monthly billed vs collected comparison
 *   - Live Activity Feed: Cross-platform unified operational audit trail
 */
const db = require('../db');
const { badRequest, notFound, forbidden } = require('../utils/http');
const { round2, pct } = require('../utils/numbers');
const { nid } = require('../utils/ids');
const { requireFields, str, toInt } = require('../utils/validate');
const { collectionRisk, maxOverdueDays } = require('../utils/risk');

// ---------- FLOW W: Public Enquiry ----------
async function publicEnquire(body = {}) {
  requireFields(body, ['organization', 'contact_person']);
  return db.transaction(async (tx) => {
    const id = await nid(tx, 'LEAD', 'leads');
    const today = new Date().toISOString().slice(0, 10);
    const expectedStudents = toInt(body.expected_students, 0);
    const expectedValue = Number(body.expected_value) || (expectedStudents ? expectedStudents * 5000 : 250000);

    await tx.run(
      `INSERT INTO leads (id, assigned_to, lead_type, organization, contact_person, email, phone, requirement,
                          program, expected_students, expected_value, source, owner, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'Sales Exec','NEW')`,
      [
        id,
        null,
        'INSTITUTION',
        str(body.organization),
        str(body.contact_person),
        str(body.email) || null,
        str(body.phone) || null,
        str(body.requirement) || 'Inbound portal inquiry',
        str(body.program) || null,
        expectedStudents,
        expectedValue,
        'Website',
      ]
    );

    await tx.run(
      `INSERT INTO lead_followups (lead_id, date, method, notes, next_action, created_by)
       VALUES (?,?,'System','Enquiry auto-captured via public website form (AUTO)','Qualify requirement and contact representative', NULL)`,
      [id, today]
    );

    return tx.get('SELECT * FROM leads WHERE id = ?', [id]);
  });
}

// ---------- FLOW Y: Certificates ----------
async function listCertificates(scope) {
  let sql = `
    SELECT c.*, s.name AS student_name, s.email AS student_email,
           p.name AS program_name, cust.name AS customer_name
      FROM certificates c
      JOIN students s ON s.id = c.student_id
      JOIN batches b ON b.id = c.batch_id
      LEFT JOIN programs p ON p.id = b.program_id
      LEFT JOIN customers cust ON cust.id = b.customer_id
     WHERE 1=1`;
  const params = [];

  if (scope.role === 'institution' && scope.customer_id) {
    sql += ' AND b.customer_id = ?';
    params.push(scope.customer_id);
  } else if (scope.role === 'trainer' && scope.trainer_id) {
    sql += ' AND b.trainer_id = ?';
    params.push(scope.trainer_id);
  } else if (scope.role === 'student' && scope.student_id) {
    sql += ' AND c.student_id = ?';
    params.push(scope.student_id);
  }

  sql += ' ORDER BY c.issued_on DESC, c.certificate_key DESC';
  return db.query(sql, params);
}

async function issueCertificate(scope, body = {}) {
  if (scope.role !== 'organization') {
    throw forbidden('Only Rampex organization can issue certificates');
  }
  requireFields(body, ['student_id', 'batch_id']);
  const studentId = str(body.student_id);
  const batchId = str(body.batch_id);

  const student = await db.get('SELECT s.*, c.name AS customer_name FROM students s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?', [studentId]);
  if (!student) throw notFound('Student not found');

  const batch = await db.get(
    `SELECT b.*, p.name AS program_name FROM batches b
       LEFT JOIN programs p ON p.id = b.program_id
      WHERE b.id = ?`,
    [batchId]
  );
  if (!batch) throw notFound('Batch not found');

  const enrolled = await db.get('SELECT 1 AS ok FROM enrollments WHERE student_id = ? AND batch_id = ?', [studentId, batchId]);
  if (!enrolled) throw badRequest(`Student ${studentId} is not enrolled in batch ${batchId}`);

  // Calculate attendance % for this student in this batch
  const att = await db.get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
       FROM attendance WHERE student_id = ? AND batch_id = ?`,
    [studentId, batchId]
  );
  const attendancePct = pct(Number(att.present || 0), Number(att.total || 0));

  // FLOW Y binding rule: Batch attendance >= 75% required
  if (attendancePct < 75) {
    const err = new Error(`Ineligible: attendance is ${attendancePct}% (minimum 75% required)`);
    err.status = 422;
    throw err;
  }

  // Calculate average score
  const scoreRow = await db.get(
    `SELECT AVG(s.score * 1.0 / a.max_score) * 100 AS v
       FROM scores s
       JOIN assessments a ON a.id = s.assessment_id
      WHERE s.student_id = ? AND a.batch_id = ?`,
    [studentId, batchId]
  );
  const avgScore = scoreRow?.v != null ? Math.round(Number(scoreRow.v)) : null;

  // Check if certificate already exists
  const existing = await db.get(
    'SELECT * FROM certificates WHERE student_id = ? AND batch_id = ?',
    [studentId, batchId]
  );
  if (existing) {
    return {
      ...existing,
      student_name: student.name,
      batch_id: batchId,
      program_name: batch.program_name,
      customer_name: student.customer_name,
      already: true,
    };
  }

  return db.transaction(async (tx) => {
    const id = await nid(tx, 'CERT', 'certificates');
    const certCount = await tx.count('SELECT COUNT(*) FROM certificates');
    const year = new Date().getFullYear();
    const certificateNo = `RNX-${year}-${String(certCount + 1).padStart(4, '0')}`;

    await tx.run(
      `INSERT INTO certificates (id, certificate_no, student_id, batch_id, attendance_pct, avg_score, issued_on)
       VALUES (?,?,?,?,?,?,datetime('now'))`,
      [id, certificateNo, studentId, batchId, attendancePct, avgScore]
    );

    return {
      id,
      certificate_no: certificateNo,
      student_id: studentId,
      student_name: student.name,
      batch_id: batchId,
      program_name: batch.program_name,
      customer_name: student.customer_name,
      attendance_pct: attendancePct,
      avg_score: avgScore,
      issued_on: new Date().toISOString(),
    };
  });
}

async function verifyCertificate(code) {
  if (!code || !code.trim()) throw badRequest('Certificate verification code is required');
  const clean = code.trim().toUpperCase();

  const cert = await db.get(
    `SELECT c.*, s.name AS student_name, s.email AS student_email,
            b.id AS batch_id, p.name AS program_name, cust.name AS customer_name
       FROM certificates c
       JOIN students s ON s.id = c.student_id
       JOIN batches b ON b.id = c.batch_id
       LEFT JOIN programs p ON p.id = b.program_id
       LEFT JOIN customers cust ON cust.id = b.customer_id
      WHERE UPPER(c.certificate_no) = ? OR UPPER(c.id) = ?`,
    [clean, clean]
  );

  if (!cert) {
    throw notFound(`Certificate '${code}' not found or invalid`);
  }
  return cert;
}

// ---------- FLOW X: Collections Queue ----------
async function getCollectionsQueue(scope) {
  let sql = `
    SELECT i.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.outstanding > 0.01`;
  const params = [];

  if (scope.role === 'institution' && scope.customer_id) {
    sql += ' AND i.customer_id = ?';
    params.push(scope.customer_id);
  }

  sql += ' ORDER BY i.due_date ASC, i.outstanding DESC';
  const invoices = await db.query(sql, params);

  const today = new Date();
  const ranked = invoices.map((inv) => {
    const overdueDays = maxOverdueDays([inv], today);
    const risk = collectionRisk({
      outstanding: inv.outstanding,
      overdueDays,
      invoiceCount: 1,
    });

    const reasons = [];
    if (overdueDays > 30) {
      reasons.push(`Severely overdue (${overdueDays} days past due)`);
    } else if (overdueDays > 0) {
      reasons.push(`Overdue by ${overdueDays} days`);
    } else {
      reasons.push('Current billing cycle');
    }

    if (inv.outstanding >= 200000) {
      reasons.push('High exposure ticket (≥ ₹2,00,000)');
    } else if (inv.outstanding >= 50000) {
      reasons.push('Significant balance');
    }

    if (Number(inv.paid || 0) === 0) {
      reasons.push('Zero payments recorded');
    } else {
      reasons.push(`Partial payment of ₹${Number(inv.paid).toLocaleString('en-IN')} received`);
    }

    return {
      ...inv,
      overdueDays,
      risk,
      reasons,
    };
  });

  const priorityScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return ranked.sort((a, b) => {
    const diff = (priorityScore[b.risk] || 0) - (priorityScore[a.risk] || 0);
    if (diff !== 0) return diff;
    return (b.outstanding || 0) - (a.outstanding || 0);
  });
}

// ---------- Revenue Trend ----------
async function getRevenueTrend(scope) {
  let invoicesSql = 'SELECT issue_date, total, customer_id FROM invoices WHERE total > 0';
  let paymentsSql = 'SELECT date, amount, customer_id FROM payments WHERE amount > 0';
  const invParams = [];
  const payParams = [];

  if (scope.role === 'institution' && scope.customer_id) {
    invoicesSql += ' AND customer_id = ?';
    paymentsSql += ' AND customer_id = ?';
    invParams.push(scope.customer_id);
    payParams.push(scope.customer_id);
  }

  const invoices = await db.query(invoicesSql, invParams);
  const payments = await db.query(paymentsSql, payParams);

  const monthsMap = {};
  const addMonth = (m) => {
    if (!monthsMap[m]) monthsMap[m] = { month: m, billed: 0, collected: 0 };
  };

  // Seed default 4 recent months so the visual trend chart always renders nicely
  const now = new Date();
  for (let i = 4; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.toISOString().slice(0, 7);
    addMonth(m);
  }

  for (const inv of invoices) {
    const m = (inv.issue_date || '').slice(0, 7);
    if (m && m.length === 7) {
      addMonth(m);
      monthsMap[m].billed += Number(inv.total || 0);
    }
  }

  for (const pay of payments) {
    const m = (pay.date || '').slice(0, 7);
    if (m && m.length === 7) {
      addMonth(m);
      monthsMap[m].collected += Number(pay.amount || 0);
    }
  }

  return Object.values(monthsMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);
}

// ---------- Global Operational Activity Feed ----------
async function getActivityFeed(scope) {
  const items = [];

  // Recent leads (Organization only)
  if (scope.role === 'organization') {
    const leads = await db.query('SELECT id, organization, source, created_at, status FROM leads ORDER BY created_at DESC LIMIT 5');
    for (const l of leads) {
      items.push({
        type: 'lead',
        label: `${l.source === 'Website' ? '[AUTO] ' : ''}Lead ${l.id} (${l.organization}) created [${l.status}]`,
        at: l.created_at,
      });
    }
  }

  // Recent invoices
  let invSql = `SELECT i.id, i.total, i.created_at, c.name AS customer_name FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id`;
  const invParams = [];
  if (scope.role === 'institution' && scope.customer_id) {
    invSql += ' WHERE i.customer_id = ?';
    invParams.push(scope.customer_id);
  }
  invSql += ' ORDER BY i.created_at DESC LIMIT 5';
  const invoices = await db.query(invSql, invParams);
  for (const inv of invoices) {
    items.push({
      type: 'invoice',
      label: `Invoice ${inv.id} generated for ${inv.customer_name || 'Customer'} (₹${Number(inv.total).toLocaleString('en-IN')})`,
      at: inv.created_at,
    });
  }

  // Recent payments
  let paySql = `SELECT p.id, p.amount, p.date, p.created_at, c.name AS customer_name FROM payments p LEFT JOIN customers c ON c.id = p.customer_id`;
  const payParams = [];
  if (scope.role === 'institution' && scope.customer_id) {
    paySql += ' WHERE p.customer_id = ?';
    payParams.push(scope.customer_id);
  }
  paySql += ' ORDER BY p.created_at DESC LIMIT 5';
  const payments = await db.query(paySql, payParams);
  for (const pay of payments) {
    items.push({
      type: 'payment',
      label: `Payment ${pay.id} recorded (₹${Number(pay.amount).toLocaleString('en-IN')}) via ${pay.customer_name || 'Customer'}`,
      at: pay.created_at || pay.date,
    });
  }

  // Recent attendance
  let attSql = `SELECT a.batch_id, a.date, a.marked_at, COUNT(*) AS count
                  FROM attendance a
                 GROUP BY a.batch_id, a.date
                 ORDER BY a.marked_at DESC LIMIT 4`;
  const atts = await db.query(attSql);
  for (const a of atts) {
    items.push({
      type: 'attendance',
      label: `Attendance marked for batch ${a.batch_id} (${a.count} students)`,
      at: a.marked_at || a.date,
    });
  }

  return items
    .filter((x) => x.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 15);
}

module.exports = {
  publicEnquire,
  listCertificates,
  issueCertificate,
  verifyCertificate,
  getCollectionsQueue,
  getRevenueTrend,
  getActivityFeed,
};
