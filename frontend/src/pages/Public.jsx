import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, toast, toastError } from '../api';

/* Client-side field validation shared by both public forms. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEnquiry(f) {
  const errs = {};
  if (!String(f.organization || '').trim()) errs.organization = 'College / organization name is required';
  if (!String(f.contact_person || '').trim()) errs.contact_person = 'Your name is required';
  if (f.email && !EMAIL_RE.test(f.email.trim())) errs.email = 'Enter a valid email address';
  if (f.phone && !/^[+()\-.\s\d]{7,20}$/.test(String(f.phone))) errs.phone = 'Enter a valid phone number';
  return errs;
}

// Public (no login): outsider enquiry → AUTO lead in org pipeline (FLOW W)
export function Enquire() {
  const [f, setF] = useState({}); const [done, setDone] = useState(null); const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState({}); const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault(); setErr('');
    const errs = validateEnquiry(f);
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { setDone(await api.enquire(f)); setF({}); toast('Enquiry sent successfully'); }
    catch (ex) { setErr(ex.message); toastError(ex.message); }
    finally { setBusy(false); }
  };
  const fe = (k) => fieldErr[k] && <p className="field-err" role="alert">{fieldErr[k]}</p>;
  return (
    <div className="login"><div style={{ width: 'min(440px, 100%)' }}>
      <h2 style={{ margin: 0 }}>Rampex <span style={{ color: '#1d4ed8' }}>Enquiry</span></h2>
      <p style={{ color: '#64748b', fontSize: 13 }}>Tell us about your training need — our team responds within a day.</p>
      {err && <div className="err">{err}</div>}
      {done
        ? <div className="okmsg">✓ Received! Reference <b>{done.id}</b>. <br /><Link to="/login">Rampex team login →</Link></div>
        : <form onSubmit={send} className="form" style={{ gridTemplateColumns: '1fr' }} noValidate>
          <div>
            <input required placeholder="College / Organization *" value={f.organization || ''} onChange={e => setF({ ...f, organization: e.target.value })} aria-invalid={!!fieldErr.organization} />
            {fe('organization')}
          </div>
          <div>
            <input required placeholder="Your name *" value={f.contact_person || ''} onChange={e => setF({ ...f, contact_person: e.target.value })} aria-invalid={!!fieldErr.contact_person} />
            {fe('contact_person')}
          </div>
          <div>
            <input placeholder="Email" value={f.email || ''} onChange={e => setF({ ...f, email: e.target.value })} aria-invalid={!!fieldErr.email} />
            {fe('email')}
          </div>
          <div>
            <input placeholder="Phone" value={f.phone || ''} onChange={e => setF({ ...f, phone: e.target.value })} aria-invalid={!!fieldErr.phone} />
            {fe('phone')}
          </div>
          <input placeholder="What training do you need?" value={f.requirement || ''} onChange={e => setF({ ...f, requirement: e.target.value })} />
          <input placeholder="Approx. students" type="number" min="1" value={f.expected_students || ''} onChange={e => setF({ ...f, expected_students: +e.target.value })} />
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send Enquiry'}</button>
        </form>}
      <p style={{ fontSize: 12 }}><Link to="/login">← Back to login</Link> · <Link to="/verify">Verify a certificate</Link></p>
    </div></div>
  );
}

// Public (no login): certificate authenticity check (FLOW Y)
export function Verify() {
  const [code, setCode] = useState(''); const [r, setR] = useState(null); const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setErr(''); setR(null);
    if (!code.trim()) { setErr('Enter the certificate code printed on the document'); return; }
    setBusy(true);
    try { setR(await api.verifyCert(code.trim())); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="login"><div style={{ width: 'min(440px, 100%)' }}>
      <h2 style={{ margin: 0 }}>Verify <span style={{ color: '#1d4ed8' }}>Certificate</span></h2>
      <p style={{ color: '#64748b', fontSize: 13 }}>Enter the code printed on a Rampex certificate.</p>
      {err && <div className="err">{err}</div>}
      <form onSubmit={go} style={{ display: 'flex', gap: 8 }}>
        <input required placeholder="e.g. RNX-2026-0001" value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '9px 12px', border: '1px solid #e5e9f2', borderRadius: 8 }} />
        <button className="btn" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
      </form>
      {r && <div className="cert-paper" style={{ marginTop: 14 }}>
        <h1>VERIFIED ✓</h1>
        <div className="who">{r.student_name}</div>
        <p style={{ fontSize: 13 }}>{r.program_name} · {r.batch_id}<br />{r.customer_name} · Issued {String(r.issued_on).slice(0, 10)}<br />Attendance {r.attendance_pct}% · Score {r.avg_score ?? '—'}{r.avg_score != null && '%'}<br />Issuer: Rampex · Code {r.certificate_no}</p>
      </div>}
      <p style={{ fontSize: 12 }}><Link to="/login">← Back to login</Link></p>
    </div></div>
  );
}
