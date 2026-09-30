export const API = '';
async function req(path, opts = {}) {
  let scope = {};
  try { scope = JSON.parse(localStorage.getItem('mira_user')) || {}; } catch { scope = {}; }
  const r = await fetch('/api' + path, {
    headers: {
      'Content-Type': 'application/json',
      'x-role': scope.role || '',
      'x-customer': scope.customer_id || '',
      'x-trainer': scope.trainer_id || '',
      'x-student': scope.student_id || ''
    }, ...opts
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || 'Request failed');
  return j.data;
}
export const api = {
  login: (email, password) => req('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  dashboard: () => req('/dashboard'),
  leads: (q = '') => req('/leads' + q),
  lead: (id) => req('/leads/' + id),
  createLead: (b) => req('/leads', { method: 'POST', body: JSON.stringify(b) }),
  patchLead: (id, b) => req('/leads/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  followup: (id, b) => req(`/leads/${id}/followups`, { method: 'POST', body: JSON.stringify(b) }),
  convert: (id) => req(`/leads/${id}/convert`, { method: 'POST' }),
  customers: (q = '') => req('/customers' + q),
  customer: (id) => req('/customers/' + id),
  programs: () => req('/programs'),
  createProgram: (b) => req('/programs', { method: 'POST', body: JSON.stringify(b) }),
  trainers: () => req('/trainers'),
  batches: () => req('/batches'),
  batch: (id) => req('/batches/' + id),
  createBatch: (b) => req('/batches', { method: 'POST', body: JSON.stringify(b) }),
  students: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('/students' + (q ? '?' + q : ''));
  },
  createStudent: (b) => req('/students', { method: 'POST', body: JSON.stringify(b) }),
  bulkCreateStudents: (b) => req('/students/bulk', { method: 'POST', body: JSON.stringify(b) }),
  patchStudent: (id, b) => req('/students/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteStudent: (id) => req('/students/' + id, { method: 'DELETE' }),
  enroll: (b) => req('/enrollments', { method: 'POST', body: JSON.stringify(b) }),
  attendance: (q = '') => req('/attendance' + q),
  attendanceSummary: (q = '') => req('/attendance/summary' + q),
  saveAttendance: (b) => req('/attendance', { method: 'POST', body: JSON.stringify(b) }),
  leaveRequests: () => req('/leave-requests'),
  createLeaveRequest: (b) => req('/leave-requests', { method: 'POST', body: JSON.stringify(b) }),
  updateLeaveRequest: (id, action) => req('/leave-requests/' + id, { method: 'PATCH', body: JSON.stringify({ action }) }),
  quotations: () => req('/quotations'),
  createQuotation: (b) => req('/quotations', { method: 'POST', body: JSON.stringify(b) }),
  patchQuotation: (id, b) => req('/quotations/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  convertQuotation: (id) => req(`/quotations/${id}/convert-invoice`, { method: 'POST' }),
  invoices: () => req('/invoices'),
  invoice: (id) => req('/invoices/' + id),
  createInvoice: (b) => req('/invoices', { method: 'POST', body: JSON.stringify(b) }),
  payments: () => req('/payments'),
  pay: (b) => req('/payments', { method: 'POST', body: JSON.stringify(b) }),
  expenses: () => req('/expenses'),
  createExpense: (b) => req('/expenses', { method: 'POST', body: JSON.stringify(b) }),
  patchExpense: (id, b) => req('/expenses/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  sessions: (q = '') => req('/sessions' + q),
  createSession: (b) => req('/sessions', { method: 'POST', body: JSON.stringify(b) }),
  materials: (q = '') => req('/materials' + q),
  createMaterial: (b) => req('/materials', { method: 'POST', body: JSON.stringify(b) }),
  interests: () => req('/interests'),
  shareInterest: (b) => req('/interests', { method: 'POST', body: JSON.stringify(b) }),
  assessments: (q = '') => req('/assessments' + q),
  createAssessment: (b) => req('/assessments', { method: 'POST', body: JSON.stringify(b) }),
  scores: (q = '') => req('/scores' + q),
  saveScore: (b) => req('/scores', { method: 'POST', body: JSON.stringify(b) }),
  studentReport: (id) => req('/students/' + id + '/report'),
  topStudents: (q = '') => req('/reports/top-students' + q),
  trainerFinance: () => req('/trainer-finance'),
  enquire: (b) => req('/public/enquire', { method: 'POST', body: JSON.stringify(b) }),
  verifyCert: (code) => req('/public/verify/' + encodeURIComponent(code)),
  activity: () => req('/activity'),
  collections: () => req('/collections'),
  trend: () => req('/reports/trend'),
  certificates: () => req('/certificates'),
  issueCertificate: (b) => req('/certificates', { method: 'POST', body: JSON.stringify(b) }),
};
export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [Object.keys(rows[0]).map(esc).join(','), ...rows.map(r => Object.values(r).map(esc).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
let toastFn = null;
export const toast = (msg) => { if (toastFn) toastFn(msg); };
export function registerToast(fn) { toastFn = fn; }
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
