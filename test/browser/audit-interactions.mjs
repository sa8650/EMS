/**
 * Interaction audit: the public site's controls must actually do something.
 *
 * The project has been bitten before by a shell that *rendered* sign-in buttons
 * without the #authlayer element behind them, so every control is clicked here
 * and its effect asserted.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const problems = [];
const pass = [];

const browser = await chromium.launch();

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/503|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}

/* ── 1. Header sign-in controls open real modals ─────────────────────────── */
{
  const { ctx, page, errors } = await fresh();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });

  await page.click('.pubnav-actions [data-pub-auth="admin"]');
  await page.waitForTimeout(300);
  const adminModal = await page.locator('#authlayer').innerText().catch(() => '');
  if (!/Administrator sign in/.test(adminModal)) problems.push(`admin nav click did not open the admin modal (got: ${adminModal.slice(0, 80)})`);
  else pass.push('header → administrator modal');

  await page.click('#closeAuth');
  await page.waitForTimeout(250);
  if (!(await page.locator('#authlayer').isHidden())) problems.push('admin modal did not close');

  await page.click('.pubnav-actions [data-pub-auth="shop"]');
  await page.waitForTimeout(300);
  if (!/Shop sign in/.test(await page.locator('#authlayer').innerText())) problems.push('shop nav click did not open the shop modal');
  else pass.push('header → shop modal');

  // Escape must dismiss instead of stranding the modal.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  if (!(await page.locator('#authlayer').isHidden())) problems.push('Escape did not close the modal');
  else pass.push('Escape closes the modal');

  await page.click('.pubnav-actions [data-pub-register]');
  await page.waitForTimeout(300);
  if (!/Create administrator account/.test(await page.locator('#authlayer').innerText())) problems.push('register button did not open the registration modal');
  else pass.push('header → create account modal');

  for (const e of errors) problems.push('landing interaction error: ' + e.slice(0, 160));
  await ctx.close();
}

/* ── 2. Mobile drawer opens, carries both sign-ins, and closes ───────────── */
{
  const { ctx, page, errors } = await fresh({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });

  await page.click('[data-pub-burger]');
  await page.waitForTimeout(350);
  const drawerVisible = await page.locator('#pubDrawer').isVisible();
  if (!drawerVisible) problems.push('mobile burger did not open the drawer');
  else {
    pass.push('mobile drawer opens');
    const drawerText = await page.locator('#pubDrawer').innerText();
    if (!/Administrator login/.test(drawerText)) problems.push('drawer is missing the administrator login');
    if (!/Shop login/.test(drawerText)) problems.push('drawer is missing the shop login');
    if (/owner login/i.test(drawerText)) problems.push('drawer still advertises the owner console');
    if (!(await page.locator('#pubDrawer a[href="/app-store"]').count())) problems.push('drawer is missing the App Store link');
  }

  await page.click('[data-pub-close]');
  await page.waitForTimeout(300);
  if (await page.locator('#pubDrawer').isVisible()) problems.push('drawer did not close');

  for (const e of errors) problems.push('drawer interaction error: ' + e.slice(0, 160));
  await ctx.close();
}

/* ── 3. Contact form validates and reports success ───────────────────────── */
{
  const { ctx, page, errors } = await fresh();
  const posts = [];
  await page.route('**/api/public/contact', async route => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'c1' }) });
  });
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' });

  const form = page.locator('form').first();
  if (!(await form.count())) {
    problems.push('contact page has no form');
  } else {
    // Submit empty: the browser's own validation must block it.
    await page.locator('form button[type="submit"], form [type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(300);
    if (posts.length) problems.push('contact form submitted while empty');

    await page.fill('input[name="name"]', 'Rahman Traders');
    await page.fill('input[name="email"]', 'owner@example.com');
    await page.fill('textarea[name="message"]', 'Question about the six month plan.');
    const submit = page.locator('form button[type="submit"], form [type="submit"]').first();
    await submit.click();
    await page.waitForTimeout(900);
    if (!posts.length) problems.push('contact form did not POST to /api/public/contact');
    else {
      pass.push('contact form submits');
      if (!posts[0].name || !posts[0].email || !posts[0].message) problems.push('contact payload is incomplete: ' + JSON.stringify(posts[0]));
      const toast = await page.locator('#toast').innerText().catch(() => '');
      if (!/thank|sent|receiv|message/i.test(toast)) problems.push('no confirmation shown after sending (toast: ' + toast.slice(0, 80) + ')');
      else pass.push('contact confirmation shown');
    }
  }
  for (const e of errors) problems.push('contact interaction error: ' + e.slice(0, 160));
  await ctx.close();
}

/* ── 4. Landing anchors scroll instead of reloading ──────────────────────── */
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const before = page.url();
  const anchors = await page.$$eval('.pubnav-links a[href^="/#"]', as => as.map(a => a.getAttribute('href')));
  if (!anchors.length) problems.push('landing nav has no section anchors');
  for (const href of anchors.slice(0, 3)) {
    await page.click(`.pubnav-links a[href="${href}"]`);
    // Smooth scrolling is animated; wait for it to settle before judging.
    await page.waitForTimeout(1500);
    if (page.url() !== before) problems.push(`anchor ${href} caused a navigation to ${page.url()}`);
    const id = href.slice(2);
    const inView = await page.evaluate(sel => {
      const el = document.getElementById(sel);
      if (!el) return 'missing';
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 ? 'visible' : 'out-of-view';
    }, id);
    if (inView === 'missing') problems.push(`anchor target #${id} does not exist on the landing page`);
    if (inView === 'out-of-view') problems.push(`anchor ${href} did not scroll #${id} into view`);
  }
  pass.push('landing anchors scroll in place');
  await ctx.close();
}

/* ── 5. Unknown paths fall back to the landing page ──────────────────────── */
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '/definitely-not-a-page', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  if (!/Manage every store/i.test(h1)) problems.push(`unknown path did not fall back to the landing page (h1: ${h1.slice(0, 60)})`);
  else pass.push('unknown path falls back to landing');
  const explained = await page.locator('body').innerText();
  if (!/That page does not exist/i.test(explained)) problems.push('the 404 fallback is silent — nothing tells the visitor the page is missing');
  else pass.push('404 fallback is explained to the visitor');
  if (new URL(page.url()).pathname !== '/') problems.push(`unknown path left the URL at ${new URL(page.url()).pathname}`);
  await ctx.close();
}

/* ── 6. No owner entry point survives anywhere ───────────────────────────── */
{
  const { ctx, page } = await fresh();
  for (const path of ['/', '/about', '/terms', '/privacy', '/blog', '/contact', '/app-store']) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const leaks = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h && /^\/owner(?!console)/i.test(h))
        .concat(/owner login/i.test(document.body.innerText) ? ['body text'] : [])
    );
    if (leaks.length) problems.push(`${path} still exposes the owner console: ${leaks.join(', ')}`);
  }
  pass.push('owner console is not advertised on any public page');
  await ctx.close();
}

await browser.close();
console.log('Passed checks:');
for (const p of pass) console.log('  ✔ ' + p);
console.log('');
if (!problems.length) {
  console.log('✔ All public interactions behave correctly.');
  process.exit(0);
}
console.log(`✖ ${problems.length} problem(s):`);
for (const p of problems) console.log('  • ' + p);
process.exit(1);
