/**
 * AI weak-area insights — identifies what a student should work on from their
 * assessment performance.
 *
 * Two layers, so the feature never depends on the model being reachable:
 *   1. Rule analysis (always): per-topic scores vs the batch average, trend
 *      over time, attendance context → weakest topics + a concrete focus plan.
 *   2. AI narrative (best-effort): the same numbers go to the OpenRouter chain
 *      (assistant.service.generate) for a coach-style write-up. Any failure —
 *      no key, quota, timeout — falls back to the rule layer with ai:false.
 *
 * Scope mirrors studentReport: the student themselves, the assigned trainer,
 * the student's own institution, or Rampex. Institutions only ever see marks
 * from PUBLISHED assessments.
 */
const db = require('../db');
const { forbidden, notFound } = require('../utils/http');
const { canSeeBatch } = require('./scope.service');
const { attendancePct, avgScore } = require('./dashboard.service');
const assistant = require('./assistant.service');

async function assertStudentVisible(scope, studentId) {
  const st = await db.get(
    `SELECT s.*, c.name AS customer_name FROM students s
      LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [studentId]
  );
  if (!st) throw notFound('Student not found');
  if (scope.role === 'organization') return st;
  if (scope.role === 'student') {
    if (scope.student_id !== st.id) throw forbidden('Not authorized');
    return st;
  }
  if (scope.role === 'trainer') {
    const batchIds = (
      await db.query('SELECT batch_id FROM enrollments WHERE student_id = ?', [studentId])
    ).map((r) => r.batch_id);
    const seen = await Promise.all(batchIds.map((b) => canSeeBatch(db, scope, b)));
    if (!batchIds.length || !seen.some(Boolean)) throw forbidden('Not authorized');
    return st;
  }
  if (scope.role === 'institution') {
    if (!scope.customer_id || st.customer_id !== scope.customer_id) throw forbidden('Not authorized');
    return st;
  }
  throw forbidden('Not authorized');
}

async function loadScores(scope, studentId) {
  const pubOnly = scope.role === 'institution' || scope.role === 'student';
  const rows = await db.query(
    `SELECT a.id AS assessment_id, a.title AS topic, a.batch_id, a.assessed_on,
            a.max_score, s.score,
            (SELECT AVG(s2.score * 1.0 / a2.max_score) * 100
               FROM scores s2 JOIN assessments a2 ON a2.id = s2.assessment_id
              WHERE s2.assessment_id = a.id) AS batch_avg,
            b.id IS NOT NULL AS in_scope
       FROM scores s
       JOIN assessments a ON a.id = s.assessment_id
       LEFT JOIN batches b ON b.id = a.batch_id
      WHERE s.student_id = ?
      ORDER BY a.assessed_on, a.id`,
    [studentId]
  );
  const statusById = Object.fromEntries(
    (await db.query('SELECT id, status FROM assessments')).map((a) => [a.id, a.status || 'DRAFT'])
  );
  return rows
    .filter((r) => !pubOnly || (statusById[r.assessment_id] || 'DRAFT') === 'PUBLISHED')
    .map((r) => ({
      topic: r.topic,
      batch_id: r.batch_id,
      assessed_on: r.assessed_on,
      score: Number(r.score),
      max_score: Number(r.max_score) || 100,
      pct: Math.round((Number(r.score) / (Number(r.max_score) || 100)) * 100),
      batch_avg: r.batch_avg == null ? null : Math.round(Number(r.batch_avg)),
    }));
}

/** Deterministic analysis — the backbone the AI narrative is grounded in. */
function ruleAnalysis(scores, attendance) {
  const ranked = [...scores].sort((a, b) => a.pct - b.pct);
  const weakest = ranked.slice(0, 3).map((r) => ({
    topic: r.topic,
    pct: r.pct,
    batch_avg: r.batch_avg,
    gap: r.batch_avg == null ? null : r.pct - r.batch_avg,
  }));
  const strengths = [...scores]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2)
    .filter((r) => r.pct >= 60)
    .map((r) => ({ topic: r.topic, pct: r.pct }));

  let trend = '—';
  if (scores.length >= 3) {
    const half = Math.floor(scores.length / 2);
    const first = scores.slice(0, half).reduce((s, r) => s + r.pct, 0) / half;
    const second = scores.slice(half).reduce((s, r) => s + r.pct, 0) / (scores.length - half);
    trend = second - first >= 8 ? 'improving' : first - second >= 8 ? 'declining' : 'steady';
  }

  const plan = [];
  for (const w of weakest) {
    if (w.pct < 50) {
      plan.push(
        `Rebuild ${w.topic} from the basics (${w.pct}%${w.batch_avg != null ? `, batch average ${w.batch_avg}%` : ''}) — redo the batch material and one practice set before the next assessment.`
      );
    } else if (w.pct < 70) {
      plan.push(
        `Push ${w.topic} from ${w.pct}% toward 80%+ with timed practice on the sub-topics missed last time.`
      );
    }
  }
  if (trend === 'declining') plan.push('Scores are trending down across recent assessments — check for gaps in the latest topics first, then revise backwards.');
  if (trend === 'improving') plan.push('Scores are trending up — keep the current study routine and protect revision time for the weakest topic above.');
  if (attendance != null && attendance < 75) {
    plan.push(`Attendance is ${attendance}% (below the 75% certification bar) — missed sessions are likely dragging scores down, so prioritise catching up on skipped classes.`);
  }
  if (!plan.length) plan.push('Performance is solid across topics — attempt stretch material and peer-teach the strongest topic to lock it in.');

  return { weakest, strengths, trend, plan };
}

const AI_SYSTEM = `You are a supportive learning coach inside a training CRM. Analyse the student's assessment numbers and reply in plain text only, no markdown, no headings, no bullet symbols: first 2-4 sentences on the weak areas you see (name the topics and numbers), then 3-5 short numbered study actions, each on its own line. Ground everything in the numbers given. Never invent topics, scores, or dates. Keep it under 180 words.`;

async function studentInsights(scope, studentId) {
  const st = await assertStudentVisible(scope, studentId);
  const scores = await loadScores(scope, studentId);
  const attendance = await attendancePct(studentId);
  const avg = await avgScore(studentId);

  if (!scores.length) {
    return {
      student: { id: st.id, name: st.name },
      stats: { avg_pct: avg, attendance_pct: attendance, assessed_count: 0, trend: '—' },
      weakest: [], strengths: [], plan: ['No assessments recorded yet — once the trainer enters marks, this analysis will populate automatically.'],
      narrative: null, ai: false, empty: true,
    };
  }

  const rules = ruleAnalysis(scores, attendance);
  const base = {
    student: { id: st.id, name: st.name },
    stats: { avg_pct: avg, attendance_pct: attendance, assessed_count: scores.length, trend: rules.trend },
    weakest: rules.weakest,
    strengths: rules.strengths,
    plan: rules.plan,
  };

  const payload = JSON.stringify({
    student: st.name,
    average_pct: avg,
    attendance_pct: attendance,
    trend: rules.trend,
    assessments: scores.map((s) => ({
      topic: s.topic, pct: s.pct, batch_average: s.batch_avg, date: s.assessed_on,
    })),
  });

  try {
    const out = await assistant.generate(AI_SYSTEM, `Student assessment data:\n${payload}`);
    return { ...base, narrative: out.reply, ai: true, model: out.model };
  } catch (err) {
    return {
      ...base,
      narrative: null,
      ai: false,
      notice: err && err.status === 503
        ? 'AI is not switched on (no model key) — showing rule-based analysis.'
        : 'AI is temporarily unreachable — showing rule-based analysis.',
    };
  }
}

module.exports = { studentInsights };
