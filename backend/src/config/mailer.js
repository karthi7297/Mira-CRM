/**
 * Nodemailer transport — Gmail SMTP, credentials from env ONLY.
 *
 *   EMAIL_USER            sender Gmail address
 *   EMAIL_APP_PASSWORD    Gmail app password (never a normal login password)
 *   EMAIL_TRANSPORT       smtp (default) | json (offline test transport, no network)
 *
 * When EMAIL_USER / EMAIL_APP_PASSWORD are missing (or still the template
 * placeholders) the mailer is "unconfigured": sendMail is skipped and callers
 * get { sent:false, reason:'not-configured' } — account creation never fails
 * because of email.
 */
const nodemailer = require('nodemailer');

const PLACEHOLDER = /^your_/i;

function mailSettings() {
  return {
    user: String(process.env.EMAIL_USER || '').trim(),
    pass: String(process.env.EMAIL_APP_PASSWORD || '').trim(),
    transport: String(process.env.EMAIL_TRANSPORT || 'smtp').toLowerCase(),
  };
}

function isMailConfigured() {
  const { user, pass, transport } = mailSettings();
  if (transport === 'json') return Boolean(user); // offline test transport
  return Boolean(user && pass) && !PLACEHOLDER.test(user) && !PLACEHOLDER.test(pass);
}

let transporter = null;
let transportKey = null;

/** Lazily built and cached; rebuilt if env changes (tests re-load env). */
function getTransporter() {
  const { user, pass, transport } = mailSettings();
  const key = `${transport}:${user}:${pass}`;
  if (transporter && transportKey === key) return transporter;
  if (!isMailConfigured()) {
    transporter = null;
    transportKey = key;
    return null;
  }
  transporter = transport === 'json'
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      secure: true,
      port: 465,
    });
  transportKey = key;
  return transporter;
}

function getFrom() {
  const { user } = mailSettings();
  const name = process.env.APP_NAME || 'Mira';
  return user ? `"${name}" <${user}>` : `"${name}" <no-reply@localhost>`;
}

module.exports = { isMailConfigured, getTransporter, getFrom };
