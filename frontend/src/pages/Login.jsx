import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth, NAV } from '../auth';

/* The five demo logins of the Rampex 4-role model (see README). */
const DEMOS = [
  { label: 'Organization', scope: 'Rampex', email: 'org@rampex.demo', pw: 'org123' },
  { label: 'Institution', scope: 'ABC College', email: 'abc@college.edu', pw: 'abc123' },
  { label: 'Institution', scope: 'Rampex Direct', email: 'direct@rampex.demo', pw: 'direct123' },
  { label: 'Trainer', scope: 'Rampex staff', email: 'trainer@rampex.demo', pw: 'trainer123' },
  { label: 'Student', scope: 'Learner', email: 'arun@student.edu', pw: 'arun123' },
];

const CAPABILITIES = ['Leads → Customers', 'Programs & batches', 'Attendance tracking', 'Invoicing & payments'];

function MiraMark({ size = 19 }) {
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
    >
      <circle cx="5.6" cy="5.4" r="2" />
      <circle cx="18.4" cy="5.4" r="2" />
      <circle cx="12" cy="18.6" r="2" />
      <path d="M7.3 6.5 11 16.8M16.7 6.5 13 16.8M7.6 5.4h8.8" />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState('org@rampex.demo');
  const [password, setPassword] = useState('org123');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const go = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const user = await api.login(email, password);
      login(user);
      /* Land each role on the first module it is actually allowed to open */
      const home = NAV.find((n) => n.roles.includes(user.role));
      nav(home ? home.to : '/', { replace: true });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  const quick = (d) => {
    setEmail(d.email);
    setPassword(d.pw);
    setErr('');
  };

  return (
    <div className="login">
      <aside className="login-brand">
        <div className="lb-head">
          <span className="brand-mark" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <MiraMark />
          </span>
          <span className="brand-name">Mira</span>
        </div>

        <div className="lb-body">
          <h1>One platform. Every EduTech operation <em>connected</em>.</h1>
          <p>
            Leads become institutions, institutions become batches, batches become revenue.
            Mira keeps the whole Rampex operation on one record — from first call to final payment.
          </p>
          <ul className="lb-points">
            {CAPABILITIES.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>

        <div className="lb-foot">
          <MiraMark size={14} />
          Rampex · 4-role access model
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <h2>Sign in</h2>
          <p className="meta">Choose a demo account below, or enter credentials.</p>

          {err && <div className="err">{err}</div>}

          <form onSubmit={go} className="form col-1">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              autoComplete="username"
              required
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              required
            />
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="demo">
            <span className="demo-label">Demo accounts</span>
            {DEMOS.map((d) => (
              <button key={d.email} type="button" className="demo-item" onClick={() => quick(d)}>
                <span className="demo-dot" />
                <span className="demo-text">
                  <b>{d.label} · {d.scope}</b>
                  <span>{d.email}</span>
                </span>
                <span className="demo-key">{d.pw}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
