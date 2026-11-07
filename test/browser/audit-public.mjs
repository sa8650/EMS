/**
 * Real-browser audit of the public site over HTTP.
 *
 * Catches what jsdom cannot: console errors, failed network requests (wrong
 * MIME types, 404s), broken images, overflow at mobile width, and dead links.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';

const PAGES = [
  ['/', 'landing'],
  ['/about', 'about'],
  ['/terms', 'terms'],
  ['/privacy', 'privacy'],
  ['/blog', 'blog list'],
  ['/contact', 'contact'],
  ['/app-store', 'app store']
];

const problems = [];
const note = (page, kind, detail) => problems.push({ page, kind, detail });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });

for (const [path, label] of PAGES) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));
  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('127.0.0.1:8788') && !url.includes('/api/')) {
      failedRequests.push(`${req.method()} ${url} — ${req.failure()?.errorText}`);
    }
  });
  page.on('response', res => {
    const url = res.url();
    if (!url.includes('127.0.0.1:8788') || url.includes('/api/')) return;
    if (res.status() >= 400) badResponses.push(`HTTP ${res.status()} ${url}`);
    // A JS/CSS URL answered with HTML is the signature of the routing bug.
    const ct = res.headers()['content-type'] || '';
    if (/\.(js|mjs)(\?|$)/.test(url) && !/javascript/.test(ct)) badResponses.push(`WRONG MIME ${url} -> ${ct}`);
    if (/\.css(\?|$)/.test(url) && !/text\/css/.test(ct)) badResponses.push(`WRONG MIME ${url} -> ${ct}`);
  });

  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 25000 });
  } catch (e) {
    note(label, 'navigation', `could not load: ${e.message}`);
    await page.close();
    continue;
  }
  await page.waitForTimeout(600);

  // The app shell must have painted something real.
  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  if (!bodyText.trim()) note(label, 'blank page', 'body has no text');
  if (/EMS could not finish starting/i.test(bodyText)) note(label, 'boot failure', bodyText.slice(0, 200));
  if (/Script load failed/i.test(bodyText)) note(label, 'script load failure', bodyText.slice(0, 200));

  for (const err of consoleErrors) note(label, 'console error', err.slice(0, 300));
  for (const f of failedRequests) note(label, 'failed request', f);
  for (const b of badResponses) note(label, 'bad response', b);

  // Broken images.
  const brokenImages = await page.$$eval('img', imgs =>
    imgs.filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc)
        .map(i => i.currentSrc || i.getAttribute('src'))
  );
  for (const src of brokenImages) note(label, 'broken image', src);

  // Horizontal overflow on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const overflow = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > docW + 2 && getComputedStyle(el).position !== 'fixed';
    }).slice(0, 4).map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} (right=${Math.round(el.getBoundingClientRect().right)})`);
    return { scrollW: document.documentElement.scrollWidth, docW, wide };
  });
  if (overflow.scrollW > overflow.docW + 2) {
    note(label, 'mobile overflow', `scrollWidth ${overflow.scrollW} > ${overflow.docW}; ${overflow.wide.join(', ')}`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });

  // Internal links must point at routes that exist.
  const links = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
  const internal = [...new Set(links.filter(h => h && h.startsWith('/') && !h.startsWith('//')))];
  for (const href of internal) {
    const target = href.split('#')[0] || '/';
    const res = await page.request.get(BASE + target, { maxRedirects: 0 });
    if (res.status() >= 400) note(label, 'dead link', `${href} -> HTTP ${res.status()}`);
  }

  // Owner console must not be advertised anywhere.
  const ownerRefs = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href');
      if (h && /^\/owner/i.test(h) && !/^\/ownerconsole/i.test(h)) out.push(`<a href="${h}">${a.textContent.trim()}</a>`);
    }
    if (/owner login/i.test(document.body.innerText)) out.push('body text contains "owner login"');
    return out;
  });
  for (const r of ownerRefs) note(label, 'owner entry point leaked', r);

  const h1 = await page.locator('h1').first().innerText().catch(() => '(none)');
  console.log(`  ${label.padEnd(12)} ${path.padEnd(12)} h1="${h1.slice(0, 48)}" links=${internal.length}`);
  await page.close();
}

await browser.close();

console.log('');
if (!problems.length) {
  console.log('✔ No problems found on the public pages.');
  process.exit(0);
}
console.log(`✖ ${problems.length} problem(s):`);
const grouped = {};
for (const p of problems) (grouped[p.page] ||= []).push(p);
for (const [page, list] of Object.entries(grouped)) {
  console.log(`\n  ${page}`);
  for (const p of list) console.log(`    [${p.kind}] ${p.detail}`);
}
process.exit(1);
