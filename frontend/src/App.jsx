import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, NAV } from './auth';
import { api } from './api';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyLearning from './pages/MyLearning';
import { Leads, LeadDetail, Customers, Customer360 } from './pages/CRM';
import { Programs, Batches, BatchDetail, Students, Attendance, TrainerLeaveRequests, StudentBulkAdd, Trainers, Assessments } from './pages/Training';
import { Quotations, Invoices, InvoiceDetail, Payments, Expenses, Reports, TrainerFinance } from './pages/Finance';
import { Enquire, Verify } from './pages/Public';
import { Collections, Certificates } from './pages/Showcase';
import ColdMail from './pages/ColdMail';
import TrainerDetail from './pages/TrainerDetail';
import LeaveApproval from './pages/LeaveApproval';
import AttendanceDetails from './pages/AttendanceDetails';
import NotFound from './pages/NotFound';

function College() {
  const { user } = useAuth();
  if (!user?.customer_id) return <div className="err">No institution linked to this login.</div>;
  return <Customer360 fixedId={user.customer_id} />;
}

/**
 * Blocks the whole app until a temporary password (issued with the credentials
 * email) is replaced — users.must_change_password (§10). No route renders
 * behind this gate while the flag is set.
 */
function ForcePasswordChange() {
  const { user, login, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (next !== confirm) { setErr('New passwords do not match.'); return; }
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      login({ ...user, mustChangePassword: false });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f1f5f9', padding: 24 }}>
      <div className="card" style={{ width: 'min(100%, 460px)', padding: 28 }}>
        <h2 style={{ marginTop: 0 }}>Set your password</h2>
        <p className="meta" style={{ marginTop: 0 }}>
          Your account was created with a temporary password. Choose a new password to continue.
        </p>
        {err && <div className="err">{err}</div>}
        <form onSubmit={submit} className="form col-1">
          <input
            type="password"
            placeholder="Temporary password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="New password (min 6 characters)"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <span style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set password & continue'}</button>
            <button className="btn ghost" type="button" onClick={logout}>Sign out</button>
          </span>
        </form>
      </div>
    </div>
  );
}

function Guard({ children, path }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.mustChangePassword) return <ForcePasswordChange />;
  const nav = NAV.find(n => n.to === path);
  if (nav && !nav.roles.includes(user.role)) return <div className="err">Access Denied — {user.role} cannot open this module.</div>;
  if (path === '/learning' && user.role !== 'student') return <div className="err">Access Denied.</div>;
  return <Layout>{children}</Layout>;
}
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/enquire" element={<Enquire />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/" element={<Guard path="/"><Dashboard /></Guard>} />
          <Route path="/learning" element={<Guard path="/learning"><MyLearning /></Guard>} />
          <Route path="/leads" element={<Guard path="/leads"><Leads /></Guard>} />
          <Route path="/leads/:id" element={<Guard path="/leads"><LeadDetail /></Guard>} />
          <Route path="/cold-mail" element={<Guard path="/cold-mail"><ColdMail /></Guard>} />
          <Route path="/customers" element={<Guard path="/customers"><Customers /></Guard>} />
          <Route path="/customers/:id" element={<Guard path="/customers"><Customer360 /></Guard>} />
          <Route path="/college" element={<Guard path="/college"><College /></Guard>} />
          <Route path="/programs" element={<Guard path="/programs"><Programs /></Guard>} />
          <Route path="/trainers" element={<Guard path="/trainers"><Trainers /></Guard>} />
          <Route path="/trainers/:id" element={<Guard path="/trainers"><TrainerDetail /></Guard>} />
          <Route path="/batches" element={<Guard path="/batches"><Batches /></Guard>} />
          <Route path="/batches/:id" element={<Guard path="/batches"><BatchDetail /></Guard>} />
          <Route path="/students" element={<Guard path="/students"><Students /></Guard>} />
          <Route path="/assessments" element={<Guard path="/assessments"><Assessments /></Guard>} />
          <Route path="/attendance-details" element={<Guard path="/attendance-details"><AttendanceDetails /></Guard>} />
          <Route path="/attendance" element={<Guard path="/attendance"><Attendance /></Guard>} />
          <Route path="/leave-approval" element={<Guard path="/leave-approval"><LeaveApproval /></Guard>} />
          <Route path="/my-leave" element={<Guard path="/my-leave"><TrainerLeaveRequests /></Guard>} />
          <Route path="/my-finance" element={<Guard path="/my-finance"><TrainerFinance /></Guard>} />
          <Route path="/quotations" element={<Guard path="/quotations"><Quotations /></Guard>} />
          <Route path="/invoices" element={<Guard path="/invoices"><Invoices /></Guard>} />
          <Route path="/invoices/:id" element={<Guard path="/invoices"><InvoiceDetail /></Guard>} />
          <Route path="/payments" element={<Guard path="/payments"><Payments /></Guard>} />
          <Route path="/collections" element={<Guard path="/collections"><Collections /></Guard>} />
          <Route path="/certificates" element={<Guard path="/certificates"><Certificates /></Guard>} />
          <Route path="/expenses" element={<Guard path="/expenses"><Expenses /></Guard>} />
          <Route path="/reports" element={<Guard path="/reports"><Reports /></Guard>} />
          {/* Custom 404: inside the shell when signed in, standalone otherwise */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
