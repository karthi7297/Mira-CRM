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
const insightsService = require('./services/insights.service');
const campaignService = require('./services/campaign.service');
const automationService = require('./services/automation.service');
const emailService = require('./services/email.service');
const supportService = require('./services/support.service');
const notificationsService = require('./services/notifications.service');
const lifecycleService = require('./services/lifecycle.service');
const feedbackService = require('./services/feedback.service');

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
    ok(res, await leadsService.listLeads({
      search: req.query.search || '',
      status: req.query.status || '',
      archived: req.query.archived === '1',
    }))));
  app.get('/api/leads/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.getLead(req.params.id))));
  app.post('/api/leads', requireOrg, validate({ body: { organization: 'string', contact_person: 'string', email: '?email', phone: '?phone' } }), asyncHandler(async (req, res) => {
    const lead = await leadsService.createLead(req.body || {});
    await notificationsService.notify({
      role: 'organization', kind: 'SUCCESS',
      title: `New lead — ${lead.organization}`,
      body: `${lead.contact_person} · ${lead.program || 'General'} · ${lead.id}`,
      link: `/leads/${lead.id}`,
    });
    return ok(res, lead);
  }));
  app.patch('/api/leads/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.updateLead(req.params.id, req.body || {}))));
  app.post('/api/leads/:id/followups', requireOrg, validate({ body: { method: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await leadsService.addFollowup(req.params.id, req.body || {}, req.scope.role === 'organization' ? null : req.scope.customer_id))));
  app.post('/api/leads/:id/convert', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await leadsService.convertLead(req.params.id))));

  // ---------- Customers + 360 ----------
  app.get('/api/customers', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await customersService.listCustomers(req.scope, {
      search: req.query.search || '',
      archived: req.query.archived === '1',
    }))));
  app.get('/api/customers/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await customersService.getCustomer360(req.scope, req.params.id))));

  // ---------- Training ----------
  app.get('/api/programs', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listPrograms({ archived: req.query.archived === '1' }))));
  app.post('/api/programs', requireOrg, validate({ body: { name: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createProgram(req.body || {}))));
  app.patch('/api/programs/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateProgram(req.params.id, req.body || {}))));
  app.delete('/api/programs/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteProgram(req.params.id))));
  app.get('/api/trainers', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listTrainers())));

  // Trainer 360 for Rampex: profile + batches + students + payouts + leave.
  app.get('/api/trainers/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.getTrainerDetail(req.params.id))));

  app.post('/api/trainers', requireOrg, validate({ body: { name: 'string', email: '?email', phone: '?phone' } }), asyncHandler(async (req, res) =>
    ok(res, await trainingService.createTrainer(req.scope, req.body || {}))));

  app.patch('/api/trainers/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.updateTrainer(req.params.id, req.body || {}))));
  app.delete('/api/trainers/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await trainingService.deleteTrainer(req.params.id))));
  app.get('/api/batches', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listBatches(req.scope, { archived: req.query.archived === '1' }))));
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
  // STUDENT MANAGEMENT: the assigned trainer delivers a batch's roster, the
  // owning institution manages its own college, and Rampex (organization)
  // manages platform-wide. Reads stay scoped; writes are trainer/institution/
  // organization per the service guards.
  app.get('/api/students', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await trainingService.listStudents(req.scope, {
      batch_id: req.query.batch_id || '',
      search: req.query.search || '',
      archived: req.query.archived === '1',
    }))));
  app.post('/api/students', requireRole('trainer', 'institution', 'organization'), validate({ body: { name: 'string', email: '?email', phone: '?phone', password: '?string' } }), asyncHandler(async (req, res) =>
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
  app.get('/api/assessments/:id/report', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.assessmentReport(req.scope, req.params.id))));
  app.get('/api/reports/batch/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.batchReport(req.scope, req.params.id))));
  app.get('/api/reports/overall', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.overallReport(req.scope))));
  app.get('/api/students/:id/report', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.studentReport(req.scope, req.params.id))));
  // AI weak-area insights from the student's assessment performance.
  // POST (not GET): each call can hit the upstream model, so it shares the AI
  // rate limiter with the assistant chat.
  app.post('/api/students/:id/insights', requireAuth, aiLimiter, asyncHandler(async (req, res) =>
    ok(res, await insightsService.studentInsights(req.scope, req.params.id))));
  app.get('/api/reports/top-students', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await learningService.topStudentsReport(req.scope, { customer_id: req.query.customer_id || '' }))));

  // ---------- Trainer finance (own payouts + claims) ----------
  app.get('/api/trainer-finance', requireRole('trainer'), asyncHandler(async (req, res) =>
    ok(res, await financeService.trainerFinance(req.scope.trainer_id))));

  // ---------- Finance ----------
  app.get('/api/quotations', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.listQuotations(req.scope, { archived: req.query.archived === '1' }))));
  app.post('/api/quotations', requireOrg, validate({ body: { customer_id: 'string', program: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await financeService.createQuotation(req.body || {}))));
  app.patch('/api/quotations/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.updateQuotation(req.scope, req.params.id, req.body || {}))));
  app.get('/api/invoices', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.listInvoices(req.scope, { archived: req.query.archived === '1' }))));
  app.get('/api/invoices/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.getInvoice(req.scope, req.params.id))));
  app.post('/api/invoices', requireOrg, validate({ body: { customer_id: 'string', program: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await financeService.createInvoice(req.body || {}))));
  app.get('/api/payments', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await financeService.listPayments(req.scope))));
  app.post('/api/payments', requireAuth, validate({ body: { invoice_id: 'string', amount: 'amount' } }), asyncHandler(async (req, res) => {
    const payment = await financeService.createPayment(req.scope, req.body || {});
    await notificationsService.notify({
      role: 'organization', kind: 'SUCCESS',
      title: `Payment received — ${payment.id}`,
      body: `Invoice ${req.body.invoice_id} · outstanding now ₹${payment.outstanding}`,
      link: `/invoices/${req.body.invoice_id}`,
    });
    return ok(res, payment);
  }));
  app.get('/api/expenses', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await financeService.listExpenses({ archived: req.query.archived === '1' }))));
  app.post('/api/expenses', requireAuth, validate({ body: { amount: 'amount' } }), asyncHandler(async (req, res) => {
    const expense = await financeService.createExpense(req.scope, req.body || {});
    // A trainer claim lands as PENDING and needs org attention — say so.
    if (expense.status === 'PENDING') {
      await notificationsService.notify({
        role: 'organization', kind: 'WARNING',
        title: `Expense claim to review — ${expense.id}`,
        body: `${expense.category} · ${expense.vendor || 'no vendor'} · ₹${expense.amount}`,
        link: '/expenses',
      });
    }
    return ok(res, expense);
  }));
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

  // ---- Support tickets / institution requests ----
  app.get('/api/tickets', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await supportService.listTickets(req.scope))));
  app.post('/api/tickets', requireAuth, validate({ body: { subject: 'string' } }), asyncHandler(async (req, res) => {
    const ticket = await supportService.createTicket(req.scope, req.body || {});
    // Tell the org there is something to triage (their own tickets don't need it).
    if (req.scope.role !== 'organization') {
      await notificationsService.notify({
        role: 'organization', kind: 'INFO',
        title: `New ${String(ticket.kind || 'SUPPORT').toLowerCase()} ticket — ${ticket.subject}`,
        body: `Raised by ${req.scope.role} · ${ticket.id}`,
        link: '/support',
      });
    }
    return ok(res, ticket, 201);
  }));
  app.patch('/api/tickets/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await supportService.updateTicket(req.scope, req.params.id, req.body || {}))));

  // ---- Announcements ----
  app.get('/api/announcements', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await supportService.listAnnouncements(req.scope))));
  app.post('/api/announcements', requireRole('organization', 'trainer'), validate({ body: { title: 'string' } }), asyncHandler(async (req, res) => {
    const ann = await supportService.createAnnouncement(req.scope, req.body || {});
    // Fan the announcement out to the roles its audience targets (audit B4/F7).
    const targets = ann.audience === 'ALL' ? ['institution', 'student']
      : ann.audience === 'CUSTOMER' ? ['institution'] : ['student'];
    for (const role of targets) {
      await notificationsService.notify({
        role, kind: 'INFO',
        title: `Announcement — ${ann.title}`,
        body: ann.body ? String(ann.body).slice(0, 140) : null,
        link: '/announcements',
      });
    }
    return ok(res, ann, 201);
  }));

  // ---- Feedback (forms → responses → sentiment) ----
  // Two audiences: STUDENT forms survey a college's learners, INSTITUTION
  // forms review the platform. Visibility lives in the service, never the
  // client: Rampex sees everything, an institution sees only the forms it
  // created and their responses, a trainer sees only its own forms (answered by
  // the students it teaches), a student sees forms addressed to its college
  // plus its own submissions. Every text answer is scored on write.
  app.get('/api/feedback/overview', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await feedbackService.overview(req.scope))));
  app.get('/api/feedback/forms', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await feedbackService.listForms(req.scope))));
  app.get('/api/feedback/mine', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await feedbackService.myResponses(req.scope))));
  app.post('/api/feedback/forms', requireRole('organization', 'institution', 'trainer'),
    validate({ body: { title: 'string', questions: 'array' } }), asyncHandler(async (req, res) => {
      const form = await feedbackService.createForm(req.scope, req.body || {});
      // A form opened by a college or a trainer should not sit unseen in their
      // workspace — Rampex gets told.
      if (req.scope.role === 'institution' || req.scope.role === 'trainer') {
        await notificationsService.notify({
          role: 'organization', kind: 'INFO',
          title: `New feedback form — ${form.title}`,
          body: `${form.customer_name || (req.scope.role === 'trainer' ? 'A trainer' : 'An institution')} · ${form.id} · ${form.audience}`,
          link: '/feedback',
        });
      }
      return ok(res, form, 201);
    }));
  app.get('/api/feedback/forms/:id', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await feedbackService.getForm(req.scope, req.params.id))));
  app.patch('/api/feedback/forms/:id', requireRole('organization', 'institution', 'trainer'), asyncHandler(async (req, res) =>
    ok(res, await feedbackService.setFormStatus(req.scope, req.params.id, req.body?.status))));
  app.delete('/api/feedback/forms/:id', requireRole('organization', 'institution', 'trainer'), asyncHandler(async (req, res) =>
    ok(res, await feedbackService.deleteForm(req.scope, req.params.id))));
  app.get('/api/feedback/forms/:id/responses', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await feedbackService.listResponses(req.scope, req.params.id))));
  app.post('/api/feedback/forms/:id/responses', requireAuth,
    validate({ body: { answers: 'array' } }), asyncHandler(async (req, res) => {
      const response = await feedbackService.submitResponse(req.scope, req.params.id, req.body || {});
      const meta = await feedbackService.getFormMeta(req.params.id);
      if (meta) {
        // The form's owner hears that feedback landed.
        if (meta.created_by && meta.created_by !== req.scope.user_id) {
          await notificationsService.notify({
            userId: meta.created_by, kind: 'SUCCESS',
            title: `New feedback — ${meta.title}`,
            body: `${response.submitted_role} · ${response.sentiment}`,
            link: '/feedback',
          });
        }
        // Institution-level feedback is Rampex's signal about the platform
        // itself, so it is flagged separately from student feedback.
        if (req.scope.role === 'institution') {
          await notificationsService.notify({
            role: 'organization', kind: 'INFO',
            title: `Institution feedback — ${meta.title}`,
            body: `${response.sentiment} · ${response.id}`,
            link: '/feedback',
          });
        }
      }
      return ok(res, response, 201);
    }));

  // ---- Customer contacts ----
  app.get('/api/customers/:id/contacts', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await supportService.listContacts(req.scope, req.params.id))));
  app.post('/api/customers/:id/contacts', requireOrg, validate({ body: { name: 'string' } }), asyncHandler(async (req, res) =>
    ok(res, await supportService.createContact(req.scope, req.params.id, req.body || {}), 201)));
  app.delete('/api/contacts/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await supportService.deleteContact(req.scope, req.params.id))));

  // ---- User & access management (organization only) ----
  app.post('/api/users', requireOrg, validate({ body: { name: 'string', email: 'email', role: 'string', password: '?string' } }), asyncHandler(async (req, res) =>
    ok(res, await authService.createUser(req.body || {}), 201)));
  app.patch('/api/users/:id', requireOrg, asyncHandler(async (req, res) =>
    ok(res, await authService.updateUser(req.params.id, req.body || {}))));

  // ---------- Notifications (audit B4 / F7) ----------
  // The topbar bell polls the unread count and lists the inbox. Read state is
  // per user, so a role-wide broadcast keeps an independent unread count for
  // everyone who received it.
  app.get('/api/notifications', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await notificationsService.list(req.scope, { limit: req.query.limit || 50 }))));
  app.get('/api/notifications/unread-count', requireAuth, asyncHandler(async (req, res) =>
    ok(res, { count: await notificationsService.unreadCount(req.scope) })));
  app.post('/api/notifications/read-all', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await notificationsService.markAllRead(req.scope))));
  app.post('/api/notifications/:id/read', requireAuth, asyncHandler(async (req, res) =>
    ok(res, await notificationsService.markRead(req.scope, req.params.id))));

  // ---------- Record lifecycle (audit D8): archive / restore / merge ----------
  // Registered as a block so every archivable entity gets the same three
  // endpoints with the same shape. `merge` is only wired where a rule exists
  // (leads, customers, students) — the service rejects it otherwise.
  const LIFECYCLE = [
    { base: '/api/leads', entity: 'leads', mergeable: true },
    { base: '/api/customers', entity: 'customers', mergeable: true },
    { base: '/api/students', entity: 'students', mergeable: true },
    { base: '/api/batches', entity: 'batches' },
    { base: '/api/quotations', entity: 'quotations' },
    { base: '/api/invoices', entity: 'invoices' },
    { base: '/api/expenses', entity: 'expenses' },
    { base: '/api/trainers', entity: 'trainers' },
    { base: '/api/programs', entity: 'programs' },
  ];
  for (const { base, entity, mergeable } of LIFECYCLE) {
    app.post(`${base}/:id/archive`, requireAuth, asyncHandler(async (req, res) =>
      ok(res, await lifecycleService.archive(req.scope, entity, req.params.id))));
    app.post(`${base}/:id/restore`, requireAuth, asyncHandler(async (req, res) =>
      ok(res, await lifecycleService.restore(req.scope, entity, req.params.id))));
    if (mergeable) {
      app.post(`${base}/merge`, requireAuth,
        validate({ body: { primary_id: 'string', duplicate_id: 'string' } }), asyncHandler(async (req, res) =>
          ok(res, await lifecycleService.merge(req.scope, entity, req.body.primary_id, req.body.duplicate_id))));
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
