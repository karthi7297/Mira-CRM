/**
 * Learning support (db-prd §3b): sessions (schedule), materials, interests,
 * assessments + scores, student report, top-students report.
 * Read rules: materials gated by batch visibility; interests readable ONLY by
 * assigned trainers + ORGANIZATION (institution → 403, enforced here not just UI).
 * Async facade throughout.
 */
const db = require('../db');
const { badRequest, forbidden, notFound } = require('../utils/http');
const { round2 } = require('../utils/numbers');
const { requireFields, oneOf, str } = require('../utils/validate');
const { nid } = require('../utils/ids');
const { visibleBatchIds, canSeeBatch, batchWithMeta } = require('./scope.service');
const { attendancePct, avgScore, weakAreas, topStudents } = require('./dashboard.service');

// ---------- Sessions (schedule: location + timing) ----------
async function listSessions(scope, { batch_id = '' } = {}) {
  let sql = 'SELECT * FROM sessions WHERE 1=1';
  const params = [];
  if (batch_id) {
    if (!(await canSeeBatch(db, scope, batch_id))) throw forbidden('Not authorized for this batch');
    sql += ' AND batch_id = ?';
    params.push(batch_id);
  } else {
    const v = await visibleBatchIds(db, scope);
    if (v !== null) {
      if (!v.length) return [];
      sql += ` AND batch_id IN (${v.map(() => '?').join(',')})`;
      params.push(...v);
    }
  }
  return db.query(`${sql} ORDER BY date`, params);
}

async function createSession(body = {}) {
  requireFields(body, ['batch_id']);
  await db.run(
    'INSERT INTO sessions (batch_id,date,start_time,end_time,location,topic) VALUES (?,?,?,?,?,?)',
    [str(body.batch_id), str(body.date) || null, str(body.start_time) || null,
      str(body.end_time) || null, str(body.location) || null, str(body.topic) || null]
  );
  return db.get('SELECT * FROM sessions WHERE batch_id = ? ORDER BY session_key DESC LIMIT 1', [str(body.batch_id)]);
}

// ---------- Materials (level-gated reads) ----------
async function listMaterials(scope, { batch_id = '' } = {}) {
  let rows = await db.query('SELECT * FROM materials ORDER BY created_at DESC, material_key DESC');
  const v = await visibleBatchIds(db, scope);
  if (v !== null) {
    const batchRows = v.length
      ? await db.query(`SELECT id, program_id FROM batches WHERE id IN (${v.map(() => '?').join(',')})`, v)
      : [];
    const okProg = new Set(batchRows.map((b) => b.program_id));
    rows = rows.filter((m) => (m.batch_id && v.includes(m.batch_id)) || (!m.batch_id && okProg.has(m.program_id)));
  }
  if (batch_id) rows = rows.filter((m) => m.batch_id === batch_id);
  return rows;
}

async function createMaterial(body = {}, createdBy = null) {
  requireFields(body, ['title']);
  const id = await nid(db, 'MAT', 'materials');
  await db.run(
    'INSERT INTO materials (id,program_id,batch_id,title,mat_type,url,notes,created_by) VALUES (?,?,?,?,?,?,?,?)',
    [id, str(body.program_id) || null, str(body.batch_id) || null, str(body.title),
      oneOf(str(body.mat_type) || 'NOTE', ['VIDEO', 'DOC', 'LINK', 'NOTE'], 'material type'),
      str(body.url) || '', str(body.notes) || '', createdBy]
  );
  return db.get('SELECT * FROM materials WHERE id = ?', [id]);
}

