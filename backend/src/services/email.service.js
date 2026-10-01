/**
 * Outbound mail transport (nodemailer over SMTP).
 *
 * Gmail + App Password is the intended setup. The service is deliberately
 * forgiving: with no credentials it reports `configured: false` and refuses to
 * send, so campaigns still queue and schedule correctly and nothing pretends to
 * have gone out. Drop the credentials into backend/.env and it starts working
 * with no code change.
 *
 * The password never leaves this module — `status()` returns a masked address
 * and nothing else, and no error path echoes the credential.
 */
const nodemailer = require('nodemailer');
const dns = require('node:dns');
const net = require('node:net');
const config = require('../config');

let transporter = null;
let transporterKey = '';
let lastError = null;
let lastCheckedAt = null;
// `connected` must mean "a handshake actually succeeded", not "credentials
// exist". Without this flag status() reports connected:true the moment SMTP_USER
// is set, even if the password is wrong and nothing can ever be sent.
let lastVerifiedOk = false;

function isConfigured() {
  const { user, pass } = config.mail;
  return Boolean(user && pass);
}

/**
 * Resolve the SMTP host with the OS resolver (dns.lookup).
 *
 * nodemailer resolves hostnames itself using a c-ares `dns.Resolver`
 * (resolve4/resolve6). On networks where outbound port 53 to the configured
 * resolver is slow, filtered, or intercepted — VPNs, corporate networks, and
 * sandboxes — that call can take tens of seconds and stalls the very first
 * connect. The OS resolver honours the system cache and hosts file and returns
 * in milliseconds. We resolve once and hand nodemailer a literal IP, which it
 * detects via net.isIP and skips resolution entirely.
 *
 * The TLS server name is passed separately so certificate validation still
 * happens against the real hostname, not the IP.
 */
let dnsCache = null; // { host, ip, at }
const DNS_TTL_MS = 5 * 60 * 1000;
const DNS_TIMEOUT_MS = 5000;

function resolveHost() {
  const host = config.mail.host;
  // Already a literal address (or a unix path) — nothing to resolve.
  if (!host || net.isIP(host)) return Promise.resolve({ host, ip: null });

  if (dnsCache && dnsCache.host === host && Date.now() - dnsCache.at < DNS_TTL_MS) {
    return Promise.resolve({ host, ip: dnsCache.ip });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ip) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ip) dnsCache = { host, ip, at: Date.now() };
      resolve({ host, ip: ip || null });
    };
    const timer = setTimeout(() => finish(null), DNS_TIMEOUT_MS);
    try {
      dns.lookup(host, { family: 4 }, (err, address) => finish(err ? null : address));
    } catch {
      finish(null);
    }
  });
}

/** Transport options, with the host pre-resolved to an IP where possible. */
async function transportOptions(extra = {}) {
  const { host, ip } = await resolveHost();
  const opts = {
    host: ip || host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    ...extra,
  };
  // Keep TLS verification pinned to the hostname when we connect by IP.
  if (ip && ip !== host) opts.tls = { servername: host };
  return opts;
}

async function getTransporter() {
  if (!isConfigured()) return null;
  const { host, ip } = await resolveHost();
  const key = `${host}|${ip || ''}|${config.mail.port}|${config.mail.secure}`;
  if (transporter && transporterKey === key) return transporter;
  if (transporter) {
    // The address behind the name changed — retire the old pooled sockets.
    try { transporter.close(); } catch { /* already closed */ }
    transporter = null;
  }
  transporter = nodemailer.createTransport(await transportOptions({
    // One connection, reused — Gmail dislikes a new session per message.
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  }));
  transporterKey = key;
  return transporter;
}

function fromHeader() {
  const { fromName, user } = config.mail;
  return fromName ? `"${fromName}" <${user}>` : user;
}

/** Masked, UI-safe status. Contains no secret. */
function status() {
  const { host, port, secure, user, dailyCap } = config.mail;
  return {
    configured: isConfigured(),
    connected: isConfigured() && lastVerifiedOk && !lastError,
    host,
    port,
    secure,
    user: user ? user.replace(/^(.)[^@]*(@.*)?$/, (_m, a, b) => `${a}***${b || ''}`) : null,
    last_error: lastError,
    last_checked_at: lastCheckedAt,
    daily_cap: dailyCap,
  };
}

/** Reject if a promise has not settled in time, so a check can never hang. */
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

/**
 * Live SMTP handshake — powers "Test connection" and the boot check.
 *
 * Uses its OWN non-pooled transport rather than the shared pooled one. Running
 * the handshake against the pool can wait for a free socket that never comes,
 * and a short-lived probe can't disturb a campaign mid-send.
 *
 * The whole check is bounded: DNS resolution, connect, TLS, and AUTH together
 * must finish inside VERIFY_TIMEOUT_MS, or the caller gets a plain-English
 * error instead of a request that hangs until the client gives up.
 */
const VERIFY_TIMEOUT_MS = 25000;

async function verify() {
  lastCheckedAt = new Date().toISOString();
  if (!isConfigured()) {
    lastError = 'No SMTP credentials configured yet';
    lastVerifiedOk = false;
    return status();
  }
  let probe = null;
  try {
    probe = nodemailer.createTransport(await transportOptions({ socketTimeout: 20000 }));
    await withTimeout(
      probe.verify(),
      VERIFY_TIMEOUT_MS,
      `No response from ${config.mail.host}:${config.mail.port} within ${VERIFY_TIMEOUT_MS / 1000}s`,
    );
    lastError = null;
    lastVerifiedOk = true;
  } catch (err) {
    lastError = err.message;
    lastVerifiedOk = false;
  } finally {
    // Always tear the probe down, otherwise every check leaks a connection.
    try { probe?.close(); } catch { /* already closed */ }
  }
  return status();
}

/** Send one message. Throws a tagged error when mail is not connected. */
async function send({ to, subject, text, html, replyTo, headers }) {
  if (!isConfigured()) {
    const err = new Error('Email is not connected — add SMTP credentials to backend/.env');
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }
  const transport = await getTransporter();
  const info = await transport.sendMail({
    from: fromHeader(),
    to,
    subject,
    text,
    html,
    replyTo: replyTo || config.mail.replyTo || undefined,
    // `headers` carries List-Unsubscribe / List-Unsubscribe-Post, which is what
    // makes Gmail and Outlook show their native "Unsubscribe" button. That
    // button is a strong deliverability signal — spam complaints drop sharply.
    headers: headers || undefined,
  });
  return {
    messageId: info.messageId,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
  };
}

/** Drop the cached transport so an env change applies without a restart. */
function reset() {
  try { transporter?.close(); } catch { /* already closed */ }
  transporter = null;
  transporterKey = '';
  dnsCache = null;
  lastError = null;
  lastVerifiedOk = false;
}

module.exports = { isConfigured, status, verify, send, reset, fromHeader };
