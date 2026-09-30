const express = require('express');
const cors = require('cors');
const { ok, fail, asyncHandler, notFoundHandler, errorHandler } = require('./utils/http');
const { requireAuth, requireRole, requireOrg } = require('./middleware/scope');

const authService = require('./services/auth.service');
const leadsService = require('./services/leads.service');
const customersService = require('./services/customers.service');
const trainingService = require('./services/training.service');
const dashboardService = require('./services/dashboard.service');
const financeService = require('./services/finance.service');
const learningService = require('./services/learning.service');
const showcaseService = require('./services/showcase.service');

/**
 * App factory — wires every route the frontend calls (frontend/src/api.js):
 * unchanged paths, unchanged { success, data } envelope, unchanged header-based
 * scope (x-role / x-customer / x-trainer / x-student). All handlers are async
 * and route through the central error handler.
 */
function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ---------- Auth ----------
  app.post('/api/login', asyncHandler(async (req, res) => ok(res, await authService.login(req.body || {}))));
  app.get('/api/users', requireOrg, asyncHandler(async (req, res) => ok(res, await authService.listUsers())));

  // ---------- Dashboard (scope-aware) ----------
  app.get('/api/dashboard', requireAuth, asyncHandler(async (req, res) => ok(res, await dashboardService.dashboard(req.scope))));

  // ---------- Leads (Rampex org operates the pipeline) ----------
  app.get('/api/leads', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.listLeads({ search: req.query.search || '', status: req.query.status || '' }))));
  app.get('/api/leads/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.getLead(req.params.id))));
  app.post('/api/leads', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.createLead(req.body || {}))));
  app.patch('/api/leads/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.updateLead(req.params.id, req.body || {}))));
  app.post('/api/leads/:id/followups', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.addFollowup(req.params.id, req.body || {}, req.scope.role === 'organization' ? null : req.scope.customer_id))));
  app.post('/api/leads/:id/convert', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.convertLead(req.params.id))));

  // ---------- Customers + 360 ----------
  app.get('/api/customers', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await customersService.listCustomers(req.scope, { search: req.query.search || '' }))));
  app.get('/api/customers/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await customersService.getCustomer360(req.scope, req.params.id))));

  // ---------- Training ----------
  app.get('/api/programs', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listPrograms())));
  app.post('/api/programs', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.createProgram(req.body || {}))));
  app.patch('/api/programs/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateProgram(req.params.id, req.body || {}))));
  app.delete('/api/programs/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteProgram(req.params.id))));
  app.get('/api/trainers', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listTrainers())));
  app.post('/api/trainers', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.createTrainer(req.body || {}))));
  app.patch('/api/trainers/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateTrainer(req.params.id, req.body || {}))));
  app.delete('/api/trainers/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteTrainer(req.params.id))));
  app.get('/api/batches', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listBatches(req.scope))));
  app.get('/api/batches/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.getBatch(req.scope, req.params.id))));
  app.post('/api/batches', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.createBatch(req.body || {}))));
  // Org edits any batch; an institution may edit (but not re-home) its own.
  // DELETE stays org-only — dropping a batch cascades enrollments/sessions.
  app.patch('/api/batches/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateBatch(req.scope, req.params.id, req.body || {}))));
  app.delete('/api/batches/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteBatch(req.params.id))));
  // STUDENT MANAGEMENT IS THE TRAINER'S JOB (master-prd §3). A trainer owns a
  // short personal roster, so name-by-name CRUD is the right granularity there.
  // Rampex + institutions have hundreds of students and get aggregates only
  // (dashboard, Customer 360) — writes are trainer-only and 403 everyone else.
  app.get('/api/students', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listStudents(req.scope, { batch_id: req.query.batch_id || '', search: req.query.search || '' }))));
  app.post('/api/students', requireRole('trainer', 'institution', 'organization'), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createStudent(req.scope, req.body || {}))));
  app.post('/api/students/bulk', requireRole('trainer', 'institution', 'organization'), asyncHandler(async (req, res) =>
    ok(res, await trainingService.bulkCreateStudents(req.scope, req.body || {}))));
  app.patch('/api/students/:id', requireRole('trainer', 'institution', 'organization'), asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateStudent(req.scope, req.params.id, req.body || {}))));
  app.delete('/api/students/:id', requireRole('trainer', 'institution', 'organization'), asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteStudent(req.scope, req.params.id))));
  app.post('/api/enrollments', requireRole('trainer', 'institution', 'organization'), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createEnrollment(req.scope, req.body || {}))));
  app.get('/api/attendance', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listAttendance(req.scope, { batch_id: req.query.batch_id || '', date: req.query.date || '' }))));
  app.get('/api/attendance/summary', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.attendanceSummary(req.scope))));
  app.post('/api/attendance', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.saveAttendance(req.scope, req.body || {}))));

  // ---------- Leave Requests (FLOW for Trainer / Org Leave Approval) ----------
  app.get('/api/leave-requests', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listLeaveRequests())));
  app.post('/api/leave-requests', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.createLeaveRequest(req.body || {}))));
  app.patch('/api/leave-requests/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateLeaveRequest(req.params.id, req.body?.action || req.body?.status))));

  // ---------- Learning support ----------
  app.get('/api/sessions', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listSessions(req.scope, { batch_id: req.query.batch_id || '' }))));
  app.post('/api/sessions', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await learningService.createSession(req.body || {}))));
  app.get('/api/materials', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listMaterials(req.scope, { batch_id: req.query.batch_id || '' }))));
  app.post('/api/materials', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await learningService.createMaterial(req.body || {}))));
  app.get('/api/interests', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listInterests(req.scope))));
  app.post('/api/interests', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.createInterest(req.scope, req.body || {}))));
  app.get('/api/assessments', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listAssessments(req.scope, { batch_id: req.query.batch_id || '' }))));
  app.post('/api/assessments', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.createAssessment(req.scope, req.body || {}))));
  app.patch('/api/assessments/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.updateAssessment(req.scope, req.params.id, req.body || {}))));
  app.delete('/api/assessments/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.deleteAssessment(req.scope, req.params.id))));
  app.get('/api/scores', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listScores(req.scope, { batch_id: req.query.batch_id || '', student_id: req.query.student_id || '' }))));
  app.post('/api/scores', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.saveScore(req.scope, req.body || {}))));
  app.delete('/api/scores/:assessmentId/:studentId', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.deleteScore(req.scope, req.params.assessmentId, req.params.studentId))));
  app.get('/api/students/:id/report', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.studentReport(req.scope, req.params.id))));
  app.get('/api/reports/top-students', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.topStudentsReport(req.scope, { customer_id: req.query.customer_id || '' }))));

  // ---------- Trainer finance (own payouts + claims) ----------
  app.get('/api/trainer-finance', requireRole('trainer'), asyncHandler(async (req, res) =>
    ok(res, await financeService.trainerFinance(req.scope.trainer_id))));

  // ---------- Finance ----------
  app.get('/api/quotations', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.listQuotations(req.scope))));
  app.post('/api/quotations', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.createQuotation(req.body || {}))));
  app.patch('/api/quotations/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.updateQuotation(req.scope, req.params.id, req.body || {}))));
  app.get('/api/invoices', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.listInvoices(req.scope))));
  app.get('/api/invoices/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.getInvoice(req.scope, req.params.id))));
  app.post('/api/invoices', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.createInvoice(req.body || {}))));
  app.get('/api/payments', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.listPayments(req.scope))));
  app.post('/api/payments', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.createPayment(req.scope, req.body || {}))));
  app.get('/api/expenses', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.listExpenses())));
  app.post('/api/expenses', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.createExpense(req.scope, req.body || {}))));
  app.patch('/api/expenses/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.updateExpense(req.scope, req.params.id, req.body || {}))));

  // ---------- 1-Click Quotation to Invoice Conversion ----------
  app.post('/api/quotations/:id/convert-invoice', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.convertQuotationToInvoice(req.scope, req.params.id))));

  // ---------- Public Enquiry (FLOW W) & Certificate Verification (FLOW Y) ----------
  app.post('/api/public/enquire', asyncHandler(async (req, res) =>
    ok(res, await showcaseService.publicEnquire(req.body || {}))));
  app.get('/api/public/verify/:code', asyncHandler(async (req, res) =>
    ok(res, await showcaseService.verifyCertificate(req.params.code))));

  // ---------- Certificates (FLOW Y) ----------
  app.get('/api/certificates', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.listCertificates(req.scope))));
  app.post('/api/certificates', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.issueCertificate(req.scope, req.body || {}))));

  // ---------- Collections Queue (FLOW X) ----------
  app.get('/api/collections', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.getCollectionsQueue(req.scope))));

  // ---------- Reports Trend & Global Live Activity Feed ----------
  app.get('/api/reports/trend', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.getRevenueTrend(req.scope))));
  app.get('/api/activity', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.getActivityFeed(req.scope))));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
