/**
 * UI smoke test for the four audit fixes (D8 / D25 / E5-D21 / B4-F7).
 *
 * Drives the real app in Chromium against the Vite dev server (:5173 -> :4000)
 * and asserts the new surfaces actually render and that an archive round-trip
 * works through the UI (not just the API).
 *
 *   NODE_PATH=<antigravity node_modules> node ui-lifecycle-smoke.cjs
 */
const { chromium } = require('playwright-core');

const BASE = process.env.BASE || 'http://localhost:5173';
const EXEC = process.env.CHROME
  || 'C:/Users/91915/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const count = (page, sel) => page.locator(sel).count();

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', (d) => d.accept()); // auto-accept the archive confirm()

  try {
    // ---------- login ----------
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const submit = page.locator('form button[type="submit"]').first();
    if (await submit.count()) {
      await submit.click();
      await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 8000 }).catch(() => {});
    }
    await page.waitForTimeout(1500);
    check('logged in (left the login screen)', !/Sign in/i.test(await page.title() || '') && !(await page.locator('.login-card').count()),
      'url=' + page.url());

    // ---------- B4 / F7 — notification bell ----------
    check('notification bell renders in the topbar', (await count(page, '.bell-btn')) === 1);
    await page.locator('.bell-btn').first().click();
    await page.waitForTimeout(400);
    check('notification bell opens a panel', (await count(page, '.bell-panel')) === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // ---------- per-page control matrix ----------
    const PAGES = [
      { path: '/leads', label: 'Leads', date: true, arch: true },
      { path: '/customers', label: 'Institutions', date: true, arch: true },
      { path: '/programs', label: 'Programs', date: false, arch: true },
      { path: '/trainers', label: 'Trainers', date: false, arch: true },
      { path: '/batches', label: 'Batches', date: true, arch: true },
      { path: '/students', label: 'Students', date: true, arch: true },
      { path: '/quotations', label: 'Quotations', date: true, arch: true },
      { path: '/invoices', label: 'Invoices', date: true, arch: true },
      { path: '/expenses', label: 'Expenses', date: true, arch: true },
    ];

    for (const p of PAGES) {
      await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      // Leads defaults to a Kanban board — flip it to the table view first so
      // the toolbar (and its controls) render.
      if (p.path === '/leads') {
        const tableBtn = page.locator('.seg button', { hasText: 'Table' });
        if (await tableBtn.count()) { await tableBtn.first().click(); await page.waitForTimeout(500); }
      }
      const hasRows = (await count(page, 'table tbody tr')) > 0;

      if (p.arch) {
        const n = await count(page, '.arch-toggle');
        // The toggle lives inside the toolbar, which only renders once the list
        // is non-empty (or already in archive view).
        check(`${p.label}: archive toggle present`, n === 1, hasRows ? '' : 'no rows in seed');
      }
      if (p.date) {
        const n = await count(page, '.daterange');
        check(`${p.label}: date-range picker present`, n === 1, hasRows ? '' : 'no rows in seed');
      }
    }

    // ---------- E5 / D21 — expense linkage selects ----------
    await page.goto(BASE + '/expenses', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    check('Expenses: customer linkage select', (await count(page, 'select[aria-label="Customer (optional)"]')) === 1);
    check('Expenses: batch linkage select', (await count(page, 'select[aria-label="Batch (optional)"]')) === 1);
    check('Expenses: trainer linkage select', (await count(page, 'select[aria-label="Trainer (optional)"]')) === 1);
    check('Expenses: "Linked To" column header', (await page.locator('th', { hasText: 'Linked To' }).count()) >= 1);

    // ---------- D8 — archive round-trip through the UI ----------
    await page.goto(BASE + '/leads', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    {
      const tableBtn = page.locator('.seg button', { hasText: 'Table' });
      if (await tableBtn.count()) { await tableBtn.first().click(); await page.waitForTimeout(600); }
    }
    const liveBefore = await count(page, 'table tbody tr');
    if (liveBefore > 0) {
      const firstArchive = page.locator('table tbody tr').first().getByRole('button', { name: 'Archive' });
      if (await firstArchive.count()) {
        await firstArchive.click();
        await page.waitForTimeout(1200);
        const liveAfter = await count(page, 'table tbody tr');
        check('Leads: Archive removes the row from the live list', liveAfter === liveBefore - 1,
          `${liveBefore} -> ${liveAfter}`);

        // Flip to the archive view — the archived row should now appear.
        await page.locator('.arch-toggle input').first().check();
        await page.waitForTimeout(1200);
        const archivedRows = await count(page, 'table tbody tr');
        check('Leads: archived row appears in the archive view', archivedRows >= 1, `rows=${archivedRows}`);

        // Restore it so we leave the data exactly as we found it.
        const restoreBtn = page.locator('table tbody tr').first().getByRole('button', { name: 'Restore' });
        if (await restoreBtn.count()) {
          await restoreBtn.click();
          await page.waitForTimeout(1200);
          await page.locator('.arch-toggle input').first().uncheck();
          await page.waitForTimeout(1000);
          const liveRestored = await count(page, 'table tbody tr');
          check('Leads: Restore puts the row back in the live list', liveRestored === liveBefore,
            `expected ${liveBefore}, got ${liveRestored}`);
        } else {
          check('Leads: Restore button present in archive view', false, 'not found');
        }
      } else {
        check('Leads: Archive row button present', false, 'no live rows to archive');
      }
    } else {
      check('Leads: has live rows to exercise archive', false, 'seed produced no rows');
    }

    // ---------- D8 — merge-duplicates modal reachable from the UI ----------
    await page.goto(BASE + '/leads', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    {
      const mergeBtn = page.locator('button', { hasText: 'Merge duplicates' });
      if (await mergeBtn.count()) {
        await mergeBtn.first().click();
        await page.waitForTimeout(400);
        const modal = page.locator('.modal', { hasText: 'Merge' });
        const hasPrimary = await modal.locator('select').count();
        check('Leads: "Merge duplicates" opens the merge modal', (await modal.count()) >= 1 && hasPrimary >= 2,
          `selects=${hasPrimary}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      } else {
        check('Leads: "Merge duplicates" button present', false, 'not found');
      }
    }

    // ---------- D25 — date filter actually narrows the list ----------
    await page.goto(BASE + '/leads', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    {
      const tableBtn = page.locator('.seg button', { hasText: 'Table' });
      if (await tableBtn.count()) { await tableBtn.first().click(); await page.waitForTimeout(600); }
    }
    const rowsAll = await count(page, 'table tbody tr');
    if (rowsAll > 0) {
      const inputs = page.locator('.daterange input[type="date"]');
      await inputs.nth(0).fill('2099-01-01');
      await page.waitForTimeout(600);
      const rowsNone = await count(page, 'table tbody tr');
      check('Leads: a far-future "from" date filters every row out', rowsNone === 0, `${rowsAll} -> ${rowsNone}`);
    }

    check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } catch (err) {
    check('smoke run completed without throwing', false, String(err && err.message || err));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  require('fs').writeFileSync(__dirname + '/ui-lifecycle-results.json', JSON.stringify({ results, passed: results.length - failed.length, total: results.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
