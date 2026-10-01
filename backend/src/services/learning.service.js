/**
 * Learning support (db-prd §3b): sessions (schedule), materials, interests,
 * assessments + scores, student report, top-students report.
 * Read rules: materials gated by batch visibility; interests readable by
 * assigned trainers, institutions (own students only) + ORGANIZATION.
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

// ---------- Interests (student shares; trainers + institutions (own) + org read) ----------
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
  if (scope.role === 'institution' && scope.customer_id) {
    // Read-only: an institution sees interests shared by its own students.
    const sids = await db.query('SELECT id AS student_id FROM students WHERE customer_id = ?', [scope.customer_id]);
    const sidList = sids.map((r) => r.student_id);
    if (!sidList.length) return [];
    return db.query(
      `${base} WHERE i.student_id IN (${sidList.map(() => '?').join(',')}) ORDER BY i.created_at DESC, i.id DESC`,
      sidList
    );
  }
  throw forbidden('Not authorized — interests are visible only to trainers, institutions (own students) and Rampex');
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

/**
 * Write guard for assessments/scores: Rampex manages everything, the assigned
 * trainer manages own batches, an institution manages only batches of its own
 * customer (tenant-scoped — never another customer's batch).
 */
async function assertCanManageBatch(scope, batchId, { trainer, other } = {}) {
  if (scope.role === 'organization') return;
  if (scope.role === 'trainer') {
    const assigned = await db.get(
      'SELECT 1 AS ok FROM batches WHERE id = ? AND trainer_id = ?',
      [batchId, scope.trainer_id]
    );
    if (!assigned) throw forbidden(trainer || 'Only the assigned trainer can manage this batch');
    return;
  }
  if (scope.role === 'institution') {
    const own = await db.get(
      'SELECT 1 AS ok FROM batches WHERE id = ? AND customer_id = ?',
      [batchId, scope.customer_id]
    );
    if (!own) throw forbidden('Not authorized for this batch');
    return;
  }
  throw forbidden(other || 'Not authorized');
}

async function createAssessment(scope, body = {}) {
  requireFields(body, ['batch_id', 'title']);
  await assertCanManageBatch(scope, str(body.batch_id), {
    trainer: 'Only the assigned trainer can assess this batch',
    other: 'Only Rampex or the assigned trainer can create assessments',
  });
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
  await assertCanManageBatch(scope, asm.batch_id, {
    trainer: 'Only the assigned trainer can record scores',
    other: 'Only Rampex or the assigned trainer can record scores',
  });
  const score = Number(body.score);
  if (!Number.isFinite(score)) throw badRequest('score must be a number');
  const maxScore = Number(asm.max_score) || 100;
  if (score < 0 || score > maxScore) throw badRequest(`score must be between 0 and ${maxScore}`);
  await db.run(
    `INSERT INTO scores (assessment_id,student_id,score,marked_at) VALUES (?,?,?,datetime('now'))
     ON CONFLICT(assessment_id,student_id) DO UPDATE SET score = excluded.score, marked_at = datetime('now')`,
    [str(body.assessment_id), str(body.student_id), score]
  );
  return { saved: true };
}

async function updateAssessment(scope, id, body = {}) {
  const asm = await db.get('SELECT * FROM assessments WHERE id = ?', [id]);
  if (!asm) throw notFound('Assessment not found');
  await assertCanManageBatch(scope, asm.batch_id, {
    trainer: 'Only the assigned trainer can update this assessment',
    other: 'Only Rampex or the assigned trainer can update assessments',
  });
  const title = body.title !== undefined ? str(body.title) : asm.title;
  const max_score = body.max_score !== undefined ? Number(body.max_score) : asm.max_score;
  const assessed_on = body.assessed_on !== undefined ? str(body.assessed_on) : asm.assessed_on;
  await db.run(
    'UPDATE assessments SET title = ?, max_score = ?, assessed_on = ? WHERE id = ?',
    [title, max_score, assessed_on, id]
  );
  return db.get('SELECT * FROM assessments WHERE id = ?', [id]);
}

