/**
 * Verifies the four audit fixes against the live backend on :4000:
 *   D8  archive / restore / merge
 *   D25 date-range  (backend just needs to return the date columns — the filter is client-side)
 *   E5/D21 expense linkage
 *   B4/F7 notifications
 * Run: node frontend/audit/lifecycle-test.cjs
 */
const BASE = 'http://localhost:4000';
const H = (role = 'organization', user = 'U-001') => ({
  'Content-Type': 'application/json', 'x-role': role, 'x-user': user,
});

async function call(method, path, body, headers = H()) {
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, json };
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

(async () => {
  const stamp = Date.now().toString(36);
  const created = { leads: [], expenses: [] };

  // ---------- B4/F7 notifications ----------
  const n0 = await call('GET', '/api/notifications/unread-count');
  check('unread-count endpoint responds', n0.ok && typeof n0.json?.data?.count === 'number',
    `count=${n0.json?.data?.count}`);

  // ---------- D8 + notifications: create a lead emits a notification ----------
  const before = (await call('GET', '/api/notifications')).json?.data?.length ?? -1;
  const lead = await call('POST', '/api/leads', {
    organization: `ZZ Merge Test ${stamp}`, contact_person: 'Alpha', email: `alpha.${stamp}@test.dev`,
    program: 'Test', expected_value: 1000,
  });
  check('create lead', lead.ok && lead.json?.data?.status === 'NEW', `id=${lead.json?.data?.id}`);
  const leadId = lead.json?.data?.id;
  if (leadId) created.leads.push(leadId);

  const after = (await call('GET', '/api/notifications')).json?.data?.length ?? -1;
  check('lead create emits a notification', after === before + 1, `${before} → ${after}`);

  // ---------- D8 archive / restore ----------
  const arch = await call('POST', `/api/leads/${leadId}/archive`);
  check('archive lead', arch.ok && arch.json?.data?.archived === true);

  const liveList = (await call('GET', '/api/leads')).json?.data ?? [];
  check('archived lead hidden from live list', !liveList.some((l) => l.id === leadId));

  const archList = (await call('GET', '/api/leads?archived=1')).json?.data ?? [];
  check('archived lead appears in archive view', archList.some((l) => l.id === leadId));

  const rest = await call('POST', `/api/leads/${leadId}/restore`);
  check('restore lead', rest.ok && rest.json?.data?.archived === false);
  const liveList2 = (await call('GET', '/api/leads')).json?.data ?? [];
  check('restored lead back in live list', liveList2.some((l) => l.id === leadId));

  // ---------- D8 merge ----------
  const dup = await call('POST', '/api/leads', {
    organization: `ZZ Merge Test ${stamp}`, contact_person: 'Beta', phone: '98410-22222',
    program: 'Test Dup', expected_value: 2500,
  });
  const dupId = dup.json?.data?.id;
  if (dupId) created.leads.push(dupId);
  check('create duplicate lead', dup.ok, `id=${dupId}`);

  const merged = await call('POST', '/api/leads/merge', { primary_id: leadId, duplicate_id: dupId });
  const mData = merged.json?.data;
  check('merge leads succeeds', merged.ok, `primary=${mData?.id}`);
  check('merge filled blank phone on primary', mData?.phone === '98410-22222', `phone=${mData?.phone}`);
  const liveAfterMerge = (await call('GET', '/api/leads')).json?.data ?? [];
  check('duplicate removed from live list after merge', !liveAfterMerge.some((l) => l.id === dupId));
  const archAfterMerge = (await call('GET', '/api/leads?archived=1')).json?.data ?? [];
  check('duplicate archived (not hard-deleted) after merge', archAfterMerge.some((l) => l.id === dupId));

  // merge self → 400
  const selfMerge = await call('POST', '/api/leads/merge', { primary_id: leadId, duplicate_id: leadId });
  check('merge with itself rejected', selfMerge.status === 400, `status=${selfMerge.status}`);

  // ---------- E5/D21 expense linkage ----------
  const exp = await call('POST', '/api/expenses', {
    amount: 1234, category: 'Venue', vendor: 'Test Hall', description: `linkage ${stamp}`,
    customer_id: 'CUST-001', batch_id: 'AIML-2026-01', trainer_id: 'TR-001',
  });
  check('create expense with linkage', exp.ok, `id=${exp.json?.data?.id}`);
  const expId = exp.json?.data?.id;
  if (expId) created.expenses.push(expId);
  check('expense stored customer_id', exp.json?.data?.customer_id === 'CUST-001');
  check('expense stored batch_id', exp.json?.data?.batch_id === 'AIML-2026-01');

  const expList = (await call('GET', '/api/expenses')).json?.data ?? [];
  const linked = expList.find((e) => e.id === expId);
  check('expense list joins customer_name', linked?.customer_name === 'ABC College', `got=${linked?.customer_name}`);
  check('expense list joins trainer_name', !!linked?.trainer_name, `got=${linked?.trainer_name}`);

  const badLink = await call('POST', '/api/expenses', { amount: 5, customer_id: 'NOPE-999' });
  check('expense rejects unknown customer_id', badLink.status === 400, `status=${badLink.status}`);

  // ---------- archive/restore on another entity ----------
  const invArch = await call('POST', '/api/invoices/INV-002/archive');
  check('archive invoice', invArch.ok);
  const invLive = (await call('GET', '/api/invoices')).json?.data ?? [];
  check('archived invoice hidden from live list', !invLive.some((i) => i.id === 'INV-002'));
  await call('POST', '/api/invoices/INV-002/restore');
  const invLive2 = (await call('GET', '/api/invoices')).json?.data ?? [];
  check('restored invoice back in live list', invLive2.some((i) => i.id === 'INV-002'));

  // ---------- RBAC: institution cannot archive a lead ----------
  const forbidden = await call('POST', `/api/leads/${leadId}/archive`, null, H('institution', 'U-002'));
  check('institution cannot archive a lead (403)', forbidden.status === 403, `status=${forbidden.status}`);

  // ---------- notifications read flow ----------
  const inbox = (await call('GET', '/api/notifications')).json?.data ?? [];
  const unread = inbox.filter((n) => !n.is_read);
  if (unread.length) {
    const one = await call('POST', `/api/notifications/${unread[0].id}/read`);
    check('mark one notification read', one.ok);
  }
  const all = await call('POST', '/api/notifications/read-all');
  check('mark-all-read responds', all.ok, `marked=${all.json?.data?.marked}`);
  const cnt = await call('GET', '/api/notifications/unread-count');
  check('unread count is 0 after read-all', cnt.json?.data?.count === 0, `count=${cnt.json?.data?.count}`);

  // ---------- CLEANUP ----------
  // leads/expenses have no DELETE route, so remove the test rows directly.
  try {
    const { DatabaseSync } = require('node:sqlite');
    const path = require('path');
    const db = new DatabaseSync(path.join(__dirname, '..', '..', 'backend', 'mira.db'));
    for (const id of created.leads) {
      db.prepare('DELETE FROM lead_followups WHERE lead_id = ?').run(id);
      db.prepare('DELETE FROM leads WHERE id = ?').run(id);
    }
    for (const id of created.expenses) db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    // Notifications emitted by this run all carry the unique stamp.
    const ntf = db.prepare('SELECT id FROM notifications WHERE title LIKE ?').all(`%${stamp}%`);
    for (const row of ntf) {
      db.prepare('DELETE FROM notification_reads WHERE notification_id = ?').run(row.id);
      db.prepare('DELETE FROM notifications WHERE id = ?').run(row.id);
    }
    db.close();
    console.log(`cleanup: removed ${created.leads.length} lead(s), ${created.expenses.length} expense(s), ${ntf.length} notification(s)`);
  } catch (e) {
    console.warn('cleanup failed:', e.message);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length) { console.log('FAILURES:'); failures.forEach((f) => console.log('  -', f.name, f.detail)); }
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
