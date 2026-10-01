/**
 * Feedback seed — fills the feedback system with demo content:
 *   4 forms (platform-wide student survey, college-specific survey,
 *   institution-run survey, platform review) + ~18 responses with realistic
 *   sentiment mix (positive / neutral / negative).
 *
 * Idempotent — safe to run repeatedly; existing rows are left untouched.
 * Sentiment is scored at write time with the same scorer the submit path
 * uses (utils/sentiment), so seeded rows look exactly like real submissions.
 * Works through the dialect facade (SQLite dev / MySQL prod).
 *
 * Demo student logins created here use the password `student123`
 * (STU-001 keeps its original arun123 login).
 */
const { hashPassword } = require('../utils/password');
const sentiment = require('../utils/sentiment');

const STUDENT_PASSWORD = 'student123';

async function ensure(db, table, id, sql, params) {
  const row = await db.get(`SELECT id FROM ${table} WHERE id = ?`, [id]);
  if (!row) await db.run(sql, params);
}

async function nextUserId(db) {
  const rows = await db.query('SELECT id FROM users WHERE id LIKE ?', ['U-%']);
  let max = 0;
  for (const r of rows) {
    const m = /^U-(\d+)$/.exec(String(r.id || ''));
    if (m && Number(m[1]) > max) max = Number(m[1]);
  }
  return `U-${String(max + 1).padStart(3, '0')}`;
}

/** Give a student a login if they don't have one (demo password). */
async function ensureStudentLogin(db, student) {
  if (student.user_id) return student.user_id;
  if (!student.email) return null;
  const clash = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [String(student.email).toLowerCase()]);
  if (clash) {
    await db.run('UPDATE students SET user_id = ? WHERE id = ?', [clash.id, student.id]);
    return clash.id;
  }
  const uid = await nextUserId(db);
  await db.run(
    'INSERT INTO users (id,name,email,phone,password_hash,role,customer_id,status) VALUES (?,?,?,?,?,?,?,?)',
    [uid, student.name, String(student.email).toLowerCase(), null, hashPassword(STUDENT_PASSWORD), 'STUDENT', null, 'ACTIVE']
  );
  await db.run('UPDATE students SET user_id = ? WHERE id = ?', [uid, student.id]);
  return uid;
}

const FORMS = [
  {
    id: 'FB-001',
    title: 'Training delivery feedback',
    description: 'Help us improve our training — rate your batch experience and tell us what worked.',
    audience: 'STUDENT', created_by_role: 'ORGANIZATION', created_by: 'U-001', customer_id: null, status: 'OPEN',
    questions: [
      ['FQ-001', 'Overall training quality', 'RATING', null],
      ['FQ-002', 'Trainer knowledge and clarity', 'RATING', null],
      ['FQ-003', 'Lab sessions and study material', 'RATING', null],
      ['FQ-004', 'What did you like most about the training?', 'TEXT', null],
      ['FQ-005', 'What should we improve?', 'TEXT', null],
    ],
  },
  {
    id: 'FB-002',
    title: 'ABC College — AIML batch feedback',
    description: 'For ABC College students in the AI & Machine Learning batch.',
    audience: 'STUDENT', created_by_role: 'ORGANIZATION', created_by: 'U-001', customer_id: 'CUST-001', status: 'OPEN',
    questions: [
      ['FQ-006', 'How would you rate the AIML sessions so far?', 'RATING', null],
      ['FQ-007', 'Pace of the classes', 'RATING', null],
      ['FQ-008', 'How do you want doubts cleared?', 'CHOICE', JSON.stringify(['Extra lab hours', 'Weekend revision', 'One-on-one mentoring', 'Recorded videos'])],
      ['FQ-009', 'Anything else you want to tell your trainers?', 'TEXT', null],
    ],
  },
  {
    id: 'FB-003',
    title: 'How are your AIML classes going?',
    description: 'A quick pulse check from your college — your trainers read every response.',
    audience: 'STUDENT', created_by_role: 'INSTITUTION', created_by: 'U-002', customer_id: 'CUST-001', status: 'OPEN',
    questions: [
      ['FQ-010', 'How satisfied are you with the classes this month?', 'RATING', null],
      ['FQ-011', 'What is going well?', 'TEXT', null],
      ['FQ-012', 'What is making learning hard for you?', 'TEXT', null],
    ],
  },
  {
    id: 'FB-004',
    title: 'Institution platform review',
    description: 'Colleges rate the Rampex platform — delivery, billing and support.',
    audience: 'INSTITUTION', created_by_role: 'ORGANIZATION', created_by: 'U-001', customer_id: null, status: 'OPEN',
    questions: [
      ['FQ-013', 'Overall platform experience', 'RATING', null],
      ['FQ-014', 'Billing and payment support', 'RATING', null],
      ['FQ-015', 'What should Rampex improve?', 'TEXT', null],
    ],
  },
];

