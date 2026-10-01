/**
 * Feedback — forms, responses and sentiment classification.
 *
 * Two audiences, because the platform has two very different questions to ask:
 *   STUDENT     — the institution (or Rampex) asks its students how delivery
 *                 is going. Students answer; the form's owner reads.
 *   INSTITUTION — an institution (or Rampex itself) reviews the platform.
 *                 Institutions and Rampex answer; Rampex reads everything.
 *
 * Visibility is decided HERE and nowhere else — the client never receives data
 * its role cannot see, and it cannot ask for it either (the scope comes from
 * the auth headers via middleware/scope.js, which nulls keys a role doesn't
 * own). The rule, in one place:
 *
 *   organization → every form, every response, every audience
 *   institution  → ONLY forms it created, and ONLY their responses
 *   student      → STUDENT forms addressed to its college (or the platform),
 *                  plus STUDENT forms written by a trainer who actually teaches
 *                  it, plus its own submissions (never another student's)
 *   trainer      → ONLY the forms it created, and ONLY their responses; it may
 *                  write to its own students, never to institutions
 *
 * Every text answer is scored for sentiment at write time and the verdict is
 * stored, so classification is a recorded fact rather than something each read
 * path recomputes and could disagree about.
 *
 * Async facade throughout.
 */
const db = require('../db');
const { badRequest, notFound, forbidden, conflict, unprocessable } = require('../utils/http');
const { requireFields, oneOf, str } = require('../utils/validate');
const { nid } = require('../utils/ids');
const sentiment = require('../utils/sentiment');

const AUDIENCES = ['STUDENT', 'INSTITUTION'];
const QTYPES = ['RATING', 'TEXT', 'CHOICE'];
const FORM_STATUSES = ['OPEN', 'CLOSED'];
const MAX_QUESTIONS = 25;
const MAX_CHOICE_OPTIONS = 12;

/** Portable timestamp — avoids the SQLite-only datetime('now') in shared SQL. */
function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function safeJson(text, fallback) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Reserve a contiguous block of business codes in one query.
 *
 * nid() derives the next code from the highest suffix present; calling it in a
 * loop would hand out the SAME code for every row, because the earlier inserts
 * aren't visible to a fresh read. Reserving the block up front avoids that.
 */
async function nextCodes(dbLike, prefix, table, count) {
  const rows = await dbLike.query(`SELECT id FROM ${table} WHERE id LIKE ?`, [`${prefix}-%`]);
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const row of rows) {
    const m = re.exec(String(row.id || ''));
    if (m && Number(m[1]) > max) max = Number(m[1]);
  }
  const out = [];
  for (let i = 1; i <= count; i += 1) out.push(`${prefix}-${String(max + i).padStart(3, '0')}`);
  return out;
}

/* ---------- Visibility ---------- */

/**
 * SQL fragment + params selecting the forms a scope may see.
 * Returned fragment always refers to the form table as alias `f`.
 */
function formVisibility(scope) {
  if (scope.role === 'organization') return { sql: '1=1', params: [] };

  if (scope.role === 'institution') {
    // Only what this college created — not Rampex's forms, not other colleges'.
    if (!scope.customer_id) return { sql: '1=0', params: [] };
    return {
      sql: "f.created_by_role = 'INSTITUTION' AND f.customer_id = ?",
      params: [scope.customer_id],
    };
  }

  if (scope.role === 'student') {
    // Student feedback forms aimed at this student's college, plus any
    // platform-wide student form Rampex publishes.
    //
    // A TRAINER-written form is deliberately excluded from that branch: its
    // `customer_id` is NULL (a trainer doesn't own a college), so the generic
    // "customer_id IS NULL" clause would leak it to every student on the
    // platform. Instead it is visible only to students the trainer actually
    // teaches — traced through enrollments → batches → trainers → users.
    const sid = scope.student_id || '';
    return {
      sql: `f.audience = 'STUDENT' AND (
        (f.created_by_role <> 'TRAINER'
          AND (f.customer_id IS NULL
               OR f.customer_id = (SELECT customer_id FROM students WHERE id = ?)))
        OR
        (f.created_by_role = 'TRAINER' AND EXISTS (
          SELECT 1 FROM enrollments e
            JOIN batches  b ON b.id = e.batch_id
            JOIN trainers t ON t.id = b.trainer_id
           WHERE e.student_id = ? AND t.user_id = f.created_by))
      )`,
      params: [sid, sid],
    };
  }

  if (scope.role === 'trainer') {
    // A trainer sees the forms it wrote — nothing else, from nobody else.
    if (!scope.user_id) return { sql: '1=0', params: [] };
    return {
      sql: "f.created_by_role = 'TRAINER' AND f.created_by = ?",
      params: [scope.user_id],
    };
  }

  return { sql: '1=0', params: [] };
}

