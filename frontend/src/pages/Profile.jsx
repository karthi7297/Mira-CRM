import { useEffect, useState } from 'react';
import { api, toast, toastError } from '../api';
import { useAuth } from '../auth';

const ROLE_LABEL = {
  organization: 'Organization', institution: 'Institution', trainer: 'Trainer', student: 'Student',
};

export default function Profile() {
  const { user, login } = useAuth();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });

  const load = () => {
    setLoading(true); setErr('');
    return api.profile()
      .then((d) => {
        setP(d);
        setF({ name: d.name || '', email: d.email || '', phone: d.phone || '', password: '', confirm: '' });
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setMsg('');
    if (!String(f.name || '').trim()) { setMsg('Name is required'); return; }
    const em = String(f.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { setMsg('Enter a valid email address'); return; }
    const ph = String(f.phone || '').trim();
    if (ph && !/^[+()\-.\s\d]{7,20}$/.test(ph)) { setMsg('Enter a valid phone number'); return; }
    if (f.password || f.confirm) {
      if (f.password.length < 6) { setMsg('Password must be at least 6 characters'); return; }
      if (f.password !== f.confirm) { setMsg('Passwords do not match'); return; }
    }
    setBusy(true);
    try {
      const payload = { name: f.name.trim(), email: em, phone: ph };
      if (f.password) payload.password = f.password;
      const updated = await api.updateProfile(payload);
      setP(updated);
      setF({ name: updated.name || '', email: updated.email || '', phone: updated.phone || '', password: '', confirm: '' });
      // Keep the cached session in sync so the topbar reflects the new name.
      if (user) login({ ...user, name: updated.name, email: updated.email });
      toast('✓ Profile updated');
    } catch (ex) {
      setMsg(ex.message);
      toastError(ex.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="loading">Loading profile…</div>;
  if (err) {
    return (
      <div className="err" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span>Could not load your profile — {err}</span>
        <button type="button" className="btn sm ghost" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>My Profile</h2>
          <p className="sub">Your account details and password. Role and access are managed by your organization.</p>
        </div>
      </div>

      {msg && <div className="err">{msg}</div>}

      <div className="cards">
        <div className="card"><h4>User ID</h4><b className="mono">{p.id}</b></div>
        <div className="card"><h4>Role</h4><b>{ROLE_LABEL[user?.role] || p.role}</b></div>
        <div className="card"><h4>Status</h4><span className={'chip ' + (p.status === 'ACTIVE' ? 'PRESENT' : 'ABSENT')}>{p.status}</span></div>
        <div className="card"><h4>Member since</h4><b>{String(p.created_at || '').slice(0, 10) || '—'}</b></div>
      </div>

      <div className="card" style={{ marginTop: 16, maxWidth: 560 }}>
        <h4>Edit details</h4>
        <form onSubmit={save} className="form col-1">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Full name *</label>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <label style={{ fontSize: 13, fontWeight: 600 }}>Email address *</label>
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <label style={{ fontSize: 13, fontWeight: 600 }}>Phone</label>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <label style={{ fontSize: 13, fontWeight: 600 }}>New password</label>
          <input type="password" placeholder="Leave blank to keep current" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <label style={{ fontSize: 13, fontWeight: 600 }}>Confirm new password</label>
          <input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