async function deleteAssessment(scope, id) {
  const asm = await db.get('SELECT * FROM assessments WHERE id = ?', [id]);
  if (!asm) throw notFound('Assessment not found');
  await assertCanManageBatch(scope, asm.batch_id, {
    trainer: 'Only the assigned trainer can delete this assessment',
    other: 'Only Rampex or the assigned trainer can delete assessments',
  });
  await db.run('DELETE FROM scores WHERE assessment_id = ?', [id]);
  await db.run('DELETE FROM assessments WHERE id = ?', [id]);
  return { deleted: true, id };
}

async function deleteScore(scope, assessmentId, studentId) {
  const asm = await db.get('SELECT * FROM assessments WHERE id = ?', [assessmentId]);
  if (!asm) throw notFound('Assessment not found');
  await assertCanManageBatch(scope, asm.batch_id, {
    trainer: 'Only the assigned trainer can delete this score',
    other: 'Only Rampex or the assigned trainer can delete scores',
  });
  await db.run('DELETE FROM scores WHERE assessment_id = ? AND student_id = ?', [assessmentId, studentId]);
  return { deleted: true };
}

// ---------- Per-assessment analytics report (PDF / Excel export) ----------
/**
 * Builds a rich per-assessment analytics payload: every student's mark, summary
 * statistics (mean/median/spread/pass rate), a 5-band score distribution, top &
 * bottom performers, below-threshold students needing remediation, and a
 * batch-wide comparison. Read-scoped to the caller (Rampex sees all; a trainer
 * only their assigned batch; an institution only its own customer's batch).
 */
