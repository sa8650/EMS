/**
 * Scanner visual pass.
 *
 * Renders every scanner screen at real phone sizes against the local harness
 * (`node test/server.mjs 8788`) and writes PNGs to /home/user/shots/scanner.
 *
 *   node test/browser/shots-scanner.mjs [outDir]
 *
 * The camera is stubbed: a MediaStream is not needed to judge layout, and a
 * fake one keeps the run headless and repeatable.
 */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const OUT = process.argv[2] || '/home/user/shots/scanner';
const BASE = 'http://127.0.0.1:8788';

const DEVICES = [
  {name: 'iphone-se', width: 375, height: 667, dpr: 2, mobile: true},
  {name: 'iphone-15', width: 390, height: 844, dpr: 3, mobile: true},
  {name: 'pixel-7', width: 412, height: 915, dpr: 2.6, mobile: true},
  {name: 'android-small', width: 360, height: 640, dpr: 2, mobile: true},
  {name: 'landscape-phone', width: 844, height: 390, dpr: 3, mobile: true},
  {name: 'landscape-small', width: 667, height: 375, dpr: 2, mobile: true},
  {name: 'tablet', width: 820, height: 1180, dpr: 2, mobile: true},
  {name: 'desktop', width: 1280, height: 900, dpr: 1, mobile: false}
];

const FAKE_TOKEN = 'harness-jwt';
const DRAFT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Camera and detector stubs, installed before any app code runs. */
const stubs = () => {
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
  const track = {stop() {}, getCapabilities: () => ({torch: true, zoom: {min: 1, max: 4}}), applyConstraints: async () => {}};
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => ({getTracks: () => [track], getVideoTracks: () => [track]});
  HTMLMediaElement.prototype.play = async () => {};
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {configurable: true, set() {}, get: () => null});
  // Paint a stand-in frame so the preview box is not a black rectangle in shots.
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = originalGetContext.call(this, type, ...rest);
    if (context && type === '2d') {
      const original = context.drawImage;
      context.drawImage = (...args) => {
        this.__painted = true;
        return original.apply(context, args);
      };
    }
    return context;
  };
};

async function newPage(browser, device) {
  const context = await browser.newContext({
    viewport: {width: device.width, height: device.height},
    deviceScaleFactor: Math.min(device.dpr, 3),
    isMobile: device.mobile,
    hasTouch: device.mobile,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    userAgent: device.mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined
  });
  const page = await context.newPage();
  await page.addInitScript(stubs);
  const problems = [];
  page.on('pageerror', error => problems.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource|favicon/i.test(message.text())) {
      problems.push('console: ' + message.text());
    }
  });
  return {context, page, problems};
}

const shot = async (page, device, name, fullPage = true) => {
  await page.waitForTimeout(320);
  await page.screenshot({path: `${OUT}/${device.name}-${name}.png`, fullPage});
  return `${device.name}-${name}.png`;
};

/** Reports anything that overflows the viewport horizontally. */
const overflow = page =>
  page.evaluate(() => {
    const bad = [];
    const width = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll('#app *')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (rect.right > width + 1 || rect.left < -1) {
        bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }
    return {width, scrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0, 6)};
  });

/** Is a control reachable without scrolling, and not hidden behind the tab bar? */
const reachable = async (page, selectors) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(60);
  return page.evaluate(list => {
    const bar = document.querySelector('.tabbar');
    const limit = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    const out = {};
    for (const selector of list) {
      const el = document.querySelector(selector);
      if (!el) {
        out[selector] = 'missing';
        continue;
      }
      const rect = el.getBoundingClientRect();
      const state = rect.height === 0 ? 'hidden' : rect.top >= -1 && rect.bottom <= limit + 1 ? 'ok' : `outside the fold (top ${Math.round(rect.top)}, bottom ${Math.round(rect.bottom)}, limit ${Math.round(limit)})`;
      out[selector] = state;
    }
    return out;
  }, selectors);
};

const signedIn = async (page, token = FAKE_TOKEN) => {
  await page.goto(BASE + '/scanner/', {waitUntil: 'domcontentloaded'});
  await page.evaluate(value => {
    sessionStorage.setItem('ems.scanner.token', value);
    sessionStorage.setItem('ems.scanner.user', 'Counter Staff');
    sessionStorage.setItem('ems.scanner.store', 'Gulshan Branch');
    sessionStorage.setItem('ems.scanner.storeId', 'st1');
    sessionStorage.setItem('ems.scanner.userId', 'u1');
    sessionStorage.setItem('ems.scanner.shopType', 'pharmacy');
    sessionStorage.setItem('ems.scanner.paired', '1');
  }, token);
  await page.goto(BASE + '/scanner/', {waitUntil: 'networkidle'});
};

const report = [];

await mkdir(OUT, {recursive: true});
const browser = await chromium.launch();

