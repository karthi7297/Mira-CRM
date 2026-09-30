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
 * Roster read. The trainer sees only their own students (short roster); a
 * student sees only themselves. Rampex and institutions deliberately get a 403
 * here — they manage hundreds of students, so they work from aggregate counts
 * (dashboard KPIs, Customer 360 summary), never a name-by-name list.
 */
async function listStudents(scope) {
  if (scope.role === 'student') {
    return db.query('SELECT * FROM students WHERE id = ?', [scope.student_id]);
  }
  if (scope.role !== 'trainer') {
    throw forbidden('Student management belongs to the trainer who delivers the batch');
  }
  const ids = (await visibleBatchIds(db, scope)) || [];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  return db.query(
    `SELECT DISTINCT s.* FROM students s
      JOIN enrollments e ON e.student_id = s.id
     WHERE e.batch_id IN (${ph}) ORDER BY s.id`,
    ids
  );
}

/**
 * Create student + optional enrollment (FLOW H — the enroll form on batch page).
 * TRAINER ONLY, and only into a batch that trainer delivers: a trainer owns a
 * short personal roster, which is the one place name-by-name entry makes sense.
 * Org/institution never reach this route (403 at the middleware).
 */
async function createStudent(scope, body = {}) {
  requireFields(body, ['name']);
  if (scope.role !== 'trainer') throw forbidden('Only the assigned trainer can add students');
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
  return db.query(`${sql} ORDER BY s.name`, params);
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

module.exports = {
  listPrograms, createProgram, listTrainers, createTrainer, listBatches, getBatch, createBatch,
  listStudents, createStudent, createEnrollment, listAttendance, saveAttendance, ATTENDANCE_STATUSES,
};
