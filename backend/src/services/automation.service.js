/**
 * Outreach scheduler + lead automation — the engine behind cold mail.
 *
 * Two independent jobs share one tick:
 *
 *   1. **Send cycle** — drain `campaign_recipients` where `status='QUEUED'` and
 *      `scheduled_at` has passed, respecting (in this order) the global daily
 *      cap, each campaign's own daily limit, its business-hours window, and a
 *      minimum gap between two sends. A handful of messages per tick with real
 *      spacing is what keeps a Gmail account alive; blasting the queue is what
 *      gets it suspended.
 *
 *   2. **Lead automation** — auto-enrol fresh leads into a chosen campaign and
 *      log a nudge on any lead that has gone quiet, so the pipeline never
 *      depends on someone remembering to work it.
 *
 * Every failure mode degrades instead of crashing: no SMTP credentials means
 * the queue keeps building and nothing is sent (never a fake success), and a
 * bounce is both recorded and pushed onto the suppression list.
 *
 * The scheduler owns no tables of its own — all persistence goes through
 * campaign.service.js, which this module imports (never the reverse).
 */
const db = require('../db');
const config = require('../config');
const email = require('./email.service');
const campaign = require('./campaign.service');

/** How often the lead-automation half is allowed to run (the send half runs every tick). */
const LEAD_RUN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Permanent-failure SMTP responses. Gmail's 550/551/553 family and the usual
 * "no such user" phrasings mean retrying is pointless — the address is dead
 * and must go on the suppression list, or we keep hammering it forever.
 */
const BOUNCE_RE = /(?:\b5(?:5[0-4]|\.1\.[01])\b)|user unknown|unknown user|does not exist|no such user|mailbox (?:full|unavailable|not found)|invalid recipient|recipient (?:address )?rejected|address rejected/i;

let timer = null;
let intervalMs = 0; // current scheduler cadence, so a saved tick_ms can re-arm it
let running = false;
let lastLeadRun = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Is `date` inside the campaign's local send window? */
function withinWindow(c, date = new Date()) {
  const h = date.getHours();
  const start = Number(c.window_start ?? 10);
  const end = Number(c.window_end ?? 18);
  return h >= start && h < end;
}

const countSentSince = (since, campaignId = null) =>
  campaignId
    ? db.count(
        "SELECT COUNT(*) FROM email_events WHERE campaign_id = ? AND type = 'SENT' AND created_at >= ?",
        [campaignId, since]
      )
    : db.count("SELECT COUNT(*) FROM email_events WHERE type = 'SENT' AND created_at >= ?", [since]);

/* ------------------------------------------------------------------ *
 * Sending one message
 * ------------------------------------------------------------------ */

/** Queue the next follow-up step, if the campaign's schedule has one left. */
async function scheduleNextStep(row, settings) {
  const days = campaign.parseDays(row.follow_up_days);
  const maxFollowups = Number(row.max_followups ?? 2);
  const nextIdx = Number(row.step) + 1;

  if (!days.length || nextIdx >= days.length || nextIdx > maxFollowups) return null;

  const gapDays = Math.max(days[nextIdx] - days[row.step], 0);
  const due = new Date(campaign.addDays(campaign.nowIso(), gapDays));
  const at = campaign.nextSlot(due, row, settings.weekdays_only === '1');

  await db.run(
    "UPDATE campaign_recipients SET status = 'QUEUED', step = ?, scheduled_at = ? WHERE id = ?",
    [nextIdx, at, row.id]
  );
  await campaign.logEvent(row, 'SCHEDULED', `Follow-up step ${nextIdx + 1} due ${at}`);
  return at;
}

/** Decide what a failed send means and record it. */
async function handleSendError(row, err) {
  // Nothing left the building — the transport has no credentials. Put the
  // recipient straight back and let the caller stop the cycle; burning an
  // attempt here would silently exhaust the retry budget.
  if (err.code === 'MAIL_NOT_CONFIGURED') {
    await db.run("UPDATE campaign_recipients SET status = 'QUEUED', attempts = ? WHERE id = ?", [
      Number(row.attempts),
      row.id,
    ]);
    return { outcome: 'NOT_CONFIGURED' };
  }

  const message = String(err.message || 'Send failed').slice(0, 500);
  const attempts = Number(row.attempts) + 1;

  if (BOUNCE_RE.test(message)) {
    await db.run("UPDATE campaign_recipients SET status = 'BOUNCED', last_error = ? WHERE id = ?", [message, row.id]);
    await campaign.logEvent(row, 'BOUNCED', message);
    await campaign.suppress(row.email, 'BOUNCED', message).catch(() => {});
    return { outcome: 'BOUNCED' };
  }

  if (attempts >= (await campaign.getLimits()).max_attempts) {
    await db.run("UPDATE campaign_recipients SET status = 'FAILED', last_error = ? WHERE id = ?", [message, row.id]);
    await campaign.logEvent(row, 'FAILED', message);
    return { outcome: 'FAILED' };
  }

  // Transient (greylisting, timeout, 4xx) — back off 10 min, then 20, …
  const retryAt = new Date(Date.now() + 600000 * attempts).toISOString();
  await db.run("UPDATE campaign_recipients SET status = 'QUEUED', scheduled_at = ?, last_error = ? WHERE id = ?", [
    retryAt,
    message,
    row.id,
  ]);
  await campaign.logEvent(row, 'RETRY', `Attempt ${attempts} failed: ${message}`);
  return { outcome: 'RETRY' };
}

