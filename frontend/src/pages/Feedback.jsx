import { useEffect, useState } from 'react';
import { api, toast, toastError } from '../api';
import { useAuth } from '../auth';

/* ==========================================================================
   Feedback — forms, responses and sentiment analytics.

   Who sees what is decided entirely on the server (services/feedback.service.js
   → formVisibility / canManage / canSubmit). The UI only reflects the flags it
   is handed: `can_manage` (open/close/delete + read responses) and
   `can_submit` (this caller may still answer). Nothing here can widen scope.
   ========================================================================== */

const QTYPES = [
  { v: 'RATING', l: 'Star rating (1–5)' },
  { v: 'TEXT', l: 'Written answer' },
  { v: 'CHOICE', l: 'Multiple choice' },
];
const SENT_LABEL = { POSITIVE: 'Positive', NEUTRAL: 'Neutral', NEGATIVE: 'Needs attention' };
const SENT_CLASS = { POSITIVE: 'sent-pos', NEUTRAL: 'sent-neu', NEGATIVE: 'sent-neg' };
const AUD_LABEL = { STUDENT: 'Students', INSTITUTION: 'Institutions' };

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
const day = (s) => String(s || '').slice(0, 10);

function SentChip({ label, score }) {
  if (!label) return <span className="chip">No score</span>;
  return (
    <span className={'chip ' + (SENT_CLASS[label] || '')}>
      {SENT_LABEL[label] || label}
      {score != null && (
        <span className="meta" style={{ marginLeft: 6 }}>
          {Number(score) > 0 ? '+' : ''}{Number(score).toFixed(2)}
        </span>
      )}
    </span>
  );
}

function MixBar({ positive = 0, neutral = 0, negative = 0 }) {
  const total = positive + neutral + negative;
  if (!total) return <div className="mix-bar empty-bar"><i style={{ width: '100%' }} /></div>;
  return (
    <div className="mix-bar" title={`${positive} positive · ${neutral} neutral · ${negative} negative`}>
      <i className="pos" style={{ width: pct(positive, total) + '%' }} />
      <i className="neu" style={{ width: pct(neutral, total) + '%' }} />
      <i className="neg" style={{ width: pct(negative, total) + '%' }} />
    </div>
  );
}

function Legend() {
  return (
    <div className="sent-legend">
      <span><i className="dot pos" />Positive</span>
      <span><i className="dot neu" />Neutral</span>
      <span><i className="dot neg" />Needs attention</span>
    </div>
  );
}

