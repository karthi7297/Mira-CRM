export const API = '';
async function req(path, opts = {}) {
  let scope = {};
  try { scope = JSON.parse(localStorage.getItem('mira_user')) || {}; } catch { scope = {}; }
  const r = await fetch('/api' + path, {
    headers: {
      'Content-Type': 'application/json',
      'x-role': scope.role || '',
      'x-user': scope.id || '',
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
  changePassword: (b) => req('/auth/change-password', { method: 'POST', body: JSON.stringify(b) }),
  resendCredentials: (id) => req(`/users/${encodeURIComponent(id)}/resend-credentials`, { method: 'POST' }),
  dashboard: () => req('/dashboard'),
  leads: (q = '') => req('/leads' + q),
  lead: (id) => req('/leads/' + id),
  createLead: (b) => req('/leads', { method: 'POST', body: JSON.stringify(b) }),
  patchLead: (id, b) => req('/leads/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  followup: (id, b) => req(`/leads/${id}/followups`, { method: 'POST', body: JSON.stringify(b) }),
  convert: (id) => req(`/leads/${id}/convert`, { method: 'POST' }),
  customers: (q = '') => req('/customers' + q),
  customer: (id) => req('/customers/' + id),
  programs: (q = '') => req('/programs' + q),
  createProgram: (b) => req('/programs', { method: 'POST', body: JSON.stringify(b) }),
  updateProgram: (id, b) => req('/programs/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteProgram: (id) => req('/programs/' + id, { method: 'DELETE' }),
  trainers: (q = '') => req('/trainers' + q),
  trainer: (id) => req('/trainers/' + id),
  createTrainer: (b) => req('/trainers', { method: 'POST', body: JSON.stringify(b) }),
  updateTrainer: (id, b) => req('/trainers/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteTrainer: (id) => req('/trainers/' + id, { method: 'DELETE' }),
  batches: (q = '') => req('/batches' + q),
  batch: (id) => req('/batches/' + id),
  createBatch: (b) => req('/batches', { method: 'POST', body: JSON.stringify(b) }),
  updateBatch: (id, b) => req('/batches/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteBatch: (id) => req('/batches/' + id, { method: 'DELETE' }),
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
  quotations: (q = '') => req('/quotations' + q),
  createQuotation: (b) => req('/quotations', { method: 'POST', body: JSON.stringify(b) }),
  patchQuotation: (id, b) => req('/quotations/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  convertQuotation: (id) => req(`/quotations/${id}/convert-invoice`, { method: 'POST' }),
  invoices: (q = '') => req('/invoices' + q),
  invoice: (id) => req('/invoices/' + id),
  createInvoice: (b) => req('/invoices', { method: 'POST', body: JSON.stringify(b) }),
  payments: () => req('/payments'),
  pay: (b) => req('/payments', { method: 'POST', body: JSON.stringify(b) }),
  expenses: (q = '') => req('/expenses' + q),
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
  updateAssessment: (id, b) => req('/assessments/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteAssessment: (id) => req('/assessments/' + id, { method: 'DELETE' }),
  scores: (q = '') => req('/scores' + q),
  saveScore: (b) => req('/scores', { method: 'POST', body: JSON.stringify(b) }),
  deleteScore: (assessmentId, studentId) => req('/scores/' + assessmentId + '/' + studentId, { method: 'DELETE' }),
  assessmentReport: (id) => req('/assessments/' + id + '/report'),
  batchReport: (id) => req('/reports/batch/' + id),
  overallReport: () => req('/reports/overall'),
  studentReport: (id) => req('/students/' + id + '/report'),
  studentInsights: (id) => req('/students/' + id + '/insights', { method: 'POST' }),
  topStudents: (q = '') => req('/reports/top-students' + q),
  trainerFinance: () => req('/trainer-finance'),
  enquire: (b) => req('/public/enquire', { method: 'POST', body: JSON.stringify(b) }),
  verifyCert: (code) => req('/public/verify/' + encodeURIComponent(code)),
  activity: () => req('/activity'),

  // ---- Support tickets / requests, announcements, contacts, users ----
  tickets: () => req('/tickets'),
  createTicket: (b) => req('/tickets', { method: 'POST', body: JSON.stringify(b) }),
  updateTicket: (id, b) => req('/tickets/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  announcements: () => req('/announcements'),
  createAnnouncement: (b) => req('/announcements', { method: 'POST', body: JSON.stringify(b) }),
  contacts: (customerId) => req('/customers/' + customerId + '/contacts'),
  createContact: (customerId, b) => req('/customers/' + customerId + '/contacts', { method: 'POST', body: JSON.stringify(b) }),
  deleteContact: (id) => req('/contacts/' + id, { method: 'DELETE' }),
  users: () => req('/users'),
  createUser: (b) => req('/users', { method: 'POST', body: JSON.stringify(b) }),
  updateUser: (id, b) => req('/users/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  profile: () => req('/profile'),
  updateProfile: (b) => req('/profile', { method: 'PATCH', body: JSON.stringify(b) }),
  collections: () => req('/collections'),
  trend: () => req('/reports/trend'),
  certificates: () => req('/certificates'),
  issueCertificate: (b) => req('/certificates', { method: 'POST', body: JSON.stringify(b) }),
  // Role-scoped assistant. Only the conversation is sent — the server derives
  // the caller's role and scope from the headers above, so scope can't be faked.
  assistantChat: (messages) => req('/assistant/chat', { method: 'POST', body: JSON.stringify({ messages }) }),

  // ---- Cold mail / outreach (organization only) ----
  // The scheduler runs server-side, so these calls only configure and inspect
  // it — closing the tab never stops a campaign.
  outreachOverview: () => req('/outreach/overview'),
  saveOutreachSettings: (b) => req('/outreach/settings', { method: 'PATCH', body: JSON.stringify(b) }),
  outreachTest: () => req('/outreach/test-connection', { method: 'POST', body: '{}' }),
  outreachRunNow: () => req('/outreach/run-now', { method: 'POST', body: '{}' }),

  outreachTemplates: () => req('/outreach/templates'),
  createOutreachTemplate: (b) => req('/outreach/templates', { method: 'POST', body: JSON.stringify(b) }),
  patchOutreachTemplate: (id, b) => req('/outreach/templates/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteOutreachTemplate: (id) => req('/outreach/templates/' + id, { method: 'DELETE' }),
  outreachPreview: (b) => req('/outreach/preview', { method: 'POST', body: JSON.stringify(b) }),

  outreachCampaigns: () => req('/outreach/campaigns'),
  outreachCampaign: (id) => req('/outreach/campaigns/' + id),
  createOutreachCampaign: (b) => req('/outreach/campaigns', { method: 'POST', body: JSON.stringify(b) }),
  patchOutreachCampaign: (id, b) => req('/outreach/campaigns/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteOutreachCampaign: (id) => req('/outreach/campaigns/' + id, { method: 'DELETE' }),
  outreachCampaignStatus: (id, status) =>
    req(`/outreach/campaigns/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  outreachAudience: (id, b) =>
    req(`/outreach/campaigns/${id}/audience`, { method: 'POST', body: JSON.stringify(b || {}) }),
  outreachImport: (id, b) =>
    req(`/outreach/campaigns/${id}/recipients`, { method: 'POST', body: JSON.stringify(b) }),
  outreachRecipients: (id, q = '') => req(`/outreach/campaigns/${id}/recipients` + q),
  outreachReplied: (id, rid) =>
    req(`/outreach/campaigns/${id}/recipients/${rid}/replied`, { method: 'POST', body: '{}' }),
  outreachRemoveRecipient: (id, rid) => req(`/outreach/campaigns/${id}/recipients/${rid}`, { method: 'DELETE' }),

  outreachSuppressions: (q = '') => req('/outreach/suppressions' + q),
  outreachSuppress: (b) => req('/outreach/suppressions', { method: 'POST', body: JSON.stringify(b) }),
  outreachUnsuppress: (email) => req('/outreach/suppressions/' + encodeURIComponent(email), { method: 'DELETE' }),

  // ---- Record lifecycle (audit D8) ----
  // `kind` is the route base: leads | customers | students | batches |
  // quotations | invoices | expenses | trainers | programs.
  archive: (kind, id) => req(`/${kind}/${id}/archive`, { method: 'POST', body: '{}' }),
  restore: (kind, id) => req(`/${kind}/${id}/restore`, { method: 'POST', body: '{}' }),
  merge: (kind, primaryId, duplicateId) =>
    req(`/${kind}/merge`, { method: 'POST', body: JSON.stringify({ primary_id: primaryId, duplicate_id: duplicateId }) }),

  // ---- Notifications (audit B4 / F7) ----
  notifications: (q = '') => req('/notifications' + q),
  unreadCount: () => req('/notifications/unread-count'),
  markNotificationRead: (id) => req(`/notifications/${id}/read`, { method: 'POST', body: '{}' }),
  markAllNotificationsRead: () => req('/notifications/read-all', { method: 'POST', body: '{}' }),

  // ---- Feedback forms + responses + sentiment analytics ----
  // Visibility is enforced server-side, so these calls never need a scope
  // argument — the headers above decide what comes back.
  feedbackOverview: () => req('/feedback/overview'),
  feedbackForms: () => req('/feedback/forms'),
  feedbackForm: (id) => req('/feedback/forms/' + id),
  createFeedbackForm: (b) => req('/feedback/forms', { method: 'POST', body: JSON.stringify(b) }),
  setFeedbackFormStatus: (id, status) =>
    req('/feedback/forms/' + id, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteFeedbackForm: (id) => req('/feedback/forms/' + id, { method: 'DELETE' }),
  feedbackResponses: (id) => req('/feedback/forms/' + id + '/responses'),
  submitFeedback: (id, answers) =>
    req('/feedback/forms/' + id + '/responses', { method: 'POST', body: JSON.stringify({ answers }) }),
  myFeedback: () => req('/feedback/mine'),
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
/** toast('Saved') → success; toast('X failed', 'error') → error styling. */
export const toast = (msg, kind = 'success') => { if (toastFn) toastFn(msg, kind); };
export const toastError = (msg) => toast(msg, 'error');
export function registerToast(fn) { toastFn = fn; }
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