/** Who may open a form: the creator, or Rampex over anything. */
function canManage(scope, form) {
  if (scope.role === 'organization') return true;
  if (scope.role === 'institution') {
    return form.created_by_role === 'INSTITUTION' && form.customer_id === scope.customer_id;
  }
  if (scope.role === 'trainer') {
    return form.created_by_role === 'TRAINER' && form.created_by === scope.user_id;
  }
  return false;
}

/** Who may answer a form — determined by its audience, not by who created it. */
function canSubmit(scope, form) {
  if (form.audience === 'STUDENT') return scope.role === 'student';
  // INSTITUTION audience: institutions review the platform, and Rampex records
  // its own review alongside theirs. A trainer never reviews the platform.
  return scope.role === 'institution' || scope.role === 'organization';
}

function assertCanCreate(scope) {
  if (scope.role !== 'organization' && scope.role !== 'institution' && scope.role !== 'trainer') {
    throw forbidden('Only Rampex, an institution or a trainer can create feedback forms');
  }
}

/* ---------- Reads ---------- */

/** Forms visible to the caller, each with its response mix and sentiment. */
async function listForms(scope) {
  const vis = formVisibility(scope);
  const rows = await db.query(
    `SELECT f.*, c.name AS customer_name,
            (SELECT COUNT(*) FROM feedback_questions q WHERE q.form_id = f.id) AS question_count,
            (SELECT COUNT(*) FROM feedback_responses r WHERE r.form_id = f.id) AS response_count,
            (SELECT COUNT(*) FROM feedback_responses r WHERE r.form_id = f.id AND r.sentiment = 'POSITIVE') AS positive_count,
            (SELECT COUNT(*) FROM feedback_responses r WHERE r.form_id = f.id AND r.sentiment = 'NEUTRAL')  AS neutral_count,
            (SELECT COUNT(*) FROM feedback_responses r WHERE r.form_id = f.id AND r.sentiment = 'NEGATIVE') AS negative_count,
            (SELECT AVG(r.sentiment_score) FROM feedback_responses r WHERE r.form_id = f.id) AS avg_sentiment,
            (SELECT COUNT(*) FROM feedback_responses r WHERE r.form_id = f.id AND r.submitted_by = ?) AS mine_count
       FROM feedback_forms f
       LEFT JOIN customers c ON c.id = f.customer_id
      WHERE ${vis.sql}
      ORDER BY f.created_at DESC, f.form_key DESC`,
    [scope.user_id || '', ...vis.params]
  );

  return rows.map((r) => {
    const avg = r.avg_sentiment == null ? null : Math.round(Number(r.avg_sentiment) * 10000) / 10000;
    return {
      ...r,
      avg_sentiment: avg,
      sentiment_label: avg == null ? null : sentiment.labelFor(avg),
      can_submit: canSubmit(scope, r) && r.status === 'OPEN' && !r.mine_count,
      can_manage: canManage(scope, r),
    };
  });
}

