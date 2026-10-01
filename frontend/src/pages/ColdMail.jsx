import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, downloadCSV, toast, toastError } from '../api';
import { confirmDialog } from '../Confirm';
import { check, ok, Ferr, req, int, minLen } from '../validate';

/**
 * Cold Mail — automated lead generation for the organization login.
 *
 * Five surfaces, one job each:
 *   Overview    connection health, throughput and the activity log
 *   Campaigns   build an audience, throttle it, watch it convert
 *   Templates   the actual copy, with a real rendered preview
 *   Suppression the do-not-contact list that keeps the mailbox alive
 *   Automation  the switches that let the pipeline run without a human
 *
 * The scheduler is server-side, so nothing here has to stay open for a
 * campaign to keep sending.
 */

const TABS = ['Overview', 'Campaigns', 'Templates', 'Suppression', 'Automation'];

const RECIPIENT_STATUSES = ['QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'UNSUBSCRIBED', 'BOUNCED', 'REPLIED'];
const LEAD_STATUSES = ['', 'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CONVERTED', 'LOST', 'CLOSED'];
const CATEGORIES = ['COLD_OUTREACH', 'FOLLOW_UP', 'NURTURE', 'RE_ENGAGE'];

/** Only these transitions are offered — the rest are terminal states. */
const NEXT_STATUS = {
  DRAFT: ['RUNNING'],
  RUNNING: ['PAUSED', 'COMPLETED'],
  PAUSED: ['RUNNING', 'COMPLETED'],
  COMPLETED: [],
};

const STATUS_LABEL = { RUNNING: 'Start', PAUSED: 'Pause', COMPLETED: 'Complete' };

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16).replace('T', ' ');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

/** Plain-text connection indicator — no badge, no colour block. */
function MailStatus({ mail }) {
  const state = !mail.configured ? 'off' : mail.connected ? 'on' : 'warn';
  const text = !mail.configured
    ? 'Mailbox not connected'
    : mail.connected
      ? `Connected as ${mail.user}`
      : `Not reachable — ${mail.last_error || 'unknown error'}`;
  return (
    <span className={'cm-status ' + state}>
      <i />
      {text}
    </span>
  );
}

function Field({ label, hint, children, wide }) {
  return (
    <label className={'cm-field' + (wide ? ' wide' : '')}>
      <span>{label}</span>
      {children}
      {hint && <small className="cm-note">{hint}</small>}
    </label>
  );
}