/**
 * Render and send one queued recipient.
 * `row` is a join of campaign_recipients + its campaign + (optionally) its lead.
 */
async function sendOne(row, settings) {
  // Re-check the suppression list: it may have grown since this row was queued.
  if (await campaign.isSuppressed(row.email)) {
    await db.run("UPDATE campaign_recipients SET status = 'SKIPPED', last_error = 'On the suppression list' WHERE id = ?", [row.id]);
    await campaign.logEvent(row, 'SKIPPED', 'On the suppression list');
    return { outcome: 'SKIPPED' };
  }

  const campaignRow = {
    id: row.campaign_id,
    from_name: row.from_name,
    template_id: row.template_id,
    followup_template_id: row.followup_template_id,
  };
  const template = await campaign.templateForStep(campaignRow, row.step);
  const message = campaign.buildMessage(row, campaignRow, template);

  // Count the attempt *before* the call so a crash mid-send still burns one.
  await db.run("UPDATE campaign_recipients SET status = 'SENDING', attempts = attempts + 1 WHERE id = ?", [row.id]);

  try {
    const out = await email.send({
      to: row.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
    });
    await db.run(
      "UPDATE campaign_recipients SET status = 'SENT', sent_at = ?, message_id = ?, last_error = NULL WHERE id = ?",
      [campaign.nowIso(), out.messageId || null, row.id]
    );
    await campaign.logEvent(row, 'SENT', `Step ${Number(row.step) + 1}${Number(row.step) ? ' (follow-up)' : ''}`);
    await scheduleNextStep(row, settings);
    return { outcome: 'SENT', to: row.email };
  } catch (err) {
    return handleSendError(row, err);
  }
}

/* ------------------------------------------------------------------ *
 * Lead automation
 * ------------------------------------------------------------------ */

/**
 * Keep the pipeline moving without a human:
 *   - auto-enrol new/contacted leads that have an email into the chosen campaign
 *   - log an automated nudge on leads that have gone quiet
 */