/** One form + its questions + this caller's own response, if any. */
async function getForm(scope, id) {
  const vis = formVisibility(scope);
  const form = await db.get(
    `SELECT f.*, c.name AS customer_name
       FROM feedback_forms f
       LEFT JOIN customers c ON c.id = f.customer_id
      WHERE f.id = ? AND ${vis.sql}`,
    [id, ...vis.params]
  );
  if (!form) throw notFound('Feedback form not found');

  const questions = await db.query(
    'SELECT id, text, qtype, options, order_index FROM feedback_questions WHERE form_id = ? ORDER BY order_index, question_key',
    [id]
  );

  const mine = scope.user_id
    ? await db.get(
      'SELECT id, sentiment, sentiment_score, created_at FROM feedback_responses WHERE form_id = ? AND submitted_by = ?',
      [id, scope.user_id]
    )
    : null;

  const counts = await db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN sentiment = 'POSITIVE' THEN 1 ELSE 0 END) AS positive,
            SUM(CASE WHEN sentiment = 'NEUTRAL'  THEN 1 ELSE 0 END) AS neutral,
            SUM(CASE WHEN sentiment = 'NEGATIVE' THEN 1 ELSE 0 END) AS negative,
            AVG(sentiment_score) AS avg_score
       FROM feedback_responses WHERE form_id = ?`,
    [id]
  );

  return {
    ...form,
    questions: questions.map((q) => ({ ...q, options: q.options ? safeJson(q.options, []) : [] })),
    my_response: mine || null,
    can_submit: canSubmit(scope, form) && form.status === 'OPEN' && !mine,
    can_manage: canManage(scope, form),
    stats: {
      total: Number((counts && counts.total) || 0),
      positive: Number((counts && counts.positive) || 0),
      neutral: Number((counts && counts.neutral) || 0),
      negative: Number((counts && counts.negative) || 0),
      avg_score: counts && counts.avg_score != null
        ? Math.round(Number(counts.avg_score) * 10000) / 10000
        : null,
    },
  };
}

/**
 * Responses to a form.
 *   organization → all of them
 *   institution  → only if it created the form
 *   student      → only its own
 */
async function listResponses(scope, formId) {
  const form = await db.get('SELECT * FROM feedback_forms WHERE id = ?', [formId]);
  if (!form) throw notFound('Feedback form not found');

  let where = 'r.form_id = ?';
  const params = [formId];

  if (scope.role === 'organization') {
    // Rampex reads every response, whichever audience it came from.
  } else if (scope.role === 'institution' || scope.role === 'trainer') {
    // A creator reads the answers to its own form — and nothing else.
    if (!canManage(scope, form)) {
      throw forbidden('You can only read responses to feedback forms you created');
    }
  } else if (scope.role === 'student') {
    where += ' AND r.submitted_by = ?';
    params.push(scope.user_id || '');
  } else {
    throw forbidden('Not authorized to read feedback responses');
  }

  const rows = await db.query(
    `SELECT r.*, u.name AS submitted_by_name, s.name AS student_name
       FROM feedback_responses r
       LEFT JOIN users u ON u.id = r.submitted_by
       LEFT JOIN students s ON s.id = r.student_id
      WHERE ${where}
      ORDER BY r.created_at DESC, r.response_key DESC`,
    params
  );

  // Answers for the whole form in one query, then grouped — avoids N+1.
  const answers = await db.query(
    `SELECT a.*, q.text AS question_text, q.qtype, q.order_index AS question_order
       FROM feedback_answers a
       JOIN feedback_questions q ON q.id = a.question_id
      WHERE q.form_id = ?`,
    [formId]
  );
  const byResponse = new Map();
  for (const a of answers) {
    if (!byResponse.has(a.response_id)) byResponse.set(a.response_id, []);
    byResponse.get(a.response_id).push(a);
  }

  return rows.map((r) => ({
    ...r,
    answers: (byResponse.get(r.id) || []).sort(
      (x, y) => Number(x.question_order) - Number(y.question_order)
    ),
  }));
}

/** The caller's own submissions (mainly the student "what I sent" view). */
async function myResponses(scope) {
  if (!scope.user_id) return [];
  return db.query(
    `SELECT r.*, f.title AS form_title, f.audience, f.created_by_role
       FROM feedback_responses r
       JOIN feedback_forms f ON f.id = r.form_id
      WHERE r.submitted_by = ?
      ORDER BY r.created_at DESC, r.response_key DESC`,
    [scope.user_id]
  );
}

/* ---------- Writes ---------- */

/** Create a form and its questions in one transaction. */
async function createForm(scope, body = {}) {
  assertCanCreate(scope);
  requireFields(body, ['title']);

  const audience = oneOf(str(body.audience).toUpperCase() || 'STUDENT', AUDIENCES, 'audience');

  // An institution surveys its own students — it cannot address other colleges,
  // and it cannot create the platform-review forms that Rampex owns.
  if (scope.role === 'institution') {
    if (audience !== 'STUDENT') {
      throw forbidden('An institution can only create student feedback forms');
    }
    if (!scope.customer_id) {
      throw badRequest('This institution login is not linked to a college');
    }
  }

  // A trainer surveys its own learners. It cannot review the platform, and it
  // cannot reach a college's students — visibility is derived from the batches
  // it teaches, so there is nothing to target.
  if (scope.role === 'trainer') {
    if (audience !== 'STUDENT') {
      throw forbidden('A trainer can only create student feedback forms');
    }
  }

  const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
  if (!rawQuestions.length) throw badRequest('Add at least one question');
  if (rawQuestions.length > MAX_QUESTIONS) {
    throw badRequest(`A form can have at most ${MAX_QUESTIONS} questions`);
  }

  const questions = rawQuestions.map((q, i) => {
    const text = str(q && q.text);
    if (!text) throw badRequest(`Question ${i + 1} needs text`);
    const qtype = oneOf(str(q && q.qtype).toUpperCase() || 'RATING', QTYPES, 'question type');
    let options = null;
    if (qtype === 'CHOICE') {
      const list = Array.isArray(q.options) ? q.options.map((o) => str(o)).filter(Boolean) : [];
      if (list.length < 2) throw badRequest(`Question ${i + 1} needs at least 2 options`);
      options = JSON.stringify(list.slice(0, MAX_CHOICE_OPTIONS));
    }
    return { text, qtype, options, order_index: i };
  });

  // An institution's form always belongs to that college. Rampex may target one
  // college or publish platform-wide. A trainer owns no college, so its form
  // stays customer-less and is scoped by the batches it teaches instead —
  // honouring a customer_id from a trainer would let it reach another college.
  let customerId = null;
  if (scope.role === 'institution') {
    customerId = scope.customer_id;
  } else if (scope.role === 'organization' && str(body.customer_id)) {
    const c = await db.get('SELECT id FROM customers WHERE id = ?', [str(body.customer_id)]);
    if (!c) throw notFound('Customer not found');
    customerId = c.id;
  }

  const formId = await nid(db, 'FB', 'feedback_forms');
  const questionIds = await nextCodes(db, 'FQ', 'feedback_questions', questions.length);

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO feedback_forms (id,title,description,audience,created_by_role,created_by,customer_id,status)
       VALUES (?,?,?,?,?,?,?, 'OPEN')`,
      [formId, str(body.title), str(body.description) || null, audience,
        scope.role.toUpperCase(), scope.user_id || null, customerId]
    );
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      await tx.run(
        'INSERT INTO feedback_questions (id,form_id,text,qtype,options,order_index) VALUES (?,?,?,?,?,?)',
        [questionIds[i], formId, q.text, q.qtype, q.options, q.order_index]
      );
    }
  });

  return getForm(scope, formId);
}