// ---------- Interests (student shares; trainers + org read; institution 403) ----------
async function listInterests(scope) {
  const base = `SELECT i.*, s.name AS student_name FROM interests i
    JOIN students s ON s.id = i.student_id`;
  if (scope.role === 'organization') {
    return db.query(`${base} ORDER BY i.created_at DESC, i.id DESC`);
  }
  if (scope.role === 'student' && scope.student_id) {
    return db.query(`${base} WHERE i.student_id = ? ORDER BY i.created_at DESC, i.id DESC`, [scope.student_id]);
  }
  if (scope.role === 'trainer' && scope.trainer_id) {
    const mine = (await visibleBatchIds(db, scope)) || [];
    if (!mine.length) return [];
    const sids = await db.query(
      `SELECT DISTINCT student_id FROM enrollments WHERE batch_id IN (${mine.map(() => '?').join(',')})`,
      mine
    );
    const sidList = sids.map((r) => r.student_id);
    if (!sidList.length) return [];
    return db.query(
      `${base} WHERE i.student_id IN (${sidList.map(() => '?').join(',')}) ORDER BY i.created_at DESC, i.id DESC`,
      sidList
    );
  }
  throw forbidden('Not authorized — interests are visible only to trainers and Rampex');
}

async function createInterest(scope, body = {}) {
  if (!str(body.body)) throw badRequest('Interest text required');
  const sid = scope.role === 'student' ? scope.student_id : str(body.student_id);
  if (!sid) throw forbidden('student_id required');
  if (scope.role !== 'organization' && scope.role !== 'student') {
    throw forbidden('Only students (own) or Rampex can share');
  }
  if (!(await db.get('SELECT 1 AS ok FROM students WHERE id = ?', [sid]))) throw notFound('Unknown student');
  await db.run('INSERT INTO interests (student_id,body) VALUES (?,?)', [sid, str(body.body)]);
  return db.get('SELECT * FROM interests WHERE student_id = ? ORDER BY id DESC LIMIT 1', [sid]);
}

// ---------- Assessments & scores ----------
async function listAssessments(scope, { batch_id = '' } = {}) {
  let rows = await db.query(
    `SELECT a.*, (SELECT COUNT(*) FROM scores sc WHERE sc.assessment_id = a.id) AS score_count
       FROM assessments a ORDER BY a.assessed_on DESC, a.assessment_key DESC`
  );
  const v = await visibleBatchIds(db, scope);
  if (v !== null) rows = rows.filter((a) => v.includes(a.batch_id));
  if (batch_id) {
    if (!(await canSeeBatch(db, scope, batch_id))) throw forbidden('Not authorized for this batch');
    rows = rows.filter((a) => a.batch_id === batch_id);
  }
  return rows;
}

async function createAssessment(scope, body = {}) {
  requireFields(body, ['batch_id', 'title']);
  if (scope.role === 'trainer') {
    const assigned = await db.get(
      'SELECT 1 AS ok FROM batches WHERE id = ? AND trainer_id = ?',
      [str(body.batch_id), scope.trainer_id]
    );
    if (!assigned) throw forbidden('Only the assigned trainer can assess this batch');
  } else if (scope.role !== 'organization') {
    throw forbidden('Only Rampex or the assigned trainer can create assessments');
  }
  const id = await nid(db, 'ASM', 'assessments');
  await db.run(
    'INSERT INTO assessments (id,batch_id,title,max_score,assessed_on,created_by) VALUES (?,?,?,?,?,?)',
    [id, str(body.batch_id), str(body.title), Number(body.max_score) || 100,
      str(body.assessed_on) || new Date().toISOString().slice(0, 10), null]
  );
  return db.get('SELECT * FROM assessments WHERE id = ?', [id]);
}

async function listScores(scope, { batch_id = '', student_id = '' } = {}) {
  let rows = await db.query(
    `SELECT s.*, a.title AS topic, a.max_score, a.batch_id, st.name AS student_name
       FROM scores s
       JOIN assessments a ON a.id = s.assessment_id
       JOIN students st ON st.id = s.student_id
      ORDER BY s.id DESC LIMIT 500`
  );
  if (scope.role === 'student' && scope.student_id) {
    return rows.filter((r) => r.student_id === scope.student_id);
  }
  const v = await visibleBatchIds(db, scope);
  if (v !== null) rows = rows.filter((r) => v.includes(r.batch_id));
  if (batch_id) rows = rows.filter((r) => r.batch_id === batch_id);
  if (student_id) rows = rows.filter((r) => r.student_id === student_id);
  if (!['organization', 'trainer', 'institution'].includes(scope.role)) throw forbidden('Not authorized');
  return rows;
}

