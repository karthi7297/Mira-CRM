/**
 * Cold-mail outreach — templates, campaigns, the send queue and the
 * suppression list. ORGANIZATION only (db-prd §2: the CRM pipeline is Rampex's).
 *
 * This module owns the *data*: what gets sent to whom, and when it is due.
 * The scheduler that actually drains the queue lives in automation.service.js,
 * which imports from here (never the other way round).
 *
 * Three things here are not optional if the mailbox is to survive:
 *   1. a suppression list — one more email to someone who opted out gets a
 *      Gmail account suspended;
 *   2. an unsubscribe footer + List-Unsubscribe headers on every message;
 *   3. a conservative daily cap and real spacing between sends.
 * All three are enforced below rather than left to the caller.
 */
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { LEAD_STATUSES } = require('./leads.service');
const { badRequest, conflict, notFound } = require('../utils/http');
const { requireFields, oneOf, str, toInt } = require('../utils/validate');
const { nid } = require('../utils/ids');

const TEMPLATE_CATEGORIES = ['COLD_OUTREACH', 'FOLLOW_UP', 'NURTURE', 'RE_ENGAGE'];
const CAMPAIGN_STATUSES = ['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED'];
const RECIPIENT_STATUSES = ['QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'UNSUBSCRIBED', 'BOUNCED', 'REPLIED'];
const SUPPRESSION_REASONS = ['UNSUBSCRIBED', 'BOUNCED', 'COMPLAINT', 'MANUAL'];
const LEAD_TYPES = ['INSTITUTION', 'DIRECT'];

/** 1×1 transparent GIF — the open-tracking pixel body. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const nowIso = () => new Date().toISOString();
const normEmail = (v) => str(v).toLowerCase();

/**
 * Start of *today* in the server's local timezone, as an absolute UTC instant.
 * Every timestamp we write is an ISO string, so a lexicographic `>=` on this
 * value is an exact "since local midnight" filter — and it agrees with the
 * local business-hours window the scheduler uses.
 */
function localDayStartIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const addDays = (date, n) => new Date(new Date(date).getTime() + n * 86400000).toISOString();

function token() {
  return crypto.randomBytes(16).toString('hex');
}

/** Parse `follow_up_days` (JSON array, or an array already) into day offsets. */
function parseDays(v) {
  let arr = [];
  if (Array.isArray(v)) arr = v;
  else {
    try { arr = JSON.parse(v || '[]'); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

/** Normalise a follow-up schedule: sorted, unique, starts at 0, max 6 steps. */
function normaliseDays(input) {
  let days = parseDays(input);
  if (!days.length) days = [0, 3, 7];
  days = [...new Set(days)].sort((a, b) => a - b);
  if (days[0] !== 0) days.unshift(0);
  return days.slice(0, 6);
}

/**
 * Next moment a campaign is allowed to send: inside its daily window and, by
 * default, on a weekday. Used to give a queued recipient a *meaningful*
 * `scheduled_at` so the UI can say "tomorrow 10:00" instead of "now".
 */
function nextSlot(from = new Date(), campaign = {}, weekdaysOnly = true) {
  const start = Number(campaign.window_start ?? 10);
  const end = Number(campaign.window_end ?? 18);
  const d = new Date(from);
  for (let i = 0; i < 14; i++) {
    const day = d.getDay(); // 0 Sun … 6 Sat
    const weekend = day === 0 || day === 6;
    if (!(weekend && weekdaysOnly)) {
      const h = d.getHours();
      if (h < start) { d.setHours(start, 0, 0, 0); return d.toISOString(); }
      if (h < end) return d.toISOString();
    }
    d.setDate(d.getDate() + 1);
    d.setHours(start, 0, 0, 0);
  }
  return d.toISOString();
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Plain-text placeholder substitution. */
function renderText(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => {
    const v = vars[k.toLowerCase()];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * HTML placeholder substitution. The template body is authored as plain text
 * and escaped first, so a stray `<` can never break the message; only the
 * values are escaped afterwards, and the unsubscribe link + tracking pixel are
 * injected raw because they are ours.
 */
function renderHtml(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => {
    const key = k.toLowerCase();
    if (key === 'unsubscribe' || key === 'unsubscribe_url') return vars.__unsubAnchor || '';
    if (key === 'tracking_pixel') return vars.__pixel || '';
    const v = vars[key];
    return v === undefined || v === null ? '' : escapeHtml(String(v));
  });
}

/** Minimal RFC-4180-ish CSV reader: quoted fields, doubled quotes, CRLF. */
function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const split = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
        } else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',' || ch === ';' || ch === '\t') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const hasHeader = header.includes('email');
  const cols = hasHeader ? header : ['email', 'name', 'organization'];
  const body = hasHeader ? lines.slice(1) : lines;
  return body
    .map((line) => {
      const cells = split(line);
      const obj = {};
      cols.forEach((c, i) => { obj[c] = cells[i] || ''; });
      return obj;
    })
    .filter((r) => str(r.email) !== '');
}

/** Append to the audit trail. Never throws — a logging failure must not stop a send. */
async function logEvent(recipient, type, detail = null) {
  try {
    await db.run(
      'INSERT INTO email_events (recipient_id, campaign_id, type, detail, created_at) VALUES (?,?,?,?,?)',
      [recipient?.id || null, recipient?.campaign_id || null, type, detail, nowIso()]
    );
  } catch (err) {
    console.error('[outreach] event log failed:', err.message);
  }
}

/* ------------------------------------------------------------------ *
 * Settings (automation_settings key/value)
 * ------------------------------------------------------------------ */

const SETTING_DEFAULTS = {
  outreach_enabled: '1',
  weekdays_only: '1',
  auto_enroll_enabled: '0',
  auto_enroll_campaign_id: '',
  auto_task_enabled: '1',
  stale_lead_days: '5',
};
/** Runtime state written by the scheduler — shown in the UI, never user-set. */
const INTERNAL_KEYS = ['last_tick_at', 'last_tick_summary', 'last_lead_run_at'];

/** Backticks work in both SQLite and MySQL, so `key` needs no dialect branch. */
async function getSettings() {
  const rows = await db.query('SELECT `key`, `value` FROM automation_settings');
  const out = { ...SETTING_DEFAULTS };
  for (const k of INTERNAL_KEYS) out[k] = null;
  for (const r of rows) {
    if (r.key in out || INTERNAL_KEYS.includes(r.key)) out[r.key] = r.value;
  }
  return out;
}

async function setSetting(key, value) {
  const existing = await db.get('SELECT `key` FROM automation_settings WHERE `key` = ?', [key]);
  if (existing) await db.run('UPDATE automation_settings SET `value` = ? WHERE `key` = ?', [String(value), key]);
  else await db.run('INSERT INTO automation_settings (`key`, `value`) VALUES (?,?)', [key, String(value)]);
}

/** Runtime state for the scheduler (last tick, summary). */
const setInternal = (key, value) => setSetting(key, value ?? '');

const asBool = (v) => (v === true || v === '1' || v === 'true' || v === 'on' ? '1' : '0');

async function updateSettings(body = {}) {
  if (body.outreach_enabled !== undefined) await setSetting('outreach_enabled', asBool(body.outreach_enabled));
  if (body.weekdays_only !== undefined) await setSetting('weekdays_only', asBool(body.weekdays_only));
  if (body.auto_enroll_enabled !== undefined) await setSetting('auto_enroll_enabled', asBool(body.auto_enroll_enabled));
  if (body.auto_task_enabled !== undefined) await setSetting('auto_task_enabled', asBool(body.auto_task_enabled));

  if (body.stale_lead_days !== undefined) {
    const n = toInt(body.stale_lead_days, 5);
    if (n < 1 || n > 90) throw badRequest('stale_lead_days must be between 1 and 90');
    await setSetting('stale_lead_days', n);
  }
  if (body.auto_enroll_campaign_id !== undefined) {
    const id = str(body.auto_enroll_campaign_id);
    if (id) {
      const c = await db.get('SELECT id FROM campaigns WHERE id = ?', [id]);
      if (!c) throw badRequest(`Unknown campaign: ${id}`);
    }
    await setSetting('auto_enroll_campaign_id', id);
  }
  return getSettings();
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

async function listTemplates() {
  return db.query('SELECT * FROM email_templates ORDER BY created_at DESC, template_key DESC');
}

async function getTemplate(id) {
  const t = await db.get('SELECT * FROM email_templates WHERE id = ?', [id]);
  if (!t) throw notFound('Template not found');
  return t;
}

async function createTemplate(body = {}) {
  requireFields(body, ['name', 'subject', 'body']);
  const category = body.category
    ? oneOf(str(body.category).toUpperCase(), TEMPLATE_CATEGORIES, 'template category')
    : 'COLD_OUTREACH';
  const id = await nid(db, 'TPL', 'email_templates');
  await db.run(
    'INSERT INTO email_templates (id, name, category, subject, body) VALUES (?,?,?,?,?)',
    [id, str(body.name), category, str(body.subject), str(body.body)]
  );
  return getTemplate(id);
}

async function updateTemplate(id, body = {}) {
  await getTemplate(id);
  const fields = ['name', 'subject', 'body'];
  for (const f of fields) {
    if (body[f] !== undefined) await db.run(`UPDATE email_templates SET ${f} = ? WHERE id = ?`, [str(body[f]), id]);
  }
  if (body.category !== undefined) {
    const category = oneOf(str(body.category).toUpperCase(), TEMPLATE_CATEGORIES, 'template category');
    await db.run('UPDATE email_templates SET category = ? WHERE id = ?', [category, id]);
  }
  await db.run('UPDATE email_templates SET updated_at = ? WHERE id = ?', [nowIso(), id]);
  return getTemplate(id);
}

async function deleteTemplate(id) {
  await getTemplate(id);
  const used = await db.count(
    'SELECT COUNT(*) FROM campaigns WHERE template_id = ? OR followup_template_id = ?',
    [id, id]
  );
  if (used) throw conflict(`Template is used by ${used} campaign(s) — detach or delete them first`);
  await db.run('DELETE FROM email_templates WHERE id = ?', [id]);
  return { id, deleted: true };
}

/* ------------------------------------------------------------------ *
 * Suppression list
 * ------------------------------------------------------------------ */

async function listSuppressions({ search = '' } = {}) {
  if (search) {
    return db.query(
      'SELECT * FROM suppressions WHERE email LIKE ? ORDER BY created_at DESC LIMIT 500',
      [`%${str(search).toLowerCase()}%`]
    );
  }
  return db.query('SELECT * FROM suppressions ORDER BY created_at DESC LIMIT 500');
}

async function isSuppressed(addr) {
  const e = normEmail(addr);
  if (!e) return false;
  return (await db.count('SELECT COUNT(*) FROM suppressions WHERE email = ?', [e])) > 0;
}

/**
 * Add an address to the suppression list and pull anything still queued for it.
 * Idempotent — re-suppressing an address keeps the original reason.
 */
async function suppress(addr, reason = 'MANUAL', detail = null) {
  const e = normEmail(addr);
  if (!EMAIL_RE.test(e)) throw badRequest('A valid email address is required');
  const why = oneOf(String(reason).toUpperCase(), SUPPRESSION_REASONS, 'suppression reason');

  const existing = await db.get('SELECT email FROM suppressions WHERE email = ?', [e]);
  if (!existing) {
    await db.run('INSERT INTO suppressions (email, reason, detail) VALUES (?,?,?)', [e, why, detail]);
  }
  // Anything mid-flight for this address stops here.
  await db.run(
    `UPDATE campaign_recipients SET status = 'UNSUBSCRIBED'
      WHERE email = ? AND status IN ('QUEUED','SENDING')`,
    [e]
  );
  return { email: e, reason: why };
}

async function unsuppress(addr) {
  const e = normEmail(addr);
  const changes = await db.run('DELETE FROM suppressions WHERE email = ?', [e]);
  if (!changes.changes) throw notFound('Address is not on the suppression list');
  return { email: e, removed: true };
}

/* ------------------------------------------------------------------ *
 * Campaigns
 * ------------------------------------------------------------------ */

const CAMPAIGN_SELECT = `
  SELECT c.*,
         t.name    AS template_name,
         t.subject AS template_subject,
         t.category AS template_category,
         f.name    AS followup_template_name
    FROM campaigns c
    LEFT JOIN email_templates t ON t.id = c.template_id
    LEFT JOIN email_templates f ON f.id = c.followup_template_id`;

async function listCampaigns() {
  const rows = await db.query(`${CAMPAIGN_SELECT} ORDER BY c.created_at DESC, c.campaign_key DESC`);
  for (const r of rows) {
    r.follow_up_days = parseDays(r.follow_up_days);
    r.stats = await campaignStats(r.id);
  }
  return rows;
}

async function getCampaign(id) {
  const c = await db.get(`${CAMPAIGN_SELECT} WHERE c.id = ?`, [id]);
  if (!c) throw notFound('Campaign not found');
  c.follow_up_days = parseDays(c.follow_up_days);
  c.stats = await campaignStats(id);
  return c;
}

function campaignPayload(body = {}, existing = null) {
  const out = {};
  if (body.name !== undefined || !existing) out.name = str(body.name);
  if (body.template_id !== undefined || !existing) out.template_id = str(body.template_id);
  if (body.followup_template_id !== undefined) out.followup_template_id = str(body.followup_template_id) || null;
  if (body.from_name !== undefined) out.from_name = str(body.from_name) || null;
  if (body.daily_limit !== undefined) {
    const n = toInt(body.daily_limit, 40);
    if (n < 1 || n > config.mail.dailyCap) {
      throw badRequest(`daily_limit must be between 1 and ${config.mail.dailyCap}`);
    }
    out.daily_limit = n;
  }
  if (body.window_start !== undefined) {
    const n = toInt(body.window_start, 10);
    if (n < 0 || n > 23) throw badRequest('window_start must be an hour between 0 and 23');
    out.window_start = n;
  }
  if (body.window_end !== undefined) {
    const n = toInt(body.window_end, 18);
    if (n < 1 || n > 24) throw badRequest('window_end must be an hour between 1 and 24');
    out.window_end = n;
  }
  if (body.follow_up_days !== undefined) out.follow_up_days = JSON.stringify(normaliseDays(body.follow_up_days));
  if (body.max_followups !== undefined) {
    const n = toInt(body.max_followups, 2);
    if (n < 0 || n > 5) throw badRequest('max_followups must be between 0 and 5');
    out.max_followups = n;
  }
  return out;
}

async function assertTemplates(templateId, followupId) {
  const t = await db.get('SELECT id FROM email_templates WHERE id = ?', [templateId]);
  if (!t) throw badRequest(`Unknown template: ${templateId}`);
  if (followupId) {
    const f = await db.get('SELECT id FROM email_templates WHERE id = ?', [followupId]);
    if (!f) throw badRequest(`Unknown follow-up template: ${followupId}`);
  }
}

async function createCampaign(body = {}, actorUserId = null) {
  requireFields(body, ['name', 'template_id']);
  const p = campaignPayload(body);
  await assertTemplates(p.template_id, p.followup_template_id);

  const id = await nid(db, 'CMP', 'campaigns');
  await db.run(
    `INSERT INTO campaigns (id, name, template_id, followup_template_id, status, from_name,
                            daily_limit, window_start, window_end, follow_up_days, max_followups, created_by)
     VALUES (?,?,?,?, 'DRAFT', ?,?,?,?,?,?,?)`,
    [
      id,
      p.name,
      p.template_id,
      p.followup_template_id || null,
      p.from_name ?? config.mail.fromName,
      p.daily_limit ?? 40,
      p.window_start ?? 10,
      p.window_end ?? 18,
      p.follow_up_days ?? '[0,3,7]',
      p.max_followups ?? 2,
      actorUserId,
    ]
  );
  return getCampaign(id);
}

async function updateCampaign(id, body = {}) {
  const current = await getCampaign(id);
  const p = campaignPayload(body, current);
  if (p.template_id || p.followup_template_id !== undefined) {
    await assertTemplates(p.template_id || current.template_id, p.followup_template_id);
  }
  const keys = Object.keys(p);
  if (!keys.length) return current;
  await db.run(
    `UPDATE campaigns SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...keys.map((k) => p[k]), nowIso(), id]
  );
  return getCampaign(id);
}

async function updateCampaignStatus(id, status) {
  const c = await getCampaign(id);
  const next = oneOf(str(status).toUpperCase(), CAMPAIGN_STATUSES, 'campaign status');
  if (c.status === 'COMPLETED' && next !== 'COMPLETED') {
    throw conflict('A completed campaign cannot be restarted — duplicate it into a new campaign');
  }
  await db.run('UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?', [next, nowIso(), id]);
  return getCampaign(id);
}

async function deleteCampaign(id) {
  const c = await getCampaign(id);
  if (c.status === 'RUNNING') throw conflict('Pause the campaign before deleting it');
  await db.run('DELETE FROM campaign_recipients WHERE campaign_id = ?', [id]); // cascades events
  await db.run('DELETE FROM email_events WHERE campaign_id = ?', [id]);
  await db.run('DELETE FROM campaigns WHERE id = ?', [id]);
  return { id, deleted: true };
}

/* ------------------------------------------------------------------ *
 * Audience — getting prospects into the queue
 * ------------------------------------------------------------------ */

/**
 * Insert prospects into a campaign's queue.
 *
 * Deduplicates against the campaign's existing recipients *and* within the
 * batch, and drops anything already on the suppression list. Returns a
 * breakdown so the UI can explain exactly what it skipped and why.
 *
 * @param prospects [{ email, name, organization, lead_id }]
 */
async function enqueue(campaignId, prospects = [], { scheduledAt = null } = {}) {
  const campaign = await getCampaign(campaignId);
  const settings = await getSettings();
  const firstSlot = scheduledAt || nextSlot(new Date(), campaign, settings.weekdays_only === '1');

  const seen = new Set(
    (await db.query('SELECT email FROM campaign_recipients WHERE campaign_id = ?', [campaignId]))
      .map((r) => normEmail(r.email))
  );
  const blocked = new Set((await db.query('SELECT email FROM suppressions')).map((r) => normEmail(r.email)));

  const stats = { added: 0, duplicate: 0, suppressed: 0, invalid: 0 };
  for (const p of prospects) {
    const addr = normEmail(p?.email);
    if (!EMAIL_RE.test(addr)) { stats.invalid++; continue; }
    if (blocked.has(addr)) { stats.suppressed++; continue; }
    if (seen.has(addr)) { stats.duplicate++; continue; }

    const id = await nid(db, 'RCP', 'campaign_recipients');
    await db.run(
      `INSERT INTO campaign_recipients
         (id, campaign_id, lead_id, email, name, organization, step, scheduled_at, status, open_token)
       VALUES (?,?,?,?,?,?, 0, ?, 'QUEUED', ?)`,
      [
        id,
        campaign.id,
        p.lead_id || null,
        addr,
        str(p.name) || null,
        str(p.organization) || null,
        firstSlot,
        token(),
      ]
    );
    seen.add(addr);
    stats.added++;
  }
  return stats;
}

/** Pull matching leads out of the CRM pipeline into a campaign. */
async function buildAudience(campaignId, { status = '', lead_type = '', search = '', limit = 200 } = {}) {
  await getCampaign(campaignId);

  let sql = "SELECT * FROM leads WHERE email IS NOT NULL AND TRIM(email) <> ''";
  const params = [];
  if (status) {
    sql += ' AND status = ?';
    params.push(oneOf(str(status).toUpperCase(), LEAD_STATUSES, 'lead status'));
  } else {
    sql += " AND status IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL')";
  }
  if (lead_type) {
    sql += ' AND lead_type = ?';
    params.push(oneOf(str(lead_type).toUpperCase(), LEAD_TYPES, 'lead type'));
  }
  if (search) {
    sql += ' AND (organization LIKE ? OR contact_person LIKE ? OR id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
  params.push(Math.min(Math.max(toInt(limit, 200), 1), 1000));

  const leads = await db.query(sql, params);
  const result = await enqueue(
    campaignId,
    leads.map((l) => ({
      email: l.email,
      name: l.contact_person,
      organization: l.organization,
      lead_id: l.id,
    }))
  );
  return { ...result, matched: leads.length };
}

/** Manual paste or CSV upload of prospect rows. */
async function importProspects(campaignId, { csv = '', rows = null } = {}) {
  const list = Array.isArray(rows) && rows.length ? rows : parseCsv(csv);
  if (!list.length) throw badRequest('No rows with an email address were found');
  return { ...(await enqueue(campaignId, list)), parsed: list.length };
}

/** Mark a recipient as having replied — stops its sequence. */
async function markReplied(campaignId, recipientId) {
  const r = await db.get('SELECT * FROM campaign_recipients WHERE id = ? AND campaign_id = ?', [recipientId, campaignId]);
  if (!r) throw notFound('Recipient not found');
  await db.run("UPDATE campaign_recipients SET status = 'REPLIED' WHERE id = ?", [r.id]);
  await logEvent(r, 'REPLIED', 'Marked as replied by user');
  return db.get('SELECT * FROM campaign_recipients WHERE id = ?', [r.id]);
}

/** Drop one queued recipient without touching the suppression list. */
async function removeRecipient(campaignId, recipientId) {
  const r = await db.get('SELECT * FROM campaign_recipients WHERE id = ? AND campaign_id = ?', [recipientId, campaignId]);
  if (!r) throw notFound('Recipient not found');
  if (r.status === 'SENDING') throw conflict('Recipient is mid-send — try again in a moment');
  await db.run('DELETE FROM campaign_recipients WHERE id = ?', [r.id]);
  return { id: recipientId, deleted: true };
}

/* ------------------------------------------------------------------ *
 * Reading the queue back out
 * ------------------------------------------------------------------ */

async function listRecipients(campaignId, { status = '', search = '', limit = 200 } = {}) {
  await getCampaign(campaignId);
  let sql = `
    SELECT r.*,
           (SELECT COUNT(*) FROM email_events e WHERE e.recipient_id = r.id AND e.type = 'SENT') AS steps_sent,
           l.program     AS program,
           l.requirement AS requirement
      FROM campaign_recipients r
      LEFT JOIN leads l ON l.id = r.lead_id
     WHERE r.campaign_id = ?`;
  const params = [campaignId];
  if (status) {
    sql += ' AND r.status = ?';
    params.push(oneOf(str(status).toUpperCase(), RECIPIENT_STATUSES, 'recipient status'));
  }
  if (search) {
    sql += ' AND (r.email LIKE ? OR r.name LIKE ? OR r.organization LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY r.scheduled_at ASC, r.recipient_key ASC LIMIT ?';
  params.push(Math.min(Math.max(toInt(limit, 200), 1), 1000));
  return db.query(sql, params);
}

async function campaignStats(campaignId) {
  const byStatus = {};
  for (const r of await db.query(
    'SELECT status, COUNT(*) AS n FROM campaign_recipients WHERE campaign_id = ? GROUP BY status',
    [campaignId]
  )) {
    byStatus[r.status] = Number(r.n);
  }

  const countEvents = (type, since = null) =>
    since
      ? db.count("SELECT COUNT(*) FROM email_events WHERE campaign_id = ? AND type = ? AND created_at >= ?", [campaignId, type, since])
      : db.count('SELECT COUNT(*) FROM email_events WHERE campaign_id = ? AND type = ?', [campaignId, type]);

  const recipients = await db.count('SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?', [campaignId]);
  const sentEvents = await countEvents('SENT');
  const emailed = await db.count(
    "SELECT COUNT(DISTINCT recipient_id) FROM email_events WHERE campaign_id = ? AND type = 'SENT'",
    [campaignId]
  );
  const opens = await countEvents('OPEN');
  const opened = await db.count(
    'SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND open_count > 0',
    [campaignId]
  );
  const bounced = await countEvents('BOUNCED');
  const sentToday = await countEvents('SENT', localDayStartIso());

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  return {
    recipients,
    queued: (byStatus.QUEUED || 0) + (byStatus.SENDING || 0),
    completed: byStatus.SENT || 0,
    failed: byStatus.FAILED || 0,
    bounced: byStatus.BOUNCED || 0,
    unsubscribed: byStatus.UNSUBSCRIBED || 0,
    replied: byStatus.REPLIED || 0,
    skipped: byStatus.SKIPPED || 0,
    sent_events: sentEvents,
    emailed,
    sent_today: sentToday,
    opens,
    opened,
    bounced_events: bounced,
    open_rate: pct(opened, emailed),
    reply_rate: pct(byStatus.REPLIED || 0, emailed),
    bounce_rate: pct(bounced, sentEvents),
  };
}

/* ------------------------------------------------------------------ *
 * Message assembly
 * ------------------------------------------------------------------ */

/** The template to use for a given step: the follow-up one when step > 0. */
async function templateForStep(campaign, step) {
  const useFollowUp = Number(step) > 0 && campaign.followup_template_id;
  const id = useFollowUp ? campaign.followup_template_id : campaign.template_id;
  const t = await db.get('SELECT * FROM email_templates WHERE id = ?', [id]);
  if (!t) throw badRequest(`Campaign template ${id} is missing — it may have been deleted`);
  return t;
}

/**
 * Merge a recipient row + template into a sendable message.
 * Every message carries the unsubscribe footer and the tracking pixel; the
 * footer is appended even when the template omits `{{unsubscribe}}`.
 */
function buildMessage(row, campaign, template, opts = {}) {
  const base = String(config.mail.publicBaseUrl || '').replace(/\/+$/, '');
  const unsubUrl = `${base}/api/public/unsubscribe/${row.open_token}`;
  const openUrl = `${base}/api/public/open/${row.open_token}.gif`;
  const sender = campaign.from_name || config.mail.fromName || 'the Rampex team';

  const vars = {
    name: row.name || 'there',
    contact_person: row.name || 'there',
    organization: row.organization || 'your institution',
    email: row.email,
    program: row.lead_program || 'our training programs',
    requirement: row.lead_requirement || '',
    sender,
  };

  const isFollowUp = Number(row.step) > 0;

  const unsubAnchor = `<a href="${unsubUrl}" style="color:#4f46e5">Unsubscribe</a>`;
  // A preview is not a send: emitting the pixel would fire a bogus tracking
  // request (with a placeholder token) every time someone opens the preview,
  // polluting the open counters and the browser console. Omit it entirely.
  const pixel = opts.preview ? '' : `<img src="${openUrl}" width="1" height="1" alt="" style="display:none" />`;
  const merged = { ...vars, unsubscribe: unsubUrl, unsubscribe_url: unsubUrl, __unsubAnchor: unsubAnchor, __pixel: pixel };

  // The subject is a template too — `{{organization}}` in a subject line is the
  // single biggest driver of open rate, so it must be merged like the body.
  const subjectRaw = renderText(template.subject || '', merged);
  const subject = isFollowUp && !/^re:/i.test(subjectRaw) ? `Re: ${subjectRaw}` : subjectRaw;

  const footerText = `\n\n--\nYou are receiving this because we believe ${vars.organization} could benefit from our training programs.\nUnsubscribe: ${unsubUrl}`;
  const text = renderText(template.body, merged) + footerText;

  const paragraphs = renderHtml(escapeHtml(template.body), merged)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc">
<div style="max-width:600px;margin:0 auto;padding:28px 24px;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
${paragraphs}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 14px" />
<p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">
You are receiving this because we believe ${escapeHtml(vars.organization)} could benefit from our training programs.<br />
Not interested? ${unsubAnchor} and we will not contact you again.
</p>
</div>
${pixel}
</body></html>`;

  return {
    subject,
    text,
    html,
    unsubUrl,
    openUrl,
    headers: {
      // Gmail/Outlook surface a native Unsubscribe button from these. Removing
      // them measurably increases spam complaints — they stay.
      'List-Unsubscribe': `<${unsubUrl}>, <mailto:${config.mail.user}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/** Render a template against sample data so the UI can preview it. */
async function preview({ template_id, sample = {} }) {
  const template = await getTemplate(template_id);
  const fake = {
    id: 'RCP-PREVIEW',
    campaign_id: 'CMP-PREVIEW',
    step: 0,
    open_token: 'preview0000preview0000preview0000',
    email: sample.email || 'principal@example.edu',
    name: sample.name || 'Dr. Meera',
    organization: sample.organization || 'Example Institute',
    lead_program: sample.program || 'AI & Machine Learning',
    lead_requirement: sample.requirement || 'AI/ML training for 3rd year students',
  };
  const campaign = {
    from_name: sample.sender || config.mail.fromName,
    template_id: template.id,
    followup_template_id: null,
  };
  const msg = buildMessage(fake, campaign, template, { preview: true });
  return { subject: msg.subject, text: msg.text, html: msg.html, unsubscribe_url: msg.unsubUrl };
}

/* ------------------------------------------------------------------ *
 * Public surfaces — open tracking + unsubscribe
 * ------------------------------------------------------------------ */

/**
 * Record an open and hand back the pixel.
 * Only the *first* open writes an event; later ones just bump the counter, so
 * a long email thread cannot flood the activity feed.
 */
async function trackOpen(tok) {
  const r = await db.get('SELECT * FROM campaign_recipients WHERE open_token = ?', [tok]);
  if (r) {
    if (!r.first_opened_at) {
      await db.run(
        'UPDATE campaign_recipients SET first_opened_at = ?, open_count = open_count + 1 WHERE id = ?',
        [nowIso(), r.id]
      );
      await logEvent(r, 'OPEN', 'First open');
    } else {
      await db.run('UPDATE campaign_recipients SET open_count = open_count + 1 WHERE id = ?', [r.id]);
    }
  }
  return PIXEL;
}

/**
 * Unsubscribe by recipient token. Adds to the suppression list (which also
 * pulls every other queued message for that address) and stops this sequence.
 */
async function unsubscribe(tok, detail = 'Recipient unsubscribed') {
  const r = await findRecipientByToken(tok);
  if (!r) return null;
  await suppress(r.email, 'UNSUBSCRIBED', detail);
  await db.run("UPDATE campaign_recipients SET status = 'UNSUBSCRIBED' WHERE id = ?", [r.id]);
  await logEvent(r, 'UNSUBSCRIBED', detail);
  return r;
}

/** Look a recipient up by its public token (open pixel / unsubscribe links). */
const findRecipientByToken = (tok) =>
  db.get('SELECT * FROM campaign_recipients WHERE open_token = ?', [tok]);

/** Shared shell for the two public HTML pages (confirm + done). */
function publicPage({ title, body }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<main style="max-width:460px;width:100%;margin:24px;padding:32px;background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,.08)">
${body}
</main></body></html>`;
}

/** Step 1 of unsubscribe: a confirmation page, so link scanners cannot opt people out. */
function unsubscribeConfirmPage(tok) {
  return publicPage({
    title: 'Confirm unsubscribe',
    body: `
      <h1 style="margin:0 0 8px;font-size:20px">Unsubscribe</h1>
      <p style="margin:0 0 22px;color:#475569;font-size:14px;line-height:1.6">
        Click the button below and we will stop emailing this address. This takes effect immediately.
      </p>
      <form method="POST" action="/api/public/unsubscribe/${escapeHtml(tok)}">
        <button type="submit" style="width:100%;padding:12px 16px;border:0;border-radius:9px;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;cursor:pointer">
          Yes, unsubscribe me
        </button>
      </form>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:12px">
        Changed your mind? Just close this page — nothing happens until you click.
      </p>`,
  });
}

function unsubscribeDonePage(addr) {
  return publicPage({
    title: 'Unsubscribed',
    body: `
      <h1 style="margin:0 0 8px;font-size:20px">You are unsubscribed</h1>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6">
        <b>${escapeHtml(addr)}</b> has been removed from our mailing list and added to our
        do-not-contact list. You will not receive further outreach from us.
      </p>`,
  });
}

function notFoundPage() {
  return publicPage({
    title: 'Link expired',
    body: `
      <h1 style="margin:0 0 8px;font-size:20px">This link is no longer valid</h1>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6">
        The unsubscribe link may have been truncated by your email client. Please reply to any
        message from us with “unsubscribe” and we will remove you manually.
      </p>`,
  });
}

module.exports = {
  // constants
  TEMPLATE_CATEGORIES,
  CAMPAIGN_STATUSES,
  RECIPIENT_STATUSES,
  SUPPRESSION_REASONS,
  SETTING_DEFAULTS,
  PIXEL,
  // helpers reused by the scheduler
  nowIso,
  localDayStartIso,
  addDays,
  nextSlot,
  parseDays,
  normaliseDays,
  logEvent,
  buildMessage,
  templateForStep,
  // settings
  getSettings,
  updateSettings,
  setInternal,
  // templates
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  // suppression
  listSuppressions,
  isSuppressed,
  suppress,
  unsuppress,
  // campaigns
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
  campaignStats,
  // audience + queue
  enqueue,
  buildAudience,
  importProspects,
  listRecipients,
  markReplied,
  removeRecipient,
  parseCsv,
  // public
  preview,
  trackOpen,
  unsubscribe,
  findRecipientByToken,
  unsubscribeConfirmPage,
  unsubscribeDonePage,
  notFoundPage,
};
