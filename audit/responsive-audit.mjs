// Responsive + console audit for Mira-CRM.
// Uses playwright-core from the Antigravity IDE bundle (no separate install).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/91915/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright-core');

const BASE = 'http://localhost:5173';
const CHROME = 'C:/Users/91915/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const SHOTS = 'C:/Users/91915/Documents/Mira-CRM/audit/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const ROLES = [
  { role: 'organization', email: 'org@rampex.demo', pw: 'org123',
    routes: ['/', '/leads', '/cold-mail', '/customers', '/programs', '/trainers', '/batches', '/students', '/assessments', '/leave-approval', '/quotations', '/invoices', '/payments', '/collections', '/certificates', '/expenses', '/reports'] },
  { role: 'institution', email: 'direct@rampex.demo', pw: 'direct123',
    routes: ['/', '/college', '/batches', '/students', '/assessments', '/attendance-details', '/quotations', '/invoices', '/payments', '/collections', '/certificates', '/reports'] },
  { role: 'trainer', email: 'trainer@rampex.demo', pw: 'trainer123',
    routes: ['/', '/programs', '/batches', '/students', '/assessments', '/attendance', '/my-leave', '/my-finance', '/certificates'] },
  { role: 'student', email: 'arun@student.edu', pw: 'arun123',
    routes: ['/learning'] },
];

// Pages where we also try to open the primary "create" modal to test bottom-sheets.
const MODAL_TEST = {
  '/programs': /new program/i,
  '/students': /add student/i,
  '/leads': /new lead/i,
  '/assessments': /new assessment|create/i,
  '/quotations': /new quotation/i,
  '/invoices': /new invoice/i,
};

const VIEWPORTS = [390, 768];

async function measureOverflow(page) {
  return await page.evaluate(() => {
    const vw = window.innerWidth;
    const de = document.documentElement;
    const overflow = Math.max(de.scrollWidth, document.body.scrollWidth) - vw;
    const offenders = [];
    const walk = (el) => {
      if (offenders.length > 12) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 40 && getComputedStyle(el).position !== 'fixed') {
        offenders.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), w: Math.round(r.width), right: Math.round(r.right) });
      }
      if (el.children) for (const c of el.children) walk(c);
    };
    walk(document.body);
    return { vw, overflow, offenders };
  });
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--disable-features=NetworkServiceSandbox'] });
  const results = [];
  const report = [];

  for (const R of ROLES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // Establish the app origin first so relative fetches are same-origin.
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    // Login via API, store user in localStorage the way the app does.
    const login = await page.evaluate(async ({ email, pw }) => {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
      const j = await r.json();
      return j;
    }, { email: R.email, pw: R.pw });
    if (!login.success) { report.push({ role: R.role, loginError: login.error }); await ctx.close(); continue; }
    await page.evaluate((u) => localStorage.setItem('mira_user', JSON.stringify(u)), login.data);
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});

    for (const route of R.routes) {
      for (const vw of VIEWPORTS) {
        await page.setViewportSize({ width: vw, height: 900 });
        consoleErrors.length = 0; pageErrors.length = 0;
        await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForTimeout(700);
        const m = await measureOverflow(page);
        const name = `${R.role}_${route.replace(/\//g, '_') || 'root'}_${vw}`;
        let modal = null;
        const trigger = MODAL_TEST[route];
        if (trigger && vw === 390) {
          try {
            const btn = page.locator('button', { hasText: trigger }).first();
            if (await btn.count()) {
              await btn.click({ timeout: 3000 });
              await page.waitForTimeout(600);
              modal = await page.evaluate(() => {
                const el = document.querySelector('.modal');
                if (!el) return { found: false };
                const r = el.getBoundingClientRect();
                const inner = el.scrollWidth;
                return { found: true, w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), scrollW: inner, overflow: inner - window.innerWidth };
              });
              await page.keyboard.press('Escape');
              await page.waitForTimeout(300);
            }
          } catch (e) { modal = { found: true, error: String(e.message).slice(0, 80) }; }
        }
        const rec = { role: R.role, route, vw, overflow: m.overflow, offenders: m.offenders, console: consoleErrors.slice(0, 5), pageErrors: pageErrors.slice(0, 5), modal };
        results.push(rec);
        if (m.overflow > 2 || m.offenders.length || pageErrors.length || (modal && modal.overflow > 2)) {
          await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
        }
        report.push({ role: R.role, route, vw, overflow: m.overflow, offenders: m.offenders.length, pageErrors: pageErrors.length, modalOverflow: modal?.overflow ?? null });
      }
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync('C:/Users/91915/Documents/Mira-CRM/audit/results.json', JSON.stringify(results, null, 2));
  // Print a compact issues summary
  const issues = results.filter((r) => r.overflow > 2 || r.offenders.length || r.pageErrors.length || (r.modal && r.modal.overflow > 2));
  console.log('\n==== AUDIT SUMMARY ====');
  console.log(`Total page-loads: ${results.length} | issues: ${issues.length}`);
  for (const i of issues) {
    console.log(`[${i.role}] ${i.route} @${i.vw} -> overflow=${i.overflow} offenders=${i.offenders.length} pageErr=${i.pageErrors.length} modalOverflow=${i.modal?.overflow ?? '-'}`);
    for (const o of i.offenders.slice(0, 4)) console.log(`    offender: <${o.tag} class="${o.cls}"> w=${o.w} right=${o.right}`);
    for (const e of i.pageErrors.slice(0, 3)) console.log(`    pageerror: ${e.slice(0, 100)}`);
  }
  const allConsole = results.flatMap((r) => r.console);
  if (allConsole.length) {
    console.log('\n--- console errors (sample) ---');
    [...new Set(allConsole)].slice(0, 15).forEach((c) => console.log('  ' + c.slice(0, 140)));
  }
}

run().catch((e) => { console.error('AUDIT FAILED', e); process.exit(1); });
