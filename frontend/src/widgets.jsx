import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, registerToast } from './api';
import { useAuth } from './auth';

/* Toasts carry a kind: 'success' (default) or 'error'. Error toasts stick
   around longer — people need time to read what went wrong. */
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    registerToast((msg, kind = 'success') => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, msg, kind }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 6000 : 3200);
    });
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={'toast ' + (i.kind === 'error' ? 'toast-err' : 'toast-ok')}>
          <span className="toast-icon" aria-hidden="true">{i.kind === 'error' ? '✕' : '✓'}</span>
          {i.msg}
        </div>
      ))}
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [hits, setHits] = useState([]);
  const { user } = useAuth(); const nav = useNavigate();
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); setQ(''); } };
    const t = () => { setOpen(o => !o); setQ(''); };
    window.addEventListener('keydown', h);
    window.addEventListener('toggle-palette', t);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('toggle-palette', t); };
  }, []);
  useEffect(() => {
    if (!open || q.length < 2) { setHits([]); return; }
    const needle = q.toLowerCase();
    const jobs = [];
    if (user?.role === 'organization') jobs.push(api.leads(`?search=${encodeURIComponent(q)}`).then(r => r.map(x => ({ label: `${x.id} · ${x.organization}`, to: `/leads/${x.id}` }))).catch(() => []));
    jobs.push(api.customers(`?search=${encodeURIComponent(q)}`).then(r => r.map(x => ({ label: `${x.id} · ${x.name}`, to: user?.role === 'institution' ? '/college' : `/customers/${x.id}` }))).catch(() => []));
    jobs.push(api.batches().then(r => r.filter(b => b.id.toLowerCase().includes(needle)).slice(0, 4).map(b => ({ label: `${b.id} · ${b.program_name}`, to: `/batches/${b.id}` }))).catch(() => []));
    jobs.push(api.invoices().then(r => r.filter(i => i.id.toLowerCase().includes(needle)).slice(0, 4).map(i => ({ label: `${i.id} · ${i.customer_name}`, to: `/invoices/${i.id}` }))).catch(() => []));
    // Student records are a trainer's own list — nobody else can open /students.
    if (user?.role === 'trainer') jobs.push(api.students().then(r => r.filter(s => s.name.toLowerCase().includes(needle)).slice(0, 4).map(s => ({ label: `${s.id} · ${s.name}`, to: '/students' }))).catch(() => []));
    Promise.all(jobs).then(a => setHits(a.flat().slice(0, 12)));
  }, [q, open, user?.role]);
  if (!open) return null;
  const scope = user?.role === 'trainer' ? 'leads, colleges, batches, invoices, students' : 'colleges, batches, invoices';
  return <div className="modal" onClick={() => setOpen(false)}><div onClick={e => e.stopPropagation()}>
    <input autoFocus className="palette-input" placeholder={`Search ${scope}… (Esc closes)`} value={q} onChange={e => setQ(e.target.value)}
      onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && hits[0]) { nav(hits[0].to); setOpen(false); } }} />
    {hits.map((h, i) => <div key={i} className="palette-item" onClick={() => { nav(h.to); setOpen(false); }}>{h.label}</div>)}
    {q.length >= 2 && hits.length === 0 && <p className="palette-empty">No matches.</p>}
  </div></div>;
}
