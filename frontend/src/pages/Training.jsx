import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, inr, downloadCSV, toast, toastError } from '../api';
import { AttendanceBar } from '../widgets';
import { useAuth } from '../auth';
import { exportAssessmentPDF, exportAssessmentExcel, exportBatchPDF, exportOverallPDF } from '../exportReport';
import AiInsights from '../AiInsights';
import { useListControls, ListToolbar, Pager, SortHeader, useBulkSelection, BulkBar, SelectAllTh, downloadCsv, ListState, DateRange, ArchiveToggle } from '../listkit';

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
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editF, setEditF] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [archived, setArchived] = useState(false);

  const canManage = user?.role === 'organization';
  const load = () => {
    setLoading(true); setLoadErr('');
    return api.programs(archived ? '?archived=1' : '').then(setRows).catch((e) => { setLoadErr(e.message); setMsg(e.message); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [archived]);

  const doArchive = async (p) => {
    if (!window.confirm(`Archive program "${p.name}" (${p.id})? It leaves the list but stays recoverable.`)) return;
    try { await api.archive('programs', p.id); toast('Program archived'); load(); }
    catch (ex) { setMsg(ex.message); }
  };
  const doRestore = async (p) => {
    try { await api.restore('programs', p.id); toast('Program restored'); load(); }
    catch (ex) { setMsg(ex.message); }
  };

  const L = useListControls(rows, {
    searchKeys: ['id', 'name', 'duration'],
    initialSort: { key: 'name', dir: 'asc' },
  });

  const create = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg('');
    try { await api.createProgram(f); setF({}); toast('✓ Program created'); load(); }
    catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
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

      <ListState loading={loading} error={loadErr} onRetry={load} empty={!loading && !loadErr && rows.length === 0} emptyText="No programs yet." />

      {canManage && !loading && (
        <form onSubmit={create} className="form narrow mb">
          <input required placeholder="Program name" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input placeholder="Duration" value={f.duration || ''} onChange={(e) => setF({ ...f, duration: e.target.value })} />
          <input placeholder="Fee per student" type="number" value={f.fee_per_student || ''} onChange={(e) => setF({ ...f, fee_per_student: +e.target.value })} />
          <span><button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : '+ Create Program'}</button></span>
        </form>
      )}

      {!loading && !loadErr && (rows.length > 0 || archived) && (
        <ListToolbar L={L} placeholder="Search programs…" sortOptions={[['name', 'Name'], ['fee_per_student', 'Fee'], ['batch_count', 'Batches']]}>
          <ArchiveToggle value={archived} onChange={setArchived} />
        </ListToolbar>
      )}
      <div className="cards">
        {L.rows.map((p) => (
          <div className="card" key={p.id}>
            <h4>{p.id}</h4>
            <b className="sm">{p.name}</b>
            <p className="meta">{p.duration} · {inr(p.fee_per_student)}/student · {p.batch_count} batches</p>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn sm ghost" onClick={() => openEdit(p)}>Edit</button>
                {archived
                  ? <button className="btn sm ghost" onClick={() => doRestore(p)}>Restore</button>
                  : <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => doArchive(p)}>Archive</button>}
                <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => remove(p)}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {rows.length > 0 && L.total === 0 && <p className="empty">No programs match your search.</p>}
      {rows.length === 0 && archived && !loading && <p className="empty">No archived programs.</p>}
      <Pager L={L} />

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
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [archived, setArchived] = useState(false);

  const canManage = user?.role === 'organization';
  const load = () => {
    setLoading(true); setLoadErr('');
    return api.trainers(archived ? '?archived=1' : '').then(setRows).catch((e) => { setLoadErr(e.message); setMsg(e.message); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [archived]);

  const doArchive = async (t) => {
    if (!window.confirm(`Archive trainer "${t.name}" (${t.id})? It leaves the list but stays recoverable.`)) return;
    try { await api.archive('trainers', t.id); toast('Trainer archived'); load(); }
    catch (ex) { setMsg(ex.message); }
  };
  const doRestore = async (t) => {
    try { await api.restore('trainers', t.id); toast('Trainer restored'); load(); }
    catch (ex) { setMsg(ex.message); }
  };

  const L = useListControls(rows, {
    searchKeys: ['id', 'name', 'expertise', 'email', 'phone'],
    initialSort: { key: 'name', dir: 'asc' },
  });

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

      <ListState loading={loading} error={loadErr} onRetry={load} empty={!loading && !loadErr && rows.length === 0} emptyText="No trainers yet." />

      {!loading && !loadErr && (rows.length > 0 || archived) && (
        <ListToolbar L={L} placeholder="Search trainers…" sortOptions={[['name', 'Name'], ['expertise', 'Expertise']]}>
          <ArchiveToggle value={archived} onChange={setArchived} />
        </ListToolbar>
      )}
      <table>
        <thead>
          <tr>
            <SortHeader label="ID" k="id" L={L} />
            <SortHeader label="Name" k="name" L={L} />
            <SortHeader label="Expertise" k="expertise" L={L} />
            <SortHeader label="Email" k="email" L={L} />
            <SortHeader label="Phone" k="phone" L={L} />
            <th></th>{canManage && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {L.rows.map((t) => (
            <tr key={t.id}>
              <td className="mono">{t.id}</td>
              <td><b>{t.name}</b></td>
              <td>{t.expertise || '—'}</td>
              <td>{t.email || '—'}</td>
              <td>{t.phone || '—'}</td>
              <td><Link to={'/trainers/' + t.id} className="btn sm ghost">View →</Link></td>
              {canManage && (
                <td>
                  <button className="btn sm ghost" onClick={() => openEdit(t)}>Edit</button>
                  {archived
                    ? <button className="btn sm ghost" onClick={() => doRestore(t)}>Restore</button>
                    : <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => doArchive(t)}>Archive</button>}
                  <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => remove(t)}>Delete</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 0 && L.total === 0 && <p className="empty">No trainers match your search.</p>}
      {rows.length === 0 && archived && !loading && <p className="empty">No archived trainers.</p>}
      <Pager L={L} />

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
  const [busy, setBusy] = useState(false);
  const [progs, setProgs] = useState([]);
  const [custs, setCusts] = useState([]);
  const [trs, setTrs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [archived, setArchived] = useState(false);

  const canManage = user?.role === 'organization';
  // Editing: org edits any batch, an institution edits only its own (DELETE stays org-only).
  const canEdit = canManage || user?.role === 'institution';

  const loadBatches = () => {
    setLoading(true); setLoadErr('');
    return api.batches(archived ? '?archived=1' : '').then(setRows).catch((e) => { setLoadErr(e.message); setMsg(e.message); }).finally(() => setLoading(false));
  };
  useEffect(() => {
    api.programs().then(setProgs);
    api.customers().then(setCusts);
    api.trainers().then(setTrs);
  }, []);
  useEffect(() => { loadBatches(); }, [archived]);

  const doArchive = async (b) => {
    if (!window.confirm(`Archive batch ${b.id}? It leaves the list but stays recoverable.`)) return;
    try { await api.archive('batches', b.id); toast(`Batch ${b.id} archived`); loadBatches(); }
    catch (ex) { setMsg(ex.message); }
  };
  const doRestore = async (b) => {
    try { await api.restore('batches', b.id); toast(`Batch ${b.id} restored`); loadBatches(); }
    catch (ex) { setMsg(ex.message); }
  };

  const [statusFilter, setStatusFilter] = useState('ALL');
  const baseBatches = useMemo(
    () => rows.filter((b) => statusFilter === 'ALL' || b.status === statusFilter),
    [rows, statusFilter],
  );
  const L = useListControls(baseBatches, {
    searchKeys: ['id', 'program_name', 'customer_name', 'trainer_name', 'status'],
    initialSort: { key: 'id', dir: 'asc' },
    dateKey: 'start_date',
  });

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
    if (busy) return;
    setBusy(true);
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
      loadBatches();
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete batch ${b.id}? This permanently removes its ${b.student_count} student enrollment(s), attendance, sessions, assessments and certificates.`)) return;
    setMsg('');
    try {
      await api.deleteBatch(b.id);
      toast(`✓ Batch ${b.id} deleted`);
      loadBatches();
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

      <ListState loading={loading} error={loadErr} onRetry={loadBatches} empty={!loading && !loadErr && rows.length === 0} emptyText="No batches yet." />

      {!loading && !loadErr && (rows.length > 0 || archived) && (
        <ListToolbar L={L} placeholder="Search batches…" sortOptions={[['id', 'Batch'], ['program_name', 'Program'], ['customer_name', 'Customer'], ['student_count', 'Students'], ['status', 'Status']]}>
          <select className="select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" style={{ minWidth: 140 }}>
            <option value="ALL">All Statuses</option>
            {['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <DateRange L={L} label="Starts" />
          <ArchiveToggle value={archived} onChange={setArchived} />
        </ListToolbar>
      )}
      <table>
        <thead>
          <tr>
            <SortHeader label="Batch" k="id" L={L} />
            <SortHeader label="Program" k="program_name" L={L} />
            <SortHeader label="Customer" k="customer_name" L={L} />
            <SortHeader label="Trainer" k="trainer_name" L={L} />
            <SortHeader label="Students" k="student_count" L={L} />
            <SortHeader label="Starts" k="start_date" L={L} />
            <SortHeader label="Status" k="status" L={L} />
            {canEdit && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {L.rows.map((b) => (
            <tr key={b.id}>
              <td><Link to={'/batches/' + b.id}>{b.id}</Link></td>
              <td>{b.program_name}</td>
              <td>{b.customer_name}</td>
              <td>{b.trainer_name || '—'}</td>
              <td>{b.student_count}</td>
              <td>{b.start_date || '—'}</td>
              <td><span className={'chip ' + b.status}>{b.status}</span></td>
              {canEdit && (
                <td>
                  <button className="btn sm ghost" onClick={() => openEdit(b)}>Edit</button>
                  {canManage && (
                    archived
                      ? <button className="btn sm ghost" onClick={() => doRestore(b)}>Restore</button>
                      : <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => doArchive(b)}>Archive</button>
                  )}
                  {canManage && (
                    <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => remove(b)}>Delete</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 0 && L.total === 0 && <p className="empty">No batches match your filters.</p>}
      {rows.length === 0 && archived && !loading && <p className="empty">No archived batches.</p>}
      <Pager L={L} />

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
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.batch(id).then(setB);
    api.sessions(`?batch_id=${id}`).then(setSess).catch(() => {});
    if (['organization', 'trainer'].includes(user?.role)) api.interests().then(setInts).catch(() => {});
  };
  useEffect(() => { load(); }, [id]);

  const enroll = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await api.createStudent({ ...f, batch_id: id }); setF({}); toast('Student enrolled'); load(); }
    catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  };
  const addSess = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api.createSession({ batch_id: id, ...sf });
      setSf({});
      toast('Session scheduled');
      api.sessions(`?batch_id=${id}`).then(setSess);
    } catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  };
  const report = async (sid) => {
    setSel(sid);
    try { setRep(await api.studentReport(sid)); } catch (e) { setMsg(e.message); }
  };

  if (!b) return <div className="loading">Loading batch…</div>;

  // Student management belongs to the trainer who delivers the batch — enrolling
  // students and reading per-student reports. Scheduling sessions is batch
  // logistics, which stays with the Rampex organization.
  const canEnroll = user?.role === 'trainer' || user?.role === 'organization';
  const canSchedule = user?.role === 'organization';
  const canReport = ['trainer', 'institution', 'organization'].includes(user?.role);
  const canSeeInterests = ['organization', 'trainer', 'institution'].includes(user?.role);
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
            <span><button className="btn" type="submit" disabled={busy}>{busy ? 'Enrolling…' : 'Enrol'}</button></span>
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
              <td>{canReport && <button type="button" className="btn ghost" onClick={() => report(s.id)}>Report</button>}</td>
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
          <button type="button" className="btn ghost" onClick={() => { setRep(null); setSel(''); }}>Close</button>
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
          <span><button className="btn" type="submit" disabled={busy}>{busy ? 'Scheduling…' : 'Schedule Session'}</button></span>
        </form>
      )}

      {canSeeInterests && (
        <div className="card mt">
          <h4>Student Interests · trainers, institutions + Rampex only</h4>
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
  const [formBusy, setFormBusy] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [reportStudent, setReportStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [archived, setArchived] = useState(false);

  const load = () => {
    const params = {};
    if (batchFilter !== 'ALL') params.batch_id = batchFilter;
    if (q.trim()) params.search = q.trim();
    if (archived) params.archived = 1;
    setLoading(true); setLoadErr('');
    api.students(params).then(setRows).catch((e) => { setLoadErr(e.message); setErr(e.message); }).finally(() => setLoading(false));
    api.batches().then(setBatches).catch(() => {});
  };

  useEffect(() => { load(); }, [batchFilter, q, archived]);

  const doArchive = async (s) => {
    if (!window.confirm(`Archive student "${s.name}" (${s.id})? It leaves the roster but stays recoverable.`)) return;
    try { await api.archive('students', s.id); toast(`Student ${s.id} archived`); load(); }
    catch (ex) { setErr(ex.message); }
  };
  const doRestore = async (s) => {
    try { await api.restore('students', s.id); toast(`Student ${s.id} restored`); load(); }
    catch (ex) { setErr(ex.message); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (formBusy) return;
    if (!String(addForm.name || '').trim()) { setErr('Student name is required'); return; }
    const addEmail = String(addForm.email || '').trim();
    if (addEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addEmail)) { setErr('Enter a valid email address'); return; }
    const addPhone = String(addForm.phone || '').trim();
    if (addPhone && !/^[+()\-.\s\d]{7,20}$/.test(addPhone)) { setErr('Enter a valid phone number'); return; }
    setFormBusy(true);
    setErr('');
    try {
      const created = await api.createStudent({
        name: addForm.name,
        email: addForm.email,
        phone: addForm.phone,
        batch_id: addForm.batch_id || undefined,
      });
      if (created?.login?.password) {
        toast(`Student added! Login: ${created.login.email} / ${created.login.password}${created.login.emailed ? ' (emailed)' : ''}`);
      } else if (addEmail) {
        toast('Student successfully added!');
      } else {
        toast('Student added! (No email — add one to enable login)');
      }
      setShowAdd(false);
      setAddForm({});
      load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setFormBusy(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (formBusy) return;
    if (!String(editStudent.name || '').trim()) { setErr('Student name is required'); return; }
    const editEmail = String(editStudent.email || '').trim();
    if (editEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(editEmail)) { setErr('Enter a valid email address'); return; }
    const editPhone = String(editStudent.phone || '').trim();
    if (editPhone && !/^[+()\-.\s\d]{7,20}$/.test(editPhone)) { setErr('Enter a valid phone number'); return; }
    setFormBusy(true);
    setErr('');
    try {
      await api.patchStudent(editStudent.id, {
        name: editStudent.name,
        email: editStudent.email,
        phone: editStudent.phone,
      });
      toast(`Student ${editStudent.id} updated!`);
      setEditStudent(null);
      load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setFormBusy(false);
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

  // Client-side sort + pagination + bulk selection over the (server-filtered) roster.
  const L = useListControls(rows, {
    searchKeys: ['id', 'name', 'batch_label', 'program', 'email', 'phone'],
    initialSort: { key: 'id', dir: 'asc' },
    dateKey: 'created_at',
  });
  const bulk = useBulkSelection();

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.size} selected student(s) and all their attendance, scores and certificates?`)) return;
    for (const id of bulk.ids) {
      try { await api.deleteStudent(id); } catch { /* keep going */ }
    }
    toast(`Removed ${bulk.size} student(s)`);
    bulk.clear();
    load();
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{user?.role === 'organization' ? 'All Students' : isInstitution ? 'Student Roster & Management' : 'My Students'}</h2>
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
            <button type="button"
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
          <button type="button" className="btn" onClick={() => setShowBulkAdd(true)}>Bulk Add Students</button>
          <button type="button" className="btn" onClick={() => setShowAdd(true)}>+ Add Student</button>
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      <ListState loading={loading} error={loadErr} onRetry={load} empty={false} />

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

      <ListToolbar
        L={L}
        hideSearch
        sortOptions={[['id', 'ID'], ['name', 'Name'], ['batch_label', 'Batch'], ['program', 'Program'], ['attendance', 'Attendance']]}
      >
        <select
          className="select-sm"
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          aria-label="Filter by batch"
        >
          <option value="ALL">All Batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.id} ({b.program_name || 'Batch'})</option>
          ))}
        </select>
        <input
          className="search-input"
          style={{ maxWidth: 300, margin: 0 }}
          placeholder="Search by name, email, phone or batch…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <DateRange L={L} label="Joined" />
        <ArchiveToggle value={archived} onChange={setArchived} />
      </ListToolbar>

      <BulkBar bulk={bulk}>
        <button type="button" className="btn sm ghost" onClick={() => downloadCsv('students-selected.csv', [
          { label: 'ID', value: 'id' }, { label: 'Name', value: 'name' },
          { label: 'Batch', value: 'batch_label' }, { label: 'Program', value: 'program' },
          { label: 'Attendance %', value: 'attendance' },
        ], L.all.filter((s) => bulk.has(s.id)))}>Export selected</button>
        <button type="button" className="btn sm ghost" style={{ color: '#ef4444' }} onClick={bulkDelete}>Delete selected</button>
      </BulkBar>

      <table>
        <thead>
          <tr>
            <SelectAllTh bulk={bulk} ids={L.rows.map((s) => s.id)} />
            <SortHeader label="ID" k="id" L={L} />
            <SortHeader label="Name" k="name" L={L} />
            <SortHeader label="Batch" k="batch_label" L={L} />
            <SortHeader label="Program" k="program" L={L} />
            <SortHeader label="Attendance" k="attendance" L={L} />
            <SortHeader label="Joined" k="created_at" L={L} />
            <th>Contact</th>
            <th>Manage</th>
          </tr>
        </thead>
        <tbody>
          {L.rows.map((s) => {
            const att = Number(s.attendance || 0);
            return (
              <tr key={s.id}>
                <td><input type="checkbox" aria-label={`Select ${s.id}`} checked={bulk.has(s.id)} onChange={() => bulk.toggle(s.id)} /></td>
                <td className="mono"><b>{s.id}</b></td>
                <td><b>{s.name}</b></td>
                <td>{s.batch_label || '—'}</td>
                <td>{s.program || '—'}</td>
                <td style={{ minWidth: 170 }}>
                  <AttendanceBar value={att} />
                </td>
                <td>{(s.created_at || '').slice(0, 10) || '—'}</td>
                <td className="meta">{s.email || '—'}{s.phone ? ` · ${s.phone}` : ''}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn sm ghost" onClick={() => handleReport(s.id)}>Report</button>
                    <button type="button" className="btn sm ghost" onClick={() => setEditStudent(s)}>Edit</button>
                    {archived
                      ? <button type="button" className="btn sm ghost" onClick={() => doRestore(s)}>Restore</button>
                      : <button type="button" className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => doArchive(s)}>Archive</button>}
                    <button type="button" className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => handleDelete(s.id, s.name)}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!loading && !loadErr && rows.length === 0 && <p className="empty">{archived ? 'No archived students.' : 'No students registered yet. Click "+ Add Student" to begin.'}</p>}
      {rows.length > 0 && L.total === 0 && <p className="empty">No students match the current filter.</p>}
      <Pager L={L} />

      {/* Add Student Modal */}
      {showAdd && (
        <div className="modal">
          <div>
            <h3>Add New Student</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              Register a student under your institutional account and optionally enrol into an active batch. Adding an email creates their login automatically — the temp password is shown once and emailed when mail is connected.
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
                <button className="btn" type="submit" disabled={formBusy}>{formBusy ? 'Saving…' : 'Add Student'}</button>
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
                <button className="btn" type="submit" disabled={formBusy}>{formBusy ? 'Saving…' : 'Save Changes'}</button>
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
              <span className={'chip ' + (reportStudent.attendance >= 75 ? 'PRESENT' : 'ABSENT')}>
                {reportStudent.attendance}% Attendance
              </span>
            </div>

            <div className="cards" style={{ margin: '14px 0' }}>
              <div className="card">
                <h4>Sessions Attended</h4>
                <b>{reportStudent.attendance_present} / {reportStudent.attendance_total}</b>
              </div>
              <div className="card">
                <h4>Average Assessment Score</h4>
                <b>{reportStudent.avg_score ?? '—'}{reportStudent.avg_score != null ? '%' : ''}</b>
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

            <p className="meta" style={{ marginTop: 12 }}>
              Weak areas: {(reportStudent.weak_areas || []).map((w) => `${w.topic} (${w.pct}%)`).join(', ') || '—'}
            </p>
            <p className="meta">
              Interests: {(reportStudent.interests || []).map((i) => i.body).join(' · ') || '—'}
            </p>

            <AiInsights studentId={reportStudent.id} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setReportStudent(null)}>Close</button>
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
  const [dirty, setDirty] = useState(false);

  // Land on the trainer's own first batch rather than a hard-coded id, and
  // default the date to today — this is a daily tool over a short roster.
  useEffect(() => {
    api.batches()
      .then((b) => { setBatches(b); setBid((cur) => cur || (b[0] ? b[0].id : '')); })
      .catch((e) => setMsg(e.message));
  }, []);

  const load = async () => {
    if (!bid) { setRows([]); setDirty(false); return; }
    setMsg('Loading…');
    try {
      const b = await api.batch(bid);
      const att = await api.attendance(`?batch_id=${bid}&date=${date}`);
      const map = Object.fromEntries(att.map((a) => [a.student_id, a.status]));
      setRows(b.students.map((s) => ({ student_id: s.id, name: s.name, status: map[s.id] || 'PRESENT' })));
      setDirty(false);
      setMsg('');
    } catch (e) {
      setMsg(e.message);
      setRows([]);
      setDirty(false);
    }
  };
  useEffect(() => { load(); }, [bid, date]);

  // Warn before leaving with unsaved marks (audit B7) — covers refresh/close
  // and in-app navigation away from the module.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const switchBatch = (next) => {
    if (dirty && !window.confirm('You have unsaved attendance changes. Discard them?')) return;
    setDirty(false);
    setBid(next);
  };
  const switchDate = (next) => {
    if (dirty && !window.confirm('You have unsaved attendance changes. Discard them?')) return;
    setDirty(false);
    setDate(next);
  };

  const save = async () => {
    // Hard guard (audit B10): never claim success without a batch + roster.
    if (!bid || !rows.length) { setMsg('Select a batch with students before saving'); return; }
    try {
      await api.saveAttendance({
        batch_id: bid,
        date,
        records: rows.map((r) => ({ student_id: r.student_id, status: r.status })),
      });
      setDirty(false);
      setMsg('✓ Attendance saved');
    } catch (e) {
      setMsg(e.message);
    }
  };

  const setStatus = (sid, status) => {
    setDirty(true);
    setRows(rows.map((x) => (x.student_id === sid ? { ...x, status } : x)));
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Attendance</h2>
          <p className="sub">Mark daily attendance for the batches assigned to you.</p>
        </div>
        {dirty && <span className="chip LATE">Unsaved changes</span>}
      </div>

      <div className="toolbar">
        <select className="select-sm" value={bid} onChange={(e) => switchBatch(e.target.value)} disabled={!batches.length}>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
        </select>
        <input className="select-sm" type="date" value={date} onChange={(e) => switchDate(e.target.value)} />
        <button type="button" className="btn ghost" onClick={load} disabled={!bid}>Load</button>
        <button type="button" className="btn ghost" disabled={!rows.length} onClick={() => { setDirty(true); setRows(rows.map((r) => ({ ...r, status: 'PRESENT' }))); }}>
          Mark all present
        </button>
        <button type="button" className="btn" onClick={save} disabled={!rows.length}>Save attendance</button>
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
                  {['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].map((s) => (
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
  const [busy, setBusy] = useState(false);
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
    if (busy) return;
    /* Validate date order before submitting */
    if (f.to_date && f.from_date && f.to_date < f.from_date) {
      setMsg('End date cannot be before the start date');
      return;
    }
    setBusy(true);
    try {
      await api.createLeaveRequest({
        ...f,
        trainer_id: user.trainer_id,
        trainer_name: user.name,
      });
      toast('Leave application submitted successfully');
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
    } finally {
      setBusy(false);
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
        <button type="button" className="btn" onClick={() => setShowApply(true)}>+ Apply Leave</button>
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
            <button type="button"
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
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit Request'}</button>
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
      const withCreds = (result.created || []).filter((s) => s?.login?.password);
      const emailedCount = withCreds.filter((s) => s?.login?.emailed).length;

      if (successCount > 0) {
        toast(`✓ ${successCount} student(s) added successfully${withCreds.length ? ` — ${withCreds.length} login(s) created${emailedCount ? ` (${emailedCount} emailed)` : ''}` : ''}`);
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
          <button type="button" className="btn" onClick={handleSubmit} disabled={loading || !file || !selectedBatch}>
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
  const [exporting, setExporting] = useState(''); // "<id>:<kind>" currently exporting

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
    const n = Number(score);
    const max = Number(filteredAssessments.find((a) => a.id === assessmentId)?.max_score) || 100;
    if (!Number.isFinite(n) || n < 0 || n > max) {
      setMsg(`Score must be between 0 and ${max}`);
      return;
    }
    setMsg('');
    try {
      await api.saveScore({ assessment_id: assessmentId, student_id: studentId, score: n });
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

  const togglePublish = async (a) => {
    const next = (a.status || 'DRAFT') === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      setMsg('');
      await api.updateAssessment(a.id, { status: next });
      toast(next === 'PUBLISHED'
        ? '✓ Published — now visible to students & institution'
        : '✓ Moved back to draft (hidden from students)');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const handleExport = async (a, kind) => {
    const key = `${a.id}:${kind}`;
    try {
      setExporting(key);
      setMsg('');
      const report = await api.assessmentReport(a.id);
      if (kind === 'pdf') await exportAssessmentPDF(report);
      else await exportAssessmentExcel(report);
      toast(`✓ ${kind.toUpperCase()} report downloaded`);
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setExporting('');
    }
  };

  const canEnter = user?.role === 'organization' || user?.role === 'trainer';
  const [reportBatch, setReportBatch] = useState('');
  const [downloading, setDownloading] = useState('');

  const downloadBatchReport = async () => {
    if (!reportBatch) { setMsg('Select a batch first'); return; }
    try {
      setDownloading('batch');
      setMsg('');
      const report = await api.batchReport(reportBatch);
      await exportBatchPDF(report);
      toast('✓ Batch PDF report downloaded');
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setDownloading('');
    }
  };

  const downloadOverallReport = async () => {
    try {
      setDownloading('overall');
      setMsg('');
      const report = await api.overallReport();
      await exportOverallPDF(report);
      toast('✓ Overall PDF report downloaded');
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setDownloading('');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Assessments & Marks</h2>
          <p className="sub">{canEnter ? 'Create assessments, enter marks, and track student performance across batches.' : 'View assessments and marks entered by your trainers (read-only).'}</p>
        </div>
        {canEnter && (
          <button className="btn" onClick={() => setShowCreate(true)}>+ Create Assessment</button>
        )}
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'okmsg' : 'err'}>{msg}</div>}

      <div className="card" style={{ borderLeft: '4px solid var(--info, #2c4f8c)', marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 4px' }}>Batch & Overall Reports</h4>
        <p className="meta" style={{ margin: '0 0 12px' }}>
          {user?.role === 'institution'
            ? 'Download a detailed professional PDF for one batch, or for all your batches combined — same analysis format as the per-assessment report.'
            : 'Download a detailed professional PDF per batch or across all batches in scope.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="select-sm"
            value={reportBatch}
            onChange={(e) => setReportBatch(e.target.value)}
            style={{ minWidth: 220 }}
            aria-label="Report batch"
          >
            <option value="">Select batch…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.id} — {b.program_name}</option>
            ))}
          </select>
          <button type="button" className="btn sm" onClick={downloadBatchReport} disabled={!reportBatch || !!downloading}>
            {downloading === 'batch' ? 'Preparing…' : 'Download Batch PDF'}
          </button>
          <button type="button" className="btn sm ghost" onClick={downloadOverallReport} disabled={!!downloading}>
            {downloading === 'overall' ? 'Preparing…' : (user?.role === 'institution' ? 'Download All-Batches PDF' : 'Download Overall PDF')}
          </button>
        </div>
      </div>

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
                <th>Status</th>
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
                    <span className={'chip ' + ((a.status || 'DRAFT') === 'PUBLISHED' ? 'PAID' : 'LATE')}>
                      {(a.status || 'DRAFT') === 'PUBLISHED' ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn sm ghost" onClick={() => loadScores(a.id)}>
                        {showScores === a.id ? 'Hide Scores' : (canEnter ? 'View/Enter Scores' : 'View Scores')}
                      </button>
                      {canEnter && (
                        <>
                          <button
                            className="btn sm ghost"
                            onClick={() => togglePublish(a)}
                            title={(a.status || 'DRAFT') === 'PUBLISHED' ? 'Hide marks from students' : 'Publish marks to students & institution'}
                          >
                            {(a.status || 'DRAFT') === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                          </button>
                          <button className="btn sm ghost" onClick={() => handleEditClick(a)}>Edit</button>
                          <button className="btn sm ghost" style={{ color: '#ef4444' }} onClick={() => deleteAssessment(a.id)}>Delete</button>
                        </>
                      )}
                      <button
                        className="btn sm ghost"
                        onClick={() => handleExport(a, 'pdf')}
                        disabled={!!exporting}
                        title="Download a professional PDF report with full analysis"
                      >
                        {exporting === a.id + ':pdf' ? '…' : 'PDF'}
                      </button>
                      <button
                        className="btn sm ghost"
                        onClick={() => handleExport(a, 'excel')}
                        disabled={!!exporting}
                        title="Download an Excel workbook (summary, marks, distribution, insights)"
                      >
                        {exporting === a.id + ':excel' ? '…' : 'Excel'}
                      </button>
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
                  {canEnter && <th>Action</th>}
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
                        {canEnter ? (
                          <>
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
                          </>
                        ) : (
                          <b>{s.score ?? '—'}</b>
                        )}
                      </td>
                      <td><b>{pct !== '—' ? pct + '%' : '—'}</b></td>
                      {canEnter && (
                      <td>
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
                      </td>
                      )}
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
