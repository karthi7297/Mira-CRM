import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/91915/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright-core');
const CHROME = 'C:/Users/91915/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--disable-features=NetworkServiceSandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
const login = await page.evaluate(async () => {
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'org@rampex.demo', password: 'org123' }) });
  return r.json();
});
await page.evaluate((u) => localStorage.setItem('mira_user', JSON.stringify(u)), login.data);
await page.goto(BASE + '/leads', { waitUntil: 'networkidle' }).catch(() => {});

for (const vw of [390, 768]) {
  await page.setViewportSize({ width: vw, height: 900 });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const meta = document.querySelector('meta[name=viewport]');
    const board = document.querySelector('.kanban-board');
    const cols = [...document.querySelectorAll('.kanban-col')];
    const cs = board ? getComputedStyle(board) : null;
    return {
      innerWidth: window.innerWidth,
      meta: meta ? meta.getAttribute('content') : 'NONE',
      view: document.querySelector('.seg .on')?.textContent || '?',
      boardDisplay: cs?.display, boardDirection: cs?.flexDirection, boardOverflowX: cs?.overflowX,
      colCount: cols.length,
      cols: cols.slice(0, 2).map((c) => ({ w: Math.round(c.getBoundingClientRect().width), left: Math.round(c.getBoundingClientRect().left), right: Math.round(c.getBoundingClientRect().right) })),
      bodyOverflowX: getComputedStyle(document.querySelector('.body')).overflowX,
    };
  });
  console.log(`\n=== vw=${vw} ===`);
  console.log(JSON.stringify(info, null, 2));
}
await browser.close();