function Stars({ value, onChange, readOnly }) {
  return (
    <div className="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= (value || 0) ? 'on' : ''}
          disabled={readOnly}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => !readOnly && onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ---------- Analytics strip ---------- */
function Analytics({ ov, showInstitution = true }) {
  if (!ov) return null;
  const s = ov.sentiment || { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  const total = s.POSITIVE + s.NEUTRAL + s.NEGATIVE;
  const aud = ov.by_audience || {};

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <b className="sm">Sentiment overview</b>
          <p className="meta" style={{ margin: '2px 0 0' }}>
            Scored at write time by a {ov.engine?.kind} · {ov.engine?.words} words, {ov.engine?.phrases} phrases
          </p>
        </div>
        <span className="chip">{ov.open_forms} open</span>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card kpi-compact">
          <small>Forms</small>
          <b className="kpi-val">{ov.forms}</b>
          <p className="meta">{ov.created_by?.ORGANIZATION || 0} by Rampex · {ov.created_by?.INSTITUTION || 0} by colleges</p>
        </div>
        <div className="card kpi-compact">
          <small>Responses</small>
          <b className="kpi-val">{ov.responses}</b>
          <p className="meta">{ov.audience?.STUDENT || 0} student · {ov.audience?.INSTITUTION || 0} institution forms</p>
        </div>
        <div className="card kpi-compact">
          <small>Positive</small>
          <b className="kpi-val">{ov.positive_pct == null ? '—' : ov.positive_pct + '%'}</b>
          <p className="meta">{s.POSITIVE} of {total} responses</p>
        </div>
        <div className="card kpi-compact">
          <small>Avg score</small>
          <b className="kpi-val">{ov.avg_score == null ? '—' : (ov.avg_score > 0 ? '+' : '') + Number(ov.avg_score).toFixed(2)}</b>
          <p className="meta">−1.00 … +1.00 scale</p>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <MixBar positive={s.POSITIVE} neutral={s.NEUTRAL} negative={s.NEGATIVE} />
        <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <Legend />
          <span className="meta">{total} scored response{total === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        {['STUDENT', 'INSTITUTION'].filter((a) => showInstitution || a === 'STUDENT').map((a) => {
          const m = aud[a] || { responses: 0, POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0, avg_score: null };
          return (
            <div key={a} className="card kpi-compact">
              <small>{a === 'STUDENT' ? 'Students rating our delivery' : 'Institutions rating the platform'}</small>
              <div className="hstack" style={{ justifyContent: 'space-between', margin: '6px 0 8px' }}>
                <b style={{ fontSize: 18 }}>{m.responses}</b>
                <SentChip label={m.responses ? (m.avg_score >= 0.18 ? 'POSITIVE' : m.avg_score <= -0.18 ? 'NEGATIVE' : 'NEUTRAL') : null} score={m.avg_score} />
              </div>
              <MixBar positive={m.POSITIVE} neutral={m.NEUTRAL} negative={m.NEGATIVE} />
            </div>
          );
        })}
      </div>

      {!!(ov.top_terms || []).length && (
        <div style={{ marginTop: 16 }}>
          <p className="meta" style={{ marginBottom: 6 }}>Recurring themes in negative answers</p>
          <div className="hstack">
            {ov.top_terms.map((t) => (
              <span key={t.term} className="chip sent-neg">{t.term} · {t.count}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Create-form builder ---------- */
function FormBuilder({ user, customers, onClose, onCreated }) {
  const isInstitution = user?.role === 'institution';
  const isTrainer = user?.role === 'trainer';
  // A trainer never picks an audience or a college — its form always goes to
  // the students it teaches, and the server derives that from its batches.
  const fixedAudience = isInstitution || isTrainer;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [d, setD] = useState({
    title: '',
    description: '',
    audience: 'STUDENT',
    customer_id: '',
    questions: [{ text: '', qtype: 'RATING', options: '' }],
  });

  const setQ = (i, patch) => setD((p) => ({ ...p, questions: p.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  const addQ = () => setD((p) => (p.questions.length >= 25 ? p : { ...p, questions: [...p.questions, { text: '', qtype: 'RATING', options: '' }] }));
  const delQ = (i) => setD((p) => (p.questions.length <= 1 ? p : { ...p, questions: p.questions.filter((_, j) => j !== i) }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!d.title.trim()) { setErr('Give the form a title'); return; }
    const questions = [];
    for (let i = 0; i < d.questions.length; i += 1) {
      const q = d.questions[i];
      if (!q.text.trim()) { setErr(`Question ${i + 1} needs text`); return; }
      const item = { text: q.text.trim(), qtype: q.qtype };
      if (q.qtype === 'CHOICE') {
        const opts = q.options.split(',').map((s) => s.trim()).filter(Boolean);
        if (opts.length < 2) { setErr(`Question ${i + 1} needs at least 2 comma-separated options`); return; }
        item.options = opts;
      }
      questions.push(item);
    }
    setBusy(true); setErr('');
    try {
      const body = { title: d.title.trim(), description: d.description.trim(), audience: d.audience, questions };
      if (!fixedAudience && d.audience === 'STUDENT' && d.customer_id) body.customer_id = d.customer_id;
      await api.createFeedbackForm(body);
      toast('✓ Feedback form created');
      onCreated();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal">
      <div style={{ maxWidth: 720 }}>
        <h3>New feedback form</h3>
        <form onSubmit={submit} className="form col-1">
          <input className="full" placeholder="Form title *" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          <textarea className="full" rows={2} placeholder="What is this survey for? (optional)" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />

          {!fixedAudience && (
            <div className="hstack full">
              <select value={d.audience} onChange={(e) => setD({ ...d, audience: e.target.value, customer_id: '' })}>
                <option value="STUDENT">Students — rate our training delivery</option>
                <option value="INSTITUTION">Institutions — rate the platform</option>
              </select>
              {d.audience === 'STUDENT' && (
                <select value={d.customer_id} onChange={(e) => setD({ ...d, customer_id: e.target.value })}>
                  <option value="">All colleges (platform-wide)</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          )}
          {isInstitution && (
            <p className="meta full" style={{ margin: 0 }}>Your students will see this form. You'll only see the responses to it.</p>
          )}
          {isTrainer && (
            <p className="meta full" style={{ margin: 0 }}>This goes to the students in the batches you teach. You'll only see their responses.</p>
          )}

          <div className="full" style={{ display: 'grid', gap: 10, marginTop: 4 }}>
            <b style={{ fontSize: 13 }}>Questions ({d.questions.length}/25)</b>
            {d.questions.map((q, i) => (
              <div key={i} className="q-block">
                <div className="q-row">
                  <input placeholder={`Question ${i + 1} *`} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
                  <select value={q.qtype} onChange={(e) => setQ(i, { qtype: e.target.value })}>
                    {QTYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                  <button type="button" className="btn sm ghost" title="Remove" disabled={d.questions.length <= 1} onClick={() => delQ(i)}>✕</button>
                </div>
                {q.qtype === 'CHOICE' && (
                  <input
                    style={{ marginTop: 8, width: '100%' }}
                    placeholder="Options, comma separated (e.g. Excellent, Good, Poor)"
                    value={q.options}
                    onChange={(e) => setQ(i, { options: e.target.value })}
                  />
                )}
              </div>
            ))}
            <button type="button" className="btn sm ghost" onClick={addQ} disabled={d.questions.length >= 25}>+ Add question</button>
          </div>

          {err && <div className="err full">{err}</div>}
          <div className="hstack full">
            <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create form'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Fill-in (student / institution answering) ---------- */
function FillIn({ form, onSubmit }) {
  const [a, setA] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const answers = [];
    for (const q of form.questions) {
      const v = a[q.id] || {};
      if (q.qtype === 'RATING') {
        if (!v.rating) { setErr(`Please rate "${q.text}"`); return; }
        answers.push({ question_id: q.id, rating: v.rating });
      } else if (q.qtype === 'CHOICE') {
        if (!v.value) { setErr(`Please choose an option for "${q.text}"`); return; }
        answers.push({ question_id: q.id, value: v.value });
      } else {
        answers.push({ question_id: q.id, value: v.value || '' });
      }
    }
    setBusy(true); setErr('');
    try { await onSubmit(answers); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="form col-1">
      {form.questions.map((q, i) => (
        <div key={q.id} className="q-block">
          <label style={{ fontSize: 13.5, fontWeight: 600, display: 'block', marginBottom: 8 }}>
            {i + 1}. {q.text}
          </label>
          {q.qtype === 'RATING' && (
            <Stars value={(a[q.id] || {}).rating} onChange={(n) => setA({ ...a, [q.id]: { rating: n } })} />
          )}
          {q.qtype === 'CHOICE' && (
            <div className="hstack">
              {(q.options || []).map((o) => (
                <label key={o} className="chip" style={{ cursor: 'pointer', padding: '6px 12px' }}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={(a[q.id] || {}).value === o}
                    onChange={() => setA({ ...a, [q.id]: { value: o } })}
                    style={{ marginRight: 6 }}
                  />
                  {o}
                </label>
              ))}
            </div>
          )}
          {q.qtype === 'TEXT' && (
            <textarea
              rows={3}
              style={{ width: '100%' }}
              placeholder="Your answer (optional)…"
              value={(a[q.id] || {}).value || ''}
              onChange={(e) => setA({ ...a, [q.id]: { value: e.target.value } })}
            />
          )}
        </div>
      ))}
      {err && <div className="err">{err}</div>}
      <div className="hstack">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit feedback'}</button>
        <span className="meta">Answers are scored for sentiment the moment you submit.</span>
      </div>
    </form>
  );
}

/* ---------- Detail view ---------- */
function FormDetail({ id, onBack, onChanged }) {
  const [form, setForm] = useState(null);
  const [responses, setResponses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const f = await api.feedbackForm(id);
      setForm(f);
      if (f.can_manage) setResponses(await api.feedbackResponses(id));
      else setResponses(null);
    } catch (e) { setMsg(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const submit = async (answers) => {
    await api.submitFeedback(id, answers);
    toast('✓ Thanks — your feedback was recorded');
    await load();
    onChanged();
  };

  const toggleStatus = async () => {
    try {
      await api.setFeedbackFormStatus(id, form.status === 'OPEN' ? 'CLOSED' : 'OPEN');
      toast('✓ Form ' + (form.status === 'OPEN' ? 'closed' : 'reopened'));
      await load(); onChanged();
    } catch (e) { toastError(e.message); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this form and all of its responses? This cannot be undone.')) return;
    try { await api.deleteFeedbackForm(id); toast('✓ Form deleted'); onChanged(); onBack(); }
    catch (e) { toastError(e.message); }
  };

  if (loading) return <div className="loading">Loading form…</div>;
  if (!form) return <div><div className="err">{msg || 'Form not found'}</div><button className="btn ghost" onClick={onBack}>← Back</button></div>;

  const canManage = form.can_manage;
  const mine = form.my_response;

  return (
    <div>
      <div className="page-head">
        <div>
          <button className="btn sm ghost" onClick={onBack} style={{ marginBottom: 8 }}>← Back to feedback</button>
          <h2>{form.title}</h2>
          <p className="sub">
            <span className="chip">{AUD_LABEL[form.audience] || form.audience}</span>{' '}
            <span className="chip">{form.created_by_role === 'ORGANIZATION' ? 'By Rampex' : 'By ' + (form.customer_name || 'institution')}</span>{' '}
            <span className={'chip ' + (form.status === 'OPEN' ? 'ACTIVE' : 'CLOSED')}>{form.status}</span>{' '}
            {form.customer_name && form.created_by_role === 'ORGANIZATION' && <span className="chip">{form.customer_name}</span>}
          </p>
        </div>
        {canManage && (
          <div className="hstack">
            <button className="btn ghost" onClick={toggleStatus}>{form.status === 'OPEN' ? 'Close form' : 'Reopen form'}</button>
            <button className="btn ghost" onClick={remove}>Delete</button>
          </div>
        )}
      </div>

      {form.description && <p className="meta" style={{ marginTop: -6, marginBottom: 14 }}>{form.description}</p>}

      {canManage && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <b className="sm">Responses</b>
            <span className="meta">{form.stats.total} received · {form.stats.positive} positive · {form.stats.neutral} neutral · {form.stats.negative} negative</span>
          </div>
          <div style={{ margin: '12px 0 4px' }}>
            <MixBar positive={form.stats.positive} neutral={form.stats.neutral} negative={form.stats.negative} />
          </div>
          <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <Legend />
            <SentChip label={form.stats.avg_score == null ? null : (form.stats.avg_score >= 0.18 ? 'POSITIVE' : form.stats.avg_score <= -0.18 ? 'NEGATIVE' : 'NEUTRAL')} score={form.stats.avg_score} />
          </div>
        </div>
      )}

      {canManage && responses && (
        <div style={{ marginBottom: 22 }}>
          {!responses.length && <p className="empty">No responses yet.</p>}
          {responses.map((r) => (
            <div className="card" key={r.id} style={{ marginBottom: 10 }}>
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <div className="hstack">
                  <b>{r.student_name || r.submitted_by_name || 'Respondent'}</b>
                  <span className="chip">{r.submitted_role}</span>
                  <SentChip label={r.sentiment} score={r.sentiment_score} />
                </div>
                <span className="meta">{day(r.created_at)}</span>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {(r.answers || []).map((ans) => (
                  <div key={ans.question_id} className="stack" style={{ padding: '6px 0' }}>
                    <p className="meta" style={{ margin: 0 }}>{ans.question_text}</p>
                    <div className="hstack" style={{ marginTop: 3 }}>
                      {ans.qtype === 'RATING'
                        ? <><Stars value={Number(ans.rating)} readOnly /><span className="meta">{ans.rating}/5</span></>
                        : <span>{ans.value || <i className="meta">— skipped —</i>}</span>}
                      {ans.sentiment && <SentChip label={ans.sentiment} score={ans.sentiment_score} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mine && (
        <div className="card" style={{ marginBottom: 18, borderColor: 'var(--accent-line)' }}>
          <div className="hstack">
            <b>Your response</b>
            <SentChip label={mine.sentiment} score={mine.sentiment_score} />
            <span className="meta" style={{ marginLeft: 'auto' }}>{day(mine.created_at)}</span>
          </div>
          <p className="meta" style={{ margin: '6px 0 0' }}>Thanks — you've already submitted this form.</p>
        </div>
      )}

      {/* Anyone the server flags as able to answer gets the fill-in — including a
          manager adding their own review on a form they also own. */}
      {!mine && form.can_submit && (
        <div style={{ marginTop: canManage ? 4 : 0 }}>
          <b style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
            {canManage ? 'Add your own response' : 'Your response'}
          </b>
          {!canManage && (
            <p className="sub" style={{ marginBottom: 14 }}>Your answers are anonymous to other students; the form owner sees the responses.</p>
          )}
          <FillIn form={form} onSubmit={submit} />
        </div>
      )}
      {!canManage && !mine && !form.can_submit && (
        <p className="empty">{form.status === 'CLOSED' ? 'This form is closed.' : 'You cannot submit to this form.'}</p>
      )}
    </div>
  );
}

/* ---------- My submissions (students) ---------- */
function MySubmissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.myFeedback().then(setRows).catch((e) => setMsg(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading your feedback…</div>;

  return (
    <div>
      {msg && <div className="err">{msg}</div>}
      {!rows.length && <p className="empty">You haven't submitted any feedback yet.</p>}
      <div className="stack">
        {rows.map((r) => (
          <div className="card" key={r.id} style={{ marginBottom: 10 }}>
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <b>{r.form_title || r.form_id}</b>
              <span className="meta">{day(r.created_at)}</span>
            </div>
            <div className="hstack" style={{ marginTop: 8 }}>
              <SentChip label={r.sentiment} score={r.sentiment_score} />
              {r.audience && <span className="chip">{AUD_LABEL[r.audience] || r.audience}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Main page ---------- */
export default function Feedback() {
  const { user } = useAuth();
  const canCreate = user?.role === 'organization' || user?.role === 'institution' || user?.role === 'trainer';
  const isStudent = user?.role === 'student';

  const [ov, setOv] = useState(null);
  const [forms, setForms] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState('forms');

  const load = () => {
    setLoading(true);
    Promise.all([api.feedbackOverview(), api.feedbackForms()])
      .then(([o, f]) => { setOv(o); setForms(f); setMsg(''); })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
    if (user?.role === 'organization') api.customers().then(setCustomers).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (sel) return <FormDetail id={sel} onBack={() => setSel(null)} onChanged={load} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Feedback</h2>
          <p className="sub">
            {user?.role === 'organization'
              ? 'Forms from Rampex, every college and every trainer, with sentiment scored on every answer.'
              : user?.role === 'institution'
                ? 'Survey your students and review the platform — you see your own forms, Rampex sees everything.'
                : user?.role === 'trainer'
                  ? 'Ask the students in your batches how the training is landing. You see only your own forms and their responses.'
                  : 'Share feedback on your training — it goes straight to your trainer, institution and Rampex.'}
          </p>
        </div>
        {canCreate && <button className="btn" onClick={() => setCreating(true)}>+ New form</button>}
      </div>

      {msg && <div className="err">{msg}</div>}

      {isStudent && (
        <div className="tabs" style={{ marginBottom: 14 }}>
          <button className={tab === 'forms' ? 'on' : ''} onClick={() => setTab('forms')}>Forms to fill</button>
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My submissions</button>
        </div>
      )}

      {loading ? <div className="loading">Loading feedback…</div> : (
        <>
          {tab === 'forms' && (
            <>
              <Analytics ov={ov} showInstitution={user?.role !== 'trainer'} />

              {!forms.length && <p className="empty">No feedback forms yet.</p>}
              {!!forms.length && (
                <table>
                  <thead>
                    <tr>
                      <th>Form</th><th>Audience</th><th>Created by</th><th>Questions</th>
                      <th>Responses</th><th>Sentiment</th><th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forms.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <b>{f.title}</b>
                          {f.customer_name && <p className="meta" style={{ margin: '2px 0 0' }}>{f.customer_name}</p>}
                        </td>
                        <td><span className="chip">{AUD_LABEL[f.audience] || f.audience}</span></td>
                        <td>{f.created_by_role === 'ORGANIZATION' ? 'Rampex' : 'Institution'}</td>
                        <td>{f.question_count}</td>
                        <td>{f.response_count}</td>
                        <td>
                          {f.response_count
                            ? <SentChip label={f.sentiment_label} score={f.avg_sentiment} />
                            : <span className="meta">—</span>}
                        </td>
                        <td><span className={'chip ' + (f.status === 'OPEN' ? 'ACTIVE' : 'CLOSED')}>{f.status}</span></td>
                        <td>
                          <button className="btn sm ghost" onClick={() => setSel(f.id)}>
                            {f.can_manage ? 'Open & review' : f.can_submit ? 'Fill in' : 'View'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
          {tab === 'mine' && <MySubmissions />}
        </>
      )}

      {creating && (
        <FormBuilder
          user={user}
          customers={customers}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
    </div>
  );
}
