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
  { to: '/trainers', label: 'Trainers', roles: ['organization'] },
  { to: '/batches', label: 'Batches', roles: ['organization', 'trainer', 'institution'] },
  { to: '/students', label: 'Students', roles: ['trainer', 'institution'] },
  { to: '/assessments', label: 'Assessments', roles: ['organization', 'institution', 'trainer'] },
  { to: '/attendance-details', label: 'Attendance Details', roles: ['institution'] },
  { to: '/attendance', label: 'Attendance', roles: ['trainer'] },
  { to: '/leave-approval', label: 'Leave Approval', roles: ['organization'] },
  { to: '/my-leave', label: 'My Leave', roles: ['trainer'] },
  { to: '/my-finance', label: 'My Finance', roles: ['trainer'] },
  { to: '/quotations', label: 'Quotations', roles: ['organization', 'institution'] },
  { to: '/invoices', label: 'Invoices', roles: ['organization', 'institution'] },
  { to: '/payments', label: 'Payments', roles: ['organization', 'institution'] },
  { to: '/collections', label: 'Collections', roles: ['organization', 'institution'] },
  { to: '/certificates', label: 'Certificates', roles: ['organization', 'institution', 'trainer'] },
  { to: '/expenses', label: 'Expenses', roles: ['organization'] },
  { to: '/reports', label: 'Reports', roles: ['organization'] },
];
