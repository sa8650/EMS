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
  'HTMLInputElement', 'HTMLFormElement', 'confirm', 'alert'
];

let boots = 0;

/** Boot the app once for a given URL. Each call needs a fresh module instance. */
async function boot(url) {
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
  // No backend in the test process: the public pages must degrade, not throw.
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'offline' }) });
  win.scrollTo = () => {};
  win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

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
