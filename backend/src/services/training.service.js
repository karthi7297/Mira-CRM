/**
 * Training domain: programs, trainers, batches, students, enrollments, attendance.
 * Scope rules (db-prd §0/§3): trainers see only assigned batches (dev port:
 * batches.trainer_id); students see only their enrollments. STUDENT MANAGEMENT
 * IS THE TRAINER'S JOB — students belong to the trainer who delivers their
 * batch, so org/institution never get a name-by-name roster (they see counts on
 * the dashboard and Customer 360 instead). Attendance may be marked by the
 * assigned trainer, or by Rampex as a fallback (FLOW I). Async facade throughout.
 */
const db = require('../db');
const { badRequest, conflict, forbidden, notFound } = require('../utils/http');
const { pct } = require('../utils/numbers');
const { requireFields, oneOf, str, isNonEmpty, toInt } = require('../utils/validate');
const { nid } = require('../utils/ids');
const { visibleBatchIds, assertBatchVisible, batchWithMeta } = require('./scope.service');

// ---------- Programs ----------
async function listPrograms() {
  return db.query(
    `SELECT p.*, (SELECT COUNT(*) FROM batches b WHERE b.program_id = p.id) AS batch_count
       FROM programs p ORDER BY p.id`
  );
}

async function createProgram(body = {}) {
  requireFields(body, ['name']);
  const id = await nid(db, 'PROG', 'programs');
  await db.run(
    'INSERT INTO programs (id, name, duration, description, fee_per_student) VALUES (?,?,?,?,?)',
    [id, str(body.name), str(body.duration) || null, str(body.description) || null,
      Number(body.fee_per_student) || 5000]
  );
  return db.get('SELECT * FROM programs WHERE id = ?', [id]);
}

// ---------- Trainers (Rampex staff) ----------
async function listTrainers() {
  return db.query('SELECT id, name, expertise, email, phone FROM trainers ORDER BY id');
}

async function createTrainer(body = {}) {
  requireFields(body, ['name']);
  const id = await nid(db, 'TR', 'trainers');
  await db.run(
    'INSERT INTO trainers (id, name, expertise, email, phone) VALUES (?,?,?,?,?)',
    [id, str(body.name), str(body.expertise) || null, str(body.email) || null, str(body.phone) || null]
  );
  return db.get('SELECT * FROM trainers WHERE id = ?', [id]);
}

// ---------- Batches ----------
async function listBatches(scope) {
  const visible = await visibleBatchIds(db, scope);
  const rows = await db.query('SELECT * FROM batches ORDER BY batch_key DESC');
  const withMeta = await Promise.all(rows.map((b) => batchWithMeta(db, b)));
  if (visible !== null) return withMeta.filter((b) => visible.includes(b.id));
  return withMeta;
}