/**
 * Submit a response. Text answers are scored on the way in; rating answers are
 * converted to a sentiment score so the two halves of a form can be averaged
 * together without one silently dominating.
 */
async function submitResponse(scope, formId, body = {}) {
  const form = await db.get('SELECT * FROM feedback_forms WHERE id = ?', [formId]);
  if (!form) throw notFound('Feedback form not found');
  if (form.status !== 'OPEN') throw unprocessable('This feedback form is closed');
  if (!scope.user_id) throw badRequest('Sign in to submit feedback');
  if (!canSubmit(scope, form)) throw forbidden('This form is not addressed to your role');

  const already = await db.get(
    'SELECT id FROM feedback_responses WHERE form_id = ? AND submitted_by = ?',
    [formId, scope.user_id]
  );
  if (already) throw conflict('You have already submitted this form');

  // A student may only answer a form aimed at their own college.
  let studentId = null;
  let customerId = form.customer_id;
  if (scope.role === 'student') {
    const s = await db.get('SELECT id, customer_id FROM students WHERE id = ?', [scope.student_id || '']);
    if (!s) throw forbidden('This login is not linked to a student record');
    if (form.customer_id && s.customer_id !== form.customer_id) {
      throw forbidden('This form is for another college');
    }
    studentId = s.id;
    customerId = s.customer_id;
  }

  const questions = await db.query(
    'SELECT id, text, qtype FROM feedback_questions WHERE form_id = ? ORDER BY order_index, question_key',
    [formId]
  );

  const provided = Array.isArray(body.answers) ? body.answers : [];
  const byQuestion = new Map();
  for (const a of provided) {
    const qid = str(a && a.question_id);
    if (qid) byQuestion.set(qid, a || {});
  }

  const rows = [];
  for (const q of questions) {
    const a = byQuestion.get(q.id) || {};

    if (q.qtype === 'RATING') {
      const rating = Number(a.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        throw badRequest(`Rate "${q.text}" from 1 to 5`);
      }
      const s = sentiment.analyzeRating(rating, 5);
      rows.push({ question_id: q.id, value: String(rating), rating, sentiment: s.label, sentiment_score: s.score });
    } else if (q.qtype === 'CHOICE') {
      const value = str(a.value);
      if (!value) throw badRequest(`Choose an option for "${q.text}"`);
      // A category carries no polarity of its own — it's a label, not an opinion.
      rows.push({ question_id: q.id, value, rating: null, sentiment: 'NEUTRAL', sentiment_score: 0 });
    } else {
      const value = str(a.value);
      if (!value) {
        rows.push({ question_id: q.id, value: null, rating: null, sentiment: null, sentiment_score: null });
      } else {
        const s = sentiment.analyze(value);
        rows.push({ question_id: q.id, value, rating: null, sentiment: s.label, sentiment_score: s.score });
      }
    }
  }

  const overall = sentiment.combine(
    rows.map((r) => ({ label: r.sentiment || 'NEUTRAL', score: r.sentiment_score == null ? 0 : r.sentiment_score }))
  );

  const responseId = await nid(db, 'FBR', 'feedback_responses');
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO feedback_responses
         (id,form_id,submitted_by,submitted_role,student_id,customer_id,sentiment,sentiment_score)
       VALUES (?,?,?,?,?,?,?,?)`,
      [responseId, formId, scope.user_id, scope.role.toUpperCase(), studentId, customerId,
        overall.label, overall.score]
    );
    for (const r of rows) {
      await tx.run(
        `INSERT INTO feedback_answers (response_id,question_id,value,rating,sentiment,sentiment_score)
         VALUES (?,?,?,?,?,?)`,
        [responseId, r.question_id, r.value, r.rating, r.sentiment, r.sentiment_score]
      );
    }
  });

  return getResponseById(responseId);
}

/** One response with its answers (used as the create-response return value). */
async function getResponseById(id) {
  const r = await db.get(
    `SELECT r.*, u.name AS submitted_by_name, s.name AS student_name, f.title AS form_title
       FROM feedback_responses r
       LEFT JOIN users u ON u.id = r.submitted_by
       LEFT JOIN students s ON s.id = r.student_id
       LEFT JOIN feedback_forms f ON f.id = r.form_id
      WHERE r.id = ?`,
    [id]
  );
  if (!r) throw notFound('Feedback response not found');
  const answers = await db.query(
    `SELECT a.*, q.text AS question_text, q.qtype, q.order_index AS question_order
       FROM feedback_answers a
       LEFT JOIN feedback_questions q ON q.id = a.question_id
      WHERE a.response_id = ?
      ORDER BY q.order_index`,
    [id]
  );
  return { ...r, answers };
}

/** Close or reopen a form (creator, or Rampex). */
async function setFormStatus(scope, id, status) {
  const form = await db.get('SELECT * FROM feedback_forms WHERE id = ?', [id]);
  if (!form) throw notFound('Feedback form not found');
  if (!canManage(scope, form)) throw forbidden('Only the creator (or Rampex) can change this form');
  const next = oneOf(str(status).toUpperCase(), FORM_STATUSES, 'status');
  await db.run('UPDATE feedback_forms SET status = ?, updated_at = ? WHERE id = ?', [next, nowIso(), id]);
  return getForm(scope, id);
}

/** Delete a form and everything hanging off it. */
async function deleteForm(scope, id) {
  const form = await db.get('SELECT * FROM feedback_forms WHERE id = ?', [id]);
  if (!form) throw notFound('Feedback form not found');
  if (!canManage(scope, form)) throw forbidden('Only the creator (or Rampex) can delete this form');
  // Explicit child-first deletes: SQLite needs PRAGMA foreign_keys=ON for
  // ON DELETE CASCADE, and we can't rely on it being set.
  await db.run(
    'DELETE FROM feedback_answers WHERE response_id IN (SELECT id FROM feedback_responses WHERE form_id = ?)',
    [id]
  );
  await db.run('DELETE FROM feedback_responses WHERE form_id = ?', [id]);
  await db.run('DELETE FROM feedback_questions WHERE form_id = ?', [id]);
  await db.run('DELETE FROM feedback_forms WHERE id = ?', [id]);
  return { deleted: true, id };
}

/* ---------- Analytics ---------- */

/** What the classifier is made of — surfaced in the UI so it isn't a black box. */
function engineInfo() {
  return {
    kind: 'rule-based lexicon',
    words: sentiment.LEXICON_SIZE,
    phrases: sentiment.PHRASE_COUNT,
    positive_threshold: sentiment.POSITIVE_THRESHOLD,
    negative_threshold: sentiment.NEGATIVE_THRESHOLD,
    note: 'Lexicon + negation + intensifier scoring, stored at write time. Deterministic and offline — no external model call.',
  };
}

function emptyMix() {
  return { responses: 0, POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0, avg_score: null };
}

/**
 * Sentiment roll-up for everything the caller can see.
 *
 * The breakdown is split by audience on purpose: "how are institutions rating
 * the platform" and "how are students rating our delivery" are different
 * questions, and blending them into one number hides both.
 */
async function overview(scope) {
  const vis = formVisibility(scope);
  const forms = await db.query(
    `SELECT f.id, f.title, f.audience, f.created_by_role, f.status, f.customer_id, f.created_at
       FROM feedback_forms f WHERE ${vis.sql}
      ORDER BY f.created_at DESC, f.form_key DESC`,
    vis.params
  );

  const byAudience = { STUDENT: emptyMix(), INSTITUTION: emptyMix() };
  const base = {
    forms: forms.length,
    open_forms: forms.filter((f) => f.status === 'OPEN').length,
    created_by: {
      ORGANIZATION: forms.filter((f) => f.created_by_role === 'ORGANIZATION').length,
      INSTITUTION: forms.filter((f) => f.created_by_role === 'INSTITUTION').length,
    },
    audience: {
      STUDENT: forms.filter((f) => f.audience === 'STUDENT').length,
      INSTITUTION: forms.filter((f) => f.audience === 'INSTITUTION').length,
    },
  };

  if (!forms.length) {
    return {
      ...base,
      responses: 0,
      sentiment: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
      avg_score: null,
      positive_pct: null,
      by_audience: byAudience,
      by_form: [],
      top_terms: [],
      recent: [],
      engine: engineInfo(),
    };
  }

  const placeholders = forms.map(() => '?').join(',');
  const formIds = forms.map((f) => f.id);
  const audienceOf = new Map(forms.map((f) => [f.id, f.audience]));
  const titleOf = new Map(forms.map((f) => [f.id, f.title]));

  const responses = await db.query(
    `SELECT id, form_id, sentiment, sentiment_score, submitted_role, created_at
       FROM feedback_responses WHERE form_id IN (${placeholders})`,
    formIds
  );

  const sentimentCounts = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  let scoreSum = 0;
  let scoreN = 0;

  for (const r of responses) {
    const label = sentimentCounts[r.sentiment] === undefined ? 'NEUTRAL' : r.sentiment;
    sentimentCounts[label] += 1;
    if (r.sentiment_score != null && Number.isFinite(Number(r.sentiment_score))) {
      scoreSum += Number(r.sentiment_score);
      scoreN += 1;
    }
    const aud = audienceOf.get(r.form_id);
    if (byAudience[aud]) {
      byAudience[aud].responses += 1;
      byAudience[aud][label] += 1;
      if (r.sentiment_score != null) {
        byAudience[aud].avg_score = (byAudience[aud].avg_score || 0) + Number(r.sentiment_score);
      }
    }
  }

  for (const aud of Object.keys(byAudience)) {
    const m = byAudience[aud];
    if (m.responses > 0 && m.avg_score != null) {
      m.avg_score = Math.round((m.avg_score / m.responses) * 10000) / 10000;
    } else {
      m.avg_score = null;
    }
  }

  const total = responses.length;
  const avgScore = scoreN ? Math.round((scoreSum / scoreN) * 10000) / 10000 : null;

  // Per-form mix, richest first so the noisiest form leads.
  const byForm = forms
    .map((f) => {
      const mine = responses.filter((r) => r.form_id === f.id);
      const mix = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
      let sum = 0;
      let n = 0;
      for (const r of mine) {
        const label = mix[r.sentiment] === undefined ? 'NEUTRAL' : r.sentiment;
        mix[label] += 1;
        if (r.sentiment_score != null) { sum += Number(r.sentiment_score); n += 1; }
      }
      return {
        id: f.id,
        title: f.title,
        audience: f.audience,
        created_by_role: f.created_by_role,
        status: f.status,
        created_at: f.created_at,
        responses: mine.length,
        POSITIVE: mix.POSITIVE,
        NEUTRAL: mix.NEUTRAL,
        NEGATIVE: mix.NEGATIVE,
        avg_score: n ? Math.round((sum / n) * 10000) / 10000 : null,
      };
    })
    .sort((a, b) => b.responses - a.responses);

  // What people actually complain about — re-reads the stored negative answers
  // through the same scorer so the themes shown match the labels stored.
  const negativeAnswers = await db.query(
    `SELECT a.value FROM feedback_answers a
       JOIN feedback_questions q ON q.id = a.question_id
      WHERE q.form_id IN (${placeholders}) AND a.sentiment = 'NEGATIVE' AND a.value IS NOT NULL`,
    formIds
  );
  const termCounts = new Map();
  for (const row of negativeAnswers) {
    const analysis = sentiment.analyze(row.value);
    for (const t of analysis.terms) {
      const m = /^([+-][\d.]+) "(.+)"$/.exec(t);
      if (!m) continue;
      if (Number(m[1]) >= 0) continue;
      const key = m[2];
      termCounts.set(key, (termCounts.get(key) || 0) + 1);
    }
  }
  const topTerms = [...termCounts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const recent = await db.query(
    `SELECT r.id, r.form_id, r.sentiment, r.sentiment_score, r.submitted_role, r.created_at,
            u.name AS submitted_by_name, s.name AS student_name
       FROM feedback_responses r
       LEFT JOIN users u ON u.id = r.submitted_by
       LEFT JOIN students s ON s.id = r.student_id
      WHERE r.form_id IN (${placeholders})
      ORDER BY r.created_at DESC, r.response_key DESC
      LIMIT 8`,
    formIds
  );

  return {
    ...base,
    responses: total,
    sentiment: sentimentCounts,
    avg_score: avgScore,
    positive_pct: total ? Math.round((sentimentCounts.POSITIVE / total) * 1000) / 10 : null,
    negative_pct: total ? Math.round((sentimentCounts.NEGATIVE / total) * 1000) / 10 : null,
    by_audience: byAudience,
    by_form: byForm.slice(0, 8),
    top_terms: topTerms,
    recent: recent.map((r) => ({ ...r, form_title: titleOf.get(r.form_id) || r.form_id })),
    engine: engineInfo(),
  };
}

/** Bare form row (no visibility filter) — for callers that already resolved access. */
async function getFormMeta(id) {
  return db.get(
    'SELECT id, title, audience, created_by, created_by_role, customer_id, status FROM feedback_forms WHERE id = ?',
    [id]
  );
}

module.exports = {
  listForms,
  getForm,
  getFormMeta,
  createForm,
  setFormStatus,
  deleteForm,
  listResponses,
  submitResponse,
  myResponses,
  overview,
  formVisibility,
  canManage,
  canSubmit,
  AUDIENCES,
  QTYPES,
  FORM_STATUSES,
  MAX_QUESTIONS,
};
