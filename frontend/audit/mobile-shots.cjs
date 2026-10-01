/**
 * Mobile diagnostic — screenshots + horizontal-overflow detection.
 *
 * Logs in ONCE and reuses the storage state across every device, because the
 * backend rate-limits the whole /api surface (300 req / 15 min per IP) and
 * re-logging in per device burns through it.
 *
 * Usage: NODE_PATH=<antigravity node_modules> node mobile-shots.cjs
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:5173';
const EXEC = process.env.CHROME
  || 'C:/Users/91915/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const OUT = path.join(__dirname, 'mobile');

const DEVICES = [
  { name: 'galaxy-fold-320', width: 320, height: 720 },
  { name: 'iphone-se-375', width: 375, height: 667 },
  { name: 'iphone-12-390', width: 390, height: 844 },
  { name: 'pixel-412', width: 412, height: 915 },
  { name: 'ipad-mini-768', width: 768, height: 1024 },
  // desktop control — must stay pixel-identical to before the mobile work
  { name: 'desktop-1280', width: 1280, height: 900, desktop: true },
];

const PAGES = [
  { path: '/', label: 'dashboard' },
  { path: '/leads', label: 'leads' },
  { path: '/expenses', label: 'expenses' },
  { path: '/students', label: 'students' },
  { path: '/batches', label: 'batches' },
  { path: '/invoices', label: 'invoices' },
  { path: '/support', label: 'support' },
];

const probePage = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1.5 || r.left < -1.5) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && cs.visibility === 'hidden') continue;
      offenders.push({
        sel: el.tagName.toLowerCase()
          + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), pos: cs.position,
      });
    }
  }
  const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; };
  const tbn = document.querySelector('.top-brand-name');
  const drl = document.querySelector('.daterange .dr-label');
  return {
    vw,
    docOverflow: document.documentElement.scrollWidth - vw,
    offenders: offenders.slice(0, 10),
    topBrandName: tbn ? rect(tbn) : null,
    topBrandNameText: tbn ? tbn.textContent : null,
    drLabel: drl ? rect(drl) : null,
    drLabelText: drl ? drl.textContent : null,
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXEC });
  const findings = [];

  // ---- one login, reused everywhere ----
  const boot = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const bp = await boot.newPage();
  await bp.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const bs = bp.locator('form button[type="submit"]').first();
  if (await bs.count()) { await bs.click(); await bp.waitForTimeout(1800); }
  const state = await boot.storageState();
  const loggedIn = (await bp.evaluate(() => !!localStorage.getItem('mira_user')));
  console.log(`bootstrap login: ${loggedIn ? 'OK' : 'FAILED'}`);
  await boot.close();

  for (const dev of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: dev.width, height: dev.height },
      deviceScaleFactor: 2,
      isMobile: !dev.desktop,
      hasTouch: !dev.desktop,
      storageState: state,
    });
    const page = await ctx.newPage();

    for (const p of PAGES) {
      await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      if (p.path === '/leads') {
        const t = page.locator('.seg button', { hasText: 'Table' });
        if (await t.count()) { await t.first().click(); await page.waitForTimeout(500); }
      }
      const probe = await probePage(page);
      await page.screenshot({ path: path.join(OUT, `${dev.name}-${p.label}.png`) });
      findings.push({ device: dev.name, page: p.label, ...probe });

      const flag = probe.docOverflow > 1 ? `OVERFLOW +${probe.docOverflow}px` : 'ok';
      const brand = probe.topBrandName ? `brand="${probe.topBrandNameText}" ${probe.topBrandName.w}x${probe.topBrandName.h}` : 'brand=n/a';
      const dr = probe.drLabel ? ` drLabel="${probe.drLabelText}" ${probe.drLabel.w}x${probe.drLabel.h}` : '';
      console.log(`${dev.name.padEnd(15)} ${p.label.padEnd(10)} ${flag.padEnd(16)} ${brand}${dr}`);
      for (const o of probe.offenders.slice(0, 4)) {
        console.log(`      ↳ ${o.sel}  [${o.left}..${o.right}] w=${o.w} pos=${o.pos}`);
      }
    }

    // ---- drawer open ----
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const burger = page.locator('.burger');
    // The burger is always in the DOM but display:none above 880px — check
    // visibility, not just presence, or the click times out on desktop.
    if ((await burger.count()) && (await burger.first().isVisible())) {
      await burger.first().click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `${dev.name}-drawer.png`) });
      const d = await page.evaluate(() => {
        const s = document.querySelector('.side');
        const r = s.getBoundingClientRect();
        return { left: Math.round(r.left), w: Math.round(r.width), vw: document.documentElement.clientWidth };
      });
      console.log(`${dev.name.padEnd(15)} drawer     ${d.left >= 0 && d.w <= d.vw ? 'ok' : 'OFF-SCREEN'}  side=[${d.left}..${d.left + d.w}] vw=${d.vw}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    await ctx.close();

    // ---- logged-out login screen (no login needed) ----
    const lctx = await browser.newContext({
      viewport: { width: dev.width, height: dev.height },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    const lp = await lctx.newPage();
    await lp.goto(BASE + '/', { waitUntil: 'networkidle' });
    await lp.waitForTimeout(600);
    await lp.screenshot({ path: path.join(OUT, `${dev.name}-login.png`) });
    const lprobe = await lp.evaluate(() => ({
      vw: document.documentElement.clientWidth,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    console.log(`${dev.name.padEnd(15)} login      ${lprobe.docOverflow > 1 ? 'OVERFLOW +' + lprobe.docOverflow + 'px' : 'ok'}`);
    findings.push({ device: dev.name, page: 'login', ...lprobe });
    await lctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
  const bad = findings.filter((f) => f.docOverflow > 1);
  const wrapped = findings.filter((f) => f.topBrandName && f.topBrandName.h > 30);
  console.log(`\n${findings.length - bad.length}/${findings.length} page-loads have no horizontal overflow`);
  console.log(`${wrapped.length} page-loads have a wrapped brand wordmark`);
  console.log(`screenshots -> ${OUT}`);
})();
