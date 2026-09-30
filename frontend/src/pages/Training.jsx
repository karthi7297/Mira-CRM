import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr, downloadCSV } from '../api';
import { useAuth } from '../auth';

export function Programs() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');

  const load = () => api.programs().then(setRows);
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try { await api.createProgram(f); setF({}); load(); }
    catch (ex) { setMsg(ex.message); }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Training Programs</h2>
      </div>

      {msg && <div className="err">{msg}</div>}

      {user?.role === 'organization' && (
        <form onSubmit={create} className="form narrow mb">
          <input required placeholder="Program name" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input placeholder="Duration" value={f.duration || ''} onChange={(e) => setF({ ...f, duration: e.target.value })} />
          <input placeholder="Fee per student" type="number" value={f.fee_per_student || ''} onChange={(e) => setF({ ...f, fee_per_student: +e.target.value })} />
          <span><button className="btn">+ Create Program</button></span>
        </form>
      )}

      {rows.length === 0 && <p className="empty">No programs yet.</p>}
      <div className="cards">
        {rows.map((p) => (
          <div className="card" key={p.id}>
            <h4>{p.id}</h4>
            <b className="sm">{p.name}</b>
            <p className="meta">{p.duration} · {inr(p.fee_per_student)}/student · {p.batch_count} batches</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Batches() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');
  const [progs, setProgs] = useState([]);
  const [custs, setCusts] = useState([]);
  const [trs, setTrs] = useState([]);

  useEffect(() => {
    api.batches().then(setRows);
    api.programs().then(setProgs);
    api.customers().then(setCusts);
    api.trainers().then(setTrs);
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.createBatch({ ...f, id: f.id || `B-${Date.now().toString().slice(-6)}` });
      setShow(false);
      setF({});
      api.batches().then(setRows);
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Batches</h2>
        {user?.role === 'organization' && (
          <button className="btn" onClick={() => setShow(true)}>+ Create Batch</button>
        )}
      </div>

      {msg && <div className="err">{msg}</div>}

      <table>
        <thead>
          <tr><th>Batch</th><th>Program</th><th>Customer</th><th>Trainer</th><th>Students</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td><Link to={'/batches/' + b.id}>{b.id}</Link></td>
              <td>{b.program_name}</td>
              <td>{b.customer_name}</td>
              <td>{b.trainer_name}</td>
              <td>{b.student_count}</td>
              <td><span className={'chip ' + b.status}>{b.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No batches yet.</p>}

      {show && (
        <div className="modal">
          <div>
            <h3>Create Batch</h3>
            <form onSubmit={create} className="form">
              <input placeholder="Batch ID (optional)" value={f.id || ''} onChange={(e) => setF({ ...f, id: e.target.value })} />
              <select value={f.program_id || ''} onChange={(e) => setF({ ...f, program_id: e.target.value })} required>
                <option value="">Program…</option>
                {progs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={f.customer_id || ''} onChange={(e) => setF({ ...f, customer_id: e.target.value })} required>
                <option value="">Customer…</option>
                {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={f.trainer_id || ''} onChange={(e) => setF({ ...f, trainer_id: e.target.value })}>
                <option value="">Trainer…</option>
                {trs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input type="date" value={f.start_date || ''} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
              <input type="date" value={f.end_date || ''} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
              <input type="number" placeholder="Capacity" value={f.capacity || ''} onChange={(e) => setF({ ...f, capacity: +e.target.value })} />
              <span>
                <button className="btn">Save</button>
                <button type="button" className="btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </span>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function BatchDetail() {
  const { user } = useAuth();
  const { id } = useParams();
  const [b, setB] = useState(null);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');
  const [sess, setSess] = useState([]);
  const [sf, setSf] = useState({});
  const [rep, setRep] = useState(null);
  const [sel, setSel] = useState('');
  const [ints, setInts] = useState([]);

  const load = () => {
    api.batch(id).then(setB);
    api.sessions(`?batch_id=${id}`).then(setSess).catch(() => {});
    if (['organization', 'trainer'].includes(user?.role)) api.interests().then(setInts).catch(() => {});
  };
  useEffect(() => { load(); }, [id]);

  const enroll = async (e) => {
    e.preventDefault();
    try { await api.createStudent({ ...f, batch_id: id }); setF({}); setMsg('✓ Student enrolled'); load(); }
    catch (ex) { setMsg(ex.message); }
  };
  const addSess = async (e) => {
    e.preventDefault();
    try {
      await api.createSession({ batch_id: id, ...sf });
      setSf({});
      setMsg('✓ Session scheduled');
      api.sessions(`?batch_id=${id}`).then(setSess);
    } catch (ex) { setMsg(ex.message); }
  };
  const report = async (sid) => {
    setSel(sid);
    try { setRep(await api.studentReport(sid)); } catch (e) { setMsg(e.message); }
  };

  if (!b) return <div className="loading">Loading batch…</div>;

  // Student management belongs to the trainer who delivers the batch — enrolling
  // students and reading per-student reports. Scheduling sessions is batch
  // logistics, which stays with the Rampex organization.
  const canEnroll = user?.role === 'trainer';
  const canSchedule = user?.role === 'organization';
  const canReport = user?.role === 'trainer';
  const canSeeInterests = ['organization', 'trainer'].includes(user?.role);
  const batchInterests = ints.filter((i) => (b.students || []).some((s) => s.id === i.student_id));

  return (
    <div>
      <Link to="/batches" className="back">← Batches</Link>

      <div className="page-head">
        <div>
          <h2>Batch {b.id}</h2>
          <p className="sub">
            {b.start_date || '—'} → {b.end_date || '—'} · Capacity {b.capacity} · {b.status}
          </p>
        </div>
      </div>

      <div className="cards">
        <div className="card"><h4>Students</h4><b>{b.students.length}</b></div>
        <div className="card"><h4>Attendance</h4><b>{b.attendance_rate}%</b></div>
        {(() => {
          const health = Math.round(Number(b.attendance_rate || 0) * 0.7 + 25);
          const isGood = health >= 75;
          const isWarn = health >= 55 && health < 75;
          const tone = isGood ? 'PAID' : isWarn ? 'PARTIALLY_PAID' : 'UNPAID';
          const label = isGood ? 'OPTIMAL' : isWarn ? 'MONITOR' : 'CRITICAL';
          return (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>Batch Health</h4>
                <span className={'chip ' + tone}>{label}</span>
              </div>
              <b>{health}/100</b>
              <small>Delivery & attendance composite index</small>
            </div>
          );
        })()}
      </div>

      {msg && <div className="okmsg">{msg}</div>}

      {canEnroll && (
        <>
          <h4>Enrol a student</h4>
          <form onSubmit={enroll} className="form narrow">
            <input required placeholder="Student name" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input placeholder="Email" value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input placeholder="Phone" value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <span><button className="btn">Enrol</button></span>
          </form>
        </>
      )}
      {!canEnroll && (
        <p className="meta">
          Students are added by the trainer delivering this batch — this is a read-only roster for you.
        </p>
      )}

      <table className="mt">
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th></th></tr></thead>
        <tbody>
          {b.students.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td><b>{s.name}</b></td>
              <td>{s.email}</td>
              <td>{canReport && <button className="btn ghost" onClick={() => report(s.id)}>Report</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {b.students.length === 0 && <p className="empty">No students enrolled in this batch yet.</p>}

      {rep && sel && (
        <div className="card mt">
          <h4>Student Report · {rep.name}</h4>
          <p className="meta">
            Attendance <b>{rep.attendance}%</b> · Avg score{' '}
            <b>{rep.avg_score ?? '—'}{rep.avg_score != null && '%'}</b>
          </p>
          <p className="meta">Weak areas: {rep.weak_areas.map((w) => `${w.topic} (${w.pct}%)`).join(', ') || '—'}</p>
          <p className="meta">Interests: {rep.interests.map((i) => i.body).join(' · ') || '—'}</p>
          <button className="btn ghost" onClick={() => { setRep(null); setSel(''); }}>Close</button>
        </div>
      )}

      <h4 style={{ marginTop: 28 }}>Schedule · location + timing</h4>
      <table>
        <thead><tr><th>Date</th><th>Time</th><th>Location</th><th>Topic</th></tr></thead>
        <tbody>
          {sess.map((x) => (
            <tr key={x.id}>
              <td>{x.date}</td>
              <td>{x.start_time}–{x.end_time}</td>
              <td>{x.location}</td>
              <td>{x.topic}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sess.length === 0 && <p className="empty">No sessions scheduled.</p>}

      {canSchedule && (
        <form onSubmit={addSess} className="form mt" style={{ maxWidth: 780 }}>
          <input type="date" value={sf.date || ''} onChange={(e) => setSf({ ...sf, date: e.target.value })} />
          <input placeholder="Start (10:00)" value={sf.start_time || ''} onChange={(e) => setSf({ ...sf, start_time: e.target.value })} />
          <input placeholder="End (13:00)" value={sf.end_time || ''} onChange={(e) => setSf({ ...sf, end_time: e.target.value })} />
          <input placeholder="Location" value={sf.location || ''} onChange={(e) => setSf({ ...sf, location: e.target.value })} />
          <input placeholder="Topic" value={sf.topic || ''} onChange={(e) => setSf({ ...sf, topic: e.target.value })} />
          <span><button className="btn">Schedule Session</button></span>
        </form>
      )}

      {canSeeInterests && (
        <div className="card mt">
          <h4>Student Interests · trainers + Rampex only</h4>
          {batchInterests.length === 0 && <p className="empty">No interests shared by this batch yet.</p>}
          <div className="list">
            {batchInterests.map((i) => (
              <div className="list-row" key={i.id}>
                <span className="grow"><b>{i.student_name}</b> — {i.body}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Trainer-owned: the students inside the batches this trainer delivers.
   Organization and institution never reach this screen — at their scale they
   work from the aggregate figures on their dashboard instead. */
export function Students() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { api.students().then(setRows).catch((e) => setErr(e.message)); }, []);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((s) => [s.name, s.email, s.id, s.batch_label, s.program]
        .some((v) => String(v || '').toLowerCase().includes(needle)))
    : rows;
  const atRisk = rows.filter((s) => s.attendance < 75).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>My Students</h2>
          <p className="sub">
            {rows.length} student{rows.length === 1 ? '' : 's'} across the batches assigned to you.
          </p>
        </div>
        {shown.length > 0 && <button className="btn ghost no-print" onClick={() => downloadCSV('students.csv', shown.map(s => ({ id: s.id, name: s.name, email: s.email, phone: s.phone })))}>Export CSV</button>}
      </div>

      {err && <div className="err">{err}</div>}

      {rows.length > 0 && (
        <div className="cards">
          <div className="card"><h4>My Students</h4><b>{rows.length}</b></div>
          <div className="card"><h4>Below 75% Attendance</h4><b>{atRisk}</b></div>
        </div>
      )}

      {rows.length > 3 && (
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search by name, email or batch…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      )}

      <table>
        <thead>
          <tr><th>ID</th><th>Name</th><th>Batch</th><th>Program</th><th>Attendance</th><th>Contact</th></tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td><b>{s.name}</b></td>
              <td>{s.batch_label || '—'}</td>
              <td>{s.program || '—'}</td>
              <td>
                <span className={'chip ' + (s.attendance >= 75 ? 'PRESENT' : s.attendance >= 50 ? 'LATE' : 'ABSENT')}>
                  {s.attendance}%
                </span>
              </td>
              <td className="meta">{s.email || '—'}{s.phone ? ` · ${s.phone}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="empty">No students yet — open one of your batches to enrol your first student.</p>
      )}
      {rows.length > 0 && shown.length === 0 && <p className="empty">No students match “{q}”.</p>}
    </div>
  );
}

export function Attendance() {
  const [batches, setBatches] = useState([]);
  const [bid, setBid] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');

  // Land on the trainer's own first batch rather than a hard-coded id, and
  // default the date to today — this is a daily tool over a short roster.
  useEffect(() => {
    api.batches()
      .then((b) => { setBatches(b); setBid((cur) => cur || (b[0] ? b[0].id : '')); })
      .catch((e) => setMsg(e.message));
  }, []);

  const load = async () => {
    if (!bid) { setRows([]); return; }
    setMsg('Loading…');
    try {
      const b = await api.batch(bid);
      const att = await api.attendance(`?batch_id=${bid}&date=${date}`);
      const map = Object.fromEntries(att.map((a) => [a.student_id, a.status]));
      setRows(b.students.map((s) => ({ student_id: s.id, name: s.name, status: map[s.id] || 'PRESENT' })));
      setMsg('');
    } catch (e) {
      setMsg(e.message);
      setRows([]);
    }
  };
  useEffect(() => { load(); }, [bid, date]);

  const save = async () => {
    try {
      await api.saveAttendance({
        batch_id: bid,
        date,
        records: rows.map((r) => ({ student_id: r.student_id, status: r.status })),
      });
      setMsg('✓ Attendance saved');
    } catch (e) {
      setMsg(e.message);
    }
  };

  const setStatus = (sid, status) =>
    setRows(rows.map((x) => (x.student_id === sid ? { ...x, status } : x)));

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Attendance</h2>
          <p className="sub">Mark daily attendance for the batches assigned to you.</p>
        </div>
      </div>

      <div className="toolbar">
        <select className="select-sm" value={bid} onChange={(e) => setBid(e.target.value)} disabled={!batches.length}>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
        </select>
        <input className="select-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn ghost" onClick={load} disabled={!bid}>Load</button>
        <button className="btn ghost" disabled={!rows.length} onClick={() => setRows(rows.map((r) => ({ ...r, status: 'PRESENT' })))}>
          Mark all present
        </button>
        <button className="btn" onClick={save} disabled={!rows.length}>Save attendance</button>
      </div>

      {msg === 'Loading…' && <p className="meta">Loading…</p>}
      {msg && msg !== 'Loading…' && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <table className="no-mono">
        <thead><tr><th>Student</th><th>Status</th><th>Mark</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.student_id}>
              <td>{r.name}</td>
              <td><span className={'chip ' + r.status}>{r.status}</span></td>
              <td>
                <div className="seg">
                  {['PRESENT', 'ABSENT', 'LATE'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      title={s}
                      aria-label={s}
                      className={r.status === s ? 'on' : ''}
                      onClick={() => setStatus(r.student_id, s)}
                    >
                      {s[0]}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!batches.length && <p className="empty">No batches are assigned to you yet, so there is nothing to mark.</p>}
      {batches.length > 0 && rows.length === 0 && <p className="empty">No students loaded for this batch and date.</p>}
    </div>
  );
}
