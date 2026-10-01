const path = require('path');

/**
 * Central configuration. Env-overridable so the same code runs anywhere.
 *
 * DB driver (db-prd §12 / §9):
 *   DB_DRIVER=sqlite (default, zero-setup dev — backend/mira.db)
 *   DB_DRIVER=mysql  (production target — MySQL 8, see backend/.env.example)
 * Both dialects share the exact same column layout, so every service query
 * is dialect-agnostic (only connection + DDL differ).
 */
module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),

  db: {
    driver: (process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'mysql' ? 'mysql' : 'sqlite',
    sqlite: {
      file: process.env.DB_FILE || path.join(__dirname, '..', '..', 'mira.db'),
    },
    mysql: {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'mira',
      password: process.env.MYSQL_PASSWORD || 'mira',
      database: process.env.MYSQL_DATABASE || 'mira',
    },
  },

  // master-prd §8: total = subtotal + tax − discount (tax rate configurable, 18% default)
  defaultTaxRate: Number(process.env.DEFAULT_TAX_RATE || 18),
  collectionRisk: {
    highOutstanding: 200000,
    highOverdueDays: 30,
    mediumOutstanding: 50000,
    mediumOverdueDays: 7,
  },

/**
   * Mira AI assistant (OpenRouter). Free models only — the primary is tried
   * first and the fallback catches rate-limits/errors, so a 429 on one model
   * does not take the widget down. The key stays server-side; the browser only
   * ever talks to /api/assistant/chat.
   */
  assistant: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackModel: process.env.OPENROUTER_MODEL_FALLBACK || 'inclusionai/ling-3.0-flash-sante:free',
    // Both models are reasoning models: hidden reasoning tokens count toward
    // max_tokens, so this needs headroom or replies get cut off mid-sentence.
    maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS || 900),
    temperature: Number(process.env.OPENROUTER_TEMPERATURE || 0.3),
    timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS || 45000),
    // Cap how much history the client may replay (token + abuse control).
    maxHistory: 12,
  },

  /**
   * Outbound mail. Serves two callers that authenticate independently:
   *  - cold outreach (SMTP_* below) via src/services/email.service.js
   *  - account credentials emails (EMAIL_USER/EMAIL_APP_PASSWORD) via
   *    src/config/mailer.js, which reads those env vars directly
   *
   * Gmail works with an App Password:
   *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
   *   SMTP_USER=you@gmail.com   SMTP_PASS=<16-char app password>
   *
   * Leave user/pass blank and the whole outreach system still works end to end —
   * it queues and schedules instead of sending, and the UI says "not connected"
   * rather than pretending. Nothing here is ever logged.
   */
  mail: {
    // Branding/links for the credentials emails.
    appName: process.env.APP_NAME || 'Mira',
    loginUrl: process.env.APPLICATION_LOGIN_URL || 'http://localhost:5173/login',

    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Rampex',
    replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_USER || '',

    // Ceiling per rolling day across ALL campaigns. Gmail locks free accounts
    // well before its documented limit, so the default stays conservative.
    dailyCap: Number(process.env.OUTREACH_DAILY_CAP || 120),
    // Minimum spacing between two sends, so a burst never looks like a blast.
    minGapMs: Number(process.env.OUTREACH_MIN_GAP_MS || 20000),
    // How often the scheduler drains the queue.
    tickMs: Number(process.env.OUTREACH_TICK_MS || 60000),
    // Retries before a recipient is marked FAILED.
    maxAttempts: Number(process.env.OUTREACH_MAX_ATTEMPTS || 3),
    // Base URL used to build unsubscribe + open-tracking links.
    publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5173',
  },
};
