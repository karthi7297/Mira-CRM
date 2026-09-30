import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// Public (no login): outsider enquiry → AUTO lead in org pipeline (FLOW W)
export function Enquire() {
  const [f, setF] = useState({}); const [done, setDone] = useState(null); const [err, setErr] = useState('');
  const send = async (e) => {
    e.preventDefault(); setErr('');
    try { setDone(await api.enquire(f)); setF({}); }
    catch (ex) { setErr(ex.message); }
  };
  return (
    <div className="login"><div style={{ width: 440 }}>
      <h2 style={{ margin: 0 }}>Rampex <span style={{ color: '#1d4ed8' }}>Enquiry</span></h2>
      <p style={{ color: '#64748b', fontSize: 13 }}>Tell us about your training need — our team responds within a day.</p>
      {err && <div className="err">{err}</div>}
      {done
        ? <div className="okmsg">✓ Received! Reference <b>{done.id}</b>. <br /><Link to="/login">Rampex team login →</Link></div>
        : <form onSubmit={send} className="form" style={{ gridTemplateColumns: '1fr' }}>
          <input required placeholder="College / Organization *" value={f.organization || ''} onChange={e => setF({ ...f, organization: e.target.value })} />
          <input required placeholder="Your name *" value={f.contact_person || ''} onChange={e => setF({ ...f, contact_person: e.target.value })} />
          <input placeholder="Email" value={f.email || ''} onChange={e => setF({ ...f, email: e.target.value })} />
          <input placeholder="Phone" value={f.phone || ''} onChange={e => setF({ ...f, phone: e.target.value })} />
          <input placeholder="What training do you need?" value={f.requirement || ''} onChange={e => setF({ ...f, requirement: e.target.value })} />
          <input placeholder="Approx. students" type="number" value={f.expected_students || ''} onChange={e => setF({ ...f, expected_students: +e.target.value })} />
          <button className="btn">Send Enquiry</button>
        </form>}
      <p style={{ fontSize: 12 }}><Link to="/login">← Back to login</Link> · <Link to="/verify">Verify a certificate</Link></p>
    </div></div>
  );
}

// Public (no login): certificate authenticity check (FLOW Y)
export function Verify() {
  const [code, setCode] = useState(''); const [r, setR] = useState(null); const [err, setErr] = useState('');
  const go = async (e) => {
    e.preventDefault(); setErr(''); setR(null);
    try { setR(await api.verifyCert(code.trim())); }
    catch (ex) { setErr(ex.message); }
  };
  return (
    <div className="login"><div style={{ width: 440 }}>
      <h2 style={{ margin: 0 }}>Verify <span style={{ color: '#1d4ed8' }}>Certificate</span></h2>
      <p style={{ color: '#64748b', fontSize: 13 }}>Enter the code printed on a Rampex certificate.</p>
      {err && <div className="err">{err}</div>}
      <form onSubmit={go} style={{ display: 'flex', gap: 8 }}>
        <input required placeholder="e.g. RNX-2026-0001" value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1, padding: '9px 12px', border: '1px solid #e5e9f2', borderRadius: 8 }} />
        <button className="btn">Verify</button>
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