async function runLeadAutomation(settings) {
  const out = { enrolled: 0, nudged: 0 };

  // --- 1. auto-enrol -------------------------------------------------
  if (settings.auto_enroll_enabled === '1' && settings.auto_enroll_campaign_id) {
    try {
      const target = await campaign.getCampaign(settings.auto_enroll_campaign_id);
      if (target.status === 'RUNNING') {
        const leads = await db.query(
          `SELECT * FROM leads
            WHERE status IN ('NEW','CONTACTED')
              AND email IS NOT NULL AND TRIM(email) <> ''
              AND id NOT IN (SELECT lead_id FROM campaign_recipients
                              WHERE campaign_id = ? AND lead_id IS NOT NULL)
            ORDER BY created_at ASC, id ASC
            LIMIT 50`,
          [target.id]
        );
        if (leads.length) {
          const res = await campaign.enqueue(
            target.id,
            leads.map((l) => ({
              email: l.email,
              name: l.contact_person,
              organization: l.organization,
              lead_id: l.id,
            }))
          );
          out.enrolled = res.added;
        }
      }
    } catch (err) {
      out.enroll_error = err.message;
    }
  }

  // --- 2. nudge leads that have gone quiet ---------------------------
  if (settings.auto_task_enabled === '1') {
    const days = Number(settings.stale_lead_days || 5);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const stale = await db.query(
      `SELECT l.* FROM leads l
        WHERE l.status IN ('NEW','CONTACTED','QUALIFIED')
          AND COALESCE((SELECT MAX(f.date) FROM lead_followups f WHERE f.lead_id = l.id),
                       SUBSTR(l.created_at, 1, 10)) < ?
          AND NOT EXISTS (SELECT 1 FROM lead_followups f
                           WHERE f.lead_id = l.id AND f.method = 'Auto' AND f.date >= ?)
        ORDER BY l.created_at ASC, l.id ASC
        LIMIT 25`,
      [cutoff, cutoff]
    );
    for (const l of stale) {
      await db.run(
        'INSERT INTO lead_followups (lead_id, date, method, notes, next_action, created_by) VALUES (?,?,?,?,?,NULL)',
        [
          l.id,
          new Date().toISOString().slice(0, 10),
          'Auto',
          `No activity logged for ${days}+ days — automated nudge`,
          l.status === 'NEW' ? 'Make first contact' : 'Re-engage and advance the stage',
        ]
      );
      out.nudged++;
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * The tick
 * ------------------------------------------------------------------ */

async function finish(summary) {
  await campaign.setInternal('last_tick_at', summary.at).catch(() => {});
  await campaign.setInternal('last_tick_summary', JSON.stringify(summary)).catch(() => {});
  return summary;
}

/**
 * One scheduler pass. Safe to call concurrently — a second call while a cycle
 * is in flight returns immediately rather than double-sending.
 */
async function tick() {
  if (running) return { skipped: true, reason: 'A send cycle is already in progress' };
  running = true;

  const summary = {
    at: campaign.nowIso(),
    sent: 0,
    skipped: 0,
    bounced: 0,
    failed: 0,
    retried: 0,
    leads: null,
    reason: null,
    configured: email.isConfigured(),
  };

  try {
    const settings = await campaign.getSettings();
    // Read once per cycle: these are what the operator sees in the Automation
    // tab, so the cadence and caps the UI promises are exactly what runs.
    const limits = await campaign.getLimits();
    syncInterval(limits.tick_ms);

    // Lead automation is independent of whether sending is switched on.
    if (Date.now() - lastLeadRun > LEAD_RUN_INTERVAL_MS) {
      lastLeadRun = Date.now();
      summary.leads = await runLeadAutomation(settings);
      await campaign.setInternal('last_lead_run_at', summary.at).catch(() => {});
    }

    if (settings.outreach_enabled !== '1') {
      summary.reason = 'Outreach is switched off';
      return await finish(summary);
    }
    if (!email.isConfigured()) {
      summary.reason = 'No mailbox connected — add SMTP credentials to backend/.env';
      return await finish(summary);
    }

    // With a 60s tick and a 20s gap, three messages per tick is the honest
    // budget; the sleep between them is what stops a burst.
    const limit = Math.max(1, Math.floor(limits.tick_ms / limits.min_gap_ms));
    const dayStart = campaign.localDayStartIso();

    const candidates = await db.query(
      `SELECT r.*,
              c.status        AS campaign_status,
              c.name          AS campaign_name,
              c.daily_limit, c.window_start, c.window_end,
              c.follow_up_days, c.max_followups,
              c.template_id, c.followup_template_id, c.from_name,
              l.program       AS lead_program,
              l.requirement   AS lead_requirement
         FROM campaign_recipients r
         JOIN campaigns c ON c.id = r.campaign_id
         LEFT JOIN leads l ON l.id = r.lead_id
        WHERE r.status = 'QUEUED'
          AND r.scheduled_at <= ?
          AND c.status = 'RUNNING'
        ORDER BY r.scheduled_at ASC, r.recipient_key ASC
        LIMIT ?`,
      [campaign.nowIso(), Math.max(limit * 8, 40)]
    );

    const now = new Date();
    const perCampaign = {};

    for (const row of candidates) {
      if (summary.sent >= limit) {
        summary.reason = `Tick budget reached (${limit} per cycle)`;
        break;
      }
      if (!withinWindow(row, now)) {
        summary.skipped++;
        continue;
      }

      const globalSent = await countSentSince(dayStart);
      if (globalSent >= limits.daily_cap) {
        summary.reason = `Daily cap of ${limits.daily_cap} messages reached`;
        break;
      }

      if (perCampaign[row.campaign_id] === undefined) {
        perCampaign[row.campaign_id] = await countSentSince(dayStart, row.campaign_id);
      }
      if (perCampaign[row.campaign_id] >= Number(row.daily_limit)) {
        summary.skipped++;
        continue;
      }

      const res = await sendOne(row, settings);

      if (res.outcome === 'NOT_CONFIGURED') {
        summary.reason = 'Mailbox dropped out mid-cycle';
        break;
      }
      if (res.outcome === 'SENT') {
        summary.sent++;
        perCampaign[row.campaign_id]++;
      } else if (res.outcome === 'BOUNCED') summary.bounced++;
      else if (res.outcome === 'FAILED') summary.failed++;
      else if (res.outcome === 'RETRY') summary.retried++;
      else if (res.outcome === 'SKIPPED') summary.skipped++;

      // Space out the sends inside this cycle.
      if (summary.sent > 0 && summary.sent < limit) await sleep(limits.min_gap_ms);
    }

    return await finish(summary);
  } catch (err) {
    summary.reason = err.message;
    console.error('[outreach] tick error:', err.message);
    return await finish(summary);
  } finally {
    running = false;
  }
}

/** Manual trigger from the UI — same rules, same caps. */
async function runNow() {
  lastLeadRun = 0; // force the lead half to run too
  return tick();
}

/* ------------------------------------------------------------------ *
 * Lifecycle + read models
 * ------------------------------------------------------------------ */

/** (Re)arm the scheduler at `ms`. Idempotent when nothing changed. */
function schedule(ms) {
  const next = Math.max(Number(ms) || 0, 5000);
  if (timer && next === intervalMs) return;
  if (timer) clearInterval(timer);
  intervalMs = next;
  timer = setInterval(() => {
    tick().catch((err) => console.error('[outreach] tick failed:', err.message));
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * Adopt a tick interval the operator just saved. Called from tick() so an edit
 * to the cadence takes effect on the next cycle — no restart required.
 */
function syncInterval(ms) {
  if (!timer) return; // scheduler stopped; don't resurrect it
  const next = Math.max(Number(ms) || 0, 5000);
  if (next === intervalMs) return;
  schedule(next);
  console.log(`[outreach] cadence changed → every ${Math.round(next / 1000)}s`);
}

function start(ms) {
  if (timer) return;
  schedule(ms || config.mail.tickMs);

  // Resume a paused queue shortly after boot rather than waiting a full tick.
  const kick = setTimeout(() => {
    tick().catch((err) => console.error('[outreach] boot tick failed:', err.message));
  }, 8000);
  if (typeof kick.unref === 'function') kick.unref();

  console.log(`[outreach] scheduler running every ${Math.round(intervalMs / 1000)}s`);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    intervalMs = 0;
  }
}

/** Boot: report the mailbox state honestly, then start the scheduler. */
async function boot() {
  const status = await email.verify().catch((err) => ({ configured: false, last_error: err.message }));
  if (!status.configured) {
    console.log('[outreach] no SMTP credentials yet — campaigns will queue but not send');
  } else if (status.connected) {
    console.log(`[outreach] mailbox ${status.user} connected via ${status.host}:${status.port}`);
  } else {
    console.warn(`[outreach] mailbox ${status.user} NOT reachable: ${status.last_error}`);
  }
  // Pick up a saved cadence instead of always booting on the env default.
  const limits = await campaign.getLimits().catch(() => null);
  start(limits && limits.tick_ms);
}

/** Everything the Cold Mail dashboard needs, in one call. */
async function overview() {
  const settings = await campaign.getSettings();
  const limits = await campaign.getLimits();
  const campaigns = await campaign.listCampaigns();

  const sum = (pick) => campaigns.reduce((n, c) => n + (pick(c.stats) || 0), 0);
  const totals = {
    campaigns: campaigns.length,
    running: campaigns.filter((c) => c.status === 'RUNNING').length,
    templates: (await campaign.listTemplates()).length,
    recipients: sum((s) => s.recipients),
    queued: sum((s) => s.queued),
    sent: sum((s) => s.sent_events),
    emailed: sum((s) => s.emailed),
    opened: sum((s) => s.opened),
    opens: sum((s) => s.opens),
    replied: sum((s) => s.replied),
    bounced: sum((s) => s.bounced_events),
    unsubscribed: sum((s) => s.unsubscribed),
    failed: sum((s) => s.failed),
    sent_today: await countSentSince(campaign.localDayStartIso()),
    suppressions: await db.count('SELECT COUNT(*) FROM suppressions'),
  };
  totals.open_rate = totals.emailed ? Math.round((totals.opened / totals.emailed) * 100) : 0;
  totals.reply_rate = totals.emailed ? Math.round((totals.replied / totals.emailed) * 100) : 0;

  const events = await db.query(
    `SELECT e.event_key, e.type, e.detail, e.created_at,
            e.campaign_id, c.name AS campaign_name,
            r.email, r.name AS recipient_name
       FROM email_events e
       LEFT JOIN campaign_recipients r ON r.id = e.recipient_id
       LEFT JOIN campaigns c ON c.id = e.campaign_id
      ORDER BY e.event_key DESC
      LIMIT 30`
  );

  let lastTick = null;
  try { lastTick = settings.last_tick_summary ? JSON.parse(settings.last_tick_summary) : null; } catch { lastTick = null; }

  return {
    mail: email.status(),
    settings,
    totals,
    campaigns,
    events,
    last_tick: lastTick,
    scheduler_running: Boolean(timer),
    sending_now: running,
    // Effective values the scheduler is actually running with…
    limits,
    // …and the env defaults, so the UI can offer a "reset to default".
    limit_defaults: {
      daily_cap: config.mail.dailyCap,
      min_gap_ms: config.mail.minGapMs,
      tick_ms: config.mail.tickMs,
      max_attempts: config.mail.maxAttempts,
    },
  };
}

module.exports = { tick, runNow, runLeadAutomation, start, stop, boot, overview, withinWindow, scheduleNextStep };
