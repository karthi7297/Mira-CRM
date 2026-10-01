/* eslint-disable */
/** Focused interaction test: Contacts tab, Support ticket, Announcement, Profile. */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const PW = 'C:/Users/91915/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright-core';
const CHROME = 'C:/Users/91915/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';
const require2 = createRequire(path.join(process.cwd(), 'x.js'));
const { chromium } = require2(PW);

const out = { tests: [] };
const rec = (name, pass, extra) => { out.tests.push({ name, pass, ...(extra || {}) }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + JSON.stringify(extra) : '')); };

async function login(page, c) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  return page.evaluate(async (c) => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
    const j = await r.json();
    localStorage.setItem('mira_user', JSON.stringify(j.data));
    return j.data;
  }, c);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--disable-features=NetworkServiceSandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await login(page, { email: 'org@rampex.demo', password: 'org123' });

  // 1. Customer 360 → Contacts tab
  await page.goto(BASE + '/customers/CUST-001', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Contacts', exact: true }).click();
  await page.waitForTimeout(600);
  const contactsVisible = await page.getByText('Customer Contacts').count();
  rec('Customer360 Contacts tab renders', contactsVisible > 0);

  // 2. Add a contact
  await page.getByPlaceholder('Name *').fill('E2E Coordinator');
  await page.getByPlaceholder('Email').fill('e2e.coord@abc.edu');
  await page.getByRole('button', { name: '+ Add Contact' }).click();
  await page.waitForTimeout(900);
  const contactRow = await page.getByText('E2E Coordinator').count();
  rec('Add contact persists', contactRow > 0);

  // 3. Support: create a ticket
  await page.goto(BASE + '/support', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '+ New ticket' }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Subject *').fill('E2E smoke ticket');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(1200);
  const ticketRow = await page.getByText('E2E smoke ticket').count();
  rec('Support ticket created', ticketRow > 0);

  // 4. Announcements: create one
  await page.goto(BASE + '/announcements', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '+ New announcement' }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Title *').fill('E2E Announcement');
  await page.getByPlaceholder('Message…').fill('Automated smoke test announcement.');
  await page.getByRole('button', { name: 'Post' }).click();
  await page.waitForTimeout(1200);
  const annRow = await page.getByText('E2E Announcement').count();
  rec('Announcement created', annRow > 0);

  // 5. Profile: load + save name
  await page.goto(BASE + '/profile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const profileLoaded = await page.getByText('My Profile').count();
  rec('Profile page loads', profileLoaded > 0);
  const nameInput = page.locator('form input').first();
  await nameInput.fill('Rampex Admin');
  await page.getByRole('button', { name: /Save changes/i }).click();
  await page.waitForTimeout(900);
  const savedToast = await page.getByText(/Profile updated/i).count();
  rec('Profile save works', savedToast > 0);

  // 6. Users page (org only)
  await page.goto(BASE + '/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const usersHead = await page.getByText(/Users|Access/i).count();
  rec('Users page loads', usersHead > 0);

  rec('no page errors', errs.length === 0, { errors: errs });

  await browser.close();
  fs.writeFileSync('audit/interaction-results.json', JSON.stringify(out, null, 2));
  const fails = out.tests.filter((t) => !t.pass).length;
  console.log('\n' + (out.tests.length - fails) + '/' + out.tests.length + ' passed');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
