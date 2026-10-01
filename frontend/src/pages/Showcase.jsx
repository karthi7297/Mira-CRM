import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr, downloadCSV, toast, toastError } from '../api';
import { useAuth } from '../auth';

// FLOW X: risk-ranked collections queue (rule-based prioritization, not ML)
export function Collections() {
  const [rows, setRows] = useState([]); const [msg, setMsg] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { api.collections().then(setRows).catch(e => setMsg(e.message)).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="loading">Loading collections queue…</div>;
  if (msg) return <div className="err">{msg}</div>;
  const totals = rows.reduce((x, r) => ({ n: x.n + 1, amt: x.amt + Number(r.outstanding || 0) }), { n: 0, amt: 0 });
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Collections Queue</h2>
        <span style={{ marginLeft: 12, fontSize: 13, color: '#64748b' }}>{totals.n} open · {inr(totals.amt)} at risk-ranked priority</span>
        <button type="button" className="btn ghost no-print" style={{ marginLeft: 'auto' }} onClick={() => downloadCSV('collections.csv', rows.map(r => ({ invoice: r.id, customer: r.customer_name, outstanding: r.outstanding, risk: r.risk, overdue_days: r.overdueDays, reasons: r.reasons.join('; ') })))}>Export CSV</button>
      </div>
      <table style={{ marginTop: 12 }}><thead><tr><th>Priority</th><th>Invoice</th><th>Customer</th><th>Outstanding</th><th>Due</th><th>Why</th><th></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}>
          <td><span className={'chip ' + (r.risk === 'HIGH' ? 'UNPAID' : r.risk === 'MEDIUM' ? 'PARTIALLY_PAID' : 'PAID')}>{r.risk}</span></td>
          <td>{r.id}</td><td>{r.customer_name}</td><td><b>{inr(r.outstanding)}</b></td><td style={{ whiteSpace: 'nowrap' }}>{r.due_date || '—'}{r.overdueDays > 0 && ` (${r.overdueDays}d late)`}</td>
          <td style={{ fontSize: 12 }}>{r.reasons.join(' · ')}</td>
          <td><Link to={'/invoices/' + r.id}>Collect →</Link></td></tr>)}</tbody></table>
      {rows.length === 0 && <p>Nothing outstanding. 🎉</p>}
    </div>
  );
}

// FLOW Y: completion certificates — org issues on ≥75% attendance; printable; publicly verifiable
export function Certificates() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]); const [batches, setBatches] = useState([]);
  const [f, setF] = useState({}); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.certificates().then(setRows).catch(e => setMsg(e.message)).finally(() => setLoading(false));
    api.batches().then(setBatches).catch(() => {});
  }, []);
  const [studs, setStuds] = useState([]);
  const pickBatch = async (bid) => {
    setF({ ...f, batch_id: bid });
    try { setStuds((await api.batch(bid)).students); } catch { setStuds([]); }
  };
  const issue = async (e) => {
    e.preventDefault(); setMsg('');
    if (busy) return;
    if (!f.batch_id) { setMsg('Select a batch first'); return; }
    if (!f.student_id) { setMsg('Select a student to issue the certificate for'); return; }
    setBusy(true);
    try {
      const c = await api.issueCertificate({ student_id: f.student_id, batch_id: f.batch_id });
      toast(`Certificate ${c.certificate_no} issued`);
      api.certificates().then(setRows);
    } catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  };

  const copyVerify = (code) => {
    const url = `${window.location.origin}/verify`;
    navigator.clipboard?.writeText(code);
    toast(`✓ Code ${code} copied! Anyone can verify at /verify`);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Certificates</h2>
        <span style={{ marginLeft: 12, fontSize: 13, color: '#64748b' }}>FLOW Y · Attendance ≥75% required to issue · Tamper-proof verification code</span>
      </div>
      {msg && <div className="err" style={{ marginTop: 10 }}>{msg}</div>}
      {user?.role === 'organization' && (
        <form onSubmit={issue} className="form no-print" style={{ maxWidth: 720, marginTop: 12 }}>
          <select required value={f.batch_id || ''} onChange={e => pickBatch(e.target.value)}><option value="">Batch...</option>{batches.map(b => <option key={b.id} value={b.id}>{b.id}</option>)}</select>
          <select required value={f.student_id || ''} onChange={e => setF({ ...f, student_id: e.target.value })}><option value="">Student...</option>{studs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <span><button className="btn" type="submit" disabled={busy}>{busy ? 'Issuing…' : 'Issue (needs ≥75% attendance)'}</button></span>
        </form>)}
      {loading && <div className="loading">Loading certificates…</div>}
      <div className="cards" style={{ marginTop: 16 }}>{rows.map(c => (
        <div key={c.id} className="card" style={{ borderTop: '4px solid #16a34a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>{c.certificate_no}</h4>
            <span className="chip PAID" style={{ fontSize: 11 }}>VERIFIED ✓</span>
          </div>
          <b style={{ fontSize: 18, marginTop: 8, display: 'block' }}>{c.student_name}</b>
          <p style={{ fontSize: 13, color: '#475569', margin: '4px 0' }}>
            {c.program_name || 'Training'} · Batch <b>{c.batch_id}</b>
          </p>
          <p style={{ fontSize: 13, margin: '4px 0' }}>
            Attendance: <b>{c.attendance_pct}%</b> · Assessment: <b>{c.avg_score ?? '—'}{c.avg_score != null && '%'}</b>
          </p>
          <small style={{ color: '#94a3b8' }}>Issued {String(c.issued_on || '').slice(0, 10)}</small>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }} className="no-print">
            <button type="button" className="btn ghost sm" onClick={() => copyVerify(c.certificate_no)}>Copy Code</button>
            <button type="button" className="btn ghost sm" onClick={() => window.print()}>Print</button>
          </div>
        </div>))}</div>
      {rows.length === 0 && <p className="empty" style={{ marginTop: 16 }}>No certificates issued yet. Pick an eligible student (≥75% attendance) to issue one above.</p>}
    </div>
  );
}

