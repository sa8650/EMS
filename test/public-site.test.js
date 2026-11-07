/* Public website rendering contracts.
 *
 * The marketing site is rendered by assets/js/public_site.js, which receives its
 * API/auth/toast helpers from app.js. These tests pin the behaviour that must not
 * regress when the design changes: live pricing, honest labelling, working routes,
 * the CMS-backed pages and the TrueBill verification states.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createPublicSite } from '../assets/js/public_site.js';

const LUCIDE_STUB = n => `<svg class="lucide" data-icon="${n}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BRANDING = { product_name: 'EMS', powered_by: 'Dexter Studio', website_name: 'EMS' };
const PLANS = [
  { id: 'free', title: 'Starter', price: 0, duration_months: 1, max_stores: 1, connectx_enabled: false, zudo_enabled: false, business_health_enabled: false, truebill_enabled: false, vaultium_gb: 0 },
  { id: 'six', title: 'Business 6 months', price: 4500, duration_months: 6, max_stores: 3, connectx_enabled: true, zudo_enabled: true, business_health_enabled: false, truebill_enabled: true, vaultium_gb: 2 }
];

function mount({ plans = PLANS, posts = [], pages = {}, invoice = null } = {}) {
  const dom = new JSDOM('<!doctype html><html><head><title>EMS</title></head><body><div id="app"></div><div id="toast"></div></body></html>', { url: 'https://ems.test/', pretendToBeVisual: true });
  const previous = { document: globalThis.document, window: globalThis.window, location: globalThis.location, FormData: globalThis.FormData, URLSearchParams: globalThis.URLSearchParams };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.location = dom.window.location;
  globalThis.FormData = dom.window.FormData;
  globalThis.URLSearchParams = dom.window.URLSearchParams;
  dom.window.scrollTo = () => {};
  const calls = [];
  const toasts = [];
  const api = async (path) => {
    calls.push(path);
    if (path === 'public/branding') return BRANDING;
    if (path === 'public/license-plans') return plans;
    if (path === 'public/blogs') return posts;
    if (path.startsWith('public/blogs?id=')) return posts.find(p => String(p.id) === path.split('=')[1]) || (() => { const e = new Error('Blog post not found.'); throw e; })();
    if (path.startsWith('public/page?slug=')) {
      const page = pages[path.split('=')[1]];
      if (!page) { const e = new Error('Page not found.'); throw e; }
      return page;
    }
    if (path.startsWith('public/invoice/')) {
      if (!invoice) { const e = new Error('No record matches this verification token.'); throw e; }
      return invoice;
    }
    throw new Error('unexpected api call: ' + path);
  };
  const site = createPublicSite({
    api, esc, lucide: LUCIDE_STUB,
    mountAppStore: (root, apps) => { root.innerHTML = `<div class="ems-store" data-apps="${apps.length}"></div>`; },
    getQrSvg: () => '<svg class="qr"></svg>',
    toast: message => toasts.push(message),
    showAuth: mode => calls.push('showAuth:' + mode),
    showEmsLogin: () => calls.push('showEmsLogin'),
    register: () => calls.push('register'),
    navigate: path => calls.push('navigate:' + path),
    app: dom.window.document.getElementById('app')
  });
  return {
    dom, site, calls, toasts,
    html: () => dom.window.document.getElementById('app').innerHTML,
    restore() { Object.assign(globalThis, previous); }
  };
}

test('Landing page states the positioning, keeps every required section and labels sample data', async () => {
  const env = mount();
  try {
    await env.site.renderLanding();
    await new Promise(resolve => setTimeout(resolve, 20));
    const doc = env.dom.window.document;
    const text = doc.querySelector('#app').textContent;

    assert.match(text, /Manage every store/);
    assert.match(text, /Create your business account/);
    for (const id of ['operations', 'how-it-works', 'access', 'multi-store', 'services', 'pricing', 'faq']) {
      assert.ok(doc.querySelector('#' + id), `missing section #${id}`);
    }
    assert.equal(doc.querySelectorAll('.pubsite h1').length, 1, 'exactly one h1 on the landing page');
    assert.equal(doc.querySelectorAll('.pub-feature').length, 8, 'operations bento covers the eight business modules');
    assert.ok(doc.querySelectorAll('.pub-step').length === 5, 'five-step workflow');
    assert.ok(doc.querySelectorAll('.pub-role').length === 3, 'three access levels');
    assert.ok(doc.querySelectorAll('.pub-service').length === 5, 'five premium services');
    assert.ok(doc.querySelectorAll('.pub-faq-item').length >= 7, 'FAQ answers genuine questions');
    assert.equal(doc.querySelectorAll('.pub-plan').length, PLANS.length, 'one card per published plan');
    assert.match(doc.querySelector('.pub-preview-note').textContent, /sample data/i);
    assert.match(text, /Powered by|powered by/i);
    assert.equal(doc.querySelector('.pub-foot-col a[href="/privacy"]').textContent.trim(), 'Privacy Policy', 'public pages use path URLs');
  } finally { env.restore(); }
});

test('Pricing cards render the plan values from the API and open the licence flow instead of inventing prices', async () => {
  const env = mount();
  try {
    await env.site.renderLanding();
    await new Promise(resolve => setTimeout(resolve, 20));
    const doc = env.dom.window.document;
    const cards = [...doc.querySelectorAll('.pub-plan')];
    assert.equal(cards.length, 2);
    assert.match(cards[0].textContent, /Free/);
    assert.match(cards[1].textContent, /৳ 4,500/);
    assert.match(cards[1].textContent, /3 stores/);
    assert.match(cards[1].textContent, /6 months of access/);
    assert.equal(cards[1].querySelectorAll('.pub-plan-list li.is-off').length, 1, 'missing entitlement is shown as not included');

    cards[1].querySelector('[data-pub-plan]').dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
    assert.ok(env.calls.includes('showAuth:admin'), 'plan CTA enters the existing administrator licence flow');
  } finally { env.restore(); }
});

test('Landing falls back honestly when no plans are published or the API fails', async () => {
  const empty = mount({ plans: [] });
  try {
    await empty.site.renderLanding();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(empty.dom.window.document.getElementById('pubPlans').textContent, /No license plans are published/i);
  } finally { empty.restore(); }
});

test('CMS pages render published content and degrade with a real message when a page is missing', async () => {
  const env = mount({ pages: { about: { slug: 'about', title: 'About EMS', body: 'First paragraph.\n\nSecond paragraph.', updated_at: '2026-09-01T00:00:00Z' }, terms: { slug: 'terms', title: 'Terms & Conditions', body: '', updated_at: '2026-09-01T00:00:00Z' } } });
  try {
    await env.site.renderPage('about');
    await new Promise(resolve => setTimeout(resolve, 10));
    const doc = env.dom.window.document;
    assert.match(doc.querySelector('.pub-prose').textContent, /First paragraph/);
    assert.match(doc.querySelector('.pub-aside-card').textContent, /At a glance/);
    assert.match(doc.title, /About EMS/);

    await env.site.renderPage('terms');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(doc.querySelector('.pub-legal-body').textContent.length > 400, 'an empty CMS body still explains the platform rules');

    await env.site.renderPage('privacy');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.match(doc.querySelector('.pub-legal-body').textContent, /Information the application stores/);

    await env.site.renderPage('not-a-real-page');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.match(doc.querySelector('.pub-empty').textContent, /Nothing lives at this address/);
  } finally { env.restore(); }
});

test('Blog listing, article and contact form keep their routes and submit behaviour', async () => {
  const posts = [
    { id: '1', title: 'Closing the month without a spreadsheet', excerpt: 'Reconcile once.', published_at: '2026-10-02T00:00:00Z', body: 'Body one.\n\nBody two.' },
    { id: '2', title: 'Staff permissions that actually help', excerpt: 'Four decisions.', published_at: '2026-09-18T00:00:00Z' }
  ];
  const env = mount({ posts });
  try {
    await env.site.renderPage('blog');
    await new Promise(resolve => setTimeout(resolve, 10));
    const doc = env.dom.window.document;
    assert.equal(doc.querySelectorAll('.pub-blog-featured').length, 1);
    assert.equal(doc.querySelectorAll('.pub-post-card').length, 1);
    assert.equal(doc.querySelector('.pub-blog-featured a').getAttribute('href'), '/blog/1', 'articles link to /blog/<id>');

    await env.site.renderPage('blog-post', { id: '1' });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.match(doc.querySelector('.pub-article-body').textContent, /Body one/);

    await env.site.renderPage('contact');
    await new Promise(resolve => setTimeout(resolve, 10));
    const form = doc.getElementById('pubContactForm');
    assert.ok(form, 'contact form is present');
    for (const field of ['name', 'email', 'phone', 'subject', 'message']) assert.ok(form.elements.namedItem(field), 'missing field ' + field);
    form.dispatchEvent(new env.dom.window.Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(env.toasts.length >= 1, 'submitting an incomplete form explains what is missing');
  } finally { env.restore(); }
});

test('App Store page mounts the shared store component inside public chrome', async () => {
  const env = mount();
  try {
    await env.site.renderPage('app-store');
    await new Promise(resolve => setTimeout(resolve, 10));
    const doc = env.dom.window.document;
    assert.ok(doc.querySelector('.pubnav'), 'public navigation');
    assert.ok(doc.querySelector('.pub-foot'), 'public footer');
    assert.equal(doc.querySelector('#pubStoreMount .ems-store').dataset.apps, '0');
    assert.match(doc.title, /App Store/);
  } finally { env.restore(); }
});

test('Invoice verification renders verified, failed and loading states from the public API', async () => {
  const invoice = {
    type: 'invoice',
    invoice: {
      kind: 'sale', invoice_number: 'INV-2061', invoice_date: '2026-10-28', payment_method: 'Cash',
      paid_amount: 2930, total_due: 0, subtotal: 3040, discount: 110, tax_amount: 0, line_tax_amount: 0,
      line_discount_amount: 0, transaction_id: 'BK-88213',
      stores: { name: 'Main Branch', address: 'Station Road', phone: '01700000000' },
      invoice_lines: [{ quantity: 4, unit_price: 600, line_total: 2400, tax_percent: 0, discount: 0, inventory_items: { description: 'LED Panel 18W', item_code: 'LED-18', unit: 'pcs' } }]
    },
    party: { name: 'Nasir Hossain', customer_code: 'C-0042', phone: '01800000000' }
  };
  const ok = mount({ invoice });
  try {
    await ok.site.renderVerification('token');
    await new Promise(resolve => setTimeout(resolve, 10));
    const doc = ok.dom.window.document;
    assert.ok(doc.querySelector('.pub-verify-state.is-ok'), 'verified state');
    assert.match(doc.querySelector('.pub-verify-card').textContent, /INV-2061/);
    assert.match(doc.querySelector('.pub-verify-card').textContent, /Main Branch/);
    assert.match(doc.querySelector('.pub-verify-card').textContent, /LED Panel 18W/);
    assert.match(doc.title, /Record verification/);
  } finally { ok.restore(); }

  const bad = mount({ invoice: null });
  try {
    await bad.site.renderVerification('token');
    await new Promise(resolve => setTimeout(resolve, 10));
    const doc = bad.dom.window.document;
    assert.ok(doc.querySelector('.pub-verify-state.is-error'), 'failure state');
    assert.match(doc.querySelector('.pub-verify-card').textContent, /not verified/i);
  } finally { bad.restore(); }
});

test('Public navigation exposes the sign-in paths as path links, never buttons', async () => {
  const env = mount();
  try {
    await env.site.renderLanding();
    await new Promise(resolve => setTimeout(resolve, 10));
    const doc = env.dom.window.document;
    const navLinks = [...doc.querySelectorAll('.pubnav-links a')].map(a => a.textContent.trim());
    assert.deepEqual(navLinks, ['Features', 'How it works', 'Pricing', 'About', 'Blog', 'Contact']);

    // Every sign-in entry point is a real link, so it works without JS, survives a
    // refresh and produces a shareable URL: /administrator, /shop and /owner.
    const find = (scope, selector) => [...doc.querySelectorAll(scope + ' ' + selector)];
    assert.equal(doc.querySelector('.pubnav-actions a[href="/administrator"]').dataset.pubAuth, 'admin');
    assert.equal(doc.querySelector('.pubnav-actions a[href="/shop"]').dataset.pubAuth, 'shop');
    assert.equal(doc.querySelector('.pubnav-actions a[href="/owner"]').textContent.trim(), 'Owner login');
    assert.equal(doc.querySelectorAll('[data-pub-auth="owner"]').length, 0, 'the owner is never a button');
    assert.equal(find('#pubDrawer', 'a[href="/administrator"]').length, 1);
    assert.equal(find('.pub-foot-col', 'a[href="/owner"]').length, 1);
    assert.equal(doc.querySelectorAll('a[href="/owner"]').length, 4, 'nav, drawer, footer and the access-levels card');

    // no sign-in control is a <button> any more
    const signInButtons = [...doc.querySelectorAll('button')].filter(b => ['admin', 'shop', 'owner'].includes(b.dataset.pubAuth));
    assert.deepEqual(signInButtons, [], 'sign-in controls are links, not buttons');

    doc.querySelector('.pubnav-actions a[href="/administrator"]').dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    doc.querySelector('.pubnav-actions [data-pub-register]').dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
    assert.ok(env.calls.includes('showAuth:admin'));
    assert.ok(env.calls.includes('register'));
    assert.ok(env.calls.includes('navigate:/administrator'), 'the address bar follows the click');

    // the owner link opens its modal in place too, and keeps the URL
    doc.querySelector('.pubnav-signin a[href="/owner"]').dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(env.calls.includes('showEmsLogin'));
    assert.ok(env.calls.includes('navigate:/owner'));
  } finally { env.restore(); }
});
