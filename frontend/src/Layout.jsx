import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, NAV } from './auth';
import { Toaster, CommandPalette } from './widgets';
import Assistant from './Assistant';
import NotificationBell from './NotificationBell';
import { useModalA11y } from './modalA11y';

/* ---------- Role + navigation grouping ---------------------------------- */

const ROLE_LABEL = {
  organization: 'Organization',
  institution: 'Institution',
  trainer: 'Trainer',
  student: 'Student',
};

/* Sections are derived from the route so auth.jsx stays the single source
   of truth for which modules a role may open. */
const SECTIONS = [
  { label: 'Overview', routes: ['/', '/learning'] },
  { label: 'CRM', routes: ['/leads', '/customers', '/college'] },
  { label: 'Training', routes: ['/programs', '/trainers', '/batches', '/students', '/assessments', '/attendance', '/my-leave'] },
  { label: 'Finance', routes: ['/quotations', '/invoices', '/payments', '/expenses', '/my-finance', '/collections'] },
  { label: 'Insights', routes: ['/reports', '/certificates'] },
  { label: 'Workspace', routes: ['/support', '/announcements', '/users'] },
];

const sectionOf = (to) => (SECTIONS.find((s) => s.routes.includes(to)) || SECTIONS[0]).label;

/* Resolve a route (including detail routes like /leads/LEAD-0004) to its nav entry */
function activeItem(pathname) {
  return [...NAV]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => (n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(n.to + '/')));
}

/* ---------- Icons ------------------------------------------------------- */

