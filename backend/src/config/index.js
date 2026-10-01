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

  // Credentials emails (Nodemailer) — see src/config/mailer.js for SMTP auth.
  mail: {
    appName: process.env.APP_NAME || 'Mira',
    loginUrl: process.env.APPLICATION_LOGIN_URL || 'http://localhost:5173/login',
  },
};
