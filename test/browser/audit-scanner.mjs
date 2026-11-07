/**
 * Scanner browser audit.
 *
 * Checks the claims the scanner rework makes, in a real browser against the
 * local harness — not against a mental model of the code:
 *
 *   1. one poll is one request (the old loop issued three per tick);
 *   2. an idle scanner does not hammer the server (measured over time);
 *   3. request counts drop to zero while the tab is hidden;
 *   4. the shell renders with no console error and no horizontal overflow at
 *      the sizes a shop phone actually uses;
 *   5. the scan → send → pending → acknowledged flow labels each step honestly;
 *   6. a guest can verify a printed number, and gets no private detail back.
 *
 *   node test/browser/audit-scanner.mjs
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:8788';
const results = [];
/** Every context this check opened, closed afterwards whether it passed or not. */
let openContexts = [];
const check = async (name, fn) => {
  openContexts = [];
  try {
    await fn();
    results.push({name, ok: true});
  } catch (error) {
    results.push({name, ok: false, error: error.message});
  } finally {
    // A leaked page would keep polling and pollute the next check's counters.
    await Promise.all(openContexts.map(context => context.close().catch(() => {})));
    openContexts = [];
  }
};

const stats = async () => (await fetch(BASE + '/api/__stats')).json();
const reset = async () => {
  const before = await stats();
  return {before, keys: Object.keys(before)};
};

const stubCamera = () => {
  window.BarcodeDetector = class {
    static async getSupportedFormats() {
      return ['qr_code', 'code_128', 'ean_13'];
    }
    constructor({formats}) {
      this.formats = formats;
    }
    async detect() {
      return [];
    }
  };
  const track = {stop() {}, getCapabilities: () => ({torch: true}), applyConstraints: async () => {}};
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => ({getTracks: () => [track], getVideoTracks: () => [track]});
  HTMLMediaElement.prototype.play = async () => {};
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {configurable: true, set() {}, get: () => null});
};

const open = async (browser, {signedIn = true, viewport = {width: 390, height: 844}} = {}) => {
  const context = await browser.newContext({viewport, hasTouch: true, isMobile: true});
  openContexts.push(context);
  const page = await context.newPage();
  await page.addInitScript(stubCamera);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource|favicon/i.test(message.text())) errors.push(message.text());
  });
  await page.goto(BASE + '/scanner/', {waitUntil: 'domcontentloaded'});
  if (signedIn) {
    await page.evaluate(() => {
      const values = {token: 'harness-jwt', user: 'Counter Staff', store: 'Gulshan Branch', storeId: 'st1', userId: 'u1', shopType: 'pharmacy', paired: '1'};
      for (const [key, value] of Object.entries(values)) sessionStorage.setItem('ems.scanner.' + key, value);
    });
    await page.goto(BASE + '/scanner/', {waitUntil: 'networkidle'});
  }
  return {context, page, errors};
};

const browser = await chromium.launch();

/* ── 1. A poll is one request ─────────────────────────────────────────────── */
await check('one poll cycle is a single request, not three', async () => {
  const {context, page} = await open(browser);
  await page.waitForSelector('[data-select]');
  await page.click('[data-select]');
  await page.waitForSelector('#startCam');
  const before = await stats();
  await page.waitForTimeout(2600); // several idle cycles at ~1.6 s
  const after = await stats();
  const cycles =
    (after['scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sync'] || 0) -
    (before['scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sync'] || 0);
  const statusHits =
    (after['scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/status'] || 0) -
    (before['scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/status'] || 0);
  const eventHits =
    (after['scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/events'] || 0) -
    (before['scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/events'] || 0);
  assert.equal(statusHits, 0, 'the poll must not also call /status');
  assert.equal(eventHits, 0, 'the poll must not also call /events');
  assert.ok(cycles >= 1 && cycles <= 4, `expected 1–4 syncs in 2.6 s, saw ${cycles}`);
  await context.close();
});

/* ── 2. Idle is quiet, active is quick ───────────────────────────────────── */
await check('an idle scanner polls slowly and an in-flight scan speeds it up', async () => {
  const {context, page} = await open(browser);
  await page.waitForSelector('[data-select]');
  await page.click('[data-select]');
  await page.waitForSelector('#startCam');
  const syncKey = 'scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sync';

  const idleBefore = (await stats())[syncKey] || 0;
  await page.waitForTimeout(3000);
  const idle = ((await stats())[syncKey] || 0) - idleBefore;

  const busyBefore = (await stats())[syncKey] || 0;
  await page.evaluate(async () => {
    const {addItem} = await import('/scanner/scanner.js');
    await addItem({id: 'p1', name: 'Paracetamol'});
  });
  await page.waitForTimeout(3000);
  const busy = ((await stats())[syncKey] || 0) - busyBefore;

  assert.ok(busy > idle, `an item in flight must be polled faster than idle (idle ${idle}, busy ${busy})`);
  assert.ok(idle <= 3, `idle polling should be lazy, saw ${idle} in 3 s`);
  // At the 180 ms floor, three seconds is ~17 polls; more than that means the
  // floor is being ignored the moment anything is outstanding.
  assert.ok(busy <= 20, `busy polling should stay bounded, saw ${busy} in 3 s`);
  await context.close();
});

/* ── 3. Hidden tab stops the traffic ─────────────────────────────────────── */
await check('requests stop while the tab is hidden and resume on return', async () => {
  const {context, page} = await open(browser);
  await page.waitForSelector('[data-select]');
  await page.click('[data-select]');
  await page.waitForSelector('#startCam');
  const syncKey = 'scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sync';
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenBefore = (await stats())[syncKey] || 0;
  await page.waitForTimeout(2600);
  const hidden = ((await stats())[syncKey] || 0) - hiddenBefore;
  assert.equal(hidden, 0, 'a hidden tab must not poll');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(600);
  const resumed = ((await stats())[syncKey] || 0) - hiddenBefore;
  assert.ok(resumed >= 1, 'coming back to the tab polls immediately');
  await context.close();
});