const ICONS = {
  dashboard: (
    <>
      <rect x="2" y="2" width="5.1" height="5.6" rx="1.4" />
      <rect x="8.9" y="2" width="5.1" height="3.6" rx="1.4" />
      <rect x="2" y="9.4" width="5.1" height="4.6" rx="1.4" />
      <rect x="8.9" y="7.4" width="5.1" height="6.6" rx="1.4" />
    </>
  ),
  learning: (
    <>
      <path d="M1.9 6.4 8 3.2l6.1 3.2L8 9.6 1.9 6.4Z" />
      <path d="M4.4 7.9v3.1c0 .9 1.6 1.7 3.6 1.7s3.6-.8 3.6-1.7V7.9" />
      <path d="M14.1 6.6v3.6" />
    </>
  ),
  leads: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <circle cx="8" cy="8" r="2.7" />
      <circle cx="8" cy="8" r="0.85" fill="currentColor" stroke="none" />
    </>
  ),
  mail: (
    <>
      <rect x="1.9" y="3.4" width="12.2" height="9.2" rx="1.9" />
      <path d="m2.7 4.9 5.3 3.9 5.3-3.9" />
    </>
  ),
  customers: (
    <>
      <path d="M2.6 13.4V4.3c0-.7.6-1.3 1.3-1.3h3.9c.7 0 1.3.6 1.3 1.3v9.1" />
      <path d="M9.1 13.4V7.5c0-.6.5-1.1 1.1-1.1h2.1c.7 0 1.2.5 1.2 1.2v5.8" />
      <path d="M1.4 13.4h13.2" />
      <path d="M5 5.9h.9M5 8.6h.9M11.2 9.4h.9" />
    </>
  ),
  college: (
    <>
      <path d="M2.4 6.6 8 3l5.6 3.6v6.3c0 .6-.5 1-1 1H3.4c-.6 0-1-.4-1-1V6.6Z" />
      <path d="M6.2 13.9V9.6h3.6v4.3" />
    </>
  ),
  programs: (
    <>
      <path d="M2.5 3.3h4c.8 0 1.5.6 1.5 1.5v8c0-.8-.7-1.5-1.5-1.5h-4V3.3Z" />
      <path d="M13.5 3.3h-4c-.8 0-1.5.6-1.5 1.5v8c0-.8.7-1.5 1.5-1.5h4V3.3Z" />
    </>
  ),
  batches: (
    <>
      <path d="M8 2.2l5.9 3.1L8 8.4 2.1 5.3 8 2.2Z" />
      <path d="M2.1 8.4 8 11.5l5.9-3.1" />
      <path d="M2.1 11.4 8 14.5l5.9-3.1" />
    </>
  ),
  students: (
    <>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.8 13.7c0-2.2 1.9-3.8 4.2-3.8s4.2 1.6 4.2 3.8" />
      <path d="M10.5 3.4a2.5 2.5 0 0 1 0 4.5" />
      <path d="M11.6 10.3c1.6.5 2.6 1.7 2.6 3.4" />
    </>
  ),
  attendance: (
    <>
      <path d="M6.2 3H4.7c-.9 0-1.6.7-1.6 1.6v8.5c0 .9.7 1.6 1.6 1.6h6.6c.9 0 1.6-.7 1.6-1.6V4.6c0-.9-.7-1.6-1.6-1.6h-1.5" />
      <rect x="5.9" y="1.6" width="4.2" height="2.7" rx="1.1" />
      <path d="m6 9 1.5 1.5L10.3 7.7" />
    </>
  ),
  wallet: (
    <>
      <path d="M13.9 6.3V5.1c0-.8-.6-1.4-1.4-1.4H3.6c-.9 0-1.6.7-1.6 1.6v6.6c0 .9.7 1.6 1.6 1.6h8.9c.8 0 1.4-.6 1.4-1.4v-1.2" />
      <path d="M9.9 6.3h4.5c.6 0 1 .4 1 1v1.7c0 .6-.4 1-1 1H9.9c-1.1 0-2-.8-2-1.9s.9-1.8 2-1.8Z" />
    </>
  ),
  quotations: (
    <>
      <path d="M8.7 1.9H5c-.9 0-1.6.7-1.6 1.6v9c0 .9.7 1.6 1.6 1.6h6c.9 0 1.6-.7 1.6-1.6V5.9L8.7 1.9Z" />
      <path d="M8.5 2.1v3.7h4" />
      <path d="M5.9 8.7h4.2M5.9 11h2.9" />
    </>
  ),
  invoices: (
    <>
      <path d="M4.2 2.5h7.6c.6 0 1 .4 1 1v10.2l-1.3-.9-1.3.9-1.3-.9-1.3.9-1.3-.9-1.3.9V3.5c0-.6.5-1 1-1Z" />
      <path d="M6.2 5.6h3.6M6.2 8.3h3.6" />
    </>
  ),
  payments: (
    <>
      <rect x="1.9" y="3.5" width="12.2" height="9" rx="2" />
      <path d="M1.9 6.6h12.2" />
      <path d="M4.4 9.9h2.3" />
    </>
  ),
  expenses: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <path d="M8 4.5v7" />
      <path d="m5.3 8.8 2.7 2.7 2.7-2.7" />
    </>
  ),
  reports: (
    <>
      <path d="M2.2 13.5h11.6" />
      <rect x="3.3" y="8.6" width="2.5" height="4.9" rx="1" />
      <rect x="6.8" y="5.4" width="2.5" height="8.1" rx="1" />
      <rect x="10.3" y="2.4" width="2.5" height="11.1" rx="1" />
    </>
  ),
  menu: <path d="M2.6 4.6h10.8M2.6 8h10.8M2.6 11.4h10.8" />,
  search: (
    <>
      <circle cx="7.1" cy="7.1" r="4.5" />
      <path d="m10.5 10.5 3.1 3.1" />
    </>
  ),
  collections: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <path d="M8 5.2v5.6" />
      <path d="M10 6.5H8.5c-.9 0-1.6.5-1.6 1.2s.7 1.2 1.6 1.2H8c.9 0 1.6.5 1.6 1.2S8.9 11.3 8 11.3H6.5" />
    </>
  ),
  cert: (
    <>
      <circle cx="8" cy="6" r="3.4" />
      <path d="m6.2 8.9-1.4 4.7 3.2-2 3.2 2-1.4-4.7" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M2.5 6h11" />
      <path d="M6 2.5v3.5M10 2.5v3.5" />
      <circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  trainers: (
    <>
      <circle cx="8" cy="4.5" r="2.5" />
      <path d="M1.5 13.5c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8" />
      <circle cx="14.5" cy="4.5" r="2.5" />
      <path d="M9 10.5c1.6.5 2.6 1.7 2.6 3.4" />
    </>
  ),
  logout: (
    <>
      <path d="M6.4 13.5H4c-.8 0-1.5-.7-1.5-1.5V4c0-.8.7-1.5 1.5-1.5h2.4" />
      <path d="m9.7 11.2 3.2-3.2-3.2-3.2" />
      <path d="M12.6 8H6.3" />
    </>
  ),
  assessment: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M5.5 9h5M7 6.5v5M9.5 6.5v5" />
      <path d="M6 5.5h4M6 10h4" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  mark: (
    <>
      <circle cx="5.6" cy="5.4" r="2" />
      <circle cx="18.4" cy="5.4" r="2" />
      <circle cx="12" cy="18.6" r="2" />
      <path d="M7.3 6.5 11 16.8M16.7 6.5 13 16.8M7.6 5.4h8.8" />
    </>
  ),
  support: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.5a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 2.4" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  announce: (
    <>
      <path d="M3 10.2v3.6a1.4 1.4 0 0 0 1.4 1.4H6l4.4 3.4V6.4L6 9.8H4.4A1.4 1.4 0 0 0 3 10.2Z" />
      <path d="M14.4 8.4a4.6 4.6 0 0 1 0 7.2M17 6a8 8 0 0 1 0 12" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.2" r="3.2" />
      <path d="M3.4 19.2a5.6 5.6 0 0 1 11.2 0" />
      <path d="M16.2 6.2a3 3 0 0 1 0 5.6M17.6 14.6a5 5 0 0 1 3 4.6" />
    </>
  ),
};