async function saveScore(scope, body = {}) {
  requireFields(body, ['assessment_id', 'student_id']);
  const asm = await db.get('SELECT * FROM assessments WHERE id = ?', [str(body.assessment_id)]);
  if (!asm) throw notFound('Assessment not found');
  if (scope.role === 'trainer') {
    const assigned = await db.get(
      'SELECT 1 AS ok FROM batches WHERE id = ? AND trainer_id = ?',
      [asm.batch_id, scope.trainer_id]
    );
    if (!assigned) throw forbidden('Only the assigned trainer can record scores');
  } else if (scope.role !== 'organization') {
    throw forbidden('Only Rampex or the assigned trainer can record scores');
  }
  const score = Number(body.score);
  if (!Number.isFinite(score)) throw badRequest('score must be a number');
  await db.run(
    `INSERT INTO scores (assessment_id,student_id,score,marked_at) VALUES (?,?,?,datetime('now'))
     ON CONFLICT(assessment_id,student_id) DO UPDATE SET score = excluded.score, marked_at = datetime('now')`,
    [str(body.assessment_id), str(body.student_id), score]
  );
  return { saved: true };
}

// ---------- Student report (FLOW T: attendance + scores + interests) ----------
/**
 * Per-student drill-down. Visible to the trainer who delivers the student's
 * batch, or to the student themselves. Org/institution see aggregates only —
 * they never manage students name-by-name (master-prd §3).
 */
async function studentReport(scope, studentId) {
  const st = await db.get(
    `SELECT s.*, c.name AS customer_name FROM students s
      LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [studentId]
  );
  if (!st) throw notFound('Student not found');
  const batchIds = (await db.query(
    'SELECT b.id FROM enrollments e JOIN batches b ON b.id = e.batch_id WHERE e.student_id = ?',
    [studentId]
  )).map((r) => r.id);

  if (scope.role === 'student') {
    if (scope.student_id !== st.id) throw forbidden('Not authorized');
  } else if (scope.role === 'trainer') {
    const canSeeAny = await Promise.all(batchIds.map((b) => canSeeBatch(db, scope, b)));
    if (!batchIds.length || !canSeeAny.some(Boolean)) throw forbidden('Not authorized');
  } else {
    throw forbidden('Student reports are visible to the assigned trainer or the student');
  }

  const interests = await db.query(
    'SELECT * FROM interests WHERE student_id = ? ORDER BY created_at DESC, id DESC',
    [studentId]
  );

  return {
    ...st,
    attendance: await attendancePct(studentId),
    avg_score: await avgScore(studentId),
    weak_areas: await weakAreas(studentId),
    interests,
    batches: batchIds,
  };
}

// ---------- Top students report (FLOW U) ----------
async function topStudentsReport(scope, { customer_id = '' } = {}) {
  if (scope.role === 'institution') {
    const ids = (await db.query('SELECT id FROM students WHERE customer_id = ?', [scope.customer_id])).map((r) => r.id);
    return topStudents(ids);
  }
  if (scope.role === 'organization') {
    const ids = customer_id
      ? (await db.query('SELECT id FROM students WHERE customer_id = ?', [customer_id])).map((r) => r.id)
      : (await db.query('SELECT id FROM students')).map((r) => r.id);
    return topStudents(ids, customer_id ? 5 : 10);
  }
  throw forbidden('Not authorized');
}

module.exports = {
  listSessions, createSession, listMaterials, createMaterial,
  listInterests, createInterest, listAssessments, createAssessment,
  listScores, saveScore, studentReport, topStudentsReport,
};
