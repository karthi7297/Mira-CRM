import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr, downloadCSV, toast } from '../api';
import { useAuth } from '../auth';

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx]; });
      rows.push(row);
    }
  }
  return rows;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (json.length < 2) { resolve([]); return; }
        const headers = json[0].map(h => String(h).trim());
        const rows = json.slice(1).map(row => {
          const obj = {};
          headers.forEach((h, idx) => { obj[h] = row[idx]?.toString().trim() || ''; });
          return obj;
        });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

let XLSX = null;
const loadXLSX = async () => {
  if (!XLSX) {
    const mod = await import('xlsx');
    XLSX = mod.default || mod;
  }
  return XLSX;
};

export function Programs() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');
  const [editId, setEditId] = useState(null);
  const [editF, setEditF] = useState({});

  const canManage = user?.role === 'organization';
  const load = () => api.programs().then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    try { await api.createProgram(f); setF({}); toast('✓ Program created'); load(); }
    catch (ex) { setMsg(ex.message); }
  };

  const openEdit = (p) => {
    setMsg('');
    setEditId(p.id);
    setEditF({ name: p.name, duration: p.duration || '', fee_per_student: p.fee_per_student });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.updateProgram(editId, editF);
      setEditId(null);
      toast('✓ Program updated');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete program "${p.name}" (${p.id})?`)) return;
    setMsg('');
    try {
      await api.deleteProgram(p.id);
      toast('✓ Program deleted');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Training Programs</h2>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      {canManage && (
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
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn sm ghost" onClick={() => openEdit(p)}>Edit</button>
                <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => remove(p)}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editId && (
        <div className="modal">
          <div>
            <h3>Edit Program · {editId}</h3>
            <form onSubmit={saveEdit} className="form">
              <input required placeholder="Program name" value={editF.name || ''} onChange={(e) => setEditF({ ...editF, name: e.target.value })} />
              <input placeholder="Duration" value={editF.duration || ''} onChange={(e) => setEditF({ ...editF, duration: e.target.value })} />
              <input placeholder="Fee per student" type="number" value={editF.fee_per_student ?? ''} onChange={(e) => setEditF({ ...editF, fee_per_student: +e.target.value })} />
              <span>
                <button className="btn">Save Changes</button>
                <button type="button" className="btn ghost" onClick={() => setEditId(null)}>Cancel</button>
              </span>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function Trainers() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');

  const canManage = user?.role === 'organization';
  const load = () => api.trainers().then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setMsg(''); setEditing(null); setF({}); setShow(true); };

  const openEdit = (t) => {
    setMsg('');
    setEditing(t.id);
    setF({ name: t.name, expertise: t.expertise || '', email: t.email || '', phone: t.phone || '' });
    setShow(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editing) {
        await api.updateTrainer(editing, f);
        toast('✓ Trainer updated');
      } else {
        await api.createTrainer(f);
        toast('✓ Trainer added');
      }
      setShow(false);
      setEditing(null);
      setF({});
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete trainer "${t.name}" (${t.id})?`)) return;
    setMsg('');
    try {
      await api.deleteTrainer(t.id);
      toast('✓ Trainer deleted');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Trainers</h2>
          <p className="sub">Manage Rampex trainers — expertise, contact info, and batch assignments.</p>
        </div>
        {canManage && (
          <button className="btn" onClick={openCreate}>+ Add Trainer</button>
        )}
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <table>
        <thead>
          <tr><th>ID</th><th>Name</th><th>Expertise</th><th>Email</th><th>Phone</th>{canManage && <th>Actions</th>}</tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="mono">{t.id}</td>
              <td><b>{t.name}</b></td>
              <td>{t.expertise || '—'}</td>
              <td>{t.email || '—'}</td>
              <td>{t.phone || '—'}</td>
              {canManage && (
                <td>
                  <button className="btn sm ghost" onClick={() => openEdit(t)}>Edit</button>
                  <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => remove(t)}>Delete</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No trainers yet.</p>}

      {show && (
        <div className="modal">
          <div>
            <h3>{editing ? `Edit Trainer · ${editing}` : 'Add Trainer'}</h3>
            <form onSubmit={submit} className="form">
              <input required placeholder="Full Name *" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <input placeholder="Expertise (e.g., AI/ML, Full Stack)" value={f.expertise || ''} onChange={(e) => setF({ ...f, expertise: e.target.value })} />
              <input type="email" placeholder="Email" value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <input placeholder="Phone" value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              <span>
                <button className="btn">{editing ? 'Save Changes' : 'Add Trainer'}</button>
                <button type="button" className="btn ghost" onClick={() => { setShow(false); setEditing(null); }}>Cancel</button>
              </span>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function Batches() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');
  const [progs, setProgs] = useState([]);
  const [custs, setCusts] = useState([]);
  const [trs, setTrs] = useState([]);

  const canManage = user?.role === 'organization';
  // Editing: org edits any batch, an institution edits only its own (DELETE stays org-only).
  const canEdit = canManage || user?.role === 'institution';

  useEffect(() => {
    api.batches().then(setRows).catch((e) => setMsg(e.message));
    api.programs().then(setProgs);
    api.customers().then(setCusts);
    api.trainers().then(setTrs);
  }, []);

  const openCreate = () => { setMsg(''); setEditing(null); setF({}); setShow(true); };

  const openEdit = (b) => {
    setMsg('');
    setEditing(b.id);
    setF({
      program_id: b.program_id,
      customer_id: b.customer_id,
      trainer_id: b.trainer_id || '',
      start_date: b.start_date || '',
      end_date: b.end_date || '',
      capacity: b.capacity,
      status: b.status,
    });
    setShow(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editing) {
        await api.updateBatch(editing, f);
        toast(`✓ Batch ${editing} updated`);
      } else {
        await api.createBatch({ ...f, id: f.id || `B-${Date.now().toString().slice(-6)}` });
        toast('✓ Batch created');
      }
      setShow(false);
      setEditing(null);
      setF({});
      api.batches().then(setRows);
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete batch ${b.id}? This permanently removes its ${b.student_count} student enrollment(s), attendance, sessions, assessments and certificates.`)) return;
    setMsg('');
    try {
      await api.deleteBatch(b.id);
      toast(`✓ Batch ${b.id} deleted`);
      api.batches().then(setRows);
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Batches</h2>
        {canManage && (
          <button className="btn" onClick={openCreate}>+ Create Batch</button>
        )}
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <table>
        <thead>
          <tr><th>Batch</th><th>Program</th><th>Customer</th><th>Trainer</th><th>Students</th><th>Status</th>{canEdit && <th>Actions</th>}</tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td><Link to={'/batches/' + b.id}>{b.id}</Link></td>
              <td>{b.program_name}</td>
              <td>{b.customer_name}</td>
              <td>{b.trainer_name || '—'}</td>
              <td>{b.student_count}</td>
              <td><span className={'chip ' + b.status}>{b.status}</span></td>
              {canEdit && (
                <td>
                  <button className="btn sm ghost" onClick={() => openEdit(b)}>Edit</button>
                  {canManage && (
                    <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => remove(b)}>Delete</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No batches yet.</p>}

      {show && (
        <div className="modal">
          <div>
            <h3>{editing ? `Edit Batch · ${editing}` : 'Create Batch'}</h3>
            <form onSubmit={submit} className="form">
              {!editing && (
                <input placeholder="Batch ID (optional)" value={f.id || ''} onChange={(e) => setF({ ...f, id: e.target.value })} />
              )}
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
              {editing && (
                <select value={f.status || ''} onChange={(e) => setF({ ...f, status: e.target.value })}>
                  <option value="PLANNED">PLANNED</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              )}
              <span>
                <button className="btn">Save</button>
                <button type="button" className="btn ghost" onClick={() => { setShow(false); setEditing(null); }}>Cancel</button>
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

export function Students() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [batches, setBatches] = useState([]);
  const [q, setQ] = useState('');
  const [batchFilter, setBatchFilter] = useState('ALL');
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [addForm, setAddForm] = useState({});
  const [editStudent, setEditStudent] = useState(null);
  const [reportStudent, setReportStudent] = useState(null);

  const load = () => {
    const params = {};
    if (batchFilter !== 'ALL') params.batch_id = batchFilter;
    if (q.trim()) params.search = q.trim();
    api.students(params).then(setRows).catch((e) => setErr(e.message));
    api.batches().then(setBatches).catch(() => {});
  };

  useEffect(() => { load(); }, [batchFilter, q]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.createStudent({
        name: addForm.name,
        email: addForm.email,
        phone: addForm.phone,
        batch_id: addForm.batch_id || undefined,
      });
      toast('✓ Student successfully added!');
      setShowAdd(false);
      setAddForm({});
      load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.patchStudent(editStudent.id, {
        name: editStudent.name,
        email: editStudent.email,
        phone: editStudent.phone,
      });
      toast(`✓ Student ${editStudent.id} updated!`);
      setEditStudent(null);
      load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove student "${name}" (${id})?`)) return;
    try {
      await api.deleteStudent(id);
      toast(`✓ Student ${name} removed`);
      load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const handleReport = async (sid) => {
    try {
      const rep = await api.studentReport(sid);
      setReportStudent(rep);
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const atRisk = rows.filter((s) => Number(s.attendance || 0) < 75).length;
  const goodAttendance = rows.filter((s) => Number(s.attendance || 0) >= 75).length;
  const isInstitution = user?.role === 'institution';

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{isInstitution ? 'Student Roster & Management' : 'My Students'}</h2>
          <p className="sub">
            {rows.length} enrolled student{rows.length === 1 ? '' : 's'} · Manage roster, view attendance trends, and monitor academic progress.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isInstitution && (
            <Link to="/attendance-details" className="btn ghost">
              View Attendance Details →
            </Link>
          )}
          {rows.length > 0 && (
            <button
              className="btn ghost no-print"
              onClick={() =>
                downloadCSV(
                  'students.csv',
                  rows.map((s) => ({ ID: s.id, Name: s.name, Email: s.email, Phone: s.phone, Batch: s.batch_label, Program: s.program, Attendance: `${s.attendance}%` }))
                )
              }
            >
              Export CSV
            </button>
          )}
          <button className="btn" onClick={() => setShowBulkAdd(true)}>Bulk Add Students</button>
          <button className="btn" onClick={() => setShowAdd(true)}>+ Add Student</button>
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="cards">
        <div className="card" style={{ borderLeft: '4px solid var(--info, #2c4f8c)' }}>
          <h4>Total Students</h4>
          <b>{rows.length}</b>
          <small>Active institutional learners</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4>Good Standing (&ge;75%)</h4>
          <b style={{ color: '#059669' }}>{goodAttendance}</b>
          <small>Eligible for certification</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h4>Below 75% Attendance</h4>
          <b style={{ color: '#dc2626' }}>{atRisk}</b>
          <small>Requires intervention</small>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
          >
            <option value="ALL">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.id} ({b.program_name || 'Batch'})</option>
            ))}
          </select>
        </div>
        <input
          className="search-input"
          style={{ maxWidth: 300, margin: 0 }}
          placeholder="Search by name, email, phone or batch…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Batch</th>
            <th>Program</th>
            <th>Attendance</th>
            <th>Contact</th>
            <th>Manage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const att = Number(s.attendance || 0);
            return (
              <tr key={s.id}>
                <td className="mono"><b>{s.id}</b></td>
                <td><b>{s.name}</b></td>
                <td>{s.batch_label || '—'}</td>
                <td>{s.program || '—'}</td>
                <td>
                  <span className={'chip ' + (att >= 75 ? 'PRESENT' : att >= 50 ? 'LATE' : 'ABSENT')}>
                    {att}%
                  </span>
                </td>
                <td className="meta">{s.email || '—'}{s.phone ? ` · ${s.phone}` : ''}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm ghost" onClick={() => handleReport(s.id)}>Report</button>
                    <button className="btn sm ghost" onClick={() => setEditStudent(s)}>Edit</button>
                    <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => handleDelete(s.id, s.name)}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No students registered yet. Click &quot;+ Add Student&quot; to begin.</p>}
      {rows.length === 0 && <p className="empty">No students match the current filter.</p>}

      {/* Add Student Modal */}
      {showAdd && (
        <div className="modal">
          <div>
            <h3>Add New Student</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              Register a student under your institutional account and optionally enrol into an active batch.
            </p>
            <form onSubmit={handleAdd} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Full Name *</label>
              <input
                required
                placeholder="Student full name"
                value={addForm.name || ''}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Email Address</label>
              <input
                type="email"
                placeholder="student@college.edu"
                value={addForm.email || ''}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Phone Number</label>
              <input
                placeholder="98400-00000"
                value={addForm.phone || ''}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
              />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Enrol into Batch</label>
              <select
                value={addForm.batch_id || ''}
                onChange={(e) => setAddForm({ ...addForm, batch_id: e.target.value })}
              >
                <option value="">Select batch (optional)…</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.id} — {b.program_name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn">Add Student</button>
                <button type="button" className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editStudent && (
        <div className="modal">
          <div>
            <h3>Edit Student {editStudent.id}</h3>
            <form onSubmit={handleEdit} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Full Name *</label>
              <input
                required
                value={editStudent.name || ''}
                onChange={(e) => setEditStudent({ ...editStudent, name: e.target.value })}
              />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Email Address</label>
              <input
                type="email"
                value={editStudent.email || ''}
                onChange={(e) => setEditStudent({ ...editStudent, email: e.target.value })}
              />
              <label style={{ fontSize: 13, fontWeight: 600 }}>Phone Number</label>
              <input
                value={editStudent.phone || ''}
                onChange={(e) => setEditStudent({ ...editStudent, phone: e.target.value })}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn">Save Changes</button>
                <button type="button" className="btn ghost" onClick={() => setEditStudent(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Academic & Attendance Report Modal */}
      {reportStudent && (
        <div className="modal">
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0 }}>Academic Report · {reportStudent.name}</h3>
                <small style={{ color: '#64748b' }}>{reportStudent.id} · {reportStudent.program || 'Active Student'}</small>
              </div>
              <span className={'chip ' + (reportStudent.attendance_rate >= 75 ? 'PRESENT' : 'ABSENT')}>
                {reportStudent.attendance_rate}% Attendance
              </span>
            </div>

            <div className="cards" style={{ margin: '14px 0' }}>
              <div className="card">
                <h4>Sessions Attended</h4>
                <b>{reportStudent.attendance_present} / {reportStudent.attendance_total}</b>
              </div>
              <div className="card">
                <h4>Average Assessment Score</h4>
                <b>{reportStudent.average_score ?? '—'}{reportStudent.average_score != null ? '%' : ''}</b>
              </div>
            </div>

            <h4 style={{ margin: '16px 0 8px' }}>Assessment Breakdown</h4>
            {reportStudent.assessments && reportStudent.assessments.length > 0 ? (
              <table>
                <thead><tr><th>Assessment</th><th>Score</th><th>Max</th><th>Date</th></tr></thead>
                <tbody>
                  {reportStudent.assessments.map((a, i) => (
                    <tr key={i}>
                      <td><b>{a.title}</b></td>
                      <td><b>{a.score}</b></td>
                      <td>{a.max_score}</td>
                      <td>{a.assessed_on}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">No assessment scores recorded yet for this student.</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn" onClick={() => setReportStudent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Students Modal */}
      {showBulkAdd && (
        <StudentBulkAdd
          onClose={() => setShowBulkAdd(false)}
          onSuccess={() => { setShowBulkAdd(false); load(); }}
        />
      )}
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

export function TrainerLeaveRequests() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [f, setF] = useState({
    type: 'Casual Leave',
    days: 1,
    reason: '',
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    setLoading(true);
    api.leaveRequests()
      .then((data) => {
        const trainerRows = data.filter((r) => r.trainer_id === user.trainer_id || r.trainer_name === user.name);
        setRows(trainerRows);
        setLoading(false);
      })
      .catch((err) => {
        setMsg(err.message);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const submitLeave = async (e) => {
    e.preventDefault();
    try {
      await api.createLeaveRequest({
        ...f,
        trainer_id: user.trainer_id,
        trainer_name: user.name,
      });
      toast('✓ Leave application submitted successfully');
      setShowApply(false);
      setF({
        type: 'Casual Leave',
        days: 1,
        reason: '',
        from_date: new Date().toISOString().slice(0, 10),
        to_date: new Date().toISOString().slice(0, 10),
      });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const pendingCount = rows.filter((r) => r.status === 'PENDING').length;
  const approvedCount = rows.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = rows.filter((r) => r.status === 'REJECTED').length;

  const filtered = rows.filter((r) => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.type.toLowerCase().includes(q) ||
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>My Leave Requests</h2>
          <p className="sub">Submit leave applications and track their approval status.</p>
        </div>
        <button className="btn" onClick={() => setShowApply(true)}>+ Apply Leave</button>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <div className="cards">
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h4>Pending</h4>
          <b style={{ color: '#d97706' }}>{pendingCount}</b>
          <small>Awaiting approval</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4>Approved</h4>
          <b style={{ color: '#059669' }}>{approvedCount}</b>
          <small>Leave approved</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h4>Rejected</h4>
          <b style={{ color: '#dc2626' }}>{rejectedCount}</b>
          <small>Leave declined</small>
        </div>
        <div className="card" style={{ borderLeft: '4px solid var(--info, #2c4f8c)' }}>
          <h4>Total Applications</h4>
          <b>{rows.length}</b>
          <small>Current academic year</small>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((tab) => (
            <button
              key={tab}
              className={`btn sm ${filter === tab ? '' : 'ghost'}`}
              onClick={() => setFilter(tab)}
            >
              {tab === 'ALL' ? 'All Requests' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              {tab === 'PENDING' && pendingCount > 0 && ` (${pendingCount})`}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          style={{ maxWidth: 300, margin: 0 }}
          placeholder="Search by type or reason…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading leave requests…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Leave Type</th>
              <th>Period</th>
              <th>Days</th>
              <th>Reason</th>
              <th>Applied Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lr) => (
              <tr key={lr.id}>
                <td className="mono">{lr.id}</td>
                <td>
                  <span className="chip" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                    {lr.type}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {lr.from_date} {lr.from_date !== lr.to_date ? `→ ${lr.to_date}` : ''}
                  </span>
                </td>
                <td><b>{lr.days} d</b></td>
                <td style={{ maxWidth: 220, fontSize: 13, color: '#334155' }}>
                  {lr.reason || '—'}
                </td>
                <td style={{ fontSize: 13, color: '#64748b' }}>{lr.applied_on}</td>
                <td>
                  <span className={'chip ' + (lr.status === 'APPROVED' ? 'PRESENT' : lr.status === 'PENDING' ? 'LATE' : 'ABSENT')}>
                    {lr.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && filtered.length === 0 && (
        <p className="empty">No leave requests match the current filter.</p>
      )}

      {showApply && (
        <div className="modal">
          <div>
            <h3>Apply for Leave</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Submit a leave request for approval by the organization.
            </p>
            <form onSubmit={submitLeave} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Leave Type</label>
              <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option>Casual Leave</option>
                <option>Sick Leave</option>
                <option>Earned Leave</option>
                <option>Comp Off</option>
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>From Date</label>
                  <input
                    type="date"
                    required
                    value={f.from_date}
                    onChange={(e) => setF({ ...f, from_date: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>To Date</label>
                  <input
                    type="date"
                    required
                    value={f.to_date}
                    onChange={(e) => setF({ ...f, to_date: e.target.value })}
                  />
                </div>
              </div>

              <label style={{ fontSize: 13, fontWeight: 600 }}>Number of Days</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                required
                value={f.days}
                onChange={(e) => setF({ ...f, days: e.target.value })}
              />

              <label style={{ fontSize: 13, fontWeight: 600 }}>Reason</label>
              <input
                required
                placeholder="Reason for leave"
                value={f.reason}
                onChange={(e) => setF({ ...f, reason: e.target.value })}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn">Submit Request</button>
                <button type="button" className="btn ghost" onClick={() => setShowApply(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function StudentBulkAdd({ onClose, onSuccess }) {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');

  useEffect(() => {
    api.batches().then(setBatches).catch(() => {});
  }, []);

  const handleFileChange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setMsg('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
      setFile(null);
      return;
    }
    setFile(f);
    setMsg('');
    try {
      let rows = [];
      if (ext === 'csv') {
        const text = await readFileAsText(f);
        rows = parseCSV(text);
      } else {
        await loadXLSX();
        rows = await readExcelFile(f);
      }
      setPreview(rows.slice(0, 10));
    } catch (err) {
      setMsg('Failed to parse file: ' + err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !selectedBatch) {
      setMsg('Please select a file and a batch');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      let rows = [];
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'csv') {
        const text = await readFileAsText(file);
        rows = parseCSV(text);
      } else {
        await loadXLSX();
        rows = await readExcelFile(file);
      }

      const students = rows.map(row => ({
        name: row.Name || row.name,
        email: row.Email || row.email,
        phone: row.Phone || row.phone,
      })).filter(s => s.name);

      if (students.length === 0) {
        setMsg('No valid student records found in file');
        setLoading(false);
        return;
      }

      const result = await api.bulkCreateStudents({ batch_id: selectedBatch, students });

      const successCount = result.created?.length || 0;
      const failedCount = result.failed?.length || 0;

      if (successCount > 0) {
        toast(`✓ ${successCount} student(s) added successfully`);
      }
      if (failedCount > 0) {
        console.error('Bulk add errors:', result.failed);
        setMsg(`${successCount} added, ${failedCount} failed. Check console for details.`);
      } else {
        setMsg(`✓ Bulk add complete: ${successCount} students added`);
      }

      setFile(null);
      setPreview([]);
      setSelectedBatch('');
      if (onSuccess) onSuccess();
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <div style={{ maxWidth: 600 }}>
        <h3>Bulk Add Students</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Upload a CSV or Excel file to add multiple students at once.
          Required columns: <b>Name</b> (Email, Phone optional).
        </p>

        {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'} style={{ marginBottom: 12 }}>{msg}</div>}

        <form onSubmit={handleSubmit} className="form col-1">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Select Batch *</label>
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            required
            disabled={!batches.length}
          >
            <option value="">Choose batch…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.id} — {b.program_name}</option>
            ))}
          </select>

          <label style={{ fontSize: 13, fontWeight: 600 }}>Upload File (CSV, XLSX, XLS) *</label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={loading}
            required
          />
          <p className="meta">Max 500 students per upload. File must have a header row.</p>

          {preview.length > 0 && (
            <div style={{ marginTop: 12, maxHeight: 200, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {Object.keys(preview[0] || {}).map((k) => <th key={k} style={{ padding: '6px 8px', textAlign: 'left' }}>{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                      {Object.values(row).map((v, j) => <td key={j} style={{ padding: '6px 8px' }}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="meta" style={{ margin: 8, fontSize: 12 }}>
                Showing first {preview.length} of {preview.length} rows (preview limited to 10)
              </p>
            </div>
          )}
        </form>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={handleSubmit} disabled={loading || !file || !selectedBatch}>
            {loading ? 'Processing…' : 'Import Students'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Assessments() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [batches, setBatches] = useState([]);
  const [scores, setScores] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showScores, setShowScores] = useState(null);
  const [showEdit, setShowEdit] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [f, setF] = useState({ batch_id: '', title: '', max_score: 100, assessed_on: new Date().toISOString().slice(0, 10) });
  const [scoreEntries, setScoreEntries] = useState({});
  const [msg, setMsg] = useState('');
  const [batchFilter, setBatchFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([
        api.batches(),
        api.assessments()
      ]);
      setBatches(b);
      setAssessments(a);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredAssessments = assessments.filter(a => batchFilter === 'ALL' || a.batch_id === batchFilter);

  const handleCreate = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.createAssessment(f);
      setShowCreate(false);
      setF({ batch_id: '', title: '', max_score: 100, assessed_on: new Date().toISOString().slice(0, 10) });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const loadScores = async (assessmentId) => {
    try {
      const s = await api.scores(`?assessment_id=${assessmentId}`);
      setScores(s);
      setShowScores(assessmentId);
    } catch (e) {
      setMsg(e.message);
    }
  };

  const handleScoreChange = (assessmentId, studentId, value) => {
    setScoreEntries(prev => ({
      ...prev,
      [assessmentId]: { ...prev[assessmentId], [studentId]: value }
    }));
  };

  const saveScore = async (assessmentId, studentId) => {
    const score = scoreEntries[assessmentId]?.[studentId];
    if (score === undefined || score === '') return;
    try {
      await api.saveScore({ assessment_id: assessmentId, student_id: studentId, score: Number(score) });
      toast('✓ Score saved');
      if (showScores === assessmentId) loadScores(assessmentId);
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const deleteScore = async (assessmentId, studentId) => {
    if (!window.confirm('Delete this score?')) return;
    try {
      await api.deleteScore(assessmentId, studentId);
      toast('✓ Score deleted');
      loadScores(assessmentId);
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const handleEditClick = (a) => {
    setShowEdit(a.id);
    setEditForm({ title: a.title, max_score: a.max_score, assessed_on: a.assessed_on });
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.updateAssessment(showEdit, editForm);
      setShowEdit(null);
      setEditForm({});
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const deleteAssessment = async (id) => {
    if (!window.confirm('Delete this assessment and all its scores?')) return;
    try {
      await api.deleteAssessment(id);
      toast('✓ Assessment deleted');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const canManage = user?.role === 'organization' || user?.role === 'institution' || user?.role === 'trainer';

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Assessments & Marks</h2>
          <p className="sub">Create assessments, enter marks, and track student performance across batches.</p>
        </div>
        {canManage && (
          <button className="btn" onClick={() => setShowCreate(true)}>+ Create Assessment</button>
        )}
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      {loading ? (
        <div className="loading">Loading assessments…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              className="select-sm"
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              style={{ minWidth: 200 }}
            >
              <option value="ALL">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.id} — {b.program_name}</option>
              ))}
            </select>
            {filteredAssessments.length === 0 && <p className="meta" style={{ marginTop: 8 }}>No assessments found. Create one to get started.</p>}
          </div>

          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Batch</th>
                <th>Date</th>
                <th>Max Score</th>
                <th>Scores Entered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssessments.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.id}</td>
                  <td><b>{a.title}</b></td>
                  <td>{a.batch_id}</td>
                  <td>{a.assessed_on}</td>
                  <td>{a.max_score}</td>
                  <td>{a.score_count || 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {canManage && (
                        <>
                          <button className="btn sm ghost" onClick={() => loadScores(a.id)}>
                            {showScores === a.id ? 'Hide Scores' : 'View/Enter Scores'}
                          </button>
                          <button className="btn sm ghost" onClick={() => handleEditClick(a)}>Edit</button>
                          <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => deleteAssessment(a.id)}>Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {showScores && scores.length > 0 && (
        <div className="modal" style={{ maxWidth: 900 }}>
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>Scores for Assessment</h3>
              <button className="btn ghost" onClick={() => setShowScores(null)}>Close</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Batch</th>
                  <th>Score / Max</th>
                  <th>%</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => {
                  const currentScore = scoreEntries[showScores]?.[s.student_id] ?? s.score;
                  const pct = currentScore !== null && currentScore !== undefined && s.max_score
                    ? Math.round((Number(currentScore) / Number(s.max_score)) * 100)
                    : '—';
                  return (
                    <tr key={`${s.student_id}-${s.assessment_id}`}>
                      <td className="mono">{s.student_id}</td>
                      <td><b>{s.student_name}</b></td>
                      <td>{s.batch_id}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max={s.max_score}
                          step="0.5"
                          value={currentScore ?? ''}
                          onChange={(e) => handleScoreChange(showScores, s.student_id, e.target.value)}
                          style={{ width: 80 }}
                        />
                        <span className="meta"> / {s.max_score}</span>
                      </td>
                      <td><b>{pct !== '—' ? pct + '%' : '—'}</b></td>
                      <td>
                        {canManage && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn sm"
                              onClick={() => saveScore(showScores, s.student_id)}
                              disabled={currentScore === undefined || currentScore === ''}
                            >
                              Save
                            </button>
                            {s.score !== null && s.score !== undefined && (
                              <button
                                className="btn sm ghost"
                                style={{ color: '#ef4444' }}
                                onClick={() => deleteScore(showScores, s.student_id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal">
          <div>
            <h3>Create Assessment</h3>
            <form onSubmit={handleCreate} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Batch *</label>
              <select
                value={f.batch_id}
                onChange={(e) => setF({ ...f, batch_id: e.target.value })}
                required
              >
                <option value="">Select batch…</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.id} — {b.program_name}</option>
                ))}
              </select>

              <label style={{ fontSize: 13, fontWeight: 600 }}>Title *</label>
              <input
                required
                placeholder="e.g. Mid-term Exam, Project Submission, Quiz 1"
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Max Score</label>
                  <input
                    type="number"
                    min="1"
                    value={f.max_score}
                    onChange={(e) => setF({ ...f, max_score: +e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Assessment Date</label>
                  <input
                    type="date"
                    value={f.assessed_on}
                    onChange={(e) => setF({ ...f, assessed_on: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn">Create Assessment</button>
                <button type="button" className="btn ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="modal">
          <div>
            <h3>Edit Assessment</h3>
            <form onSubmit={handleEdit} className="form col-1">
              <label style={{ fontSize: 13, fontWeight: 600 }}>Title *</label>
              <input
                required
                placeholder="e.g. Mid-term Exam, Project Submission, Quiz 1"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Max Score</label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.max_score}
                    onChange={(e) => setEditForm({ ...editForm, max_score: +e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Assessment Date</label>
                  <input
                    type="date"
                    value={editForm.assessed_on}
                    onChange={(e) => setEditForm({ ...editForm, assessed_on: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn">Save Changes</button>
                <button type="button" className="btn ghost" onClick={() => setShowEdit(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