// [responseId, formId, userId, studentId, customerId, submittedRole, createdAt, answers...]
// answers: [questionId, { rating } | { value }]
const POSITIVE_TEXTS = [
  'Excellent trainer, very helpful and the labs were clear and practical',
  'Great sessions, knowledgeable faculty and good study material, I really enjoyed it',
  'Smooth and well organised classes, everything was easy to follow, thank you',
];
const NEUTRAL_TEXTS = [
  'Classes are okay so far, average pace, nothing major to report',
  'It is fine, some sessions were good and some were just okay',
];
const NEGATIVE_TEXTS = [
  'Slow lab machines and confusing schedule, poor support when we asked for help',
  'Sessions feel rushed and monotonous, too much theory and outdated material',
  'Disappointing experience, classes were disorganised and my doubts were ignored',
];

async function seedFeedback(db) {
  console.log('[feedback-seed] seeding demo feedback…');

  // 1. Logins for a spread of students (4 per college) so responses have authors.
  for (const cust of ['CUST-001', 'CUST-002', 'CUST-003']) {
    const studs = await db.query(
      "SELECT id, user_id, name, email FROM students WHERE customer_id = ? AND email IS NOT NULL AND email <> '' ORDER BY id LIMIT 4",
      [cust]
    );
    for (const s of studs) {
      await ensureStudentLogin(db, s);
    }
  }
  const inCust = async (c) => db.query(
    'SELECT s.id, s.user_id, s.name, s.email FROM students s WHERE s.customer_id = ? AND s.user_id IS NOT NULL ORDER BY s.id',
    [c]
  );

  // 2. Forms + questions.
  for (const f of FORMS) {
    await ensure(db, 'feedback_forms', f.id,
      'INSERT INTO feedback_forms (id,title,description,audience,created_by_role,created_by,customer_id,status) VALUES (?,?,?,?,?,?,?,?)',
      [f.id, f.title, f.description, f.audience, f.created_by_role, f.created_by, f.customer_id, f.status]);
    for (const [qid, text, qtype, options] of f.questions) {
      await ensure(db, 'feedback_questions', qid,
        'INSERT INTO feedback_questions (id,form_id,text,qtype,options,order_index) VALUES (?,?,?,?,?,?)',
        [qid, f.id, text, qtype, options, f.questions.findIndex((q) => q[0] === qid)]);
    }
  }

  // 3. Responses. Authors are spread so every sentiment band shows up.
  // Payload order matches each form's question order:
  //   RATING → 1-5 number · CHOICE → option string · TEXT → free text.
  const c1 = await inCust('CUST-001');
  const c2 = await inCust('CUST-002');
  const c3 = await inCust('CUST-003');

  const RESPONSES = [
    // FB-001 platform-wide student survey [r, r, r, text, text]: mixed bag
    ['FBR-001', 'FB-001', c1[0], [5, 5, 4, POSITIVE_TEXTS[0], POSITIVE_TEXTS[0]], '2026-09-27 12:00:00'],
    ['FBR-002', 'FB-001', c1[1], [4, 4, 3, POSITIVE_TEXTS[1], NEUTRAL_TEXTS[0]], '2026-09-28 12:00:00'],
    ['FBR-003', 'FB-001', c2[0], [3, 3, 3, NEUTRAL_TEXTS[1], NEUTRAL_TEXTS[0]], '2026-09-28 12:00:00'],
    ['FBR-004', 'FB-001', c2[1], [2, 2, 1, NEGATIVE_TEXTS[0], NEGATIVE_TEXTS[2]], '2026-09-29 12:00:00'],
    ['FBR-005', 'FB-001', c3[0], [5, 5, 5, POSITIVE_TEXTS[2], POSITIVE_TEXTS[1]], '2026-09-29 12:00:00'],
    ['FBR-006', 'FB-001', c3[1], [3, 2, 3, NEGATIVE_TEXTS[1], NEUTRAL_TEXTS[1]], '2026-09-30 12:00:00'],
    // FB-002 ABC College AIML [r, r, choice, text]: mostly warm, one gripe
    ['FBR-007', 'FB-002', c1[0], [5, 5, 'Extra lab hours', POSITIVE_TEXTS[2]], '2026-09-28 12:00:00'],
    ['FBR-008', 'FB-002', c1[2], [4, 3, 'Weekend revision', NEUTRAL_TEXTS[0]], '2026-09-29 12:00:00'],
    ['FBR-009', 'FB-002', c1[3], [2, 2, 'One-on-one mentoring', NEGATIVE_TEXTS[2]], '2026-09-30 12:00:00'],
    // FB-003 institution pulse [r, text, text]: honest mix
    ['FBR-010', 'FB-003', c1[1], [5, POSITIVE_TEXTS[1], POSITIVE_TEXTS[0]], '2026-09-29 12:00:00'],
    ['FBR-011', 'FB-003', c1[2], [2, NEUTRAL_TEXTS[0], NEGATIVE_TEXTS[0]], '2026-09-30 12:00:00'],
    ['FBR-012', 'FB-003', c1[3], [4, POSITIVE_TEXTS[0], NEUTRAL_TEXTS[1]], '2026-09-30 12:00:00'],
    // FB-004 platform review [r, r, text] by institutions + Rampex
    ['FBR-013', 'FB-004', { user_id: 'U-002' }, [5, 4, POSITIVE_TEXTS[0]], '2026-09-29 12:00:00'],
    ['FBR-014', 'FB-004', { user_id: 'U-003' }, [3, 3, NEUTRAL_TEXTS[0]], '2026-09-30 12:00:00'],
    ['FBR-015', 'FB-004', { user_id: 'U-001' }, [4, 5, POSITIVE_TEXTS[2]], '2026-09-30 12:00:00'],
  ];

  const qByForm = {};
  for (const f of FORMS) {
    qByForm[f.id] = await db.query(
      'SELECT id, qtype FROM feedback_questions WHERE form_id = ? ORDER BY order_index',
      [f.id]
    );
  }

  let created = 0;
  for (const [rid, formId, author, payloads, createdAt] of RESPONSES) {
    const exists = await db.get('SELECT id FROM feedback_responses WHERE id = ?', [rid]);
    if (exists) continue;
    if (!author || !author.user_id) continue;
    const questions = qByForm[formId];
    if (!questions || questions.length !== payloads.length) continue;
    const isInstitutionForm = formId === 'FB-004';
    const submittedBy = author.user_id;
    const dupe = await db.get(
      'SELECT id FROM feedback_responses WHERE form_id = ? AND submitted_by = ?',
      [formId, submittedBy]
    );
    if (dupe) continue;
    const studentId = isInstitutionForm ? null : (author.id || null);
    const custRow = isInstitutionForm
      ? await db.get('SELECT customer_id FROM users WHERE id = ?', [submittedBy])
      : await db.get('SELECT customer_id FROM students WHERE id = ?', [studentId]);
    const submittedRole = isInstitutionForm
      ? (submittedBy === 'U-001' ? 'ORGANIZATION' : 'INSTITUTION')
      : 'STUDENT';

    const parts = [];
    const answerRows = [];
    questions.forEach((q, i) => {
      const p = payloads[i];
      if (q.qtype === 'RATING') {
        const s = sentiment.analyzeRating(Number(p), 5);
        parts.push({ label: s.label, score: s.score });
        answerRows.push([q.id, String(p), Number(p), s.label, s.score]);
      } else if (q.qtype === 'CHOICE') {
        parts.push({ label: 'NEUTRAL', score: 0 });
        answerRows.push([q.id, String(p || ''), null, 'NEUTRAL', 0]);
      } else {
        const v = p ? String(p) : '';
        if (!v) {
          answerRows.push([q.id, null, null, null, null]);
        } else {
          const s = sentiment.analyze(v);
          parts.push({ label: s.label, score: s.score });
          answerRows.push([q.id, v, null, s.label, s.score]);
        }
      }
    });
    const overall = sentiment.combine(parts);
    await db.run(
      'INSERT INTO feedback_responses (id,form_id,submitted_by,submitted_role,student_id,customer_id,sentiment,sentiment_score,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [rid, formId, submittedBy, submittedRole, studentId, (custRow && custRow.customer_id) || null, overall.label, overall.score, createdAt]
    );
    for (const [qid, value, rating, label, score] of answerRows) {
      await db.run(
        'INSERT INTO feedback_answers (response_id,question_id,value,rating,sentiment,sentiment_score) VALUES (?,?,?,?,?,?)',
        [rid, qid, value, rating, label, score]
      );
    }
    created += 1;
  }

  const counts = {};
  for (const t of ['feedback_forms', 'feedback_questions', 'feedback_responses', 'feedback_answers']) {
    counts[t] = (await db.query(`SELECT COUNT(*) c FROM ${t}`))[0].c;
  }
  console.log('[feedback-seed] done:', JSON.stringify(counts), `(+${created} new responses)`);
}

if (require.main === module) {
  const db = require('./index');
  (async () => {
    await db.ready;
    await seedFeedback(db);
    process.exit(0);
  })().catch((e) => { console.error('[feedback-seed] failed:', e); process.exit(1); });
}

module.exports = { seedFeedback, STUDENT_PASSWORD };
