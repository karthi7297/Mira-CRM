import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

/* Custom 404 — every unknown route lands here. Logged-in users keep the shell
   (sidebar + top bar) so they can navigate home; anonymous visitors get the
   standalone version with login / public links. */
export default function NotFound() {
  const { user } = useAuth();

  const links = user
    ? [{ to: '/', label: 'Back to dashboard' }]
    : [
        { to: '/login', label: 'Sign in' },
        { to: '/enquire', label: 'Request training' },
        { to: '/verify', label: 'Verify a certificate' },
      ];

  return (
    <div className="nf">
      <p className="nf-code">404</p>
      <h1>This page doesn't exist</h1>
      <p className="nf-sub">
        The link may be outdated or the address mistyped. Everything you need is a click away:
      </p>
      <div className="nf-actions">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="btn">{l.label}</Link>
        ))}
      </div>
    </div>
  );
}