async function getBatch(scope, batchId) {
  await assertBatchVisible(db, scope, batchId);
  const row = await db.get('SELECT * FROM batches WHERE id = ?', [batchId]);
  if (!row) throw notFound('Batch not found');
  const batch = await batchWithMeta(db, row);
  batch.students = await db.query(
    `SELECT s.id, s.name, s.email, s.phone, e.enrolled_at
       FROM enrollments e JOIN students s ON s.id = e.student_id
      WHERE e.batch_id = ? ORDER BY s.id`,
    [batchId]
  );
  const r = await db.get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
       FROM attendance WHERE batch_id = ?`,
    [batchId]
  );
  batch.attendance_rate = pct(Number(r.present || 0), Number(r.total || 0));
  return batch;
}

async function createBatch(body = {}) {
  requireFields(body, ['program_id', 'customer_id']);
  const program = await db.get('SELECT id FROM programs WHERE id = ?', [str(body.program_id)]);
  if (!program) throw badRequest('Unknown program_id');
  const customer = await db.get('SELECT id FROM customers WHERE id = ?', [str(body.customer_id)]);
  if (!customer) throw badRequest('Unknown customer_id');
  if (body.trainer_id && !(await db.get('SELECT 1 AS ok FROM trainers WHERE id = ?', [str(body.trainer_id)]))) {
    throw badRequest('Unknown trainer_id');
  }
  // The frontend supplies a batch id (optional); otherwise generate one.
  const id = isNonEmpty(body.id) ? str(body.id) : await nid(db, 'B', 'batches');
  if (await db.get('SELECT 1 AS ok FROM batches WHERE id = ?', [id])) throw conflict(`Batch ${id} already exists`);
  await db.run(
    `INSERT INTO batches (id, program_id, customer_id, trainer_id, start_date, end_date, capacity, status)
     VALUES (?,?,?,?,?,?,?,'ACTIVE')`,
    [id, str(body.program_id), str(body.customer_id), str(body.trainer_id) || null,
      str(body.start_date) || null, str(body.end_date) || null, toInt(body.capacity, 50)]
  );
  return batchWithMeta(db, await db.get('SELECT * FROM batches WHERE id = ?', [id]));
}

// ---------- Students ----------
/**
 * Roster read. The trainer sees their own students (short roster); a student
 * sees only themselves. INSTITUTION can now also list students scoped to their
 * customer_id (read-only view for the "Students" tab in the institution panel).
 * Organization sees all students across the platform.
 */
async function listStudents(scope, opts = {}) {
  const { batch_id = '', search = '' } = opts;
  if (scope.role === 'student') {
    return db.query('SELECT * FROM students WHERE id = ?', [scope.student_id]);
  }
  // Institution: read-only view of their own students (scoped by customer_id)
  if (scope.role === 'institution') {
    if (!scope.customer_id) return [];
    let sql = `SELECT s.*, GROUP_CONCAT(e.batch_id) AS batch_label
       FROM students s LEFT JOIN enrollments e ON e.student_id = s.id
      WHERE s.customer_id = ?`;
    const params = [scope.customer_id];
    if (batch_id) {
      sql += ` AND EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.student_id = s.id AND e2.batch_id = ?)`;
      params.push(batch_id);
    }
    if (search) {
      sql += ` AND (s.name LIKE ? OR s.email LIKE ? OR s.id LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    sql += ` GROUP BY s.id ORDER BY s.id`;
    const rows = await db.query(sql, params);
    return Promise.all(rows.map(async (s) => {
      const att = await db.get(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
           FROM attendance WHERE student_id = ?`, [s.id]
      );
      const prog = await db.query(
        `SELECT DISTINCT p.name FROM enrollments e
           JOIN batches b ON b.id = e.batch_id
           JOIN programs p ON p.id = b.program_id
          WHERE e.student_id = ?`, [s.id]
      );
      return {
        ...s,
        program: prog.map(p => p.name).join(', ') || null,
        attendance: pct(Number(att.present || 0), Number(att.total || 0)),
      };
    }));
  }
  // Organization: see all students across the platform (read-only overview)
  if (scope.role === 'organization') {
    let sql = `SELECT s.*, GROUP_CONCAT(e.batch_id) AS batch_label, c.name AS customer_name
       FROM students s
       LEFT JOIN enrollments e ON e.student_id = s.id
       LEFT JOIN customers c ON c.id = s.customer_id`;
    const params = [];
    const conditions = [];
    if (batch_id) {
      conditions.push(`EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.student_id = s.id AND e2.batch_id = ?)`);
      params.push(batch_id);
    }
    if (search) {
      conditions.push(`(s.name LIKE ? OR s.email LIKE ? OR s.id LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (conditions.length) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }
    sql += ` GROUP BY s.id ORDER BY s.id`;
    const rows = await db.query(sql, params);
    return Promise.all(rows.map(async (s) => {
      const att = await db.get(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
           FROM attendance WHERE student_id = ?`, [s.id]
      );
      const prog = await db.query(
        `SELECT DISTINCT p.name FROM enrollments e
           JOIN batches b ON b.id = e.batch_id
           JOIN programs p ON p.id = b.program_id
          WHERE e.student_id = ?`, [s.id]
      );
      return {
        ...s,
        program: prog.map(p => p.name).join(', ') || null,
        attendance: pct(Number(att.present || 0), Number(att.total || 0)),
      };
    }));
  }
  if (scope.role !== 'trainer') {
    throw forbidden('Student management belongs to the trainer who delivers the batch');
  }
  const ids = (await visibleBatchIds(db, scope)) || [];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  let sql = `SELECT DISTINCT s.* FROM students s
    JOIN enrollments e ON e.student_id = s.id
   WHERE e.batch_id IN (${ph})`;
  const params = [...ids];
  if (batch_id) {
    sql += ` AND e.batch_id = ?`;
    params.push(batch_id);
  }
  if (search) {
    sql += ` AND (s.name LIKE ? OR s.email LIKE ? OR s.id LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  sql += ` ORDER BY s.id`;
  const rows = await db.query(sql, params);
  // Enrich with the batch/program label + attendance % the "My Students" table renders.
  return Promise.all(
    rows.map(async (s) => {
      const bs = await db.query(
        `SELECT b.id, p.name AS program_name FROM enrollments e
           JOIN batches b ON b.id = e.batch_id
           LEFT JOIN programs p ON p.id = b.program_id
          WHERE e.student_id = ? AND e.batch_id IN (${ph}) ORDER BY b.id`,
        [s.id, ...ids]
      );
      const att = await db.get(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
           FROM attendance WHERE student_id = ? AND batch_id IN (${ph})`,
        [s.id, ...ids]
      );
      return {
        ...s,
        batch_label: bs.map((b) => b.id).join(', ') || null,
        program: bs.map((b) => b.program_name).filter(Boolean).join(', ') || null,
        attendance: pct(Number(att.present || 0), Number(att.total || 0)),
      };
    })
  );
}

/**
 * Institution: add a student under their own customer_id.
 * Trainer: add + enrol into batch (existing behaviour).
 */
async function createStudent(scope, body = {}) {
  requireFields(body, ['name']);
  // Institution can add students to their own college
  if (scope.role === 'institution') {
    if (!scope.customer_id) throw forbidden('No institution linked to this login');
    const id = await nid(db, 'STU', 'students');
    await db.run(
      'INSERT INTO students (id, name, email, phone, customer_id) VALUES (?,?,?,?,?)',
      [id, str(body.name), str(body.email) || null, str(body.phone) || null, scope.customer_id]
    );
    // Optionally enrol into a batch if batch_id provided
    if (body.batch_id) {
      const batch = await db.get('SELECT customer_id FROM batches WHERE id = ?', [str(body.batch_id)]);
      if (batch && batch.customer_id === scope.customer_id) {
        await db.run('INSERT INTO enrollments (student_id, batch_id) VALUES (?,?)', [id, str(body.batch_id)]);
      }
    }
    return db.get('SELECT * FROM students WHERE id = ?', [id]);
  }
  if (scope.role !== 'trainer') throw forbidden('Only the assigned trainer or institution can add students');
  return db.transaction(async (tx) => {
    let customerId = str(body.customer_id) || null;
    if (body.batch_id) {
      const batch = await tx.get(
        'SELECT customer_id, capacity, trainer_id FROM batches WHERE id = ?',
        [str(body.batch_id)]
      );
      if (!batch) throw badRequest('Unknown batch_id');
      if (batch.trainer_id !== scope.trainer_id) {
        throw forbidden('You can only add students to your own batches');
      }
      customerId = customerId || batch.customer_id;
      const count = await tx.count('SELECT COUNT(*) FROM enrollments WHERE batch_id = ?', [str(body.batch_id)]);
      if (count >= batch.capacity) throw conflict('Batch is at full capacity');
    }
    if (!customerId) throw badRequest('customer_id or batch_id required to place the student');
    const id = await nid(tx, 'STU', 'students');
    await tx.run(
      'INSERT INTO students (id, name, email, phone, customer_id) VALUES (?,?,?,?,?)',
      [id, str(body.name), str(body.email) || null, str(body.phone) || null, customerId]
    );
    if (body.batch_id) {
      await tx.run('INSERT INTO enrollments (student_id, batch_id) VALUES (?,?)', [id, str(body.batch_id)]);
    }
    return tx.get('SELECT * FROM students WHERE id = ?', [id]);
  });
}

// ---------- Enrollments ----------
/**
 * Enrol an existing student into a batch (FLOW H). TRAINER ONLY, own batches
 * only — org/institution never manage the roster directly.
 */
async function createEnrollment(scope, body = {}) {
  requireFields(body, ['student_id', 'batch_id']);
  if (scope.role !== 'trainer') throw forbidden('Only the assigned trainer can enrol students');
  const student = await db.get('SELECT customer_id FROM students WHERE id = ?', [str(body.student_id)]);
  if (!student) throw badRequest('Unknown student_id');
  const batch = await db.get(
    'SELECT customer_id, capacity, trainer_id FROM batches WHERE id = ?',
    [str(body.batch_id)]
  );
  if (!batch) throw badRequest('Unknown batch_id');
  if (batch.trainer_id !== scope.trainer_id) {
    throw forbidden('You can only enrol into your own batches');
  }
  if (student.customer_id !== batch.customer_id) {
    throw conflict('Student belongs to a different institution than the batch');
  }
  const count = await db.count('SELECT COUNT(*) FROM enrollments WHERE batch_id = ?', [str(body.batch_id)]);
  if (count >= batch.capacity) throw conflict('Batch is at full capacity');
  const existing = await db.get(
    'SELECT 1 AS ok FROM enrollments WHERE student_id = ? AND batch_id = ?',
    [str(body.student_id), str(body.batch_id)]
  );
  if (existing) return { student_id: str(body.student_id), batch_id: str(body.batch_id), already: true };
  await db.run('INSERT INTO enrollments (student_id, batch_id) VALUES (?,?)', [str(body.student_id), str(body.batch_id)]);
  return { student_id: str(body.student_id), batch_id: str(body.batch_id) };
}

// ---------- Attendance (FLOW I) ----------
const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE'];

async function listAttendance(scope, { batch_id = '', date = '' } = {}) {
  let sql = `SELECT a.student_id, a.batch_id, a.date, a.status, a.marked_at, s.name AS student_name
               FROM attendance a JOIN students s ON s.id = a.student_id
              WHERE 1=1`;
  const params = [];
  if (batch_id) {
    await assertBatchVisible(db, scope, batch_id);
    sql += ' AND a.batch_id = ?';
    params.push(batch_id);
  } else {
    const visible = await visibleBatchIds(db, scope);
    if (visible !== null) {
      if (!visible.length) return [];
      sql += ` AND a.batch_id IN (${visible.map(() => '?').join(',')})`;
      params.push(...visible);
    }
  }
  if (date) {
    sql += ' AND a.date = ?';
    params.push(date);
  }
  if (scope.role === 'student' && scope.student_id) {
    sql += ' AND a.student_id = ?';
    params.push(scope.student_id);
  }
  return db.query(`${sql} ORDER BY a.date DESC, s.name`, params);
}

/** Upsert a day's roster in one transaction; assigned trainer or org only (403 otherwise). */
async function saveAttendance(scope, body = {}) {
  return db.transaction(async (tx) => {
    requireFields(body, ['batch_id', 'date']);
    if (!Array.isArray(body.records) || body.records.length === 0) {
      throw badRequest('records[] with student_id/status required');
    }
    // FLOW I: trainer must be assigned to this batch; org passes.
    if (scope.role === 'trainer') {
      const assigned = await tx.get(
        'SELECT 1 AS ok FROM batches WHERE id = ? AND trainer_id = ?',
        [str(body.batch_id), scope.trainer_id]
      );
      if (!assigned) throw forbidden('Only the assigned trainer can mark attendance for this batch');
    } else if (scope.role !== 'organization') {
      throw forbidden('Only Rampex organization or the assigned trainer can mark attendance');
    }

    const enrolled = new Set(
      (await tx.query('SELECT student_id FROM enrollments WHERE batch_id = ?', [str(body.batch_id)]))
        .map((r) => r.student_id)
    );
    const stmt = `INSERT INTO attendance (student_id, batch_id, date, status) VALUES (?,?,?,?)
      ON CONFLICT(student_id, batch_id, date) DO UPDATE SET status = excluded.status, marked_at = datetime('now')`;
    for (const rec of body.records) {
      const status = oneOf(str(rec.status), ATTENDANCE_STATUSES, 'attendance status');
      if (!enrolled.has(str(rec.student_id))) {
        throw badRequest(`Student ${str(rec.student_id)} is not enrolled in ${str(body.batch_id)}`);
      }
      await tx.run(stmt, [str(rec.student_id), str(body.batch_id), str(body.date), status]);
    }
    return { batch_id: str(body.batch_id), date: str(body.date), saved: body.records.length };
  });
}

// ---------- Attendance summary for institution (read-only) ----------
async function attendanceSummary(scope) {
  if (scope.role === 'institution' && scope.customer_id) {
    return db.query(
      `SELECT a.student_id, s.name AS student_name, a.batch_id, a.date, a.status, a.marked_at
         FROM attendance a
         JOIN students s ON s.id = a.student_id
         JOIN enrollments e ON e.student_id = a.student_id AND e.batch_id = a.batch_id
         JOIN batches b ON b.id = a.batch_id
        WHERE b.customer_id = ?
        ORDER BY a.date DESC, s.name`,
      [scope.customer_id]
    );
  }
  // Organization sees all
  return db.query(
    `SELECT a.student_id, s.name AS student_name, a.batch_id, a.date, a.status, a.marked_at
       FROM attendance a
       JOIN students s ON s.id = a.student_id
      ORDER BY a.date DESC, s.name`
  );
}

// ---------- Leave Requests (mock in-memory for org approval) ----------
// In-memory store since there's no leave_requests table — purely frontend-driven mock
let _leaveRequests = [
  { id: 'LR-001', trainer_id: 'TR-001', trainer_name: 'Arun Kumar', customer_id: 'CUST-001', type: 'Sick Leave', from_date: '2026-10-05', to_date: '2026-10-06', days: 2, reason: 'Feeling unwell, need rest', status: 'PENDING', applied_on: '2026-09-28' },
  { id: 'LR-002', trainer_id: 'TR-002', trainer_name: 'Divya Rao', customer_id: 'CUST-002', type: 'Casual Leave', from_date: '2026-10-10', to_date: '2026-10-10', days: 1, reason: 'Personal work — bank appointment', status: 'PENDING', applied_on: '2026-09-29' },
  { id: 'LR-003', trainer_id: 'TR-001', trainer_name: 'Arun Kumar', customer_id: 'CUST-001', type: 'Casual Leave', from_date: '2026-09-20', to_date: '2026-09-20', days: 1, reason: 'Family function', status: 'APPROVED', applied_on: '2026-09-15' },
  { id: 'LR-004', trainer_id: 'TR-002', trainer_name: 'Divya Rao', customer_id: 'CUST-002', type: 'Sick Leave', from_date: '2026-09-10', to_date: '2026-09-12', days: 3, reason: 'Fever and cold', status: 'APPROVED', applied_on: '2026-09-08' },
  { id: 'LR-005', trainer_id: 'TR-001', trainer_name: 'Arun Kumar', customer_id: 'CUST-001', type: 'Earned Leave', from_date: '2026-11-01', to_date: '2026-11-05', days: 5, reason: 'Annual vacation — Diwali break', status: 'PENDING', applied_on: '2026-09-30' },
  { id: 'LR-006', trainer_id: 'TR-002', trainer_name: 'Divya Rao', customer_id: 'CUST-002', type: 'Comp Off', from_date: '2026-10-15', to_date: '2026-10-15', days: 1, reason: 'Worked on weekend for WEB batch setup', status: 'PENDING', applied_on: '2026-09-30' },
];
let _lrSeq = 7;

function listLeaveRequests() {
  return [..._leaveRequests].sort((a, b) => {
    const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });
}

function updateLeaveRequest(id, action) {
  const lr = _leaveRequests.find(l => l.id === id);
  if (!lr) throw notFound('Leave request not found');
  if (lr.status !== 'PENDING') throw conflict('Only pending requests can be actioned');
  lr.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
  return lr;
}

async function createLeaveRequest(body) {
  const trainerId = str(body.trainer_id) || 'TR-001';
  // Find the customer_id from the trainer's assigned batches
  const batch = await db.get('SELECT customer_id FROM batches WHERE trainer_id = ?', [trainerId]);
  const customerId = batch?.customer_id || null;

  const id = `LR-${String(_lrSeq++).padStart(3, '0')}`;
  const lr = {
    id,
    trainer_id: trainerId,
    trainer_name: str(body.trainer_name) || 'Unknown',
    customer_id: customerId,
    type: str(body.type) || 'Casual Leave',
    from_date: str(body.from_date),
    to_date: str(body.to_date),
    days: Number(body.days) || 1,
    reason: str(body.reason) || '',
    status: 'PENDING',
    applied_on: new Date().toISOString().slice(0, 10),
  };
  _leaveRequests.push(lr);
  return lr;
}

async function updateStudent(scope, id, body = {}) {
  const student = await db.get('SELECT * FROM students WHERE id = ?', [id]);
  if (!student) throw notFound('Student not found');
  if (scope.role === 'institution' && student.customer_id !== scope.customer_id) {
    throw forbidden('Not authorized to modify this student');
  }
  const name = body.name !== undefined ? str(body.name) : student.name;
  const email = body.email !== undefined ? str(body.email) : student.email;
  const phone = body.phone !== undefined ? str(body.phone) : student.phone;
  await db.run('UPDATE students SET name = ?, email = ?, phone = ? WHERE id = ?', [name, email, phone, id]);
  return db.get('SELECT * FROM students WHERE id = ?', [id]);
}

async function deleteStudent(scope, id) {
  const student = await db.get('SELECT * FROM students WHERE id = ?', [id]);
  if (!student) throw notFound('Student not found');
  if (scope.role === 'institution' && student.customer_id !== scope.customer_id) {
    throw forbidden('Not authorized to delete this student');
  }
  await db.run('DELETE FROM enrollments WHERE student_id = ?', [id]);
  await db.run('DELETE FROM attendance WHERE student_id = ?', [id]);
  await db.run('DELETE FROM scores WHERE student_id = ?', [id]);
  await db.run('DELETE FROM students WHERE id = ?', [id]);
  return { deleted: true, id };
}

async function bulkCreateStudents(scope, body = {}) {
  requireFields(body, ['batch_id', 'students']);
  if (!Array.isArray(body.students) || body.students.length === 0) {
    throw badRequest('students[] array required');
  }
  if (scope.role !== 'trainer' && scope.role !== 'institution' && scope.role !== 'organization') {
    throw forbidden('Only trainer, institution, or organization can bulk add students');
  }
  const batch = await db.get('SELECT customer_id, capacity, trainer_id FROM batches WHERE id = ?', [str(body.batch_id)]);
  if (!batch) throw badRequest('Unknown batch_id');
  if (scope.role === 'trainer' && batch.trainer_id !== scope.trainer_id) {
    throw forbidden('You can only add students to your own batches');
  }
  if (scope.role === 'institution' && batch.customer_id !== scope.customer_id) {
    throw forbidden('Batch does not belong to your institution');
  }
  const currentCount = await db.count('SELECT COUNT(*) FROM enrollments WHERE batch_id = ?', [str(body.batch_id)]);
  if (currentCount + body.students.length > batch.capacity) {
    throw conflict(`Batch capacity exceeded. Available slots: ${batch.capacity - currentCount}`);
  }

  const results = { created: [], failed: [] };
  for (const studentData of body.students) {
    try {
      if (!studentData.name) {
        results.failed.push({ data: studentData, error: 'Name is required' });
        continue;
      }
      const student = await createStudent(scope, {
        name: studentData.name,
        email: studentData.email,
        phone: studentData.phone,
        batch_id: body.batch_id,
      });
      results.created.push(student);
    } catch (err) {
      results.failed.push({ data: studentData, error: err.message });
    }
  }
  return results;
}

module.exports = {
  listPrograms, createProgram, listTrainers, createTrainer, listBatches, getBatch, createBatch,
  listStudents, createStudent, updateStudent, deleteStudent, createEnrollment, listAttendance, saveAttendance, ATTENDANCE_STATUSES,
  attendanceSummary, listLeaveRequests, updateLeaveRequest, createLeaveRequest, bulkCreateStudents,
};
