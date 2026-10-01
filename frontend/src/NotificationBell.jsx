import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, toast } from './api';

/**
 * Topbar notification bell (audit B4 / F7).
 *
 * The inbox is a real entity on the server — the bell just polls the unread
 * count, lists the newest items, and marks them read. Clicking an item follows
 * its `link` into the app, so a notification is actionable, not just a badge.
 */

const KIND_COLOR = {
  INFO: '#2c4f8c',
  SUCCESS: '#1c7a45',
  WARNING: '#91601b',
  ERROR: '#ae332b',
};

/** SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC — normalise before parsing. */
const parseWhen = (iso) => {
  if (!iso) return NaN;
  const s = String(iso);
  const normalised = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  return new Date(normalised).getTime();
};

const timeAgo = (iso) => {
  const t = parseWhen(iso);
  if (Number.isNaN(t)) return String(iso || '').slice(0, 16);
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return String(iso).slice(0, 10);
};

export default function NotificationBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  const loadCount = () => api.unreadCount().then((d) => setCount(d.count || 0)).catch(() => {});
  const loadList = () => {
    setLoading(true);
    return api.notifications('?limit=30')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  // Poll the badge, and refresh the moment the tab regains focus.
  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 60000);
    const onFocus = () => loadCount();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, []);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.is_read) {
      try { await api.markNotificationRead(n.id); setCount((c) => Math.max(0, c - 1)); } catch { /* badge self-heals on next poll */ }
    }
    if (n.link) nav(n.link);
  };

  const readAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setCount(0);
      loadList();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn bell-btn"
        onClick={toggle}
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.4 6.6a3.6 3.6 0 0 1 7.2 0c0 2.4.9 3.4 1.4 3.9H3c.5-.5 1.4-1.5 1.4-3.9Z" />
          <path d="M6.6 12.6a1.5 1.5 0 0 0 2.8 0" />
        </svg>
        {count > 0 && <span className="bell-dot">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            {count > 0 && (
              <button type="button" className="btn sm ghost" onClick={readAll}>Mark all read</button>
            )}
          </div>
          <div className="bell-list">
            {loading && <div className="bell-empty">Loading…</div>}
            {!loading && items.length === 0 && <div className="bell-empty">You&rsquo;re all caught up.</div>}
            {!loading && items.map((n) => (
              <button
                type="button"
                key={n.id}
                className={'bell-item' + (n.is_read ? '' : ' unread')}
                onClick={() => openItem(n)}
              >
                <span className="bi-title">
                  <span className="bi-kind" style={{ background: KIND_COLOR[n.kind] || KIND_COLOR.INFO }} />
                  {n.title}
                </span>
                {n.body && <span className="bi-body">{n.body}</span>}
                <span className="bi-meta">{timeAgo(n.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
