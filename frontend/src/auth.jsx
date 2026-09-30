import { createContext, useContext, useState } from 'react';
const Ctx = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('mira_user')); } catch { return null; } });
  const login = (u) => { setUser(u); localStorage.setItem('mira_user', JSON.stringify(u)); };
  const logout = () => { setUser(null); localStorage.removeItem('mira_user'); };
  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
export const NAV = [
  { to: '/', label: 'Dashboard', roles: ['organization', 'institution', 'trainer'] },
  { to: '/learning', label: 'My Learning', roles: ['student'] },
  { to: '/leads', label: 'Leads', roles: ['organization'] },
  { to: '/customers', label: 'Institutions', roles: ['organization'] },
  { to: '/college', label: 'My College', roles: ['institution'] },
  { to: '/programs', label: 'Programs', roles: ['organization', 'trainer'] },
  { to: '/batches', label: 'Batches', roles: ['organization', 'trainer', 'institution'] },
  // Student management is a trainer's job. Organization and institution never
  // manage students directly — at their scale they read the aggregate figures
  // on their dashboard and the per-batch roster inside Batches.
  { to: '/students', label: 'My Students', roles: ['trainer'] },
  // Attendance is per-student work, so it follows student management → trainer only.
  { to: '/attendance', label: 'Attendance', roles: ['trainer'] },
  { to: '/my-finance', label: 'My Finance', roles: ['trainer'] },
  { to: '/quotations', label: 'Quotations', roles: ['organization', 'institution'] },
  { to: '/invoices', label: 'Invoices', roles: ['organization', 'institution'] },
  { to: '/payments', label: 'Payments', roles: ['organization', 'institution'] },
  { to: '/collections', label: 'Collections', roles: ['organization', 'institution'] },
  { to: '/certificates', label: 'Certificates', roles: ['organization', 'institution', 'trainer'] },
  { to: '/expenses', label: 'Expenses', roles: ['organization'] },
  { to: '/reports', label: 'Reports', roles: ['organization'] },
];