/* Route → icon key (most share a name, a few are clearer spelled out) */
const ICON_FOR = {
  '/': 'dashboard',
  '/learning': 'learning',
  '/leads': 'leads',
  '/cold-mail': 'mail',
  '/customers': 'customers',
  '/college': 'college',
  '/programs': 'programs',
  '/trainers': 'trainers',
  '/batches': 'batches',
  '/students': 'students',
  '/assessments': 'assessment',
  '/attendance': 'attendance',
  '/my-leave': 'calendar',
  '/my-finance': 'wallet',
  '/quotations': 'quotations',
  '/invoices': 'invoices',
  '/payments': 'payments',
  '/expenses': 'expenses',
  '/support': 'support',
  '/announcements': 'announce',
  '/users': 'users',
  '/reports': 'reports',
  '/collections': 'collections',
  '/certificates': 'cert',
};

function Icon({ name, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name] || ICONS.dashboard}
    </svg>
  );
}

function BrandMark({ size = 17 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS.mark}
    </svg>
  );
}

const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '··';

/* ---------- Shell ------------------------------------------------------- */

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  /* Global modal behaviour: Escape/backdrop close, focus in/out, ARIA (F4/F5). */
  useModalA11y();

  const items = NAV.filter((n) => n.roles.includes(user?.role));
  const current = activeItem(pathname);
  const section = current ? sectionOf(current.to) : '';

  /* Close the drawer whenever the route changes */
  useEffect(() => { setOpen(false); }, [pathname]);

  /* Escape closes it, and the page behind stops scrolling */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const doLogout = () => { logout(); navigate('/login'); };

  return (
    <div className={'shell' + (open ? ' nav-open' : '')}>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className="side">
        <div className="brand">
          <span className="brand-mark"><BrandMark /></span>
          <span>
            <span className="brand-name">Mira</span>
            <span className="brand-sub">Rampex workspace</span>
          </span>
        </div>

        <nav className="nav">
          {SECTIONS.map((s) => {
            const grouped = items.filter((n) => sectionOf(n.to) === s.label);
            if (!grouped.length) return null;
            return (
              <div key={s.label}>
                <div className="nav-label">{s.label}</div>
                {grouped.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === '/'}
                    className={({ isActive }) => 'nav-item' + (isActive ? ' on' : '')}
                  >
                    <Icon name={ICON_FOR[n.to] || 'dashboard'} />
                    {n.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="rail-user">
          <span className="avatar">{initialsOf(user?.name)}</span>
          <span className="ru-text">
            <b>{user?.name}</b>
            <span>{user?.email}</span>
          </span>
          <button type="button" className="icon-btn" onClick={doLogout} title="Log out" aria-label="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <button type="button" className="icon-btn burger" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Icon name="menu" size={18} />
          </button>

          <div className="top-brand">
            <span className="brand-mark"><BrandMark size={14} /></span>
            <span className="top-brand-name">Mira</span>
          </div>

          <div className="crumb">
            {section}
            {current && current.label !== section ? <> / <b>{current.label}</b></> : null}
          </div>

          <div className="top-right">
            <button type="button" className="kbd-hint" title="Search" aria-label="Search" onClick={() => window.dispatchEvent(new Event('toggle-palette'))}>
              <Icon name="search" size={15} />
              <span className="kbd-hint-label">Search</span>
            </button>
            <NotificationBell />
            <span className="role">{ROLE_LABEL[user?.role] || user?.role}</span>
            <NavLink to="/profile" className="top-user" title="My profile" aria-label="My profile">
              <span className="avatar sm">{initialsOf(user?.name)}</span>
              <span className="tu-name">{user?.name}</span>
            </NavLink>
          </div>
        </header>

        <div className="body">{children}</div>
      </div>

      <Toaster />
      <CommandPalette />
      {/* Sibling of the page content, so `position: fixed` resolves against the
          viewport instead of any transformed ancestor. */}
      <Assistant />
    </div>
  );
}