function Check({ label, hint, checked, disabled, onChange }) {
  return (
    <label className={'cm-check' + (disabled ? ' off' : '')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={wide ? { width: 760, maxWidth: '100%' } : undefined}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function ColdMail() {
  const [tab, setTab] = useState('Overview');
  const [overview, setOverview] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [suppressions, setSuppressions] = useState([]);
  const [suppSearch, setSuppSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const fail = useCallback((e) => {
    setMsg(e.message);
    toastError(e.message);
  }, []);

  const load = useCallback(async () => {
    try {
      const [ov, tpl, cmp, sup] = await Promise.all([
        api.outreachOverview(),
        api.outreachTemplates(),
        api.outreachCampaigns(),
        api.outreachSuppressions(),
      ]);
      setOverview(ov);
      setTemplates(tpl);
      setCampaigns(cmp);
      setSuppressions(sup);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  useEffect(() => { load(); }, [load]);

  /**
   * The scheduler runs on the server, so sent-today / queued / delivered keep
   * moving without anyone touching this page. Re-fetch on a timer — and when
   * the tab comes back into focus — so the counters on screen match the mailbox
   * instead of the last time something happened to trigger a reload.
   */
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    const refresh = () => { if (!busyRef.current) load(); };
    const id = setInterval(refresh, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const selected = useMemo(
    () => campaigns.find((c) => c.id === selectedId) || null,
    [campaigns, selectedId]
  );

  const mail = overview?.mail;
  const totals = overview?.totals;
  const settings = overview?.settings;

  /** Every mutation funnels through here so busy/error handling stays in one place. */
  const run = async (fn, successMsg) => {
    if (busy) return null;
    setBusy(true);
    setMsg('');
    try {
      const out = await fn();
      if (successMsg) toast(typeof successMsg === 'function' ? successMsg(out) : successMsg);
      await load();
      return out;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runNow = () => run(async () => {
    const s = await api.outreachRunNow();
    toast(s.reason ? `Cycle complete — ${s.reason}` : `Cycle complete — ${s.sent} sent`, s.sent ? 'success' : 'error');
    return s;
  }, null);

  const testConnection = () => run(async () => {
    const s = await api.outreachTest();
    toast(s.connected ? 'SMTP handshake succeeded' : `Not reachable: ${s.last_error || 'unknown'}`, s.connected ? 'success' : 'error');
    return s;
  }, null);

  if (!overview) return <div className={msg ? 'err' : 'loading'}>{msg || 'Loading outreach…'}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Cold Mail</h2>
          <p className="sub">
            Automated lead generation · {totals.campaigns} campaign{totals.campaigns === 1 ? '' : 's'} ·{' '}
            {totals.sent_today} of {overview.limits.daily_cap} sent today
          </p>
        </div>
        <div className="cm-actions">
          <MailStatus mail={mail} />
          <button type="button" className="btn ghost" disabled={busy} onClick={testConnection}>
            Test connection
          </button>
          <button type="button" className="btn" disabled={busy || !mail.configured} onClick={runNow}>
            Run now
          </button>
        </div>
      </div>

      {msg && <div className="err">{msg}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button type="button" key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <OverviewTab
          overview={overview}
          busy={busy}
          onRunNow={runNow}
          onOpenCampaign={(id) => { setSelectedId(id); setTab('Campaigns'); }}
        />
      )}

      {tab === 'Campaigns' && (
        <CampaignsTab
          campaigns={campaigns}
          templates={templates}
          selected={selected}
          onSelect={setSelectedId}
          busy={busy}
          run={run}
          onChanged={load}
          fail={fail}
        />
      )}

      {tab === 'Templates' && <TemplatesTab templates={templates} busy={busy} run={run} />}

      {tab === 'Suppression' && (
        <SuppressionTab rows={suppressions} search={suppSearch} onSearch={setSuppSearch} busy={busy} run={run} />
      )}

      {tab === 'Automation' && (
        <AutomationTab
          settings={settings}
          overview={overview}
          campaigns={campaigns}
          busy={busy}
          save={(patch) => run(() => api.saveOutreachSettings(patch), 'Settings saved')}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

function OverviewTab({ overview, busy, onRunNow, onOpenCampaign }) {
  const { mail, totals, limits, events, last_tick: lastTick, settings, campaigns } = overview;

  return (
    <div>
      {!mail.configured && (
        <div className="cm-notice warn">
          <b>No mailbox connected — nothing will send.</b>
          <p>
            Campaigns still queue, schedule and preview, but the scheduler will not send and will
            never report a message as delivered. Add these to <code>backend/.env</code> and restart
            the API:
          </p>
          <pre className="cm-code">{`SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop   # Gmail App Password, not your login password`}</pre>
          <p className="cm-note">
            Create one at Google Account → Security → 2-Step Verification → App passwords.
          </p>
        </div>
      )}

      <div className="cards">
        <div className="card"><h4>Sent today</h4><b>{totals.sent_today}</b><small>of {limits.daily_cap} daily cap</small></div>
        <div className="card"><h4>Queued</h4><b>{totals.queued}</b><small>{totals.recipients} recipients</small></div>
        <div className="card"><h4>Delivered</h4><b>{totals.sent}</b><small>{totals.emailed} people</small></div>
        <div className="card"><h4>Open rate</h4><b>{totals.open_rate}%</b><small>{totals.opened} opened</small></div>
        <div className="card"><h4>Reply rate</h4><b>{totals.reply_rate}%</b><small>{totals.replied} replies</small></div>
        <div className="card"><h4>Bounced</h4><b>{totals.bounced}</b><small>auto-suppressed</small></div>
        <div className="card"><h4>Unsubscribed</h4><b>{totals.unsubscribed}</b><small>{totals.suppressions} suppressed</small></div>
        <div className="card"><h4>Failed</h4><b>{totals.failed}</b><small>after {limits.max_attempts} attempts</small></div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="cm-h">
            <h4>Activity</h4>
            <span className="cm-note">Last {events.length} events</span>
          </div>
          {events.length === 0 ? (
            <p className="empty">Nothing logged yet. Build a campaign to get started.</p>
          ) : (
            <div className="tscroll">
              <table>
                <thead><tr><th>When</th><th>Event</th><th>Recipient</th><th>Detail</th></tr></thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.event_key}>
                      <td className="cm-nowrap">{fmtDate(e.created_at)}</td>
                      <td><span className={'chip ' + e.type}>{e.type}</span></td>
                      <td>
                        <b>{e.recipient_name || e.email || '—'}</b>
                        {e.email && e.recipient_name && <small className="cm-cell-sub">{e.email}</small>}
                      </td>
                      <td className="cm-err-cell">{e.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="cm-h"><h4>Scheduler</h4></div>
          <dl className="kv">
            <div><dt>Status</dt><dd>{overview.scheduler_running ? 'Running' : 'Stopped'}</dd></div>
            <div><dt>Outreach</dt><dd>{settings.outreach_enabled === '1' ? 'Enabled' : 'Disabled'}</dd></div>
            <div><dt>Weekdays only</dt><dd>{settings.weekdays_only === '1' ? 'Yes' : 'No'}</dd></div>
            <div><dt>Last run</dt><dd>{lastTick ? fmtDate(lastTick.at) : '—'}</dd></div>
            <div><dt>Last outcome</dt><dd>{lastTick?.reason || (lastTick ? `${lastTick.sent} sent` : '—')}</dd></div>
            <div><dt>Cadence</dt><dd>Every {Math.round(limits.tick_ms / 1000)}s, {Math.round(limits.min_gap_ms / 1000)}s apart</dd></div>
            <div><dt>Retries</dt><dd>{limits.max_attempts} attempts, then failed</dd></div>
          </dl>
          <button type="button" className="btn ghost" disabled={busy || !mail.configured} onClick={onRunNow}>
            Run a send cycle now
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cm-h">
          <h4>Campaign throughput</h4>
          <span className="cm-note">Daily cap {limits.daily_cap}</span>
        </div>
        {campaigns.length === 0 ? (
          <p className="empty">No campaigns yet.</p>
        ) : (
          <div className="tscroll">
            <table>
              <thead>
                <tr><th>Campaign</th><th>Status</th><th>Audience</th><th>Queued</th><th>Sent</th><th>Today</th><th>Opened</th><th>Replied</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td><a onClick={() => onOpenCampaign(c.id)} className="cm-link">{c.name}</a></td>
                    <td><span className={'chip ' + c.status}>{c.status}</span></td>
                    <td>{c.stats.recipients}</td>
                    <td>{c.stats.queued}</td>
                    <td>{c.stats.sent_events}</td>
                    <td>{c.stats.sent_today} / {c.daily_limit}</td>
                    <td>{c.stats.open_rate}%</td>
                    <td>{c.stats.reply_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Campaigns
 * ------------------------------------------------------------------ */

function CampaignsTab({ campaigns, templates, selected, onSelect, busy, run, onChanged, fail }) {
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="btn" onClick={() => setCreating(true)} disabled={!templates.length}>
          New campaign
        </button>
        {!templates.length && <span className="cm-note">Create a template first — every campaign sends one.</span>}
      </div>

      <div className="tscroll">
        <table>
          <thead>
            <tr>
              <th>Campaign</th><th>Status</th><th>Audience</th><th>Queued</th>
              <th>Sent</th><th>Opened</th><th>Replied</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className={selected?.id === c.id ? 'cm-row-on' : ''}>
                <td>
                  <b>{c.name}</b>
                  <small className="cm-cell-sub">{c.id} · {c.template_name || 'template missing'}</small>
                </td>
                <td><span className={'chip ' + c.status}>{c.status}</span></td>
                <td>{c.stats.recipients}</td>
                <td>{c.stats.queued}</td>
                <td>
                  {c.stats.sent_events}
                  <small className="cm-cell-sub">{c.stats.sent_today} today</small>
                </td>
                <td>{c.stats.opened}<small className="cm-cell-sub">{c.stats.open_rate}%</small></td>
                <td>{c.stats.replied}<small className="cm-cell-sub">{c.stats.reply_rate}%</small></td>
                <td>
                  <div className="cm-row-actions">
                    {NEXT_STATUS[c.status]?.map((s) => (
                      <button type="button" key={s} className="btn ghost sm" disabled={busy}
                        onClick={() => run(() => api.outreachCampaignStatus(c.id, s), `Campaign ${s.toLowerCase()}`)}>
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                    <button type="button" className="btn ghost sm" onClick={() => onSelect(selected?.id === c.id ? null : c.id)}>
                      {selected?.id === c.id ? 'Close' : 'Open'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {campaigns.length === 0 && <p className="empty">No campaigns yet.</p>}

      {selected && (
        <CampaignDetail
          key={selected.id}
          campaign={selected}
          templates={templates}
          busy={busy}
          run={run}
          onChanged={onChanged}
          fail={fail}
          onClose={() => onSelect(null)}
        />
      )}

      {creating && (
        <NewCampaignModal
          templates={templates}
          onClose={() => setCreating(false)}
          onCreate={async (body) => {
            const c = await run(() => api.createOutreachCampaign(body), 'Campaign created');
            if (c) { setCreating(false); onSelect(c.id); }
          }}
        />
      )}
    </div>
  );
}

function CampaignDetail({ campaign, templates, busy, run, onChanged, fail, onClose }) {
  const [aud, setAud] = useState({ status: '', lead_type: '', search: '', limit: 200 });
  const [csv, setCsv] = useState('');
  const [recs, setRecs] = useState([]);
  const [rFilter, setRFilter] = useState('');
  const [rSearch, setRSearch] = useState('');
  const [edit, setEdit] = useState(false);
  const [fe, setFe] = useState({});
  const [form, setForm] = useState(() => ({
    name: campaign.name,
    template_id: campaign.template_id,
    followup_template_id: campaign.followup_template_id || '',
    from_name: campaign.from_name || '',
    daily_limit: campaign.daily_limit,
    window_start: campaign.window_start,
    window_end: campaign.window_end,
    follow_up_days: (campaign.follow_up_days || []).join(','),
    max_followups: campaign.max_followups,
  }));

  const loadRecs = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (rFilter) q.set('status', rFilter);
      if (rSearch) q.set('search', rSearch);
      q.set('limit', '300');
      setRecs(await api.outreachRecipients(campaign.id, '?' + q.toString()));
    } catch (e) {
      fail(e);
    }
  }, [campaign.id, rFilter, rSearch, fail]);

  // Re-fetch whenever the filters change, and whenever the parent hands us a
  // freshly polled campaign — otherwise the header stats move while the queue
  // below still shows the old statuses.
  useEffect(() => { loadRecs(); }, [loadRecs, campaign]);

  const afterChange = async () => { await onChanged(); await loadRecs(); };

  const pull = async () => {
    const out = await run(() => api.outreachAudience(campaign.id, aud));
    if (out) {
      toast(`Matched ${out.matched}, added ${out.added}`
        + (out.suppressed ? `, ${out.suppressed} suppressed` : '')
        + (out.duplicate ? `, ${out.duplicate} already present` : '')
        + (out.invalid ? `, ${out.invalid} invalid` : ''));
      await afterChange();
    }
  };

  const importCsv = async (text) => {
    const out = await run(() => api.outreachImport(campaign.id, { csv: text }));
    if (out) {
      toast(`Parsed ${out.parsed}, added ${out.added}${out.invalid ? `, ${out.invalid} invalid` : ''}`);
      setCsv('');
      await afterChange();
    }
  };

  const saveConfig = async () => {
    const out = await run(() => api.patchOutreachCampaign(campaign.id, {
      ...form,
      followup_template_id: form.followup_template_id || null,
      follow_up_days: String(form.follow_up_days).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)),
    }), 'Campaign updated');
    if (out) { setEdit(false); await afterChange(); }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(String(reader.result || ''));
    reader.readAsText(f);
    e.target.value = '';
  };

  const exportRecs = () => downloadCSV(
    `${campaign.id}-recipients.csv`,
    recs.map((r) => ({
      email: r.email, name: r.name, organization: r.organization,
      step: r.step, status: r.status, scheduled_at: r.scheduled_at,
      sent_at: r.sent_at, opens: r.open_count, steps_sent: r.steps_sent, last_error: r.last_error,
    }))
  );

  const s = campaign.stats;

  return (
    <div className="card cm-detail">
      <div className="cm-h">
        <div>
          <h4>{campaign.name}</h4>
          <p className="cm-note">
            {campaign.id} · send window {campaign.window_start}:00–{campaign.window_end}:00 · follow-ups
            on day {(campaign.follow_up_days || []).slice(1).join(', ') || 'none'} · max {campaign.max_followups} ·
            {' '}{campaign.daily_limit}/day
          </p>
        </div>
        <div className="cm-row-actions">
          <button type="button" className="btn ghost sm" onClick={() => setEdit((v) => !v)}>
            {edit ? 'Cancel edit' : 'Edit settings'}
          </button>
          <button type="button" className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
      </div>

      <dl className="kv cm-stats">
        <div><dt>Audience</dt><dd>{s.recipients}</dd></div>
        <div><dt>Queued</dt><dd>{s.queued}</dd></div>
        <div><dt>Delivered</dt><dd>{s.sent_events}</dd></div>
        <div><dt>Opened</dt><dd>{s.opened} ({s.open_rate}%)</dd></div>
        <div><dt>Replied</dt><dd>{s.replied} ({s.reply_rate}%)</dd></div>
        <div><dt>Bounced</dt><dd>{s.bounced_events}</dd></div>
        <div><dt>Unsubscribed</dt><dd>{s.unsubscribed}</dd></div>
        <div><dt>Failed</dt><dd>{s.failed}</dd></div>
      </dl>

      {edit && (
        <div className="cm-block">
          <div className="cm-h"><h4>Campaign settings</h4></div>
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            const errs = check({
              name: [req('Name')],
              daily_limit: [int('Daily limit', { min: 1, max: 1000 })],
              max_followups: [int('Max follow-ups', { min: 0, max: 5 })],
              window_start: [int('Send window start', { min: 0, max: 23 })],
              window_end: [int('Send window end', { min: 1, max: 24 })],
            }, form);
            setFe(errs);
            if (!ok(errs)) return;
            saveConfig();
          }}>
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!fe.name} />
              <Ferr fe={fe} name="name" />
            </Field>
            <Field label="From name"><input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></Field>
            <Field label="Initial template">
              <select value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Follow-up template">
              <select value={form.followup_template_id} onChange={(e) => setForm({ ...form, followup_template_id: e.target.value })}>
                <option value="">Reuse the initial template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Daily limit">
              <input type="number" min="1" value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: +e.target.value })} aria-invalid={!!fe.daily_limit} />
              <Ferr fe={fe} name="daily_limit" />
            </Field>
            <Field label="Follow-up days" hint="Day offsets from enrolment, e.g. 0,3,7">
              <input value={form.follow_up_days} onChange={(e) => setForm({ ...form, follow_up_days: e.target.value })} />
            </Field>
            <Field label="Max follow-ups">
              <input type="number" min="0" max="5" value={form.max_followups} onChange={(e) => setForm({ ...form, max_followups: +e.target.value })} aria-invalid={!!fe.max_followups} />
              <Ferr fe={fe} name="max_followups" />
            </Field>
            <Field label="Send window">
              <span className="cm-inline">
                <input type="number" min="0" max="23" value={form.window_start} onChange={(e) => setForm({ ...form, window_start: +e.target.value })} aria-invalid={!!fe.window_start} />
                <input type="number" min="1" max="24" value={form.window_end} onChange={(e) => setForm({ ...form, window_end: +e.target.value })} aria-invalid={!!fe.window_end} />
              </span>
              <Ferr fe={fe} name="window_start" />
              <Ferr fe={fe} name="window_end" />
            </Field>
            <span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
            </span>
          </form>
        </div>
      )}

      <div className="grid2 cm-block">
        <div className="cm-block-flat">
          <div className="cm-h"><h4>Build audience from the pipeline</h4></div>
          <p className="cm-note">
            Pulls leads that have an email address. Anyone on the suppression list, or already in
            this campaign, is skipped.
          </p>
          <div className="cm-inline cm-inline-top">
            <select className="select-sm" value={aud.status} onChange={(e) => setAud({ ...aud, status: e.target.value })}>
              {LEAD_STATUSES.map((v) => <option key={v || 'open'} value={v}>{v || 'Open leads (NEW–PROPOSAL)'}</option>)}
            </select>
            <select className="select-sm" value={aud.lead_type} onChange={(e) => setAud({ ...aud, lead_type: e.target.value })}>
              <option value="">All lead types</option>
              <option value="INSTITUTION">Institution</option>
              <option value="DIRECT">Direct</option>
            </select>
            <input className="search-input" placeholder="Search" value={aud.search} onChange={(e) => setAud({ ...aud, search: e.target.value })} />
            <input className="search-input cm-num" type="number" min="1" value={aud.limit} title="Maximum leads" onChange={(e) => setAud({ ...aud, limit: +e.target.value })} />
            <button type="button" className="btn" disabled={busy} onClick={pull}>Add matching leads</button>
          </div>
        </div>

        <div className="cm-block-flat">
          <div className="cm-h"><h4>Import prospects</h4></div>
          <p className="cm-note">
            CSV with an <code>email</code> column; <code>name</code> and <code>organization</code> are optional.
          </p>
          <textarea
            className="cm-textarea"
            rows={4}
            placeholder={'email,name,organization\nprincipal@college.edu,Dr. Meena,ABC College'}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <div className="cm-inline">
            <button type="button" className="btn" disabled={busy || !csv.trim()} onClick={() => importCsv(csv)}>
              Import pasted rows
            </button>
            <label className="btn ghost cm-file">
              Upload CSV
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
            </label>
          </div>
        </div>
      </div>

      <div className="cm-block">
        <div className="cm-h">
          <h4>Queue ({recs.length})</h4>
          <div className="cm-inline">
            <select className="select-sm" value={rFilter} onChange={(e) => setRFilter(e.target.value)}>
              <option value="">All statuses</option>
              {RECIPIENT_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input className="search-input" placeholder="Search" value={rSearch} onChange={(e) => setRSearch(e.target.value)} />
            <button type="button" className="btn ghost sm" onClick={exportRecs} disabled={!recs.length}>Export CSV</button>
          </div>
        </div>

        <div className="tscroll">
          <table>
            <thead>
              <tr><th>Recipient</th><th>Status</th><th>Step</th><th>Scheduled</th><th>Opens</th><th>Last error</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name || r.email}</b>
                    <small className="cm-cell-sub">{r.email}{r.organization ? ` · ${r.organization}` : ''}</small>
                  </td>
                  <td><span className={'chip ' + r.status}>{r.status}</span></td>
                  <td>{r.step + 1}<small className="cm-cell-sub">{r.steps_sent} sent</small></td>
                  <td className="cm-nowrap">{fmtDate(r.scheduled_at)}</td>
                  <td>{r.open_count}{r.first_opened_at && <small className="cm-cell-sub">{fmtDate(r.first_opened_at)}</small>}</td>
                  <td className="cm-err-cell">{r.last_error || '—'}</td>
                  <td>
                    <div className="cm-row-actions">
                      {!['REPLIED', 'UNSUBSCRIBED'].includes(r.status) && (
                        <button type="button" className="btn ghost sm" disabled={busy}
                          onClick={async () => { await run(() => api.outreachReplied(campaign.id, r.id), 'Marked as replied'); await afterChange(); }}>
                          Replied
                        </button>
                      )}
                      <button type="button" className="btn ghost sm" disabled={busy}
                        onClick={async () => {
                          if (!(await confirmDialog({ title: 'Remove from queue', message: `Remove ${r.name || r.email} (${r.email}) from this campaign's queue?` }))) return;
                          await run(() => api.outreachRemoveRecipient(campaign.id, r.id), 'Removed from queue');
                          await afterChange();
                        }}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recs.length === 0 && <p className="empty">Nothing in this queue yet.</p>}
      </div>
    </div>
  );
}

function NewCampaignModal({ templates, onClose, onCreate }) {
  const [f, setF] = useState({
    name: '', template_id: templates[0]?.id || '', followup_template_id: '',
    daily_limit: 40, window_start: 10, window_end: 18, follow_up_days: '0,3,7', max_followups: 2,
  });
  const [fe, setFe] = useState({});
  return (
    <Modal title="New campaign" onClose={onClose}>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        const errs = check({
          name: [req('Campaign name')],
          daily_limit: [int('Daily limit', { min: 1, max: 1000 })],
          max_followups: [int('Max follow-ups', { min: 0, max: 5 })],
          window_start: [int('Send window start', { min: 0, max: 23 })],
          window_end: [int('Send window end', { min: 1, max: 24 })],
        }, f);
        setFe(errs);
        if (!ok(errs)) return;
        onCreate({
          ...f,
          followup_template_id: f.followup_template_id || null,
          follow_up_days: f.follow_up_days.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)),
        });
      }}>
        <Field label="Name" wide>
          <input required placeholder="Q1 college outreach" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!fe.name} />
          <Ferr fe={fe} name="name" />
        </Field>
        <Field label="Initial template">
          <select value={f.template_id} onChange={(e) => setF({ ...f, template_id: e.target.value })}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Follow-up template">
          <select value={f.followup_template_id} onChange={(e) => setF({ ...f, followup_template_id: e.target.value })}>
            <option value="">Reuse the initial template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Daily limit">
          <input type="number" min="1" value={f.daily_limit} onChange={(e) => setF({ ...f, daily_limit: +e.target.value })} aria-invalid={!!fe.daily_limit} />
          <Ferr fe={fe} name="daily_limit" />
        </Field>
        <Field label="Follow-up days" hint="e.g. 0,3,7">
          <input value={f.follow_up_days} onChange={(e) => setF({ ...f, follow_up_days: e.target.value })} />
        </Field>
        <Field label="Max follow-ups">
          <input type="number" min="0" max="5" value={f.max_followups} onChange={(e) => setF({ ...f, max_followups: +e.target.value })} aria-invalid={!!fe.max_followups} />
          <Ferr fe={fe} name="max_followups" />
        </Field>
        <Field label="Send window">
          <span className="cm-inline">
            <input type="number" min="0" max="23" value={f.window_start} onChange={(e) => setF({ ...f, window_start: +e.target.value })} aria-invalid={!!fe.window_start} />
            <input type="number" min="1" max="24" value={f.window_end} onChange={(e) => setF({ ...f, window_end: +e.target.value })} aria-invalid={!!fe.window_end} />
          </span>
          <Ferr fe={fe} name="window_start" />
          <Ferr fe={fe} name="window_end" />
        </Field>
        <span>
          <button className="btn" type="submit">Create campaign</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </span>
      </form>
      <p className="cm-note">
        Campaigns start as drafts so you can build the audience and check the copy before anything
        is eligible to send.
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

function TemplatesTab({ templates, busy, run }) {
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="btn" onClick={() => setEditing({ name: '', category: 'COLD_OUTREACH', subject: '', body: '' })}>
          New template
        </button>
        <span className="cm-note">
          Placeholders: <code>{'{{name}} {{organization}} {{program}} {{sender}} {{unsubscribe}}'}</code>
        </span>
      </div>

      <div className="tscroll">
        <table>
          <thead><tr><th>Template</th><th>Category</th><th>Subject</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <b>{t.name}</b>
                  <small className="cm-cell-sub">{t.id}</small>
                </td>
                <td><span className="chip">{t.category}</span></td>
                <td className="cm-subject-cell">{t.subject}</td>
                <td className="cm-nowrap">{fmtDate(t.updated_at || t.created_at)}</td>
                <td>
                  <div className="cm-row-actions">
                    <button type="button" className="btn ghost sm" onClick={() => setPreview(t)}>Preview</button>
                    <button type="button" className="btn ghost sm" onClick={() => setEditing(t)}>Edit</button>
                    <button type="button" className="btn ghost sm" disabled={busy}
                      onClick={async () => {
                        if (!(await confirmDialog({ title: 'Delete template', message: `Delete template "${t.name}"?` }))) return;
                        await run(() => api.deleteOutreachTemplate(t.id), 'Template deleted');
                      }}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {templates.length === 0 && <p className="empty">No templates yet.</p>}

      {editing && (
        <TemplateModal
          template={editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const out = await run(
              () => (editing.id ? api.patchOutreachTemplate(editing.id, body) : api.createOutreachTemplate(body)),
              editing.id ? 'Template updated' : 'Template created'
            );
            if (out) setEditing(null);
          }}
        />
      )}

      {preview && <PreviewModal template={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function TemplateModal({ template, onClose, onSave }) {
  const [f, setF] = useState({
    name: template.name || '',
    category: template.category || 'COLD_OUTREACH',
    subject: template.subject || '',
    body: template.body || '',
  });
  const [busy, setBusy] = useState(false);
  const [fe, setFe] = useState({});

  return (
    <Modal title={template.id ? `Edit ${template.id}` : 'New template'} onClose={onClose} wide>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        const errs = check({
          name: [req('Name'), minLen(2, 'Name')],
          category: [req('Category')],
          subject: [req('Subject'), minLen(3, 'Subject')],
          body: [req('Body'), minLen(10, 'Body')],
        }, f);
        setFe(errs);
        if (!ok(errs)) return;
        setBusy(true);
        await onSave(f);
        setBusy(false);
      }}>
        <Field label="Name">
          <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!fe.name} />
          <Ferr fe={fe} name="name" />
        </Field>
        <Field label="Category">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-invalid={!!fe.category}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
          <Ferr fe={fe} name="category" />
        </Field>
        <Field label="Subject" wide>
          <input required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} aria-invalid={!!fe.subject} />
          <Ferr fe={fe} name="subject" />
        </Field>
        <Field label="Body" wide>
          <textarea className="cm-textarea" rows={12} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} aria-invalid={!!fe.body} />
          <Ferr fe={fe} name="body" />
        </Field>
        <span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </span>
      </form>
      <p className="cm-note">
        The unsubscribe link and a tracking pixel are appended to every message automatically, so you
        do not have to include them — <code>{'{{unsubscribe}}'}</code> only controls where the link sits.
      </p>
    </Modal>
  );
}

function PreviewModal({ template, onClose }) {
  const [out, setOut] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.outreachPreview({ template_id: template.id }).then(setOut).catch((e) => setErr(e.message));
  }, [template.id]);

  return (
    <Modal title={`Preview — ${template.name}`} onClose={onClose} wide>
      {err && <div className="err">{err}</div>}
      {!out && !err && <div className="loading">Rendering…</div>}
      {out && (
        <>
          <dl className="kv"><div><dt>Subject</dt><dd>{out.subject}</dd></div></dl>
          <p className="cm-note" style={{ marginBottom: 6 }}>Plain text</p>
          <pre className="cm-tpl-body">{out.text}</pre>
          <p className="cm-note" style={{ margin: '14px 0 6px' }}>As delivered</p>
          <iframe title="Email preview" className="cm-preview-frame" sandbox="" srcDoc={out.html} />
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Suppression
 * ------------------------------------------------------------------ */

function SuppressionTab({ rows, search, onSearch, busy, run }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('MANUAL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.email.includes(q)) : rows;
  }, [rows, search]);

  return (
    <div>
      <div className="cm-notice">
        <b>This list is why the mailbox survives.</b>
        <p>
          Unsubscribes and hard bounces are added automatically, and every campaign checks it twice —
          once when a prospect is queued, and again immediately before sending. Removing an address
          here makes it mailable again.
        </p>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="Search suppressed addresses" value={search} onChange={(e) => onSearch(e.target.value)} />
        <select className="select-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="MANUAL">Manual</option>
          <option value="COMPLAINT">Complaint</option>
          <option value="BOUNCED">Bounced</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
        </select>
        <input className="search-input" placeholder="add@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className="btn" disabled={busy || !email.trim()}
          onClick={async () => { const out = await run(() => api.outreachSuppress({ email, reason }), 'Added to suppression list'); if (out) setEmail(''); }}>
          Suppress
        </button>
      </div>

      <div className="tscroll">
        <table>
          <thead><tr><th>Email</th><th>Reason</th><th>Detail</th><th>Added</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.email}>
                <td><b>{r.email}</b></td>
                <td><span className="chip">{r.reason}</span></td>
                <td className="cm-err-cell">{r.detail || '—'}</td>
                <td className="cm-nowrap">{fmtDate(r.created_at)}</td>
                <td>
                  <button type="button" className="btn ghost sm" disabled={busy}
                    onClick={() => run(() => api.outreachUnsuppress(r.email), 'Removed from suppression list')}>
                    Allow again
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="empty">Nothing suppressed{search ? ' for that search' : ' yet'}.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Automation
 * ------------------------------------------------------------------ */

/** Editor for the four numbers the scheduler actually runs on. */
function LimitsCard({ overview, busy, save }) {
  const limits = overview.limits;
  const defaults = overview.limit_defaults || overview.limits;
  const toForm = (v) => ({
    daily_cap: v.daily_cap,
    min_gap_s: Math.max(1, Math.round(v.min_gap_ms / 1000)),
    tick_s: Math.max(1, Math.round(v.tick_ms / 1000)),
    max_attempts: v.max_attempts,
  });
  const [f, setF] = useState(() => toForm(limits));
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});

  const setNum = (key) => (e) => setF({ ...f, [key]: +e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = check({
      daily_cap: [int('Daily cap', { min: 1, max: 1000 })],
      min_gap_s: [int('Spacing', { min: 1, max: 600 })],
      tick_s: [int('Tick', { min: 5, max: 3600 })],
      max_attempts: [int('Retries', { min: 1, max: 10 })],
    }, f);
    setFe(errs);
    if (!ok(errs)) return;
    if (Number(f.tick_s) < Number(f.min_gap_s)) {
      setErr('The tick must be at least as long as the spacing, or the gap can never apply.');
      return;
    }
    setErr('');
    await save({
      daily_cap: Number(f.daily_cap),
      min_gap_ms: Number(f.min_gap_s) * 1000,
      tick_ms: Number(f.tick_s) * 1000,
      max_attempts: Number(f.max_attempts),
    });
  };

  // Blank on the server means "fall back to the env default", so a reset is
  // just sending empty values and showing what the env resolves to.
  const reset = async () => {
    setErr('');
    setFe({});
    const out = await save({ daily_cap: '', min_gap_ms: '', tick_ms: '', max_attempts: '' });
    if (out) setF(toForm(defaults));
  };

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="cm-h">
        <h4>Throughput limits</h4>
        <span className="cm-note">Applies to every campaign and to the scheduler itself</span>
      </div>
      <p className="cm-note">
        The automation will never mail an address on the suppression list, exceed the daily cap,
        send outside a campaign's window, or report a message as delivered while the mailbox is
        disconnected. When SMTP is missing it queues and says so. Changing the tick takes effect on
        the next cycle — no restart needed.
      </p>

      <form className="form" onSubmit={submit}>
        <Field label="Daily cap" hint={`Messages per day, all campaigns (default ${defaults.daily_cap})`}>
          <input type="number" min="1" max="1000" value={f.daily_cap} disabled={busy} onChange={setNum('daily_cap')} aria-invalid={!!fe.daily_cap} />
          <Ferr fe={fe} name="daily_cap" />
        </Field>
        <Field label="Spacing" hint={`Seconds between two sends (default ${Math.round(defaults.min_gap_ms / 1000)}s)`}>
          <input type="number" min="1" max="600" value={f.min_gap_s} disabled={busy} onChange={setNum('min_gap_s')} aria-invalid={!!fe.min_gap_s} />
          <Ferr fe={fe} name="min_gap_s" />
        </Field>
        <Field label="Tick" hint={`Seconds between send cycles (default ${Math.round(defaults.tick_ms / 1000)}s)`}>
          <input type="number" min="5" max="3600" value={f.tick_s} disabled={busy} onChange={setNum('tick_s')} aria-invalid={!!fe.tick_s} />
          <Ferr fe={fe} name="tick_s" />
        </Field>
        <Field label="Retries" hint={`Attempts before a recipient fails (default ${defaults.max_attempts})`}>
          <input type="number" min="1" max="10" value={f.max_attempts} disabled={busy} onChange={setNum('max_attempts')} aria-invalid={!!fe.max_attempts} />
          <Ferr fe={fe} name="max_attempts" />
        </Field>
        <span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save limits'}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={reset}>Reset to defaults</button>
        </span>
      </form>
      {err && <div className="err">{err}</div>}
    </div>
  );
}

function AutomationTab({ settings, overview, campaigns, busy, save }) {
  const [form, setForm] = useState(() => ({
    outreach_enabled: settings.outreach_enabled === '1',
    weekdays_only: settings.weekdays_only === '1',
    auto_task_enabled: settings.auto_task_enabled === '1',
    auto_enroll_enabled: settings.auto_enroll_enabled === '1',
    auto_enroll_campaign_id: settings.auto_enroll_campaign_id || '',
    stale_lead_days: Number(settings.stale_lead_days || 5),
  }));

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    save({ [key]: value });
  };

  const { limits, last_tick: lastTick } = overview;

  return (
    <div>
      <div className="grid2">
        <div className="card">
          <div className="cm-h"><h4>Send automation</h4></div>
          <p className="cm-note" style={{ marginBottom: 4 }}>
            The scheduler runs on the server. Once a campaign is running it keeps draining its queue
            whether or not anyone is signed in.
          </p>

          <Check
            label="Outreach enabled"
            hint="Master switch. Off means nothing is sent, queue included."
            checked={form.outreach_enabled}
            disabled={busy}
            onChange={(v) => set('outreach_enabled', v)}
          />
          <Check
            label="Weekdays only"
            hint="Skip Saturdays and Sundays when scheduling the next slot."
            checked={form.weekdays_only}
            disabled={busy}
            onChange={(v) => set('weekdays_only', v)}
          />

          <dl className="kv" style={{ marginTop: 14, marginBottom: 0 }}>
            <div><dt>Throughput</dt><dd>{limits.daily_cap}/day · {Math.round(limits.min_gap_ms / 1000)}s apart · every {Math.round(limits.tick_ms / 1000)}s</dd></div>
            <div><dt>Retries</dt><dd>{limits.max_attempts} attempts, then failed</dd></div>
            <div><dt>Last run</dt><dd>{lastTick ? fmtDate(lastTick.at) : '—'}</dd></div>
            <div><dt>Last outcome</dt><dd>{lastTick?.reason || (lastTick ? `${lastTick.sent} sent` : '—')}</dd></div>
          </dl>
          <p className="cm-note" style={{ marginTop: 10 }}>
            Daily cap, spacing, tick and retries are editable under <b>Throughput limits</b> below.
          </p>
        </div>

        <div className="card">
          <div className="cm-h"><h4>Lead automation</h4></div>
          <p className="cm-note" style={{ marginBottom: 4 }}>
            Keeps the pipeline moving without a human: new leads are enrolled automatically, and
            quiet leads get a nudge logged against them.
          </p>

          <Check
            label="Auto-enrol new leads"
            hint="New and contacted leads with an email join the chosen campaign."
            checked={form.auto_enroll_enabled}
            disabled={busy}
            onChange={(v) => set('auto_enroll_enabled', v)}
          />

          <div style={{ marginTop: 12 }}>
            <Field label="Auto-enrol campaign">
              <select
                value={form.auto_enroll_campaign_id}
                disabled={busy || !form.auto_enroll_enabled}
                onChange={(e) => set('auto_enroll_campaign_id', e.target.value)}
              >
                <option value="">None selected</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
              </select>
            </Field>
            <p className="cm-note" style={{ marginTop: 6 }}>Only running campaigns accept enrolments.</p>
          </div>

          <Check
            label="Nudge quiet leads"
            hint="Logs an automated follow-up on leads with no recent activity."
            checked={form.auto_task_enabled}
            disabled={busy}
            onChange={(v) => set('auto_task_enabled', v)}
          />

          <div style={{ marginTop: 12 }}>
            <Field label="Quiet after (days)">
              <input
                type="number" min="1" max="90"
                value={form.stale_lead_days}
                disabled={busy || !form.auto_task_enabled}
                onChange={(e) => setForm((p) => ({ ...p, stale_lead_days: +e.target.value }))}
                onBlur={(e) => save({ stale_lead_days: +e.target.value })}
              />
            </Field>
          </div>
        </div>
      </div>

      <LimitsCard overview={overview} busy={busy} save={save} />
    </div>
  );
}