/* ── 4. Every screen renders clean at phone sizes ────────────────────────── */
await check('every screen renders without overflow or console errors', async () => {
  for (const viewport of [{width: 360, height: 640}, {width: 390, height: 844}, {width: 412, height: 915}]) {
    const {context, page, errors} = await open(browser, {viewport});
    await page.waitForSelector('[data-select]');
    await page.click('[data-select]');
    await page.waitForSelector('#startCam');
    for (const view of ['home', 'camera', 'catalog', 'verify']) {
      await page.click(`.tabs [data-view=${view}]`);
      await page.waitForTimeout(260);
      const box = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth
      }));
      assert.ok(box.scroll <= box.client + 1, `${view} overflows at ${viewport.width}px (${box.scroll} > ${box.client})`);
    }
    const guest = await browser.newContext({viewport});
    openContexts.push(guest);
    const guestPage = await guest.newPage();
    await guestPage.addInitScript(stubCamera);
    await guestPage.goto(BASE + '/scanner/', {waitUntil: 'networkidle'});
    const signin = await guestPage.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    assert.ok(signin.scroll <= signin.client + 1, `sign-in overflows at ${viewport.width}px`);
    await guest.close();
    assert.deepEqual(errors, [], `console errors at ${viewport.width}px: ${errors.join(' | ')}`);
    await context.close();
  }
});

/* ── 5. The scan flow tells the truth about each step ────────────────────── */
await check('a scan shows as awaiting the PC, and only an acknowledgement says it was added', async () => {
  const {context, page} = await open(browser);
  await page.waitForSelector('[data-select]');
  await page.click('[data-select]');
  await page.waitForSelector('#startCam');
  await page.evaluate(async () => {
    const {addItem} = await import('/scanner/scanner.js');
    await addItem({id: 'p1', name: 'Paracetamol'});
  });
  await page.waitForTimeout(400);
  const feed = await page.textContent('#eventList');
  assert.match(feed, /Paracetamol/, 'the item is listed');
  assert.match(feed, /On its way/, 'the label says the item is still in flight');
  assert.ok(!/Added/.test(feed), 'nothing claims to be added before the PC says so');
  await context.close();
});

/* ── 6. Repeat visits do not re-fetch what is already loaded ─────────────── */
await check('revisiting the catalog within a minute uses what is already loaded', async () => {
  const {context, page} = await open(browser);
  await page.waitForSelector('[data-select]');
  await page.click('[data-select]');
  await page.waitForSelector('#startCam');
  await page.click('.tabs [data-view=catalog]');
  await page.waitForSelector('#catalogList .list-item');
  const key = 'scanner/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/catalog';
  const before = (await stats())[key] || 0;
  await page.click('.tabs [data-view=home]');
  await page.waitForTimeout(200);
  await page.click('.tabs [data-view=catalog]');
  await page.waitForTimeout(400);
  const after = (await stats())[key] || 0;
  assert.equal(after - before, 0, 'the second visit should come from memory');
  assert.ok(await page.locator('#catalogList .list-item').count() > 0, 'the list is still rendered');
  await context.close();
});

/* ── 7. The offline shell is complete ───────────────────────────────────── */
await check('the service worker shell covers every module the app imports', async () => {
  const sw = await (await fetch(BASE + '/scanner/sw.js')).text();
  const shell = [...sw.matchAll(/'\/scanner\/[^']*'/g)].map(match => match[0].replace(/'/g, ''));
  for (const asset of ['/scanner/scanner.js', '/scanner/link.js', '/scanner/engine.js', '/scanner/ui.js', '/scanner/truebill.js', '/scanner/truebill_view.js', '/scanner/zxing-fallback.js', '/scanner/jsbarcode.min.js', '/scanner/scanner.css']) {
    assert.ok(shell.includes(asset), `${asset} must be in the offline shell`);
  }
  assert.match(sw, /ems-scanner-shell-v\d+/, 'the shell cache is versioned');
  assert.ok(!/https?:\/\/(?!.*self\.location)/.test(sw.replace(/\/\*[\s\S]*?\*\//g, '')), 'no CDN in the service worker');
});

/* ── 8. Public verification leaks nothing ───────────────────────────────── */
await check('a printed invoice number returns a minimal answer; a TrueBill QR returns the document', async () => {
  const {context, page} = await open(browser, {signedIn: false});
  await page.click('#openVerifyPublic');
  await page.waitForSelector('#verifyForm');
  await page.fill('#verifyInput', 'PUR-12034');
  await page.click('#verifyForm button[type=submit]');
  await page.waitForSelector('.verify-limited');
  const limited = await page.textContent('#verifyResult');
  assert.match(limited, /Invoice number found/);
  assert.ok(!/Medicine|Walk-in|৳/.test(limited), 'no line items, party or totals for a printed number');

  await page.evaluate(async () => {
    const {verifyInvoice} = await import('/scanner/scanner.js');
    await verifyInvoice('https://ems.example/verify/12345678-1234-4234-8234-123456789012', 'qr');
  });
  await page.waitForSelector('.tb-document');
  const full = await page.textContent('#verifyResult');
  assert.match(full, /Paracetamol 500 mg/, 'the scanned document lists items');
  assert.match(full, /Gulshan Branch/, 'the scanned document names the shop');
  assert.match(full, /6 Nov 2026/, 'dates read as dates, not ISO timestamps');
  await context.close();
});

await browser.close();

for (const result of results) console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}${result.ok ? '' : '\n     ' + result.error}`);
const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;
