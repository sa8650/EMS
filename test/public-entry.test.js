/**
 * Boots the real `assets/js/app.js` in jsdom and exercises the public entry
 * points the way a visitor does — by clicking them.
 *
 * This is the test that was missing when the public site was rewritten: the new
 * shell no longer shipped the `#authlayer` element, so every sign-in and
 * "create account" control rendered but silently did nothing. `authLayer()`
 * now creates it on demand, and these assertions keep it that way.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const GLOBALS = [
  'window', 'document', 'location', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
  'MouseEvent', 'CustomEvent', 'getComputedStyle', 'localStorage', 'FormData', 'URLSearchParams',
  'Blob', 'File', 'FileReader', 'structuredClone', 'requestAnimationFrame', 'DOMParser',
  'HTMLInputElement', 'HTMLFormElement', 'confirm', 'alert', 'history', 'CustomEvent', 'CSS'
];

let boots = 0;

/** A syntactically valid token so scheduleLogout() can read an expiry. */
function token(minutes = 60) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + minutes * 60 })}.sig`;
}
const SESSIONS = {
  admin: () => ({ token: token(), role: 'admin', user: { id: 'a1', name: 'Rahman Traders', email: 'admin@example.com' } }),
  owner: () => ({ token: token(), role: 'owner', user: { id: 'o1', name: 'Platform Owner', email: 'owner@example.com' } }),
  staff: () => ({ token: token(), role: 'staff', user: { id: 's1', name: 'Counter Staff', email: 'staff@example.com' }, store: { id: 'st1', shop_id: 1001, name: 'Main Branch', shop_type: 'electronics' }, permissions: {} })
};

/**
 * Boot the app once for a given URL. Each call needs a fresh module instance.
 * `routes` maps an API path to a JSON body; anything else answers 503 so the
 * public pages exercise their offline fallbacks.
 */
async function boot(url, options = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><head><title>EMS</title></head><body><div id="app"></div><div id="toast"></div></body></html>',
    { url, pretendToBeVisual: true }
  );
  const win = dom.window;
  const prior = {};
  for (const key of GLOBALS) {
    prior[key] = globalThis[key];
    if (win[key] !== undefined) globalThis[key] = win[key];
  }
  prior.addEventListener = globalThis.addEventListener;
  prior.innerWidth = globalThis.innerWidth;
  prior.fetch = globalThis.fetch;
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.innerWidth = 1280;
  if (options.session) win.localStorage.setItem('ems.session', JSON.stringify(options.session));
  // No backend in the test process: the public pages must degrade, not throw.
  globalThis.fetch = async (input, init) => {
    const path = String(input).replace(/^\/api\//, '');
    const body = options.routes && options.routes[path];
    if (body) return { ok: true, status: 200, json: async () => (typeof body === 'function' ? body(init) : body) };
    return { ok: false, status: 503, json: async () => ({ error: 'offline' }) };
  };
  win.scrollTo = () => {};
  win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.matchMedia = win.matchMedia;
  globalThis.scrollTo = win.scrollTo;
  globalThis.HTMLElement.prototype.scrollIntoView = globalThis.HTMLElement.prototype.scrollIntoView || function () {};

  /* The app schedules long-lived timers (session expiry, polling). Track and
     unref them so the test process can exit, then cancel them on restore. */
  const timers = new Set();
  const realSetTimeout = globalThis.setTimeout;
  const realSetInterval = globalThis.setInterval;
  const realClearTimeout = globalThis.clearTimeout;
  const realClearInterval = globalThis.clearInterval;
  /* Track without unref-ing: the harness's own sleeps go through the same
     wrapper, so unref would stall the awaits. `restore()` cancels everything. */
  const track = (schedule) => (fn, ms, ...rest) => {
    const id = schedule(fn, ms, ...rest);
    timers.add(id);
    return id;
  };
  globalThis.setTimeout = track(realSetTimeout);
  globalThis.setInterval = track(realSetInterval);

  boots += 1;
  await import(`../assets/js/app.js?boot=${boots}`);
  await new Promise(resolve => setTimeout(resolve, 250));

  return {
    win,
    doc: win.document,
    layer: () => win.document.getElementById('authlayer'),
    click: selector => {
      const el = win.document.querySelector(selector);
      assert.ok(el, `expected ${selector} in the rendered page`);
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      return el;
    },
    restore() {
      delete globalThis.matchMedia;
      for (const id of timers) { realClearTimeout(id); realClearInterval(id); }
      globalThis.setTimeout = realSetTimeout;
      globalThis.setInterval = realSetInterval;
      globalThis.clearTimeout = realClearTimeout;
      globalThis.clearInterval = realClearInterval;
      for (const key of GLOBALS) {
        if (prior[key] === undefined) delete globalThis[key];
        else globalThis[key] = prior[key];
      }
      globalThis.addEventListener = prior.addEventListener;
      globalThis.innerWidth = prior.innerWidth;
      globalThis.fetch = prior.fetch;
      win.close();
    }
  };
}

test('landing renders and every nav control opens a real modal', async () => {
  const env = await boot('https://ems.test/');
  try {
    const { doc } = env;
    assert.ok(doc.querySelector('.pubsite'), 'public shell rendered');
    assert.match(doc.querySelector('h1').textContent, /Manage every store/i);

    // the auth layer is created on demand, not shipped inside index.html
    assert.equal(doc.getElementById('authlayer'), null, 'nothing pre-renders the layer');

    env.click('.pubnav-actions [data-pub-auth="admin"]');
    const layer = env.layer();
    assert.ok(layer, '#authlayer created when the first modal opens');
    assert.equal(layer.hidden, false);
    assert.match(layer.textContent, /Administrator sign in/);
    assert.equal(layer.parentElement, doc.body, 'modal layer lives on <body>, outside #app');

    env.click('.pubnav-actions [data-pub-auth="shop"]');
    assert.match(env.layer().textContent, /Shop staff/);

    env.click('.pubnav-actions [data-pub-register]');
    assert.match(env.layer().textContent, /Create administrator account/);

    // closing restores the page
    env.doc.getElementById('closeAuth').dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    assert.equal(env.layer().hidden, true);
  } finally { env.restore(); }
});

test('/owner is a link, and landing on it opens the owner sign-in', async () => {
  const env = await boot('https://ems.test/owner');
  try {
    const { doc } = env;
    assert.ok(doc.querySelector('.pubsite'), 'public shell behind the modal');
    assert.equal(doc.querySelectorAll('[data-pub-auth="owner"]').length, 0, 'no owner button');
    const layer = env.layer();
    assert.ok(layer, 'owner modal opened from the path');
    assert.equal(layer.hidden, false);
    assert.match(layer.textContent, /EMS login/);
    assert.match(layer.textContent, /platform owner/i);
  } finally { env.restore(); }
});

test('/admin and /shop open their own sign-in from the path', async () => {
  const admin = await boot('https://ems.test/admin');
  try {
    assert.match(admin.layer().textContent, /Administrator sign in/);
  } finally { admin.restore(); }

  const shop = await boot('https://ems.test/shop/');
  try {
    assert.match(shop.layer().textContent, /Shop staff/);
  } finally { shop.restore(); }
});

/* ── Bug: the modal stayed on screen after a successful sign-in ───────────── */

async function signIn(env, formSelector, fields) {
  const form = env.doc.querySelector(formSelector);
  assert.ok(form, `expected ${formSelector}`);
  for (const [name, value] of Object.entries(fields)) {
    const input = form.elements.namedItem(name);
    assert.ok(input, `form is missing ${name}`);
    input.value = value;
  }
  form.dispatchEvent(new env.win.Event('submit', { cancelable: true, bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 200));
}

test('a successful owner sign-in closes the modal and lands the console', async () => {
  const env = await boot('https://ems.test/owner', { routes: { 'auth/ems/login': SESSIONS.owner() } });
  try {
    await signIn(env, '#emsform', { email: 'owner@example.com', password: 'correct-horse-battery' });
    const layer = env.layer();
    assert.equal(layer.hidden, true, 'the sign-in modal must be hidden after signing in');
    assert.equal(layer.innerHTML, '', 'and emptied, so nothing stale is left behind');
    assert.equal(env.win.location.pathname, '/ownerconsole', 'the URL becomes the console, not the sign-in path');
    assert.ok(env.doc.body.classList.contains('ob-on'), 'Owner Console is active');
  } finally { env.restore(); }
});

test('a successful administrator sign-in closes the modal and survives a refresh', async () => {
  const login = { 'auth/admin/login': SESSIONS.admin(), 'admin/entitlement': { hasActivatedLicense: true, active: true } };
  const env = await boot('https://ems.test/administrator', { routes: login });
  try {
    await signIn(env, '#authform', { email: 'admin@example.com', password: 'correct-horse-battery' });
    assert.equal(env.layer().hidden, true, 'modal closed');
    assert.equal(env.win.location.pathname, '/administratorconsole', 'the URL becomes the console, not the sign-in path');
  } finally { env.restore(); }

  // Same address after a refresh: the console must come back, not the landing
  // page with a sign-in dialog on top of it.
  const fresh = await boot('https://ems.test/administratorconsole', {
    session: SESSIONS.admin(),
    routes: { 'admin/entitlement': { hasActivatedLicense: true, active: true } }
  });
  try {
    assert.ok(fresh.doc.body.classList.contains('adm-on'), 'Administrator Panel rendered');
    assert.equal(fresh.layer(), null, 'no sign-in modal on a signed-in refresh');
  } finally { fresh.restore(); }
});

test('a sign-in path with an existing session never reopens the dialog', async () => {
  const env = await boot('https://ems.test/owner', {
    session: SESSIONS.owner(),
    routes: { 'platform/overview': {} }
  });
  try {
    assert.equal(env.layer(), null, 'no dialog for a signed-in owner');
    assert.ok(env.doc.body.classList.contains('ob-on'), 'went straight to the console');
    assert.equal(env.win.location.pathname, '/ownerconsole', 'and corrected the URL');
  } finally { env.restore(); }
});

test('public pages have their own paths and work on refresh', async () => {
  const routes = {
    'public/page?slug=about': { slug: 'about', title: 'About EMS', body: 'A multi-store platform.' },
    'public/blogs?id=7': { id: '7', title: 'Closing the month', body: 'Body seven.', published_at: '2026-10-02T00:00:00Z' }
  };
  const about = await boot('https://ems.test/about', { routes });
  try {
    assert.match(about.doc.querySelector('.pub-page-title').textContent, /About EMS/);
  } finally { about.restore(); }

  const article = await boot('https://ems.test/blog/7', { routes });
  try {
    assert.match(article.doc.querySelector('.pub-article-body').textContent, /Body seven/);
  } finally { article.restore(); }

  const unknown = await boot('https://ems.test/not-a-page');
  try {
    assert.match(unknown.doc.querySelector('h1').textContent, /Manage every store/i, 'unknown paths fall back to the landing page');
    assert.equal(unknown.win.location.pathname, '/', 'and the URL is corrected');
  } finally { unknown.restore(); }
});

test('console deep links open the requested panel page', async () => {
  const env = await boot('https://ems.test/ownerconsole/licenses', {
    session: SESSIONS.owner(),
    routes: { 'platform/overview': {} }
  });
  try {
    assert.ok(env.doc.body.classList.contains('ob-on'));
    assert.equal(env.win.location.pathname, '/ownerconsole/licenses');
    assert.match(env.doc.getElementById('obTopTitle').textContent, /License/i, 'the URL decides which page renders');
  } finally { env.restore(); }
});

test('closing a sign-in modal gives the URL back', async () => {
  const env = await boot('https://ems.test/administrator');
  try {
    assert.equal(env.win.location.pathname, '/administrator');
    env.doc.getElementById('closeAuth').dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    assert.equal(env.layer().hidden, true, 'modal closed');
    assert.equal(env.win.location.pathname, '/', 'a dismissed sign-in returns to the landing URL');
  } finally { env.restore(); }
});

test('Escape closes the modal instead of leaving it stranded', async () => {
  const env = await boot('https://ems.test/owner');
  try {
    env.doc.dispatchEvent(new env.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(env.layer().hidden, true);
    assert.equal(env.win.location.pathname, '/');
  } finally { env.restore(); }
});
