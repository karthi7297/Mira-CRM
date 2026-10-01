import { useEffect, useState } from 'react';
import { api, toast, toastError } from '../api';
import { useAuth } from '../auth';

const STATUS_CHIP = {
  OPEN: 'LATE', IN_PROGRESS: 'PROPOSAL', RESOLVED: 'PRESENT', CLOSED: 'CLOSED',
};
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const KINDS = ['SUPPORT', 'REQUEST'];
const CATEGORIES = ['Schedule change', 'Trainer change', 'Student transfer', 'Billing query', 'Access / account', 'Other'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

/* ---------- Support tickets & institution requests ---------- */
export function Support() {
  const { user } = useAuth();
  const isOrg = user?.role === 'organization';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ kind: 'SUPPORT', category: 'Other', subject: '', body: '', priority: 'NORMAL' });
  const [reply, setReply] = useState({});

  const load = () => {
    api.tickets().then(setRows).catch((e) => setMsg(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.subject.trim()) { setMsg('Subject is required'); return; }
    setBusy(true); setMsg('');
    try {
      await api.createTicket(f);
      toast('✓ Ticket raised — our team will respond');
      setShow(false);
      setF({ kind: 'SUPPORT', category: 'Other', subject: '', body: '', priority: 'NORMAL' });
      load();
    } catch (ex) { setMsg(ex.message); } finally { setBusy(false); }
  };

  const update = async (id, patch) => {
    try {
      await api.updateTicket(id, patch);
      toast('✓ Ticket updated');
      load();
    } catch (ex) { toastError(ex.message); }
  };

  const filtered = filter === 'ALL' ? rows : rows.filter((r) => r.status === filter);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{isOrg ? 'Support & Requests' : 'Support & Requests'}</h2>
          <p className="sub">
            {isOrg
              ? 'Triage support tickets and institution change requests from across the platform.'
              : 'Raise a support ticket or a change request (schedule, trainer, transfer, billing).'}
          </p>
        </div>
        <button className="btn" onClick={() => setShow(true)}>+ New ticket</button>
      </div>

      {msg && <div className="err">{msg}</div>}

      <div className="toolbar">
        <select className="select-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="ALL">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? <div className="loading">Loading tickets…</div> : (
        <table>
          <thead>
            <tr><th>ID</th><th>Kind</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th>{isOrg && <th>From</th>}<th>Raised</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.id}</td>
                <td><span className="chip">{t.kind}</span></td>
                <td>
                  <b>{t.subject}</b>
                  {t.body && <p className="meta" style={{ margin: '2px 0 0' }}>{t.body}</p>}
                  {t.response && <p className="meta" style={{ margin: '4px 0 0', color: 'var(--ok)' }}>↳ {t.response}</p>}
                </td>
                <td>{t.category || '—'}</td>
                <td><span className={'chip ' + (t.priority === 'URGENT' || t.priority === 'HIGH' ? 'ABSENT' : '')}>{t.priority}</span></td>
                <td><span className={'chip ' + (STATUS_CHIP[t.status] || '')}>{t.status.replace('_', ' ')}</span></td>
                {isOrg && <td>{t.created_role}{t.customer_name ? ` · ${t.customer_name}` : ''}</td>}
                <td>{String(t.created_at || '').slice(0, 10)}</td>
                <td>
                  {isOrg ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <select className="select-sm" value={t.status} onChange={(e) => update(t.id, { status: e.target.value })}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                      <input
                        className="select-sm"
                        placeholder="Reply…"
                        value={reply[t.id] ?? ''}
                        onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })}
                      />
                      <button className="btn sm ghost" onClick={() => { update(t.id, { response: reply[t.id] }); setReply({ ...reply, [t.id]: '' }); }}>Reply</button>
                    </div>
                  ) : (
                    t.status !== 'CLOSED' && (
                      <button className="btn sm ghost" onClick={() => update(t.id, { status: 'CLOSED' })}>Close</button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={isOrg ? 9 : 8}><p className="empty">No tickets yet.</p></td></tr>}
          </tbody>
        </table>
      )}

      {show && (
        <div className="modal">
          <div>
            <h3>Raise a ticket</h3>
            <form onSubmit={submit} className="form">
              <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                {KINDS.map((k) => <option key={k} value={k}>{k === 'REQUEST' ? 'Change request' : 'Support ticket'}</option>)}
              </select>
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input className="full" placeholder="Subject *" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
              <textarea className="full" placeholder="Describe the issue or request…" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
              <div className="hstack full">
                <button className="btn ghost" type="button" onClick={() => setShow(false)}>Cancel</button>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Submit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Announcements ---------- */
export function Announcements() {
  const { user } = useAuth();
  const canPost = user?.role === 'organization' || user?.role === 'trainer';
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: '', body: '', audience: 'ALL', customer_id: '', batch_id: '' });

  const load = () => {
    api.announcements().then(setRows).catch((e) => setMsg(e.message)).finally(() => setLoading(false));
    if (user?.role === 'organization') api.customers().then(setCustomers).catch(() => {});
    api.batches().then(setBatches).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.title.trim()) { setMsg('Title is required'); return; }
    if (f.audience === 'CUSTOMER' && !f.customer_id) { setMsg('Pick a customer'); return; }
    if (f.audience === 'BATCH' && !f.batch_id) { setMsg('Pick a batch'); return; }
    setBusy(true); setMsg('');
    try {
      await api.createAnnouncement(f);
      toast('✓ Announcement posted');
      setShow(false);
      setF({ title: '', body: '', audience: 'ALL', customer_id: '', batch_id: '' });
      load();
    } catch (ex) { setMsg(ex.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Announcements</h2>
          <p className="sub">Broadcast updates to everyone, a specific institution, or a single batch.</p>
        </div>
        {canPost && <button className="btn" onClick={() => setShow(true)}>+ New announcement</button>}
      </div>

      {msg && <div className="err">{msg}</div>}

      {loading ? <div className="loading">Loading announcements…</div> : (
        <div className="stack">
          {rows.map((a) => (
            <div className="card" key={a.id}>
              <div className="hstack">
                <b>{a.title}</b>
                <span className="chip">{a.audience === 'ALL' ? 'Everyone' : a.audience === 'CUSTOMER' ? (a.customer_name || 'Institution') : 'Batch'}</span>
                <span className="meta" style={{ marginLeft: 'auto' }}>{String(a.created_at || '').slice(0, 10)}</span>
              </div>
              {a.body && <p className="meta" style={{ margin: '6px 0 0' }}>{a.body}</p>}
            </div>
          ))}
          {!rows.length && <p className="empty">No announcements yet.</p>}
        </div>
      )}

      {show && (
        <div className="modal">
          <div>
            <h3>New announcement</h3>
            <form onSubmit={submit} className="form">
              <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
                <option value="ALL">Everyone</option>
                <option value="CUSTOMER">A specific institution</option>
                <option value="BATCH">A specific batch</option>
              </select>
              {f.audience === 'CUSTOMER' && (
                <select value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
                  <option value="">Select institution…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {f.audience === 'BATCH' && (
                <select value={f.batch_id} onChange={(e) => setF({ ...f, batch_id: e.target.value })}>
                  <option value="">Select batch…</option>
                  {batches.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.program_name}</option>)}
                </select>
              )}
              <input className="full" placeholder="Title *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <textarea className="full" placeholder="Message…" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
              <div className="hstack full">
                <button className="btn ghost" type="button" onClick={() => setShow(false)}>Cancel</button>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