for (const device of DEVICES) {
  const {context, page, problems} = await newPage(browser, device);
  const pushed = [];

  try {
    /* ── Sign in ─────────────────────────────────────────────────────────── */
    await page.goto(BASE + '/scanner/', {waitUntil: 'networkidle'});
    pushed.push(await shot(page, device, 'signin'));
    pushed.push({overflow: await overflow(page)});
    await page.click('#qrTab');
    await page.waitForTimeout(160);
    pushed.push(await shot(page, device, 'signin-qr'));

    /* ── Home ────────────────────────────────────────────────────────────── */
    await signedIn(page);
    await page.waitForSelector('#refreshDrafts');
    await page.waitForTimeout(260);
    pushed.push(await shot(page, device, 'home'));
    pushed.push({overflow: await overflow(page)});

    /* ── Choose a bill and scan ──────────────────────────────────────────── */
    await page.click('[data-select]');
    await page.waitForTimeout(420);
    pushed.push(await shot(page, device, 'camera'));
    pushed.push({fold: await reachable(page, ['#startCam', '#manualForm'])});
    await page.click('#startCam');
    await page.waitForTimeout(500);
    pushed.push(await shot(page, device, 'camera-live', false));
    pushed.push({fold: await reachable(page, ['#camActions', '[data-cam=stop]'])});
    pushed.push({overflow: await overflow(page)});

    /* ── A bill with scans in flight ─────────────────────────────────────── */
    await page.evaluate(async () => {
      const {addItem} = await import('/scanner/scanner.js');
      await addItem({id: 'p1', name: 'Paracetamol', strength: '500 mg'});
      await addItem({id: 'p2', name: 'Amoxicillin', strength: '250 mg'});
      await addItem({id: 'p3', name: 'Salbutamol Inhaler', strength: '100 mcg'});
    });
    await page.waitForTimeout(500);
    pushed.push(await shot(page, device, 'camera-scanned'));
    await page.click('.tabs [data-view=home]');
    await page.waitForTimeout(420);
    pushed.push(await shot(page, device, 'home-scanned'));

    /* ── Catalog ─────────────────────────────────────────────────────────── */
    await page.click('.tabs [data-view=catalog]');
    await page.waitForSelector('#catalogList .list-item');
    pushed.push(await shot(page, device, 'catalog'));

    /* ── Verify (guest) ──────────────────────────────────────────────────── */
    await page.click('.tabs [data-view=verify]');
    await page.waitForSelector('#verifyForm');
    pushed.push(await shot(page, device, 'verify'));
    await page.fill('#verifyInput', 'PUR-12034');
    await page.click('#verifyForm button[type=submit]');
    await page.waitForTimeout(500);
    pushed.push(await shot(page, device, 'verify-result'));

    /* Scanned TrueBill QR: the full document, including the stacked line items. */
    await page.evaluate(() => {
      // Drive the same code path the QR reader uses, without a camera.
      const form = document.querySelector('#verifyForm');
      form.dispatchEvent(new Event('submit', {cancelable: true}));
    });
    await page.fill('#verifyInput', 'SAL-4821');
    await page.evaluate(async () => {
      const {verifyInvoice} = await import('/scanner/scanner.js');
      await verifyInvoice('https://ems.example/verify/12345678-1234-4234-8234-123456789012', 'qr');
    });
    await page.waitForTimeout(500);
    pushed.push(await shot(page, device, 'verify-document'));

    /* ── Profile + menu sheet ────────────────────────────────────────────── */
    await page.evaluate(() => {
      location.hash = '';
    });
    await page.goto(BASE + '/scanner/', {waitUntil: 'networkidle'});
    await page.waitForSelector('#refreshDrafts');
    await page.click('.hero-menu');
    await page.waitForTimeout(260);
    pushed.push(await shot(page, device, 'menu', false));

    const overflowIssues = pushed.filter(item => item.overflow && (item.overflow.bad.length || item.overflow.scrollWidth > item.overflow.width + 1));
    const foldIssues = pushed
      .filter(item => item.fold)
      .flatMap(item => Object.entries(item.fold).filter(([, value]) => value !== 'ok'))
      .map(([selector, value]) => `${selector}: ${value}`);
    report.push({
      device: device.name,
      size: `${device.width}×${device.height}`,
      overflow: overflowIssues.length ? overflowIssues.map(item => item.overflow) : 'none',
      belowFold: foldIssues.length ? foldIssues : 'none',
      problems
    });
  } catch (error) {
    report.push({device: device.name, error: error.message, problems, shots: pushed});
  }
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
const failed = report.filter(
  entry => entry.error || entry.problems.length || entry.overflow !== 'none' || (entry.belowFold && entry.belowFold !== 'none')
);
if (failed.length) {
  console.error('\n✖ scanner visual pass found problems');
  process.exitCode = 1;
} else {
  console.log(`\n✔ ${report.length} viewports rendered to ${OUT}`);
}
