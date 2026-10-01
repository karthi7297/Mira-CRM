import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/91915/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright-core');
const CHROME = 'C:/Users/91915/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--disable-features=NetworkServiceSandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
let leadPosts = 0;
page.on('request', (r) => { if (r.url().includes('/api/leads') && r.method() === 'POST') leadPosts++; });

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
const login = await page.evaluate(async () => {
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'org@rampex.demo', password: 'org123' }) });
  return r.json();
});
await page.evaluate((u) => localStorage.setItem('mira_user', JSON.stringify(u)), login.data);
await page.setViewportSize({ width: 390, height: 900 });
await page.goto(BASE + '/leads', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(800);

await page.locator('button', { hasText: /new lead/i }).first().click();
await page.waitForTimeout(400);

await page.locator('input[placeholder="Organization *"]').fill('Guard Test Org');
await page.locator('input[placeholder="Contact Person *"]').fill('Guard Tester');
await page.locator('input[placeholder="Email"]').fill('bad-email');
console.log('filled form with invalid email');

await page.locator('.modal button[type="submit"]').click().catch(() => page.locator('.modal button').first().click());
await page.waitForTimeout(700);

const errTexts = await page.locator('.modal .err, .err, [role="alert"]').allInnerTexts().catch(() => []);
console.log('visible error text:', JSON.stringify(errTexts));
console.log('POST /api/leads fired:', leadPosts, '(expect 0 — client guard blocked it)');
console.log(leadPosts === 0 && errTexts.some((t) => /valid email/i.test(t)) ? 'PASS: client-side email guard works' : 'CHECK: guard result');

await browser.close();
