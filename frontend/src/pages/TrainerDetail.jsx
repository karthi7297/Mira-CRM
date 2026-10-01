import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr } from '../api';
import { AttendanceBar } from '../widgets';

/* Trainer 360 (organization only): profile + assigned batches with
   attendance + students taught + payouts/claims + leave requests. */
export default function TrainerDetail() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [msg, setMsg] = useState('');
  const [rep, setRep] = useState(null);

  useEffect(() => {
    api.trainer(id).then(setT).catch((e) => setMsg(e.message));
  }, [id]);

  if (!t) return <div className={msg ? 'err' : 'loading'}>{msg || 'Loading trainer…'}</div>;

  const report = async (sid) => {
    try { setRep(await api.studentReport(sid)); }
    catch (e) { setMsg(e.message); }
  };

  const s = t.summary || {};
  return (
    <div>
      <Link to="/trainers" className="back">← Trainers</Link>

      <div className="page-head">
        <div>
          <h2>{t.name}</h2>
          <p className="sub">{t.id} · {t.expertise || 'Trainer'} · {t.email || '—'}{t.phone ? ` · ${t.phone}` : ''}</p>
        </div>
        <span className="chip PRESENT">{s.batches || 0} batches · {s.students || 0} students</span>
      </div>

      {msg && <div className="err">{msg}</div>}

      <div className="cards kpi-strip">
        <div className="card kpi-compact" style={{ borderTop: '3px solid var(--info)' }}>
          <span className="kpi-title">Batches</span><b className="kpi-val">{s.batches || 0}</b>
        </div>
        <div className="card kpi-compact" style={{ borderTop: '3px solid var(--accent)' }}>
          <span className="kpi-title">Students Taught</span><b className="kpi-val">{s.students || 0}</b>
        </div>
        <div className="card kpi-compact" style={{ borderTop: '3px solid var(--ok)' }}>
          <span className="kpi-title">Avg Attendance</span><b className="kpi-val">{s.attendance || 0}%</b>
        </div>
        <div className="card kpi-compact" style={{ borderTop: '3px solid var(--warn)' }}>
          <span className="kpi-title">Paid Out</span><b className="kpi-val">{inr(s.paid_out)}</b>
        </div>
        <div className="card kpi-compact" style={{ borderTop: '3px solid var(--bad)' }}>
          <span className="kpi-title">Pending Claims</span><b className="kpi-val">{inr(s.pending_claims)}</b>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h4>Assigned Batches</h4>
          {(t.batches || []).length === 0 && <p className="empty">No batches assigned.</p>}
          <div className="list scroll">
            {(t.batches || []).map((b) => (
              <div className="list-row" key={b.id}>
                <Link className="mono" to={'/batches/' + b.id}>{b.id}</Link>
                <span className="grow meta">{b.program_name} · {b.customer_name} · {b.student_count} students</span>
                <AttendanceBar value={b.attendance} width={130} />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4>Leave Requests</h4>
          {(t.leave || []).length === 0 && <p className="empty">No leave applications.</p>}
          <div className="list scroll">
            {(t.leave || []).map((l) => (
              <div className="list-row" key={l.id}>
                <span className="mono">{l.id}</span>
                <span className="grow meta">{l.type} · {l.from_date}{l.from_date !== l.to_date ? ` → ${l.to_date}` : ''} · {l.days}d</span>
                <span className={'chip ' + (l.status === 'APPROVED' ? 'PRESENT' : l.status === 'PENDING' ? 'LATE' : 'ABSENT')}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h4>Students Taught ({(t.students || []).length})</h4>
        {(t.students || []).length === 0 && <p className="empty">No students enrolled yet.</p>}
        {(t.students || []).length > 0 && (
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Attendance</th><th></th></tr></thead>
            <tbody>
              {(t.students || []).map((x) => (
                <tr key={x.id}>
                  <td className="mono">{x.id}</td>
                  <td><b>{x.name}</b></td>
                  <td className="meta">{x.email || '—'}{x.phone ? ` · ${x.phone}` : ''}</td>
                  <td style={{ minWidth: 150 }}><AttendanceBar value={x.attendance} width={120} /></td>
                  <td><button type="button" className="btn sm ghost" onClick={() => report(x.id)}>Report</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rep && (
        <div className="card" style={{ marginTop: 16 }}>
          <h4>Student Report · {rep.name}</h4>
          <p className="meta">
            Attendance <b>{rep.attendance}%</b> ({rep.attendance_present}/{rep.attendance_total} sessions) · Avg score{' '}
            <b>{rep.avg_score ?? '—'}{rep.avg_score != null && '%'}</b>
          </p>
          <p className="meta">Weak areas: {(rep.weak_areas || []).map((w) => `${w.topic} (${w.pct}%)`).join(', ') || '—'}</p>
          <button type="button" className="btn ghost" onClick={() => setRep(null)}>Close</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h4>Payouts &amp; Claims</h4>
        {(t.finance || []).length === 0 && <p className="empty">No payouts or claims recorded.</p>}
        {(t.finance || []).length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {(t.finance || []).map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td><span className="chip">{e.category}</span></td>
                  <td>{e.description || '—'}</td>
                  <td><b>{inr(e.amount)}</b></td>
                  <td><span className={'chip ' + e.status}>{e.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
