/**
 * Reproduces issue #2 the way a user hits it: sign in, land deep inside a
 * console, then press F5.
 *
 * Before the fix the shell was served at /shopconsole (and every nested page)
 * but loaded `assets/js/app.js` relatively, so the browser asked for
 * /shopconsole/assets/js/app.js, got HTML back, and the page died with
 * "Script load failed".
 *
 * This boots each console URL directly with a stored session — exactly what a
 * refresh does — and asserts the app really starts.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';

/** A token shaped like the app's JWT so scheduleLogout() can read `exp`. */
function token(minutes = 60) {
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + minutes * 60 })}.sig`;
}

const SESSIONS = {
  owner: { token: token(), role: 'owner', user: { id: 'o1', name: 'Platform Owner', email: 'owner@example.com' } },
  admin: { token: token(), role: 'admin', user: { id: 'a1', name: 'Rahman Traders', email: 'admin@example.com' } },
  staff: {
    token: token(), role: 'staff',
    user: { id: 's1', name: 'Counter Staff', email: 'staff@example.com' },
    store: { id: 'st1', shop_id: 1001, name: 'Main Branch', shop_type: 'electronics' },
    permissions: {}
  }
};

const CASES = [
  ['owner', '/ownerconsole', 'ob-on'],
  ['owner', '/ownerconsole/licenses', 'ob-on'],
  ['owner', '/ownerconsole/plans', 'ob-on'],
  ['owner', '/ownerconsole/branding', 'ob-on'],
  ['admin', '/administratorconsole', 'adm-on'],
  ['admin', '/administratorconsole/stores', 'adm-on'],
  ['staff', '/shopconsole', 'shp-on'],
  ['staff', '/shopconsole/pharmacy-pos', 'shp-on'],
  ['staff', '/shopconsole/sales', 'shp-on']
];

const problems = [];
const browser = await chromium.launch();

for (const [role, path, bodyClass] of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  // Seed the session before any script runs — this is the "refresh" condition.
  await ctx.addInitScript(session => {
    localStorage.setItem('ems.session', JSON.stringify(session));
  }, SESSIONS[role]);

  const page = await ctx.newPage();
  const scriptFailures = [];
  const wrongMime = [];

  page.on('response', res => {
    const url = res.url();
    if (!url.includes('127.0.0.1:8788')) return;
    const ct = res.headers()['content-type'] || '';
    if (/\.(js|mjs)(\?|$)/.test(url) && !/javascript/.test(ct)) wrongMime.push(`${url} -> ${ct}`);
    if (/\.css(\?|$)/.test(url) && !/text\/css/.test(ct)) wrongMime.push(`${url} -> ${ct}`);
    if (/\/assets\/js\/app\.js/.test(url) && res.status() !== 200) scriptFailures.push(`app.js HTTP ${res.status()}`);
  });
  page.on('pageerror', err => scriptFailures.push('pageerror: ' + err.message));

  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(1200);

  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  const hasBodyClass = await page.evaluate(c => document.body.classList.contains(c), bodyClass);
  const bootFailure = /Script load failed|EMS could not finish starting/i.test(bodyText);
  const whichApp = await page.evaluate(() =>
    document.querySelector('.ems-boot-surface') ? 'startup-panel'
      : document.querySelector('.pubsite') ? 'public-site'
      : 'console');

  const label = `${role.padEnd(5)} ${path}`;
  if (scriptFailures.length) problems.push(`${label} — script failure: ${scriptFailures.join('; ')}`);
  if (wrongMime.length) problems.push(`${label} — wrong MIME: ${wrongMime.join('; ')}`);
  if (bootFailure) problems.push(`${label} — boot failure banner: ${bodyText.slice(0, 160).replace(/\n/g, ' ')}`);
  if (!hasBodyClass) problems.push(`${label} — body.${bodyClass} missing (rendered: ${whichApp})`);

  console.log(`  ${label}  body.${bodyClass}=${hasBodyClass}  rendered=${whichApp}  url=${new URL(page.url()).pathname}`);
  await ctx.close();
}

await browser.close();
console.log('');
if (!problems.length) {
  console.log('✔ Every console survives a refresh: no script-load failures, correct MIME types.');
  process.exit(0);
}
console.log(`✖ ${problems.length} problem(s):`);
for (const p of problems) console.log('   ' + p);
process.exit(1);