async function assessmentReport(scope, assessmentId) {
  const asm = await db.get('SELECT * FROM assessments WHERE id = ?', [assessmentId]);
  if (!asm) throw notFound('Assessment not found');
  if (scope.role !== 'organization') {
    await assertCanManageBatch(scope, asm.batch_id, {
      trainer: 'Only the assigned trainer can view this report',
      other: 'Not authorized for this assessment',
    });
  }

  const batch = await db.get(
    `SELECT b.id, p.name AS program_name, t.name AS trainer_name, c.name AS customer_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) AS enrollment_total
       FROM batches b
       LEFT JOIN programs p ON p.id = b.program_id
       LEFT JOIN trainers t ON t.id = b.trainer_id
       LEFT JOIN customers c ON c.id = b.customer_id
      WHERE b.id = ?`,
    [asm.batch_id]
  );

  const scores = await db.query(
    `SELECT s.student_id, st.name AS student_name, s.score, a.max_score
       FROM scores s
       JOIN assessments a ON a.id = s.assessment_id
       JOIN students st ON st.id = s.student_id
      WHERE s.assessment_id = ? ORDER BY (s.score * 1.0 / a.max_score) DESC, st.name`,
    [assessmentId]
  );

  const maxScore = Number(asm.max_score) || 100;
  const passThreshold = Math.round(maxScore * 0.5); // 50% of max = pass mark

  const pcts = scores.map((x) => Math.round((Number(x.score) / maxScore) * 100));
  const scoredCount = scores.length;
  const totalEnrolled = Number(batch?.enrollment_total || 0);
  const pendingCount = Math.max(0, totalEnrolled - scoredCount);

  const mean = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const sorted = [...pcts].sort((a, b) => a - b);
  let median = null;
  if (sorted.length) {
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  const maxPct = sorted.length ? sorted[sorted.length - 1] : null;
  const minPct = sorted.length ? sorted[0] : null;
  const rangePct = (maxPct != null && minPct != null) ? maxPct - minPct : null;
  let stddev = null;
  if (pcts.length > 1) {
    const variance = pcts.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / pcts.length;
    stddev = Math.round(Math.sqrt(variance));
  }

  const passCount = pcts.filter((p) => p >= 50).length;
  const failCount = scoredCount - passCount;
  const passRate = scoredCount ? Math.round((passCount / scoredCount) * 100) : null;

  const buckets = [
    { label: '0–20%', lo: 0, hi: 20 },
    { label: '20–40%', lo: 20, hi: 40 },
    { label: '40–60%', lo: 40, hi: 60 },
    { label: '60–80%', lo: 60, hi: 80 },
    { label: '80–100%', lo: 80, hi: 101 },
  ];
  const distribution = buckets.map((b) => {
    const count = pcts.filter((p) => p >= b.lo && p < b.hi).length;
    return { ...b, count, pctOfScored: scoredCount ? Math.round((count / scoredCount) * 100) : 0 };
  });

  const topPerformers = scores.slice(0, 3).map((x) => ({
    student_id: x.student_id, student_name: x.student_name,
    pct: Math.round((Number(x.score) / maxScore) * 100),
  }));
  const bottomPerformers = scores.slice(-3).reverse().map((x) => ({
    student_id: x.student_id, student_name: x.student_name,
    pct: Math.round((Number(x.score) / maxScore) * 100),
  }));
  const weakStudents = scores
    .filter((x) => Math.round((Number(x.score) / maxScore) * 100) < 50)
    .map((x) => ({ student_id: x.student_id, student_name: x.student_name, pct: Math.round((Number(x.score) / maxScore) * 100) }));

  const cmp = await db.get(
    `SELECT AVG(s.score * 1.0 / a.max_score) * 100 AS v, COUNT(DISTINCT a.id) AS n
       FROM scores s JOIN assessments a ON a.id = s.assessment_id
      WHERE a.batch_id = ?`,
    [asm.batch_id]
  );
  const batchAvgAll = cmp.v == null ? null : Math.round(Number(cmp.v));
  const assessmentCountInBatch = Number(cmp.n || 0);
  const delta = (mean != null && batchAvgAll != null) ? mean - batchAvgAll : null;

  return {
    assessment: {
      id: asm.id, title: asm.title, batch_id: asm.batch_id,
      max_score: maxScore, assessed_on: asm.assessed_on, pass_threshold: passThreshold,
    },
    batch: {
      id: batch?.id || asm.batch_id,
      program_name: batch?.program_name || '—',
      trainer_name: batch?.trainer_name || '—',
      customer_name: batch?.customer_name || '—',
      enrollment_total: totalEnrolled,
      assessment_count: assessmentCountInBatch,
    },
    scores: scores.map((x) => ({
      student_id: x.student_id, student_name: x.student_name,
      score: Number(x.score), max_score: maxScore,
      pct: Math.round((Number(x.score) / maxScore) * 100),
    })),
    stats: {
      scored_count: scoredCount, total_enrolled: totalEnrolled, pending_count: pendingCount,
      mean_pct: mean, median_pct: median, max_pct: maxPct, min_pct: minPct,
      range_pct: rangePct, stddev_pct: stddev,
      pass_count: passCount, fail_count: failCount, pass_rate: passRate,
    },
    distribution,
    top_performers: topPerformers,
    bottom_performers: bottomPerformers,
    weak_students: weakStudents,
    batch_comparison: { this_avg: mean, batch_avg_all: batchAvgAll, delta },
  };
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
  } else if (scope.role === 'institution') {
    // Read-only: an institution may view reports of its own college's students.
    if (!scope.customer_id || st.customer_id !== scope.customer_id) throw forbidden('Not authorized');
  } else if (scope.role !== 'organization') {
    throw forbidden('Student reports are visible to Rampex, the assigned trainer, the institution, or the student');
  }

  const interests = await db.query(
    'SELECT * FROM interests WHERE student_id = ? ORDER BY created_at DESC, id DESC',
    [studentId]
  );

  const attCounts = await db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
       FROM attendance WHERE student_id = ?`,
    [studentId]
  );
  const assessmentRows = await db.query(
    `SELECT a.title, s.score AS score, a.max_score, a.assessed_on
       FROM scores s JOIN assessments a ON a.id = s.assessment_id
      WHERE s.student_id = ? ORDER BY a.assessed_on DESC, a.id DESC`,
    [studentId]
  );

  return {
    ...st,
    attendance: await attendancePct(studentId),
    attendance_present: Number(attCounts.present || 0),
    attendance_total: Number(attCounts.total || 0),
    avg_score: await avgScore(studentId),
    weak_areas: await weakAreas(studentId),
    interests,
    batches: batchIds,
    assessments: assessmentRows,
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
  updateAssessment, deleteAssessment,
  listScores, saveScore, deleteScore,
  studentReport, topStudentsReport, assessmentReport,
};
