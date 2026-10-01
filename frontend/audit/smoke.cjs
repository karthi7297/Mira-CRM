/* eslint-disable */
/**
 * Post-fix smoke test for Mira-CRM.
 *  · logs in as each role via the real API, seeds localStorage
 *  · visits every route and records console errors / page errors / failed requests
 *  · exercises the new list toolkit (sort, pagination, bulk) and modal a11y
 * Writes audit/smoke-results.json.
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const PW = 'C:/Users/91915/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright-core';
const CHROME = 'C:/Users/91915/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';

const require2 = createRequire(path.join(process.cwd(), 'x.js'));
const { chromium } = require2(PW);

const ROLES = {
  organization: { email: 'org@rampex.demo', password: 'org123' },
  institution: { email: 'abc@college.edu', password: 'abc123' },
};

const ROUTES = {
  organization: ['/', '/leads', '/customers', '/programs', '/trainers', '/batches', '/students',
    '/assessments', '/attendance', '/quotations', '/invoices', '/payments', '/expenses',
    '/reports', '/collections', '/certificates', '/support', '/announcements', '/users', '/profile'],
  institution: ['/', '/college', '/programs', '/batches', '/students', '/assessments',
    '/attendance-details', '/quotations', '/invoices', '/payments', '/reports',
    '/support', '/announcements', '/profile'],
};

const results = { routes: [], modals: [], toolkit: [], summary: {} };

async function loginAndSeed(page, role) {
  const creds = ROLES[role];
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  const user = await page.evaluate(async (c) => {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const j = await r.json();
    if (!j.success) throw new Error('login failed: ' + j.error);
    localStorage.setItem('mira_user', JSON.stringify(j.data));
    return j.data;
  }, creds);
  return user;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-proxy-server', '--disable-features=NetworkServiceSandbox'],
  });

  for (const role of Object.keys(ROLES)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => {
      const u = r.url();
      if (u.includes('/api/')) errors.push('reqfail: ' + u + ' ' + (r.failure() && r.failure().errorText));
    });

    try {
      const user = await loginAndSeed(page, role);
      for (const route of ROUTES[role]) {
        errors.length = 0;
        const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => null);
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const denied = await page.locator('.err', { hasText: 'Access Denied' }).count();
        results.routes.push({
          role, route,
          status: resp ? resp.status() : null,
          errors: [...errors],
          overflow,
          accessDenied: denied > 0,
          user: user.email,
        });
      }
    } catch (e) {
      results.routes.push({ role, route: '(setup)', errors: ['SETUP: ' + e.message] });
    }
    await ctx.close();
  }

  // ---- Modal a11y + toolkit behaviour (organization) ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await loginAndSeed(page, 'organization');

    // Escape closes a modal
    await page.goto(BASE + '/leads', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '+ New Lead' }).click();
    await page.waitForSelector('.modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const escClosed = (await page.locator('.modal').count()) === 0;
    results.modals.push({ test: 'escape closes modal', pass: escClosed });

    // Backdrop click closes a modal
    await page.getByRole('button', { name: '+ New Lead' }).click();
    await page.waitForSelector('.modal');
    const box = await page.locator('.modal').boundingBox();
    await page.mouse.click(box.x + 6, box.y + box.height - 6); // bottom-left corner = backdrop
    await page.waitForTimeout(300);
    const backdropClosed = (await page.locator('.modal').count()) === 0;
    results.modals.push({ test: 'backdrop click closes modal', pass: backdropClosed });

    // role=dialog stamped
    await page.getByRole('button', { name: '+ New Lead' }).click();
    await page.waitForSelector('.modal');
    const roleAttr = await page.locator('.modal > div').first().getAttribute('role');
    results.modals.push({ test: 'role=dialog present', pass: roleAttr === 'dialog', got: roleAttr });
    await page.keyboard.press('Escape');

    // Table view sort + pagination on Invoices
    await page.goto(BASE + '/invoices', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const hasPager = await page.locator('.pager').count();
    const sortThs = await page.locator('th.th-sort').count();
    const toolbar = await page.locator('.list-toolbar').count();
    results.toolkit.push({ test: 'invoices has list toolbar', pass: toolbar > 0 });
    results.toolkit.push({ test: 'invoices has sortable headers', pass: sortThs > 0, count: sortThs });
    // click a sort header, ensure no crash
    if (sortThs > 0) {
      await page.locator('th.th-sort').first().click();
      await page.waitForTimeout(200);
      await page.locator('th.th-sort').first().click();
      await page.waitForTimeout(200);
      results.toolkit.push({ test: 'sort header click no crash', pass: errs.length === 0 });
    }

    // Saved views bar present on invoices
    const svBar = await page.locator('.savedviews').count();
    results.toolkit.push({ test: 'invoices has saved views bar', pass: svBar > 0 });

    // Students bulk selection
    await page.goto(BASE + '/students', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const cbs = await page.locator('table tbody input[type=checkbox]').count();
    if (cbs > 0) {
      await page.locator('table tbody input[type=checkbox]').first().check();
      await page.waitForTimeout(200);
      const bulk = await page.locator('.bulkbar').count();
      results.toolkit.push({ test: 'students bulk bar appears', pass: bulk > 0 });
    } else {
      results.toolkit.push({ test: 'students bulk bar appears', pass: false, note: 'no rows/checkbox' });
    }

    results.toolkit.push({ test: 'no page errors during toolkit test', pass: errs.length === 0, errors: errs });
    await ctx.close();
  }

  await browser.close();

  const allRouteErrors = results.routes.filter((r) => (r.errors && r.errors.length) || r.accessDenied || (r.overflow || 0) > 2);
  results.summary = {
    routesTested: results.routes.length,
    routesWithProblems: allRouteErrors.length,
    modalTests: results.modals.length,
    modalPass: results.modals.filter((m) => m.pass).length,
    toolkitTests: results.toolkit.length,
    toolkitPass: results.toolkit.filter((t) => t.pass).length,
  };

  fs.mkdirSync('audit', { recursive: true });
  fs.writeFileSync('audit/smoke-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.summary, null, 2));
  if (allRouteErrors.length) {
    console.log('\n--- routes with problems ---');
    for (const r of allRouteErrors) {
      console.log(`${r.role} ${r.route} overflow=${r.overflow} denied=${r.accessDenied}`);
      (r.errors || []).forEach((e) => console.log('   ' + e));
    }
  }
  const badModals = results.modals.filter((m) => !m.pass);
  if (badModals.length) console.log('\nFAILED MODALS:', JSON.stringify(badModals, null, 2));
  const badToolkit = results.toolkit.filter((t) => !t.pass);
  if (badToolkit.length) console.log('\nFAILED TOOLKIT:', JSON.stringify(badToolkit, null, 2));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
