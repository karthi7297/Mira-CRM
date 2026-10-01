import { useEffect, useState } from 'react';
import { api, toast, toastError } from '../api';

const ROLES = ['ORGANIZATION', 'INSTITUTION', 'TRAINER', 'STUDENT'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED'];
const STATUS_CHIP = { ACTIVE: 'PRESENT', INACTIVE: 'CLOSED', BLOCKED: 'ABSENT' };

export default function Users() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState({ name: '', email: '', role: 'TRAINER', password: '', customer_id: '' });

  const load = () => {
    api.users().then(setRows).catch((e) => setMsg(e.message)).finally(() => setLoading(false));
    api.customers().then(setCustomers).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.name.trim()) { setMsg('Name is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) { setMsg('Enter a valid email address'); return; }
    setBusy(true); setMsg('');
    try {
      await api.createUser({
        name: f.name, email: f.email, role: f.role,
        password: f.password || undefined,
        customer_id: f.role === 'INSTITUTION' ? (f.customer_id || undefined) : undefined,
      });
      toast('✓ User created');
      setShow(false);
      setF({ name: '', email: '', role: 'TRAINER', password: '', customer_id: '' });
      load();
    } catch (ex) { setMsg(ex.message); } finally { setBusy(false); }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      await api.updateUser(edit.id, {
        name: edit.name, email: edit.email, role: edit.role, status: edit.status,
        password: edit.password || undefined,
      });
      toast(`✓ User ${edit.id} updated`);
      setEdit(null);
      load();
    } catch (ex) { setMsg(ex.message); } finally { setBusy(false); }
  };

  const filtered = rows.filter((u) =>
    !q.trim() || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Users & Access</h2>
          <p className="sub">Create logins, assign roles, and activate or block access across the platform.</p>
        </div>
        <button className="btn" onClick={() => setShow(true)}>+ New user</button>
      </div>

      {msg && <div className="err">{msg}</div>}

      <div className="toolbar">
        <input className="search-input" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? <div className="loading">Loading users…</div> : (
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td className="mono">{u.id}</td>
                <td><b>{u.name}</b></td>
                <td>{u.email}</td>
                <td><span className="chip">{u.role}</span></td>
                <td><span className={'chip ' + (STATUS_CHIP[u.status] || '')}>{u.status}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn sm ghost" onClick={() => setEdit({ ...u, password: '' })}>Edit</button>
                    {u.status === 'ACTIVE'
                      ? <button className="btn sm ghost" onClick={async () => { try { await api.updateUser(u.id, { status: 'BLOCKED' }); toast('✓ Access blocked'); load(); } catch (ex) { toastError(ex.message); } }}>Block</button>
                      : <button className="btn sm ghost" onClick={async () => { try { await api.updateUser(u.id, { status: 'ACTIVE' }); toast('✓ Access restored'); load(); } catch (ex) { toastError(ex.message); } }}>Activate</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6}><p className="empty">No users found.</p></td></tr>}
          </tbody>
        </table>
      )}

      {show && (
        <div className="modal">
          <div>
            <h3>Create user</h3>
            <form onSubmit={submit} className="form">
              <input placeholder="Full name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <input placeholder="Email *" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {f.role === 'INSTITUTION' && (
                <select value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
                  <option value="">Link institution…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <input className="full" placeholder="Temp password (min 6 chars — default: changeme123)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              <div className="hstack full">
                <button className="btn ghost" type="button" onClick={() => setShow(false)}>Cancel</button>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {edit && (
        <div className="modal">
          <div>
            <h3>Edit {edit.id}</h3>
            <form onSubmit={saveEdit} className="form">
              <input placeholder="Full name" value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <input placeholder="Email" type="email" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input className="full" placeholder="Reset password (leave blank to keep)" value={edit.password || ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
              <div className="hstack full">
                <button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
