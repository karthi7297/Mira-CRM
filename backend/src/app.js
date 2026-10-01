const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { ok, fail, asyncHandler, notFoundHandler, errorHandler } = require('./utils/http');
const { requireAuth, requireRole, requireOrg } = require('./middleware/scope');
const { validate, sanitizeBody } = require('./middleware/validate');
const { globalLimiter, authLimiter, publicLimiter, aiLimiter, jsonOnly } = require('./middleware/ratelimit');

const authService = require('./services/auth.service');
const leadsService = require('./services/leads.service');
const customersService = require('./services/customers.service');
const trainingService = require('./services/training.service');
const dashboardService = require('./services/dashboard.service');
const financeService = require('./services/finance.service');
const learningService = require('./services/learning.service');
const showcaseService = require('./services/showcase.service');
const credentialsService = require('./services/credentials.service');
const assistantService = require('./services/assistant.service');
const campaignService = require('./services/campaign.service');
const automationService = require('./services/automation.service');
const emailService = require('./services/email.service');

/**
 * App factory — wires every route the frontend calls (frontend/src/api.js):
 * unchanged paths, unchanged { success, data } envelope, unchanged header-based
 * scope (x-role / x-customer / x-trainer / x-student). All handlers are async
 * and route through the central error handler.
 *
 * Security posture:
 *  - helmet sets sane security headers (XSS/content-type/frame/corp referrer)
 *  - CORS restricted to the frontend origin(s) via CORS_ORIGIN env (comma list)
 *  - JSON body capped at 100kb; deep string truncation via sanitizeBody
 *  - tiered rate limits (global / auth / public / AI) — middleware/ratelimit.js
 *  - every mutating endpoint validates shape via middleware/validate.js
 */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = ALLOWED_ORIGINS.length
  ? {
      origin(origin, cb) {
        // Same-origin tools (curl, health checks) send no Origin header.
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
    }
  : {}; // dev default: same origin through the Vite proxy

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));
  app.use(sanitizeBody);

  // ---------- Public: open tracking + unsubscribe (NO auth) ----------
  // Deliberately registered *before* the API-wide rate limiter. A mail
  // provider's link scanner can fetch many tracking pixels from a single IP;
  // rate-limiting them would silently lose opens and make the numbers lie.
  // Both endpoints are cheap, idempotent and safe to hit repeatedly.
  app.get('/api/public/open/:token', jsonOnly, asyncHandler(async (req, res) => {
    // The URL ends in `.gif` for client compatibility; the token itself never does.
    const pixel = await campaignService.trackOpen(String(req.params.token).replace(/\.gif$/i, ''));
    res.type('gif').set('Cache-Control', 'no-store, no-cache, must-revalidate, private').send(pixel);
  }));

  // Unsubscribe is two-step on purpose: a bare GET would let link scanners
  // (and over-eager mail clients) opt people out who never clicked anything.
  app.get('/api/public/unsubscribe/:token', jsonOnly, asyncHandler(async (req, res) => {
    const found = await campaignService.findRecipientByToken(req.params.token);
    res.type('html').send(
      found ? campaignService.unsubscribeConfirmPage(req.params.token) : campaignService.notFoundPage()
    );
  }));
  app.post('/api/public/unsubscribe/:token', jsonOnly, asyncHandler(async (req, res) => {
    const row = await campaignService.unsubscribe(req.params.token, 'Recipient clicked the unsubscribe link');
    res.type('html').send(row ? campaignService.unsubscribeDonePage(row.email) : campaignService.notFoundPage());
  }));

  // ---------- API-wide rate limit ----------
  app.use('/api', globalLimiter);

  // ---------- Auth (brute-force protected) ----------
  app.post('/api/login', authLimiter, validate({ body: { email: 'email', password: '?string' } }),
    asyncHandler(async (req, res) => ok(res, await authService.login(req.body || {}))));
  app.get('/api/users', requireOrg, asyncHandler(async (req, res) => ok(res, await authService.listUsers())));
  // First-login password change for accounts issued with a temporary password.
  app.post('/api/auth/change-password', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await credentialsService.changePassword(req.scope, req.body || {}))));
  // Rotate the temp password + re-send the credentials email (§9). Accepts a
  // users.id, trainers.id or students.id; Organization or the owning institution.
  app.post('/api/users/:id/resend-credentials', requireRole('organization', 'institution'),
    asyncHandler(async (req, res) =>
      ok(res, await credentialsService.resendCredentials(req.scope, req.params.id))));

  // ---------- Dashboard (scope-aware) ----------
  app.get('/api/dashboard', requireAuth, asyncHandler(async (req, res) => ok(res, await dashboardService.dashboard(req.scope))));

  // ---------- Leads (Rampex org operates the pipeline) ----------
  app.get('/api/leads', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.listLeads({ search: req.query.search || '', status: req.query.status || '' }))));
  app.get('/api/leads/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.getLead(req.params.id))));
  app.post('/api/leads', requireOrg, validate({ body: { organization: 'string', contact_person: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await leadsService.createLead(req.body || {}))));
  app.patch('/api/leads/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.updateLead(req.params.id, req.body || {}))));
  app.post('/api/leads/:id/followups', requireOrg, validate({ body: { method: 'string' } }), asyncHandler(async (req, res) =>
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
  app.post('/api/programs', requireOrg, validate({ body: { name: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createProgram(req.body || {}))));
  app.patch('/api/programs/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateProgram(req.params.id, req.body || {}))));
  app.delete('/api/programs/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteProgram(req.params.id))));
  app.get('/api/trainers', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listTrainers())));
app.post('/api/trainers', requireOrg, validate({ body: { name: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createTrainer(req.scope, req.body || {}))));
  app.patch('/api/trainers/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateTrainer(req.params.id, req.body || {}))));
  app.delete('/api/trainers/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteTrainer(req.params.id))));
  app.get('/api/batches', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listBatches(req.scope))));
  app.get('/api/batches/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.getBatch(req.scope, req.params.id))));
  app.post('/api/batches', requireOrg, validate({ body: { program_id: 'string', customer_id: 'string' } }), asyncHandler(async (req, res) =>
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
  app.post('/api/students', requireRole('trainer', 'institution', 'organization'), validate({ body: { name: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createStudent(req.scope, req.body || {}))));
  app.post('/api/students/bulk', requireRole('trainer', 'institution', 'organization'), validate({ body: { students: 'array' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.bulkCreateStudents(req.scope, req.body || {}))));
  app.patch('/api/students/:id', requireRole('trainer', 'institution', 'organization'), asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateStudent(req.scope, req.params.id, req.body || {}))));
  app.delete('/api/students/:id', requireRole('trainer', 'institution', 'organization'), asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteStudent(req.scope, req.params.id))));
  app.post('/api/enrollments', requireRole('trainer', 'institution', 'organization'), validate({ body: { student_id: 'string', batch_id: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createEnrollment(req.scope, req.body || {}))));
  app.get('/api/attendance', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listAttendance(req.scope, { batch_id: req.query.batch_id || '', date: req.query.date || '' }))));
  app.get('/api/attendance/summary', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.attendanceSummary(req.scope))));
  app.post('/api/attendance', requireAuth, validate({ body: { batch_id: 'string', date: 'date' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.saveAttendance(req.scope, req.body || {}))));

  // ---------- Leave Requests (FLOW for Trainer / Org Leave Approval) ----------
  app.get('/api/leave-requests', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listLeaveRequests())));
  app.post('/api/leave-requests', requireAuth, validate({ body: { trainer_id: '?string', type: '?string', from_date: '?date', to_date: '?date' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createLeaveRequest(req.body || {}))));
  app.patch('/api/leave-requests/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateLeaveRequest(req.params.id, req.body?.action || req.body?.status))));

  // ---------- Learning support ----------
  app.get('/api/sessions', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listSessions(req.scope, { batch_id: req.query.batch_id || '' }))));
  app.post('/api/sessions', requireOrg, validate({ body: { batch_id: 'string', date: '?date' } }), asyncHandler(async (req, res) =>
    ok(res, await learningService.createSession(req.body || {}))));
  app.get('/api/materials', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listMaterials(req.scope, { batch_id: req.query.batch_id || '' }))));
  app.post('/api/materials', requireOrg, validate({ body: { batch_id: 'string', title: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await learningService.createMaterial(req.body || {}))));
  app.get('/api/interests', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listInterests(req.scope))));
  app.post('/api/interests', requireAuth, validate({ body: { body: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await learningService.createInterest(req.scope, req.body || {}))));
  app.get('/api/assessments', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listAssessments(req.scope, { batch_id: req.query.batch_id || '' }))));
  app.post('/api/assessments', requireAuth, validate({ body: { batch_id: 'string', title: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await learningService.createAssessment(req.scope, req.body || {}))));
  app.patch('/api/assessments/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.updateAssessment(req.scope, req.params.id, req.body || {}))));
  app.delete('/api/assessments/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.deleteAssessment(req.scope, req.params.id))));
  app.get('/api/scores', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.listScores(req.scope, { batch_id: req.query.batch_id || '', student_id: req.query.student_id || '' }))));
  app.post('/api/scores', requireAuth, validate({ body: { assessment_id: 'string', student_id: 'string' } }), asyncHandler(async (req, res) =>
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
  app.post('/api/quotations', requireOrg, validate({ body: { customer_id: 'string', program: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await financeService.createQuotation(req.body || {}))));
  app.patch('/api/quotations/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.updateQuotation(req.scope, req.params.id, req.body || {}))));
  app.get('/api/invoices', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.listInvoices(req.scope))));
  app.get('/api/invoices/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.getInvoice(req.scope, req.params.id))));
  app.post('/api/invoices', requireOrg, validate({ body: { customer_id: 'string', program: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await financeService.createInvoice(req.body || {}))));
  app.get('/api/payments', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.listPayments(req.scope))));
  app.post('/api/payments', requireAuth, validate({ body: { invoice_id: 'string', amount: 'amount' } }), asyncHandler(async (req, res) =>
    ok(res, await financeService.createPayment(req.scope, req.body || {}))));
  app.get('/api/expenses', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.listExpenses())));
  app.post('/api/expenses', requireAuth, validate({ body: { amount: 'amount' } }), asyncHandler(async (req, res) =>
    ok(res, await financeService.createExpense(req.scope, req.body || {}))));
  app.patch('/api/expenses/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.updateExpense(req.scope, req.params.id, req.body || {}))));

  // ---------- 1-Click Quotation to Invoice Conversion ----------
  app.post('/api/quotations/:id/convert-invoice', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.convertQuotationToInvoice(req.scope, req.params.id))));

  // ---------- Public Enquiry (FLOW W) & Certificate Verification (FLOW Y) ----------
  app.post('/api/public/enquire', publicLimiter, validate({ body: { organization: 'string', contact_person: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await showcaseService.publicEnquire(req.body || {}))));
  app.get('/api/public/verify/:code', publicLimiter, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.verifyCertificate(req.params.code))));

  // ---------- Certificates (FLOW Y) ----------
  app.get('/api/certificates', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.listCertificates(req.scope))));
  app.post('/api/certificates', requireOrg, validate({ body: { student_id: 'string', batch_id: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await showcaseService.issueCertificate(req.scope, req.body || {}))));

  // ---------- Collections Queue (FLOW X) ----------
  app.get('/api/collections', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.getCollectionsQueue(req.scope))));

  // ---------- Reports Trend & Global Live Activity Feed ----------
  app.get('/api/reports/trend', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.getRevenueTrend(req.scope))));
  app.get('/api/activity', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await showcaseService.getActivityFeed(req.scope))));

  // ---------- Mira AI assistant (role-scoped from req.scope, read-only) ----------
  // The client sends only the conversation. The role and scope come from the
  // x-role/x-customer/x-trainer/x-student headers, which middleware/scope.js
  // sanitises — so the browser cannot ask as a different role.
  app.post('/api/assistant/chat', requireAuth, aiLimiter, validate({ body: { messages: 'array' } }), asyncHandler(async (req, res) =>
    ok(res, await assistantService.chat(req.scope, req.body || {}))));

  // ---------- Outreach / Cold Mail (ORGANIZATION only) ----------
  // Automated lead generation: templates → campaigns → a throttled send queue,
  // with the suppression list and lead automation that keep the pipeline
  // moving. Every route is org-only, and the scheduler runs server-side, so
  // closing the browser never stops a campaign mid-flight.
  app.get('/api/outreach/overview', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await automationService.overview())));
  app.get('/api/outreach/settings', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.getSettings())));
  app.patch('/api/outreach/settings', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.updateSettings(req.body || {}))));
  app.post('/api/outreach/test-connection', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await emailService.verify())));
  app.post('/api/outreach/run-now', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await automationService.runNow())));

  // --- Templates ---
  app.get('/api/outreach/templates', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.listTemplates())));
  app.post('/api/outreach/templates', requireOrg,
    validate({ body: { name: 'string', subject: 'string', body: 'string' } }), asyncHandler(async (req, res) =>
      ok(res, await campaignService.createTemplate(req.body || {}))));
  app.get('/api/outreach/templates/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.getTemplate(req.params.id))));
  app.patch('/api/outreach/templates/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.updateTemplate(req.params.id, req.body || {}))));
  app.delete('/api/outreach/templates/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.deleteTemplate(req.params.id))));
  app.post('/api/outreach/preview', requireOrg, validate({ body: { template_id: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await campaignService.preview(req.body || {}))));

  // --- Campaigns ---
  app.get('/api/outreach/campaigns', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.listCampaigns())));
  app.post('/api/outreach/campaigns', requireOrg,
    validate({ body: { name: 'string', template_id: 'string' } }), asyncHandler(async (req, res) =>
      ok(res, await campaignService.createCampaign(req.body || {}))));
  app.get('/api/outreach/campaigns/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.getCampaign(req.params.id))));
  app.patch('/api/outreach/campaigns/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.updateCampaign(req.params.id, req.body || {}))));
  app.delete('/api/outreach/campaigns/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.deleteCampaign(req.params.id))));
  app.post('/api/outreach/campaigns/:id/status', requireOrg,
    validate({ body: { status: 'string' } }), asyncHandler(async (req, res) =>
      ok(res, await campaignService.updateCampaignStatus(req.params.id, req.body.status))));

  // --- Audience + queue ---
  app.post('/api/outreach/campaigns/:id/audience', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.buildAudience(req.params.id, req.body || {}))));
  app.post('/api/outreach/campaigns/:id/recipients', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.importProspects(req.params.id, req.body || {}))));
  app.get('/api/outreach/campaigns/:id/recipients', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.listRecipients(req.params.id, {
      status: req.query.status || '',
      search: req.query.search || '',
      limit: req.query.limit || 200,
    }))));
  app.post('/api/outreach/campaigns/:id/recipients/:rid/replied', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.markReplied(req.params.id, req.params.rid))));
  app.delete('/api/outreach/campaigns/:id/recipients/:rid', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.removeRecipient(req.params.id, req.params.rid))));

  // --- Suppression list ---
  app.get('/api/outreach/suppressions', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.listSuppressions({ search: req.query.search || '' }))));
  app.post('/api/outreach/suppressions', requireOrg, validate({ body: { email: 'email' } }), asyncHandler(async (req, res) =>
    ok(res, await campaignService.suppress(req.body.email, req.body.reason || 'MANUAL', req.body.detail || null))));
  app.delete('/api/outreach/suppressions/:email', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await campaignService.unsuppress(req.params.email))));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
