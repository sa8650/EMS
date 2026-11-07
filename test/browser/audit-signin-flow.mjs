/**
 * The full journey a real user takes: open the public page, click sign-in,
 * submit the form, land in the console, then press F5.
 *
 * Every one of these steps has broken at some point in this project's history
 * (a modal that could not be built, a modal that stayed on screen after a
 * successful sign-in, a console that died on refresh), so they are asserted
 * end to end against the real API and the real assets.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const problems = [];
const pass = [];

function token(minutes = 240) {
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ sub: 'u', exp: Math.floor(Date.now() / 1000) + minutes * 60 })}.sig`;
}

/** Serve a canned login response plus the console's session bootstrap. */
async function wireApi(page, kind) {
  const me = {
    id: 'u1', name: 'Test User', role: kind === 'shop' ? 'staff' : kind,
    permissions: Object.fromEntries(
      ['dashboard', 'supplier', 'customer', 'inventory', 'purchase', 'sales', 'expense', 'due_recover',
        'returns_refunds', 'staff', 'report', 'settings', 'audit-log', 'connectx', 'zudo', 'vaultium',
        'attendance', 'salary'].map(s => [s, ['view', 'add', 'edit', 'delete']])
    ),
    store: { id: 'st1', shop_id: 1001, name: 'Main Branch', shop_type: 'electronics' },
    readOnly: false, licenseExpired: false
  };
  const bodies = {
    'auth/ems/login': { token: token(), role: 'owner', user: { id: 'o1', name: 'Platform Owner', email: 'owner@example.com' } },
    'auth/admin/login': { token: token(), role: 'admin', user: { id: 'a1', name: 'Admin', email: 'admin@example.com' } },
    'auth/shop/login': { token: token(), role: 'staff', user: { id: 's1', name: 'Staff', email: 's1@example.com' }, store: me.store, permissions: me.permissions },
    'me': me,
    'admin/entitlement': { hasActivatedLicense: true, active: true }
  };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const key = url.pathname.replace(/^\/api\//, '');
    if (bodies[key]) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bodies[key]) });
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'not mocked: ' + key }) });
  });
}

const browser = await chromium.launch();

const CASES = [
  { name: 'owner', start: '/owner', form: '#emsform', fields: { email: 'owner@example.com', password: 'correct-horse-battery' }, home: '/ownerconsole', bodyClass: 'ob-on', kind: 'owner' },
  { name: 'administrator', start: '/administrator', form: '#authform', fields: { email: 'admin@example.com', password: 'correct-horse-battery' }, home: '/administratorconsole', bodyClass: 'adm-on', kind: 'admin' },
  { name: 'shop staff', start: '/shop', form: '#authform', fields: { storeId: '1001', userId: 'staff1', password: 'correct-horse-battery' }, home: '/shopconsole', bodyClass: 'shp-on', kind: 'shop' }
];

for (const testCase of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await wireApi(page, testCase.kind);

  await page.goto(BASE + testCase.start, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const modalBefore = await page.locator('#authlayer').innerText().catch(() => '');
  if (!modalBefore.trim()) problems.push(`${testCase.name}: ${testCase.start} did not open the sign-in dialog`);

  for (const [name, value] of Object.entries(testCase.fields)) {
    await page.fill(`${testCase.form} [name="${name}"]`, value);
  }
  await page.click(`${testCase.form} button:not(.linkbutton)`);
  await page.waitForTimeout(1400);

  const layerVisible = await page.locator('#authlayer').isVisible().catch(() => false);
  if (layerVisible) problems.push(`${testCase.name}: the sign-in dialog stayed on screen after signing in`);
  else pass.push(`${testCase.name}: dialog closes on success`);

  const path = new URL(page.url()).pathname;
  if (path !== testCase.home) problems.push(`${testCase.name}: landed on ${path}, expected ${testCase.home}`);
  else pass.push(`${testCase.name}: lands on ${testCase.home}`);

  if (!(await page.evaluate(c => document.body.classList.contains(c), testCase.bodyClass))) {
    problems.push(`${testCase.name}: body.${testCase.bodyClass} is missing — the console did not render`);
  } else pass.push(`${testCase.name}: console renders`);

  // The refresh. This is the bug from the report.
  const assetsBefore = [];
  page.on('response', res => {
    const url = res.url();
    if (/\/assets\/js\/.*\.js/.test(url)) assetsBefore.push(`${res.status()} ${url}`);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  const afterText = await page.locator('body').innerText();
  if (/Script load failed|EMS could not finish starting/i.test(afterText)) {
    problems.push(`${testCase.name}: refresh failed with a boot error`);
  } else pass.push(`${testCase.name}: survives refresh`);

  if (!(await page.evaluate(c => document.body.classList.contains(c), testCase.bodyClass))) {
    problems.push(`${testCase.name}: console did not come back after refresh`);
  }
  const badAssets = assetsBefore.filter(a => !a.startsWith('200'));
  if (badAssets.length) problems.push(`${testCase.name}: assets not 200 after refresh — ${badAssets.join(', ')}`);

  for (const e of errors) problems.push(`${testCase.name}: page error ${e.slice(0, 140)}`);
  await ctx.close();
}

await browser.close();
console.log('Passed:');
for (const p of pass) console.log('  ✔ ' + p);
console.log('');
if (!problems.length) {
  console.log('✔ Sign in, land in the console, and refresh works for every role.');
  process.exit(0);
}
console.log(`✖ ${problems.length} problem(s):`);
for (const p of problems) console.log('  • ' + p);
process.exit(1);
