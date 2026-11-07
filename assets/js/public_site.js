/* =====================================================================
   EMS PUBLIC WEBSITE — renderer
   ---------------------------------------------------------------------
   Renders the marketing site (landing page, About, Terms, Privacy, Blog,
   Contact, App Store and TrueBill verification) in the Agent Bento Grid
   visual language defined by assets/css/public.css.

   This module owns markup only. Authentication, sessions, API access and
   every panel keep living in app.js — the host passes those helpers in
   through createPublicSite() so there is exactly one implementation of
   each behaviour. See DESIGN_SYSTEM.md §7 for the layout rules.
   ===================================================================== */

const MARK_SRC = '/assets/brand/ems-mark.svg';

/* Icons that are not part of app.js' LUCIDE map. Decorative only. */
const GLYPH = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8L4.3 10.7l5.8-1.9L12 3Z"/></svg>',
  shieldCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6l7-3Z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>'
};

const DEFAULT_BRAND = { product_name: 'EMS', powered_by: 'Dexter Studio', website_name: 'EMS' };

/* Nav model — one source of truth for desktop links and the mobile drawer. */
const NAV_LINKS = [
  ['/#operations', 'Features', 'features'],
  ['/#how-it-works', 'How it works', 'how'],
  ['/#pricing', 'Pricing', 'pricing'],
  ['/about', 'About', 'about'],
  ['/blog', 'Blog', 'blog'],
  ['/contact', 'Contact', 'contact']
];

/* Sample rows used by the product previews. Everything is labelled. */
const SAMPLE_SALES = [
  ['INV-2061', 'Counter sale · Main Branch', '3,150', 'Paid'],
  ['INV-2060', 'Counter sale · City Branch', '1,480', 'Paid'],
  ['INV-2059', 'Credit sale · Main Branch', '5,900', 'Due']
];

const SAMPLE_STORES = [
  ['Main Branch', 'ST-1042 · Electronics', 'Active', 'emerald', 72],
  ['City Branch', 'ST-1043 · Electronics', 'Active', 'emerald', 48],
  ['Depot Store', 'ST-1044 · Supershop', 'Read-only', 'amber', 26]
];

export function createPublicSite(deps) {
  const { api, esc, lucide, getQrSvg, mountAppStore, toast, showAuth, showEmsLogin, register, navigate, app } = deps;

  const icon = name => lucide(name);
  const go = typeof navigate === 'function' ? navigate : () => {};
  const brand = () => api('public/branding').catch(() => ({ ...DEFAULT_BRAND }));

  /* -------------------------------------------------------------------
     Shell (header + footer)
  ------------------------------------------------------------------- */
  function navLinks(active) {
    return NAV_LINKS.map(([href, label, key]) => {
      const current = active === key ? ' aria-current="page"' : '';
      return `<a href="${href}"${current}>${esc(label)}</a>`;
    }).join('');
  }

  function brandBlock(b, compact = false) {
    return `<a class="pubbrand" href="/" aria-label="${esc(b.website_name || 'EMS')} home">
      <img src="${MARK_SRC}" alt="" aria-hidden="true" width="34" height="34">
      <span class="pubbrand-copy"><b data-brand-name>${esc(b.product_name || 'EMS')}</b><small>powered by <span data-powered-by>${esc(b.powered_by || 'Dexter Studio')}</span></small></span>
    </a>`;
  }

  function headerHtml(b, active) {
    return `<header class="pubnav">
      <div class="pubnav-inner">
        ${brandBlock(b)}
        <nav class="pubnav-links" aria-label="Primary">${navLinks(active)}</nav>
        <div class="pubnav-actions">
          <span class="pubnav-signin">
            <a href="/administrator" data-pub-auth="admin">Administrator login</a>
            <a href="/shop" data-pub-auth="shop">Shop login</a>
          </span>
          <button type="button" class="pub-btn pub-btn--sm" data-pub-register>Create account</button>
          <button type="button" class="pub-burger" data-pub-burger aria-label="Open navigation menu" aria-expanded="false" aria-controls="pubDrawer">${icon('menu')}</button>
        </div>
      </div>
    </header>
    <div class="pub-drawer" id="pubDrawer" hidden>
      <button type="button" class="pub-drawer-backdrop" data-pub-close aria-label="Close navigation menu"></button>
      <div class="pub-drawer-panel" role="dialog" aria-modal="true" aria-label="Site navigation">
        <div class="pub-drawer-head">${brandBlock(b)}<button type="button" class="pub-burger" data-pub-close aria-label="Close navigation menu">${icon('x')}</button></div>
        <nav class="pub-drawer-links" aria-label="Primary mobile">${navLinks(active)}
          <a href="/app-store">App Store</a>
        </nav>
        <div class="pub-drawer-group">
          <span>Sign in</span>
          <a class="pub-btn pub-btn--secondary pub-btn--block" href="/administrator" data-pub-auth="admin">Administrator login</a>
          <a class="pub-btn pub-btn--secondary pub-btn--block" href="/shop" data-pub-auth="shop">Shop login</a>
        </div>
        <div class="pub-drawer-foot">
          <button type="button" class="pub-btn pub-btn--block" data-pub-register>Create your business account</button>
          <p class="pub-small">Accounts are created once per business. Staff accounts are added inside a store by its administrator.</p>
        </div>
      </div>
    </div>`;
  }

  function footerHtml(b) {
    const year = new Date().getFullYear();
    return `<footer class="pub-foot">
      <div class="pub-shell">
        <div class="pub-foot-main">
          <div class="pub-foot-brand">
            ${brandBlock(b)}
            <p>One platform for the store operations that decide whether a retail business makes money: inventory, purchases, sales, dues, expenses, staff and multi-store control.</p>
            <div class="pub-hero-notes" style="margin-top:2px">
              <span>${GLYPH.shieldCheck} Role-based access</span>
              <span>${GLYPH.globe} Works in any modern browser</span>
            </div>
          </div>
          <div class="pub-foot-col">
            <h4>Product</h4>
            <ul>
              <li><a href="/#operations">Features</a></li>
              <li><a href="/#how-it-works">How it works</a></li>
              <li><a href="/#pricing">Pricing &amp; licenses</a></li>
              <li><a href="/#services">Premium services</a></li>
              <li><a href="/app-store">App Store</a></li>
            </ul>
          </div>
          <div class="pub-foot-col">
            <h4>Company</h4>
            <ul>
              <li><a href="/about">About ${esc(b.product_name || 'EMS')}</a></li>
              <li><a href="/blog">Blog</a></li>
              <li><a href="/contact">Contact</a></li>
              <li><a href="/#faq">FAQ</a></li>
            </ul>
          </div>
          <div class="pub-foot-col">
            <h4>Access &amp; legal</h4>
            <ul>
              <li><a href="/administrator" data-pub-auth="admin">Administrator login</a></li>
              <li><a href="/shop" data-pub-auth="shop">Shop login</a></li>
              <li><a href="/terms">Terms of Service</a></li>
              <li><a href="/privacy">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div class="pub-foot-bar">
          <span>© ${year} ${esc(b.powered_by || 'Dexter Studio')}. All rights reserved.</span>
          <span class="pub-credit">${esc(b.product_name || 'EMS')} is designed and built by ${esc(b.powered_by || 'Dexter Studio')}.</span>
        </div>
      </div>
    </footer>`;
  }

  function shellHtml(b, active, content) {
    return `<div class="pubsite" id="pubSite">
      <a href="#pubMain" class="pub-skip">Skip to content</a>
      ${headerHtml(b, active)}
      <main id="pubMain">${content}</main>
      ${footerHtml(b)}
    </div>`;
  }

  /* Delegated wiring — survives every re-render because it is bound to #app. */
  let bound = false;
  function bindShell() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', event => {
      const burger = event.target.closest('[data-pub-burger]');
      if (burger) { openDrawer(true); return; }
      if (event.target.closest('[data-pub-close]')) { openDrawer(false); return; }
      const auth = event.target.closest('[data-pub-auth]');
      if (auth) {
        openDrawer(false);
        /* Sign-in controls are links to /administrator or /shop so the URL is
           shareable and survives a refresh; intercept the click to open the
           modal in place and keep the address bar in step. */
        const href = auth.getAttribute('href');
        if (href) {
          event.preventDefault();
          try { go(href); } catch { /* non-visual environment */ }
        }
        const mode = auth.dataset.pubAuth;
        if (mode === 'owner') showEmsLogin();
        else showAuth(mode === 'shop' ? 'shop' : 'admin');
        return;
      }
      if (event.target.closest('[data-pub-register]')) { openDrawer(false); register(); return; }
      /* Landing-page anchors: scroll in place instead of reloading the SPA. */
      const jump = event.target.closest('a[href^="/#"]');
      if (jump) {
        const target = document.getElementById(jump.getAttribute('href').slice(2));
        if (target) {
          event.preventDefault();
          openDrawer(false);
          target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
          return;
        }
      }
      /* There is deliberately no platform-owner link on the public site: the
         owner console is internal and /owner is reached by direct URL only
         (the route still works, it is simply not advertised here). */
      const anchor = event.target.closest('[data-pub-plan]');
      if (anchor) { openDrawer(false); showAuth('admin'); }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') openDrawer(false);
    });
  }

  const prefersReducedMotion = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  };

  function openDrawer(open) {
    const drawer = document.getElementById('pubDrawer');
    if (!drawer) return;
    const burger = document.querySelector('[data-pub-burger]');
    if (open) {
      drawer.hidden = false;
      requestAnimationFrame(() => drawer.classList.add('is-open'));
      burger?.setAttribute('aria-expanded', 'true');
      drawer.querySelector('[data-pub-close]')?.focus({ preventScroll: true });
    } else {
      if (drawer.hidden) return;
      drawer.classList.remove('is-open');
      burger?.setAttribute('aria-expanded', 'false');
      setTimeout(() => { if (!drawer.classList.contains('is-open')) drawer.hidden = true; }, 260);
    }
  }

  function applyBranding(b) {
    document.title = `${b.website_name || 'EMS'} | Multi-store retail management`;
    document.querySelectorAll('[data-brand-name]').forEach(node => { node.textContent = b.product_name || 'EMS'; });
    document.querySelectorAll('[data-powered-by]').forEach(node => { node.textContent = b.powered_by || 'Dexter Studio'; });
  }

  /* -------------------------------------------------------------------
     Landing — hero
  ------------------------------------------------------------------- */
  function heroPreview() {
    const bars = [46, 62, 54, 78, 66, 92, 74];
    return `<div class="pub-preview-wrap">
      <p class="pub-preview-note">${GLYPH.info} Illustrative interface preview · sample data, not live figures</p>
      <div class="pub-preview" role="img" aria-label="Preview of the EMS store overview screen showing sales, due recovery, stock alerts and recent invoices. Sample data.">
        <div class="pub-preview-chrome">
          <span class="pub-preview-dots"><i></i><i></i><i></i></span>
          <span class="pub-preview-url">${GLYPH.lock} ems / store-overview</span>
          <span class="pub-tag pub-tag--accent">Preview</span>
        </div>
        <div class="pub-preview-body">
          <div class="pub-appbar">
            <div class="pub-appbar-left">
              <img src="${MARK_SRC}" alt="" aria-hidden="true" width="22" height="22">
              <div class="pub-appbar-title"><b>Store overview</b><small>Today · 3 stores</small></div>
            </div>
            <span class="pub-store-switch"><i></i>Main Branch${GLYPH.chevron}</span>
          </div>
          <div class="pub-kpi-row">
            <div class="pub-kpi pub-t-emerald"><span>Sales today</span><b>৳ 42,850</b><em>12 invoices</em></div>
            <div class="pub-kpi pub-t-sky"><span>Due collected</span><b>৳ 7,200</b><em>4 recoveries</em></div>
            <div class="pub-kpi pub-t-amber"><span>Low stock</span><b>6 items</b><em>Needs order</em></div>
          </div>
          <div class="pub-visual pub-visual--flush">
            <div class="pub-mini-head" style="padding:9px 10px 0"><span>Sales · last 7 days</span><span>Sample</span></div>
            <div class="pub-chart pub-t-teal">${bars.map(h => `<i style="height:${h}%"></i>`).join('')}</div>
            <div class="pub-chart-axis"><span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span></div>
          </div>
          <div class="pub-visual pub-visual--flush">
            <div class="pub-mini-head" style="padding:9px 10px 7px;border-bottom:1px solid var(--pub-line)"><span>Recent activity</span><span>Sales</span></div>
            <div class="pub-rows">
              ${SAMPLE_SALES.map(([no, label, amount, status]) => `<div class="pub-row pub-t-${status === 'Paid' ? 'emerald' : 'amber'}">
                <span class="pub-row-ic">${icon('receipt')}</span>
                <span class="pub-row-main"><b>${esc(no)} · ৳ ${esc(amount)}</b><small>${esc(label)}</small></span>
                <span class="pub-status">${esc(status)}</span>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="pub-preview-float">
        <div class="pub-mini-head"><span>Stock alerts</span><span>Sample</span></div>
        ${[['Blender 1.5L', '2 left'], ['LED Bulb 9W', '5 left'], ['Extension 4-way', '1 left']].map(([name, left]) => `<div class="pub-row" style="padding:6px 0;border:0">
          <span class="pub-row-main"><b>${esc(name)}</b></span>
          <span class="pub-row-val">${esc(left)}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function heroHtml() {
    return `<section class="pub-hero">
      <div class="pub-shell pub-hero-grid">
        <div class="pub-hero-copy">
          <span class="pub-eyebrow"><i></i>Multi-store retail management</span>
          <h1 class="pub-hero-title">Manage every store.<br>Run your business <span>with clarity.</span></h1>
          <p class="pub-hero-sub">${esc('EMS')} brings inventory, purchases, sales, expenses, customers, dues and staff into one management system — so every store you run reports into the same accurate set of books.</p>
          <div class="pub-hero-actions">
            <button type="button" class="pub-btn" data-pub-register>Create your business account</button>
            <a class="pub-btn pub-btn--secondary" href="#operations">Explore EMS${GLYPH.arrow}</a>
          </div>
          <div class="pub-hero-notes">
            <span>${GLYPH.check} Free to create an account</span>
            <span>${GLYPH.check} Each store runs on a license plan you choose</span>
            <span>${GLYPH.check} bKash and Nagad payments verified by the EMS team</span>
          </div>
        </div>
        ${heroPreview()}
      </div>
    </section>
    <section class="pub-audience">
      <div class="pub-shell pub-audience-inner">
        <span>Built for</span>
        <ul>
          <li>Electronics &amp; wholesale</li>
          <li>Clothing &amp; lifestyle</li>
          <li>Pharmacy</li>
          <li>Supershop &amp; grocery</li>
          <li>Single shops growing into chains</li>
        </ul>
      </div>
    </section>`;
  }

  /* -------------------------------------------------------------------
     Landing — operations bento
  ------------------------------------------------------------------- */
  function stockVisual() {
    return `<div class="pub-visual pub-visual--flush">
      <div class="pub-mini-head" style="padding:9px 11px 7px;border-bottom:1px solid var(--pub-line)"><span>Inventory · Main Branch</span><span>Live stock</span></div>
      ${[['LED Panel 18W', '42 pcs', 68, 'teal'], ['Copper Wire 1mm', '9 roll', 22, 'amber'], ['Wall Switch 2-gang', '86 pcs', 88, 'emerald']].map(([name, qty, pct, tone]) => `<div class="pub-stock-row pub-t-${tone}">
        <div class="pub-stock-head"><b>${esc(name)}</b><span>${esc(qty)}</span></div>
        <div class="pub-meter"><i style="width:${pct}%"></i></div>
      </div>`).join('')}
    </div>`;
  }

  function invoiceVisual() {
    return `<div class="pub-visual pub-visual--flush">
      <div class="pub-mini-head" style="padding:9px 11px 7px;border-bottom:1px solid var(--pub-line)"><span>Sales invoice</span><span>INV-2061</span></div>
      <table class="pub-tbl" aria-label="Sample invoice lines">
        <thead><tr><th>Item</th><th>Qty</th><th class="num">Amount</th></tr></thead>
        <tbody>
          <tr><td>LED Panel 18W</td><td>4</td><td class="num">2,400.00</td></tr>
          <tr><td>Wall Switch 2-gang</td><td>2</td><td class="num">640.00</td></tr>
        </tbody>
      </table>
      <div class="pub-verify-totals" style="padding:8px 11px 10px">
        <p><span>Discount</span><b>− 110.00</b></p>
        <p class="is-total"><span>Paid</span><b>2,930.00</b></p>
      </div>
    </div>`;
  }

  function suppliersVisual() {
    return `<div class="pub-visual pub-visual--flush">
      <div class="pub-mini-head" style="padding:9px 11px 7px;border-bottom:1px solid var(--pub-line)"><span>Purchases · suppliers</span><span>Dues</span></div>
      ${[['Rahman Traders', '৳ 12,400 due', 'amber'], ['Metro Supply Co.', '৳ 0 due', 'emerald'], ['Ideal Imports', '৳ 6,150 due', 'amber']].map(([name, due, tone]) => `<div class="pub-row pub-t-${tone}">
        <span class="pub-row-ic">${icon('truck')}</span>
        <span class="pub-row-main"><b>${esc(name)}</b><small>Purchase ledger</small></span>
        <span class="pub-row-val">${esc(due)}</span>
      </div>`).join('')}
    </div>`;
  }

  function dueVisual() {
    return `<div class="pub-visual pub-visual--flush">
      <div class="pub-mini-head" style="padding:9px 11px 7px;border-bottom:1px solid var(--pub-line)"><span>Customer dues</span><span>Recovery</span></div>
      ${[['Nasir Hossain', '৳ 4,300', 'Recovered', 'emerald'], ['Sumaiya Akter', '৳ 1,250', 'Open', 'amber']].map(([name, amt, status, tone]) => `<div class="pub-row pub-t-${tone}">
        <span class="pub-row-ic">${icon('coins')}</span>
        <span class="pub-row-main"><b>${esc(name)}</b><small>${esc(amt)} outstanding</small></span>
        <span class="pub-status">${esc(status)}</span>
      </div>`).join('')}
    </div>`;
  }

  function expenseVisual() {
    return `<div class="pub-visual pub-visual--flush" style="padding:11px">
      <div class="pub-mini-head" style="margin-bottom:8px"><span>This month</span><span>Expenses</span></div>
      ${[['Shop rent', '18,000'], ['Utility bills', '4,250'], ['Staff salary', '32,500']].map(([label, amt]) => `<div class="pub-row" style="padding:6px 0;border:0">
        <span class="pub-row-main"><b>${esc(label)}</b></span>
        <span class="pub-row-val">৳ ${esc(amt)}</span>
      </div>`).join('')}
      <div class="pub-meter pub-t-sky" style="margin-top:6px"><i style="width:74%"></i></div>
    </div>`;
  }

  function reportVisual() {
    const bars = [38, 52, 44, 66, 58, 78, 70, 88];
    return `<div class="pub-visual pub-visual--flush pub-t-emerald">
      <div class="pub-mini-head" style="padding:9px 11px 7px;border-bottom:1px solid var(--pub-line)"><span>Business performance</span><span>This quarter</span></div>
      <div class="pub-chart" style="height:86px">${bars.map(h => `<i style="height:${h}%"></i>`).join('')}</div>
      <div class="pub-legend"><span>Sales <b>৳ 1.24M</b></span><span>Profit <b>৳ 286K</b></span><span>Expenses <b>৳ 412K</b></span></div>
    </div>`;
  }

  function storesMiniVisual() {
    return `<div class="pub-visual pub-visual--flush">
      <div class="pub-mini-head" style="padding:9px 11px 7px;border-bottom:1px solid var(--pub-line)"><span>Stores on this business</span><span>3 of 4</span></div>
      ${SAMPLE_STORES.map(([name, meta, status, tone], index) => `<div class="pub-row ${index === 0 ? 'is-current' : ''} pub-t-${tone}">
        <span class="pub-row-ic">${icon('store')}</span>
        <span class="pub-row-main"><b>${esc(name)}</b><small>${esc(meta)}</small></span>
        <span class="pub-status">${esc(status)}</span>
      </div>`).join('')}
    </div>`;
  }

  function permissionVisual() {
    const rows = [['Inventory', true, true, false], ['Sales', true, true, true], ['Expenses', true, false, false], ['Reports', true, false, false]];
    const cell = on => `<div class="${on ? 'on' : 'off'}">${on ? GLYPH.check : GLYPH.minus}</div>`;
    return `<div class="pub-visual pub-visual--flush">
      <div class="pub-mini-head" style="padding:9px 11px 7px;border-bottom:1px solid var(--pub-line)"><span>Permissions</span><span>Staff role</span></div>
      <div class="pub-perm-grid">
        <div class="hd">Section</div><div class="hd">View</div><div class="hd">Add</div><div class="hd">Delete</div>
        ${rows.map(([name, view, add, del]) => `<div>${esc(name)}</div>${cell(view)}${cell(add)}${cell(del)}`).join('')}
      </div>
    </div>`;
  }

  function operationsHtml() {
    return `<section class="pub-section" id="operations">
      <div class="pub-shell">
        <div class="pub-head-row">
          <div class="pub-head">
            <span class="pub-kicker">One platform, every operation</span>
            <h2 class="pub-h2">The work you do every day, already organised.</h2>
            <p class="pub-lead">EMS covers the operations that decide whether a shop is profitable — from the stock on the shelf to the salary paid at the end of the month. Each module writes to the same records, so nothing has to be reconciled by hand.</p>
          </div>
        </div>
        <div class="pub-bento">
          <article class="pub-feature pub-c3">
            <div class="pub-feature-top">
              <span class="pub-chip pub-t-teal">${icon('package')}</span>
              <div class="pub-feature-title"><h3>Inventory management</h3><span>Stock</span></div>
            </div>
            <p>Item codes, units and categories with live stock levels. Purchases and sales post movements automatically, and low-stock lines surface before you run out.</p>
            ${stockVisual()}
          </article>
          <article class="pub-feature pub-c3">
            <div class="pub-feature-top">
              <span class="pub-chip pub-t-emerald">${icon('receipt')}</span>
              <div class="pub-feature-title"><h3>Sales &amp; invoicing</h3><span>Counter &amp; credit</span></div>
            </div>
            <p>Invoices with discounts, tax, paid and due amounts, plus returns and exchanges that reverse stock and totals correctly.</p>
            ${invoiceVisual()}
          </article>
          <article class="pub-feature pub-c2">
            <div class="pub-feature-top">
              <span class="pub-chip pub-t-sky">${icon('truck')}</span>
              <div class="pub-feature-title"><h3>Purchases &amp; suppliers</h3><span>Procurement</span></div>
            </div>
            <p>Record supplier purchases line by line and settle dues against the invoice they belong to.</p>
            ${suppliersVisual()}
          </article>
          <article class="pub-feature pub-c2">
            <div class="pub-feature-top">
              <span class="pub-chip pub-t-amber">${icon('coins')}</span>
              <div class="pub-feature-title"><h3>Customers &amp; due recovery</h3><span>Receivables</span></div>
            </div>
            <p>Every customer's history and outstanding balance in one ledger; record a recovery the moment they pay.</p>
            ${dueVisual()}
          </article>
          <article class="pub-feature pub-c2">
            <div class="pub-feature-top">
              <span class="pub-chip pub-t-violet">${icon('wallet')}</span>
              <div class="pub-feature-title"><h3>Expenses &amp; salaries</h3><span>Outgoings</span></div>
            </div>
            <p>Log shop expenses with paid and due amounts, and run staff salary cycles without a separate spreadsheet.</p>
            ${expenseVisual()}
          </article>
          <article class="pub-feature pub-c4">
            <div class="pub-feature-top">
              <span class="pub-chip pub-t-emerald">${icon('chart')}</span>
              <div class="pub-feature-title"><h3>Reports &amp; business performance</h3><span>Review</span></div>
            </div>
            <p>Summary, sales, purchase and expense reports for any date range — so month-end is a review instead of a reconstruction.</p>
            ${reportVisual()}
          </article>
          <article class="pub-feature pub-c2">
            <div class="pub-feature-top">
              <span class="pub-chip pub-t-rose">${icon('user-check')}</span>
              <div class="pub-feature-title"><h3>Staff &amp; permissions</h3><span>Access control</span></div>
            </div>
            <p>Create staff accounts and choose exactly which sections and actions each person can use.</p>
            ${permissionVisual()}
          </article>
          <article class="pub-feature pub-feature--band pub-c6">
            <div class="pub-feature-copy">
              <div class="pub-feature-top">
                <span class="pub-chip pub-t-zinc">${icon('store')}</span>
                <div class="pub-feature-title"><h3>Multi-store business</h3><span>One account</span></div>
              </div>
              <p>Each store keeps its own inventory, staff, invoices, expenses and reports. Your administrator account holds the whole business — stores, licenses and permissions — in one place, and switches between them without a second login.</p>
            </div>
            ${storesMiniVisual()}
          </article>
        </div>
      </div>
    </section>`;
  }

  /* -------------------------------------------------------------------
     Landing — how it works
  ------------------------------------------------------------------- */
  function howItWorksHtml() {
    const steps = [
      ['Create your business account', 'Register once as an administrator. That account owns your business profile, stores, licenses and add-ons.'],
      ['Create and configure your stores', 'Add each store with its business type, address and details. A store needs an active license before staff can use it.'],
      ['Set up inventory and business information', 'Add items, units, categories, customers and suppliers so invoices and stock movements start from accurate records.'],
      ['Manage daily purchases, sales and expenses', 'Your team records the day’s work in the modules their permissions allow; stock and dues update as they go.'],
      ['Monitor activity and performance', 'Review reports, outstanding dues, stock alerts and staff activity to decide what to do next.']
    ];
    return `<section class="pub-section" id="how-it-works">
      <div class="pub-shell">
        <div class="pub-head">
          <span class="pub-kicker">How EMS works</span>
          <h2 class="pub-h2">From registration to a running store.</h2>
          <p class="pub-lead">Five steps stand between a new account and a shop that records its own numbers. None of them require an IT team.</p>
        </div>
        <ol class="pub-steps">
          ${steps.map(([title, body], index) => `<li class="pub-step">
            <span class="pub-step-num">Step ${String(index + 1).padStart(2, '0')}</span>
            <h3>${esc(title)}</h3>
            <p>${esc(body)}</p>
          </li>`).join('')}
        </ol>
        <div class="pub-step-note">${GLYPH.info}<span><b>Where licensing fits:</b> creating an account is free. A store becomes usable once a license is active — choose a plan, submit your bKash or Nagad payment details, and the EMS team verifies and activates it. Free plans, where published, activate automatically.</span></div>
      </div>
    </section>`;
  }

  /* -------------------------------------------------------------------
     Landing — roles
  ------------------------------------------------------------------- */
  function rolesHtml() {
    const roles = [
      ['Administrator', 'Business owner or manager', 'teal', 'register',
        'Owns the business account. This is the account you create when you sign up.',
        ['Manages the business profile and every store', 'Controls licenses, shop capacity and subscriptions', 'Registers devices and buys premium add-ons', 'Can enter a store and work inside it']],
      ['Shop staff', 'Store employee', 'sky', null,
        'Created inside a store by its administrator. Sees only the modules it has been granted.',
        ['Handles everyday store operations', 'Works within permitted sections and actions', 'Cannot buy licenses or add-ons', 'Access changes the moment permissions change']],
      ['Platform owner', 'The team running EMS', 'violet', null,
        'The operator of this EMS deployment. Not a customer account.',
        ['Manages businesses, stores and licenses', 'Defines plans and premium services', 'Controls website content and platform settings', 'Reviews payment claims before activation']]
    ];
    return `<section class="pub-section" id="access">
      <div class="pub-shell">
        <div class="pub-head-row">
          <div class="pub-head">
            <span class="pub-kicker">Access levels</span>
            <h2 class="pub-h2">One platform, different access levels.</h2>
            <p class="pub-lead">Three roles share the same system without seeing the same things. Access is decided by role, license and staff permission — not by who has the link.</p>
          </div>
        </div>
        <div class="pub-roles">
          ${roles.map(([name, sub, tone, cta, intro, bullets]) => `<article class="pub-role pub-t-${tone}">
            <span class="pub-role-flag">${name === 'Platform owner' ? GLYPH.lock : GLYPH.check}${esc(sub)}</span>
            <h3>${esc(name)}</h3>
            <p>${esc(intro)}</p>
            <ul>${bullets.map(text => `<li>${GLYPH.check}<span>${esc(text)}</span></li>`).join('')}</ul>
            <div class="pub-role-foot">${cta === 'register'
              ? '<button type="button" class="pub-btn pub-btn--secondary pub-btn--sm" data-pub-register>Create your business account</button>'
              : name === 'Shop staff'
                ? '<a class="pub-btn pub-btn--ghost pub-btn--sm" href="/shop" data-pub-auth="shop">Shop login</a>'
                : '<a class="pub-btn pub-btn--ghost pub-btn--sm" href="/contact">Questions? Contact us</a>'}</div>
          </article>`).join('')}
        </div>
        <div class="pub-note">${GLYPH.info}<span><b>Not sure which one you need?</b> If the business is yours, register as an <b>Administrator</b>. Shop staff accounts are added by that administrator inside each store. The platform-owner account is internal to the team operating this deployment and is not available from this website.</span></div>
      </div>
    </section>`;
  }

  /* -------------------------------------------------------------------
     Landing — multi-store
  ------------------------------------------------------------------- */
  function multiStoreVisual() {
    return `<div class="pub-visual pub-visual--flush">
      <div class="pub-store-panel">
        <div class="pub-store-panel-head">
          <b>Store manage</b>
          <span class="pub-tag pub-tag--accent">Capacity 3 of 4</span>
        </div>
        <div class="pub-store-list">
          ${SAMPLE_STORES.map(([name, meta, status, tone], index) => `<div class="pub-store-row ${index === 0 ? 'is-current' : ''} pub-t-${tone}">
            <span class="pub-store-mark">${esc(name.slice(0, 2).toUpperCase())}</span>
            <span class="pub-store-main"><b>${esc(name)}</b><small>${esc(meta)}</small></span>
            <span class="pub-status">${esc(status)}</span>
          </div>`).join('')}
        </div>
        <div class="pub-store-panel-foot">
          <span>1 store slot available on this license</span>
          <span class="pub-mono">Store Manage</span>
        </div>
      </div>
    </div>`;
  }

  function multiStoreHtml() {
    const facts = [
      ['devices', 'One account, every store', 'Switch between stores from the same administrator account — no separate sign-in per branch.'],
      ['layers', 'Records stay separated', 'Inventory, invoices, customers and staff belong to a store, so branch totals never blur together.'],
      ['shield', 'Capacity you control', 'Decide which stores are active, read-only or inactive within the shop allowance of your license.'],
      ['chart', 'Compare without spreadsheets', 'Review each store on its own or the business as a whole from the same reports.']
    ];
    return `<section class="pub-section" id="multi-store">
      <div class="pub-shell pub-split">
        <div class="pub-split-copy">
          <span class="pub-kicker">Multi-store management</span>
          <h2 class="pub-h2">One account can hold your whole business.</h2>
          <p class="pub-lead">An administrator account is not tied to a single counter. Add another store when you open one, give it its own records and staff, and keep both visible from the place you already work.</p>
          <div class="pub-facts">
            ${facts.map(([ic, title, body]) => `<div class="pub-fact">
              <span class="pub-fact-ic">${icon(ic)}</span>
              <div><b>${esc(title)}</b><p>${esc(body)}</p></div>
            </div>`).join('')}
          </div>
          <div><a class="pub-link" href="#pricing">See how store capacity works${GLYPH.arrow}</a></div>
        </div>
        ${multiStoreVisual()}
      </div>
    </section>`;
  }

  /* -------------------------------------------------------------------
     Landing — premium services
  ------------------------------------------------------------------- */
  function servicesHtml() {
    const services = [
      ['ConnectX', 'mail', 'teal', 'Email &amp; SMS', 'Email invoices and messages to customers and suppliers from inside a store, with a per-shop daily sending limit.'],
      ['Zudo AI', 'sparkles', 'violet', 'Read-only assistant', 'Ask questions about your own sales, purchases, stock, customers and dues. Zudo answers from your records and never edits them.'],
      ['Business Health', 'activity', 'emerald', 'AI review', 'Generate a health report for a chosen period with a score, the risks it found and practical recommendations.'],
      ['TrueBill', 'qr', 'sky', 'Invoice verification', 'Every invoice, return and exchange carries a QR code that opens a public verification page for your customer.'],
      ['Vaultium', 'folder', 'amber', 'Document storage', 'Keep business documents private in store-linked storage, and attach them to the expenses they belong to.']
    ];
    return `<section class="pub-section" id="services">
      <div class="pub-shell">
        <div class="pub-head-row">
          <div class="pub-head">
            <span class="pub-kicker">Premium services</span>
            <h2 class="pub-h2">Extend EMS when the business needs it.</h2>
            <p class="pub-lead">These services are optional. Availability depends on your license plan and on any add-on your administrator purchases — a plan that does not include a service simply leaves it switched off.</p>
          </div>
          <a class="pub-link" href="#pricing">Compare plans${GLYPH.arrow}</a>
        </div>
        <div class="pub-services">
          ${services.map(([name, ic, tone, tag, body], index) => `<article class="pub-service pub-t-${tone}${index > 2 ? ' pub-service--wide' : ''}">
            <div class="pub-service-top">
              <span class="pub-chip pub-t-${tone}">${icon(ic)}</span>
              <span class="pub-tag"><i></i>${tag}</span>
            </div>
            <h3>${esc(name)}</h3>
            <p>${body}</p>
            <div class="pub-service-meta"><span class="pub-tag pub-tag--outline">License or add-on</span></div>
          </article>`).join('')}
        </div>
        <div class="pub-note">${GLYPH.info}<span><b>How availability works:</b> the EMS owner publishes which services each license plan includes and which add-ons can be bought. If a service is not in your plan, your administrator can purchase it separately — add-ons never change store capacity or extend a license.</span></div>
      </div>
    </section>`;
  }

  /* -------------------------------------------------------------------
     Landing — pricing (live plans from the API)
  ------------------------------------------------------------------- */
  function planFeatureList(plan) {
    const rows = [];
    const stores = Number(plan.max_stores) || 0;
    const months = Number(plan.duration_months) || 0;
    rows.push([`${stores} ${stores === 1 ? 'store' : 'stores'} on this license`, true]);
    rows.push([`${months} ${months === 1 ? 'month' : 'months'} of access`, true]);
    const entitlements = [
      ['connectx_enabled', 'ConnectX email & SMS'],
      ['zudo_enabled', 'Zudo AI assistant'],
      ['business_health_enabled', 'AI Business Health'],
      ['truebill_enabled', 'TrueBill verification']
    ];
    entitlements.forEach(([key, label]) => {
      if (plan[key] === undefined || plan[key] === null) return;
      rows.push([label, !!plan[key]]);
    });
    if (Number(plan.vaultium_gb) > 0) rows.push([`Vaultium · ${Number(plan.vaultium_gb)} GB storage`, true]);
    return rows.map(([label, on]) => `<li class="${on ? '' : 'is-off'}">${on ? GLYPH.check : GLYPH.minus}<span>${esc(label)}</span></li>`).join('');
  }

  function planCardHtml(plan, featured) {
    const free = Number(plan.price) === 0;
    const stores = Number(plan.max_stores) || 0;
    const months = Number(plan.duration_months) || 0;
    return `<article class="pub-plan ${featured ? 'pub-plan--featured' : ''}">
      ${featured ? '<span class="pub-plan-flag">Featured</span>' : ''}
      <div class="pub-plan-head">
        <div class="pub-plan-name"><h3>${esc(plan.title || 'License plan')}</h3><span>License plan</span></div>
        <span class="pub-chip pub-t-teal">${icon('shield')}</span>
      </div>
      <div class="pub-plan-price">${free ? 'Free' : '৳ ' + Number(plan.price || 0).toLocaleString('en-US')}${free ? '' : `<small>/ ${months} mo</small>`}</div>
      <p class="pub-plan-desc">${esc(plan.description || (free ? 'A zero-cost license for getting a single store started.' : 'A store license activated after the EMS team verifies your payment.'))}</p>
      <div class="pub-plan-facts">
        <div><span>Stores</span><b>${stores}</b></div>
        <div><span>Duration</span><b>${months} ${months === 1 ? 'month' : 'months'}</b></div>
      </div>
      <ul class="pub-plan-list">${planFeatureList(plan)}</ul>
      <div class="pub-plan-actions">
        <button type="button" class="pub-btn ${featured ? '' : 'pub-btn--secondary'} pub-btn--block" data-pub-plan="${esc(plan.id)}">Choose this plan</button>
        <small>${free ? 'Free plans activate automatically when eligible.' : 'Payment is verified before activation.'}</small>
      </div>
    </article>`;
  }

  function pricingSectionHtml() {
    return `<section class="pub-section pub-pricing" id="pricing">
      <div class="pub-shell">
        <div class="pub-head-row">
          <div class="pub-head">
            <span class="pub-kicker">Pricing &amp; licenses</span>
            <h2 class="pub-h2">Plans published for this EMS deployment.</h2>
            <p class="pub-lead">Prices, duration and store capacity below come from the license plans published on this deployment. A license belongs to your administrator account and defines how many stores you can run and which services are included.</p>
          </div>
        </div>
        <div id="pubPlans" class="pub-plans">
          <div class="pub-skel" aria-live="polite"><div class="pub-skel-line w40"></div><div class="pub-skel-line w70"></div><div class="pub-skel-line"></div></div>
          <div class="pub-skel" aria-hidden="true"><div class="pub-skel-line w40"></div><div class="pub-skel-line w70"></div><div class="pub-skel-line"></div></div>
        </div>
        <div class="pub-pricing-foot">
          <span><b>How payment works:</b> choose a plan after creating your administrator account, pay with bKash or Nagad, and submit the transaction ID. Each claim is reviewed by the EMS team before the license starts.</span>
          <button type="button" class="pub-btn pub-btn--secondary pub-btn--sm" data-pub-register>Create your business account</button>
        </div>
      </div>
    </section>`;
  }

  async function loadPlans() {
    const box = document.getElementById('pubPlans');
    if (!box) return;
    try {
      const plans = await api('public/license-plans');
      if (!document.body.contains(box)) return;
      box.innerHTML = plans.length
        ? plans.map((plan, index) => planCardHtml(plan, index === 1)).join('')
        : `<div class="pub-empty" style="grid-column:1/-1">
            <span class="pub-empty-ic">${icon('shield')}</span>
            <h3>No license plans are published right now</h3>
            <p>Accounts can still be created. An administrator can request a license as soon as a plan is published.</p>
            <button type="button" class="pub-btn pub-btn--sm" data-pub-register>Create your business account</button>
          </div>`;
    } catch {
      if (!document.body.contains(box)) return;
      box.innerHTML = `<div class="pub-empty" style="grid-column:1/-1">
        <span class="pub-empty-ic">${icon('alert-triangle')}</span>
        <h3>License plans could not be loaded</h3>
        <p>The EMS API did not respond. Reload the page, or create an account and view plans inside the administrator panel.</p>
        <button type="button" class="pub-btn pub-btn--secondary pub-btn--sm" data-pub-register>Create your business account</button>
      </div>`;
    }
  }

  /* -------------------------------------------------------------------
     Landing — FAQ, CTA
  ------------------------------------------------------------------- */
  function faqHtml() {
    const items = [
      ['Can I manage more than one store?', 'Yes. Your administrator account can hold several stores. Each store keeps its own inventory, invoices, customers and staff, and you switch between them from the same account. How many you can run at once is set by the store capacity of your license.'],
      ['What is the difference between an administrator and shop staff?', 'An <b>administrator</b> owns the business account: profile, stores, licenses, add-ons and devices. <b>Shop staff</b> are employees created inside a store by that administrator, and they only see the modules and actions their permissions allow. Staff cannot purchase licenses or add-ons.'],
      ['How do store licenses work?', 'A license belongs to your administrator account and defines the plan, validity dates, store capacity and included services. Paid purchases are reviewed by the EMS team before they activate, and separate license purchases do not stack — the license that is currently effective controls capacity.'],
      ['What happens when a license expires?', 'Without an active license, normal store operation is no longer available and affected stores can be placed in read-only mode, where existing records are visible but business changes are restricted. Renewing a plan restores normal operation once the new license is approved.'],
      ['Can staff permissions be restricted?', 'Yes. Each staff account has its own permissions per section — view, add, edit and delete are granted separately. Changes take effect when the staff member’s session next syncs, so access follows the permission rather than the device.'],
      ['Are premium add-ons included in every plan?', 'No. ConnectX, Zudo AI, Business Health, TrueBill and Vaultium are available only when your license includes them or your administrator purchases the add-on. Add-ons do not add store capacity and do not extend a license.'],
      ['Can a customer check whether an invoice is genuine?', 'If TrueBill is enabled, invoices, return slips and exchange invoices carry a QR code that opens a public verification page showing the record held by EMS. No login is needed to verify.'],
      ['How do I get started?', 'Create a business account, add your business details, choose a license plan and submit your payment details. When the license is active, create your first store and add items, customers and staff. Your staff then sign in with their Shop ID and User ID.']
    ];
    return `<section class="pub-section" id="faq">
      <div class="pub-shell pub-faq">
        <div class="pub-split-copy">
          <span class="pub-kicker">Questions</span>
          <h2 class="pub-h2">Answers, before you commit.</h2>
          <p class="pub-lead">The practical details owners ask about most — licensing, access and what happens when something changes.</p>
          <div class="pub-card pub-card--pad" style="margin-top:6px">
            <div class="pub-feature-top">
              <span class="pub-chip pub-t-teal">${icon('help')}</span>
              <div class="pub-feature-title"><h3>Still deciding?</h3><span>Talk to the team</span></div>
            </div>
            <p class="pub-small">Send a question through the contact form and the EMS team will answer with specifics for your business.</p>
            <a class="pub-link" href="/contact">Open the contact form${GLYPH.arrow}</a>
          </div>
        </div>
        <div class="pub-faq-list">
          ${items.map(([q, a]) => `<details class="pub-faq-item">
            <summary><span class="pub-faq-q">${esc(q)}</span><span class="pub-faq-plus" aria-hidden="true"></span></summary>
            <div class="pub-faq-a">${a}</div>
          </details>`).join('')}
        </div>
      </div>
    </section>`;
  }

  function ctaHtml() {
    return `<section class="pub-section" style="padding-bottom:0">
      <div class="pub-shell">
        <div class="pub-cta">
          <div class="pub-cta-inner">
            <span class="pub-kicker" style="color:rgba(232,243,240,.7)">Start here</span>
            <h2>Open your first store on EMS this week.</h2>
            <p>Create your business account, choose a license plan and add your store. No installation, no separate server — EMS runs in the browser your team already uses.</p>
            <div class="pub-cta-actions">
              <button type="button" class="pub-btn" data-pub-register>Create your business account</button>
              <a class="pub-btn pub-btn--secondary" href="#pricing">Review license plans${GLYPH.arrow}</a>
            </div>
          </div>
          <div class="pub-cta-meta">
            <span>Free account creation</span>
            <span>Manual payment verification</span>
            <span>Role-based staff access</span>
            <span>Browser-based, no install</span>
          </div>
        </div>
      </div>
    </section>`;
  }

  /* -------------------------------------------------------------------
     Landing entry point
  ------------------------------------------------------------------- */
  /* Shown above the landing page when the requested URL does not exist. */
  function notFoundBannerHtml() {
    return `<div class="pub-shell" style="padding-top:28px">
      <div class="pub-note" role="status">${GLYPH.info}<span><b>That page does not exist.</b> The address you followed does not point to anything on this site, so here is the home page instead. Every real page is reachable from the menu above.</span></div>
    </div>`;
  }

  async function renderLanding(options = {}) {
    bindShell();
    let b = { ...DEFAULT_BRAND };
    app.innerHTML = `<div class="pubsite"><div class="pub-shell" style="padding-block:80px"><div class="pub-skel"><div class="pub-skel-line w40"></div><div class="pub-skel-line w70"></div><div class="pub-skel-line"></div></div></div></div>`;
    try { b = await brand(); } catch { b = { ...DEFAULT_BRAND }; }
    applyBranding(b);
    app.innerHTML = shellHtml(b, 'home', `${options.notFound ? notFoundBannerHtml() : ''}${heroHtml()}${operationsHtml()}${howItWorksHtml()}${rolesHtml()}${multiStoreHtml()}${servicesHtml()}${pricingSectionHtml()}${faqHtml()}${ctaHtml()}`);
    const hashTarget = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    if (hashTarget) hashTarget.scrollIntoView({ block: 'start' });
    else { try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* non-visual environment */ } }
    loadPlans();
  }

  /* =====================================================================
     SUBPAGES
     ===================================================================== */

  const money2 = value => Number(value || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateLong = value => {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
  };
  const paras = text => String(text || '')
    .split(/\n{2,}/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => `<p>${esc(chunk).replace(/\n/g, '<br>')}</p>`)
    .join('');

  function pageHead({ crumbs = [], kicker, title, sub, meta = '' }) {
    return `<section class="pub-page-head">
      <div class="pub-shell pub-page-head-inner">
        ${crumbs.length ? `<nav class="pub-crumbs" aria-label="Breadcrumb">${crumbs.map(([href, label], index) => `${index ? '<span>/</span>' : ''}<a href="${href}">${esc(label)}</a>`).join('')}</nav>` : ''}
        ${kicker ? `<span class="pub-kicker">${esc(kicker)}</span>` : ''}
        <h1 class="pub-page-title">${esc(title)}</h1>
        ${sub ? `<p class="pub-page-sub">${sub}</p>` : ''}
        ${meta}
      </div>
    </section>`;
  }

  async function cmsPage(slug) {
    try { return await api('public/page?slug=' + encodeURIComponent(slug)); }
    catch { return null; }
  }

  /* --- About ---------------------------------------------------------- */
  function aboutFallback() {
    return `<div class="pub-prose">
      <p>EMS is a multi-store retail management platform: one system where a business owner records purchases, sales, expenses, dues, staff and stock — and where every store in that business reports into the same records.</p>
      <h2>Why it exists</h2>
      <p>Most shops do not lose money because they cannot sell. They lose it because the paperwork disagrees with the shelves. A purchase is written in one book, a sale in another, a due on a slip of paper, a salary in someone's memory. By the time those numbers meet, it is too late to act on them.</p>
      <p>EMS was built to remove that gap. Every module writes to the same database: posting a sale moves stock and updates a customer's due at the same moment, and a report reads the identical numbers your staff recorded at the counter.</p>
      <h2>Who it is for</h2>
      <p>A single shop that wants accurate records, and a growing business that runs several branches under one owner. The same account covers both: add a store when you open one, and the platform grows with the business rather than being replaced by it.</p>
      <h2>How it is operated</h2>
      <p>Each EMS deployment is run by its own platform owner, who publishes license plans, verifies payments and manages support. Every business, store and staff account beneath that owner is separated by license, role and permission.</p>
    </div>`;
  }

  function aboutBody(data) {
    return data && String(data.body || '').trim()
      ? `<div class="pub-prose">${paras(data.body)}</div>`
      : aboutFallback();
  }

  function valuesHtml() {
    const values = [
      ['shield', 'Records you can defend', 'Every invoice, purchase, expense and recovery is stored with who posted it and when, so a disputed number can always be traced.'],
      ['layers', 'Built for many stores', 'Store-level data stays separate while the business stays visible as a whole — the structure a chain needs from day one.'],
      ['user-check', 'Access that matches the job', 'Staff see the sections they were granted, and permissions can be reduced without creating a new account.']
    ];
    return `<div class="pub-values">
      ${values.map(([ic, title, body]) => `<article class="pub-value">
        <span class="pub-chip pub-t-teal">${icon(ic)}</span>
        <h3>${esc(title)}</h3>
        <p>${esc(body)}</p>
      </article>`).join('')}
    </div>`;
  }

  function aboutPage(b, data) {
    const title = (data && data.title) || `About ${b.product_name || 'EMS'}`;
    const updated = data ? dateLong(data.updated_at) : '';
    return `${pageHead({
      crumbs: [['/', 'Home'], ['/about', 'About']],
      kicker: 'About EMS',
      title,
      sub: 'A complete multi-store retail business management platform — built so that the numbers a shop runs on are recorded once, in one place.'
    })}
    <section class="pub-section">
      <div class="pub-shell pub-about-grid">
        ${aboutBody(data)}
        <aside class="pub-aside-card">
          <h3>At a glance</h3>
          <ul class="pub-aside-list">
            <li><b>Product</b>${esc(b.product_name || 'EMS')} — multi-store retail management</li>
            <li><b>Runs as</b>Browser-based platform, no installation on the counter</li>
            <li><b>Covers</b>Inventory, purchases, sales, customers, dues, expenses, staff and reports</li>
            <li><b>Built by</b>${esc(b.powered_by || 'Dexter Studio')}</li>
            ${updated ? `<li><b>Page updated</b>${esc(updated)}</li>` : ''}
          </ul>
          <div class="pub-aside-meta">
            <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/contact">Contact the team</a>
          </div>
        </aside>
      </div>
      <div class="pub-shell">${valuesHtml()}</div>
    </section>
    ${ctaHtml()}`;
  }

  /* --- Terms --------------------------------------------------------- */
  function termsFallback() {
    return `<p>This page is managed by the operators of this EMS deployment. The summary below describes how licensing and access actually work inside the product; the binding agreement for your account is the one your platform owner publishes here.</p>
    <h2>1 · Accounts</h2>
    <p>An administrator account represents one business. It owns the business profile, its stores, licenses, devices and premium add-ons. Staff accounts are created by an administrator inside a store and are limited to the permissions they are granted.</p>
    <h2>2 · Licenses</h2>
    <p>A license defines the plan, validity period, store capacity and included services for an administrator account. Paid purchases are reviewed before activation. Separate license purchases do not add their store limits together — the currently effective license controls capacity. Premium add-ons are separate from the license and do not extend it.</p>
    <h2>3 · Store operation</h2>
    <p>A store operates normally only while its license, its module entitlement, service availability and staff permissions all allow it. Without an active license, stores may be placed in read-only mode where existing records remain visible but business changes are restricted.</p>
    <h2>4 · Payments</h2>
    <p>License and add-on payments are made through the payment methods published in the product (bKash or Nagad) and are activated after manual verification. Rejected claims can be reviewed with the platform owner through the support channels provided in the product.</p>
    <h2>5 · Data</h2>
    <p>Business records belong to the administrator account that created them. The platform owner operates the infrastructure and can access platform-level data required to run, secure and support the service. See the <a href="/privacy">Privacy Policy</a> for how the software handles data.</p>
    <h2>6 · Support</h2>
    <p>Support is handled through the HelpDesk built into the panels and through the contact form on this website. Questions about this document should be sent through the contact form.</p>`;
  }

  function legalLayout(b, { title, sub, updated, bodyHtml, crumbs }) {
    return `${pageHead({
      crumbs,
      kicker: 'Legal',
      title,
      sub,
      meta: updated ? `<div class="pub-blog-meta"><span>Last updated</span><span>·</span><span>${esc(updated)}</span></div>` : ''
    })}
    <section class="pub-section">
      <div class="pub-shell pub-legal">
        <div class="pub-legal-body">${bodyHtml}</div>
        <aside class="pub-aside-card">
          <h3>Document</h3>
          <ul class="pub-aside-list">
            <li><b>Published by</b>${esc(b.powered_by || 'Dexter Studio')}, operator of this EMS deployment</li>
            ${updated ? `<li><b>Last updated</b>${esc(updated)}</li>` : ''}
            <li><b>Applies to</b>The website, the administrator panel and shop panels of this deployment</li>
          </ul>
          <div class="pub-aside-meta">
            <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/contact">Ask a question</a>
            <a class="pub-btn pub-btn--ghost pub-btn--sm" href="/privacy">Privacy Policy</a>
          </div>
        </aside>
      </div>
    </section>
    ${ctaHtml()}`;
  }

  function termsPage(b, data) {
    const title = (data && data.title) || 'Terms of Service';
    const updated = data ? dateLong(data.updated_at) : '';
    const bodyHtml = data && String(data.body || '').trim() ? paras(data.body) : termsFallback();
    return legalLayout(b, {
      title,
      sub: 'The rules that govern an EMS account: what a license covers, how stores operate and what each role may do.',
      updated,
      bodyHtml,
      crumbs: [['/', 'Home'], ['/terms', 'Terms']]
    });
  }

  /* --- Privacy (built-in page — no CMS slug required) ------------------ */
  function privacyPage(b) {
    const bodyHtml = `<p>This policy describes how the EMS software handles information. It is written from the behaviour of the application itself, and this deployment's platform owner can replace it with their own legal text.</p>
    <h2>1 · Information the application stores</h2>
    <ul>
      <li><b>Account details</b> — name, email address, phone, business profile and, for staff, the store and staff identifiers created by an administrator.</li>
      <li><b>Business records</b> — stores, items, purchases, sales, invoices, customers, suppliers, dues, expenses, salaries, attendance and staff permissions that your business enters.</li>
      <li><b>Contact form submissions</b> — the name, email, phone, subject and message you send through this website's contact form.</li>
      <li><b>Operational logs</b> — activity, device sign-in and error records kept so an action can be traced to the account that performed it.</li>
    </ul>
    <h2>2 · What the website does not do</h2>
    <p>The public website sends no advertising or analytics trackers. It stores only what is needed to keep you signed in: the session for a signed-in user is kept in your browser's local storage and is removed when you sign out or the session expires. Passwords are stored as one-way hashes, not as readable text.</p>
    <h2>3 · Where data is held</h2>
    <p>Data is stored in the database and file storage configured by the platform owner operating this EMS deployment. Data is accessed by the browser only through the application's own API; the database credentials are never sent to the browser.</p>
    <h2>4 · Optional services</h2>
    <p>Some services are off unless a license or add-on enables them, and each one changes what leaves the system:</p>
    <ul>
      <li><b>ConnectX</b> sends messages to the recipients you choose, through the sending configuration enabled for your shop.</li>
      <li><b>Zudo AI</b> and <b>Business Health</b> send the business data needed to answer a request to the AI provider configured by the platform owner.</li>
      <li><b>Vaultium</b> stores the documents you upload in private file storage; they are not published on the public site.</li>
      <li><b>TrueBill</b> publishes a verification page for an invoice token. It shows the record details needed to confirm the document — not your customer's full account data.</li>
    </ul>
    <h2>5 · Your choices</h2>
    <p>Business records are managed by the administrator account that created them: an administrator can correct, export or delete records through the panels. Deleting a store or account removes its data from the active system, subject to the backups and retention the platform owner keeps for support, security and legal reasons.</p>
    <h2>6 · Questions</h2>
    <p>For a question about this policy, or about the data held for your business, use the <a href="/contact">contact form</a>. Signed-in administrators and staff can also reach the platform owner through HelpDesk inside the panels.</p>`;
    return legalLayout(b, {
      title: 'Privacy Policy',
      sub: 'What the EMS application stores, what it never sends anywhere, and how optional services change that.',
      updated: '',
      bodyHtml,
      crumbs: [['/', 'Home'], ['/privacy', 'Privacy']]
    });
  }

  /* --- Blog ---------------------------------------------------------- */
  function coverHtml(url, emptyModifier) {
    const style = url ? ` style="background-image:url('${esc(url)}')"` : '';
    return `<div class="pub-blog-cover${url ? '' : ' pub-blog-cover--empty'}${emptyModifier ? ' ' + emptyModifier : ''}"${style}></div>`;
  }

  function blogPage(b, posts) {
    const list = Array.isArray(posts) ? posts : [];
    const featured = list[0];
    const rest = list.slice(1);
    const body = !list.length
      ? `<div class="pub-empty">
          <span class="pub-empty-ic">${icon('rss')}</span>
          <h2>No articles published yet</h2>
          <p>Product updates and retail operations notes appear here once ${esc(b.product_name || 'EMS')} publishes them.</p>
          <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/#operations">Explore the platform</a>
        </div>`
      : `${featured ? `<article class="pub-blog-featured">
          ${coverHtml(featured.cover_image_url)}
          <div class="pub-blog-featured-body">
            <div class="pub-blog-meta"><span>Latest</span><span>·</span><span>${esc(dateLong(featured.published_at))}</span></div>
            <h2><a href="/blog/${encodeURIComponent(featured.id)}">${esc(featured.title)}</a></h2>
            <p>${esc(featured.excerpt || 'Read the full article.')}</p>
            <a class="pub-link" href="/blog/${encodeURIComponent(featured.id)}">Read article${GLYPH.arrow}</a>
          </div>
        </article>` : ''}
        ${rest.length ? `<div class="pub-blog-grid">
          ${rest.map(post => `<article class="pub-post-card">
            ${coverHtml(post.cover_image_url)}
            <div class="pub-post-body">
              <div class="pub-blog-meta"><span>${esc(dateLong(post.published_at))}</span></div>
              <h3><a href="/blog/${encodeURIComponent(post.id)}">${esc(post.title)}</a></h3>
              <p>${esc(post.excerpt || 'Read the full article.')}</p>
              <a class="pub-link" href="/blog/${encodeURIComponent(post.id)}">Read article${GLYPH.arrow}</a>
            </div>
          </article>`).join('')}
        </div>` : ''}`;
    return `${pageHead({
      crumbs: [['/', 'Home'], ['/blog', 'Blog']],
      kicker: 'Insights',
      title: `${b.product_name || 'EMS'} Insights`,
      sub: 'Notes on running retail operations with better records — product changes, workflow advice and how shops use EMS day to day.'
    })}
    <section class="pub-section">
      <div class="pub-shell">${body}</div>
    </section>`;
  }

  function blogPostPage(b, post) {
    return `${pageHead({
      crumbs: [['/', 'Home'], ['/blog', 'Blog']],
      kicker: 'Article',
      title: post.title || 'Article',
      meta: `<div class="pub-blog-meta"><span>${esc(dateLong(post.published_at))}</span>${post.author ? `<span>·</span><span>${esc(post.author)}</span>` : ''}</div>`
    })}
    <section class="pub-section">
      <div class="pub-shell">
        <article class="pub-article">
          ${post.cover_image_url ? `<div class="pub-article-cover" style="background-image:url('${esc(post.cover_image_url)}')"></div>` : ''}
          ${post.excerpt ? `<p class="pub-article-excerpt">${esc(post.excerpt)}</p>` : ''}
          <div class="pub-article-body pub-prose" style="margin-top:22px">${paras(post.body)}</div>
          <div class="pub-article-foot">
            <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/blog">All articles</a>
            <a class="pub-link" href="/contact">Ask about EMS${GLYPH.arrow}</a>
          </div>
        </article>
      </div>
    </section>`;
  }

  /* --- Contact ------------------------------------------------------- */
  function contactPage(b, data) {
    const title = (data && data.title) || 'Contact us';
    const bodyHtml = data && String(data.body || '').trim()
      ? paras(data.body)
      : `<p>Send a message and the team operating this EMS deployment will reply. Include your business name if you already have an account, so the answer can be specific.</p>`;
    return `${pageHead({
      crumbs: [['/', 'Home'], ['/contact', 'Contact']],
      kicker: 'Contact',
      title,
      sub: 'Questions about licensing, multi-store setup or a plan that fits your business — send them here.'
    })}
    <section class="pub-section">
      <div class="pub-shell pub-contact">
        <div class="pub-contact-copy">
          <div class="pub-prose" style="max-width:52ch">${bodyHtml}</div>
          <div class="pub-contact-list">
            <div class="pub-contact-item">${icon('store')}<div><b>Business enquiries</b><span>Licensing, store setup, add-ons and migration questions.</span></div></div>
            <div class="pub-contact-item">${icon('user-check')}<div><b>Existing customers</b><span>Signed-in administrators and staff can reach the platform owner through HelpDesk inside the panels.</span></div></div>
            <div class="pub-contact-item">${icon('clock')}<div><b>Response time</b><span>Messages are answered by the operator of this deployment; timeframes depend on their support hours.</span></div></div>
          </div>
        </div>
        <form class="pub-form" id="pubContactForm" novalidate>
          <div class="pub-form-head">
            <h2>Send us a message</h2>
            <p>Fields marked with an asterisk are required.</p>
          </div>
          <div class="pub-form-grid">
            <label class="pub-field"><span>Name <em>*</em></span><input name="name" autocomplete="name" required></label>
            <label class="pub-field"><span>Email <em>*</em></span><input name="email" type="email" autocomplete="email" required></label>
          </div>
          <div class="pub-form-grid">
            <label class="pub-field"><span>Phone</span><input name="phone" type="tel" autocomplete="tel"></label>
            <label class="pub-field"><span>Subject</span><input name="subject"></label>
          </div>
          <label class="pub-field"><span>Message <em>*</em></span><textarea name="message" rows="6" required placeholder="Tell us about your business and what you need."></textarea></label>
          <div class="pub-form-foot">
            <p class="pub-form-note">Your message is stored by this EMS deployment and used only to answer your enquiry.</p>
            <button type="submit" class="pub-btn" id="pubContactSubmit">Send message</button>
          </div>
        </form>
      </div>
    </section>`;
  }

  function wireContact() {
    const form = document.getElementById('pubContactForm');
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('#pubContactSubmit');
      const payload = Object.fromEntries(new FormData(form));
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(payload.email || '').trim());
      if (!payload.name || !payload.message) { toast('Enter your name and a message.'); return; }
      if (!emailOk) { toast('Enter a valid email address.'); return; }
      button.disabled = true;
      const label = button.textContent;
      button.textContent = 'Sending…';
      try {
        await api('public/contact', { method: 'POST', body: JSON.stringify(payload) });
        form.reset();
        toast('Your message was submitted successfully.');
      } catch (error) {
        toast(error.message || 'Your message could not be sent. Please try again.');
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });
  }

  /* --- App Store ----------------------------------------------------- */
  function appStorePage(b) {
    return `${pageHead({
      crumbs: [['/', 'Home'], ['/app-store', 'App Store']],
      kicker: 'App Store',
      title: `${b.product_name || 'EMS'} apps`,
      sub: 'Official applications published for this EMS deployment. Download an available APK, or open an installable web app from a verified release. No account is needed to browse.'
    })}
    <section class="pub-section pub-section--tight">
      <div class="pub-shell">
        <div class="pub-store-shell" id="pubStoreMount"><div class="pub-skel"><div class="pub-skel-line w40"></div><div class="pub-skel-line w70"></div><div class="pub-skel-line"></div></div></div>
      </div>
    </section>`;
  }

  /* =====================================================================
     TRUEBILL VERIFICATION
     ===================================================================== */
  function verifyState({ tone = 'ok', title, text, tag }) {
    const mark = tone === 'loading'
      ? `<svg class="pub-verify-spinner" viewBox="0 0 52 52" aria-hidden="true"><circle class="track" cx="26" cy="26" r="24"/><circle class="spin" cx="26" cy="26" r="24"/></svg>`
      : tone === 'error'
        ? `<svg class="pub-verify-mark" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M18 18l16 16M34 18L18 34"/></svg>`
        : `<svg class="pub-verify-mark" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7.5 7.5L37 19"/></svg>`;
    return `<div class="pub-verify-state ${tone === 'ok' ? 'is-ok' : tone === 'error' ? 'is-error' : ''}">
      ${mark}
      ${tag ? `<span class="pub-tag ${tone === 'ok' ? 'pub-tag--accent' : ''}">${esc(tag)}</span>` : ''}
      <h1>${esc(title)}</h1>
      <p>${text}</p>
    </div>`;
  }

  function verifyShopHead(shop, typeLabel, recordNo, badges) {
    return `<div class="pub-verify-head">
      <div class="pub-verify-shop">
        <h2>${esc(shop.name || 'EMS store')}</h2>
        ${shop.address ? `<p>${esc(shop.address)}</p>` : ''}
        ${shop.phone ? `<p>${esc(shop.phone)}${shop.phone2 ? ' · ' + esc(shop.phone2) : ''}</p>` : ''}
        ${shop.email ? `<p>${esc(shop.email)}</p>` : ''}
        ${shop.website ? `<p>${esc(shop.website)}</p>` : ''}
      </div>
      <div class="pub-verify-title">
        <span class="pub-mono">OFFICIAL EMS RECORD</span>
        <h2>${esc(typeLabel)}</h2>
        <span># ${esc(recordNo || '—')}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${badges}</div>
      </div>
    </div>`;
  }

  function verifyCols(pairs) {
    return `<div class="pub-verify-cols">
      ${pairs.map(([title, rows]) => `<div class="pub-verify-col">
        <h3>${esc(title)}</h3>
        ${rows.map(([label, value]) => `<p><b>${esc(label)}:</b> ${esc(value ?? '—')}</p>`).join('')}
      </div>`).join('')}
    </div>`;
  }

  function verifyTable(headers, rows) {
    return `<div class="pub-verify-table-wrap"><table class="pub-verify-table">
      <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function verifyTotals(rows, totalLabel) {
    return `<div class="pub-verify-totals">
      ${rows.map(([label, value, isTotal]) => `<p class="${isTotal ? 'is-total' : ''}"><span>${esc(label)}</span><b>${value}</b></p>`).join('')}
    </div>`;
  }

  function verifyFooter() {
    return `<div class="pub-verify-foot">
      <span>Verified by <span data-brand-name>EMS</span> · <span data-powered-by>Dexter Studio</span></span>
      <span>TrueBill · authenticity check</span>
    </div>`;
  }

  function returnDoc(d) {
    const ret = d.return || d.invoice || {};
    const p = d.party || {};
    const shop = ret.stores || {};
    const original = ret.invoices || d.invoice || {};
    const items = Array.isArray(ret.return_items) ? ret.return_items : [];
    const badges = '<span class="pub-tag pub-tag--accent">Verified</span><span class="pub-tag pub-tag--outline">Refunded</span>';
    return `<div class="pub-verify-card">
      ${verifyState({ title: 'Return slip verified', text: 'This is an authentic EMS return &amp; refund record, confirmed against the record held by the platform.', tag: 'Return slip' })}
      <div class="pub-verify-doc">
        ${verifyShopHead(shop, 'Return slip', ret.return_number, badges)}
        ${verifyCols([
          ['Customer', [['ID', p.customer_code || 'Custom customer'], ['Name', p.name || ret.customer_name || '—'], ['Phone', p.phone || '—'], ['Address', p.address || '—']]],
          ['Return details', [['Date', ret.return_date || '—'], ['Original invoice', original.invoice_number || '—'], ['Refund method', ret.refund_method || ret.payment_method || 'Cash'], ['Reason', (ret.return_items && ret.return_items[0] && ret.return_items[0].reason) || ret.reason || 'Customer return']]]
        ])}
        ${verifyTable(['Item', 'Condition', 'Qty', 'Unit price', 'Total'], items.map(item => [
          `<b>${esc((item.inventory_items && item.inventory_items.description) || 'Item')}</b><br><small>${esc((item.inventory_items && item.inventory_items.item_code) || '')}</small>`,
          esc(item.condition || 'sellable'),
          `${esc(item.quantity)} ${esc((item.inventory_items && item.inventory_items.unit) || '')}`,
          money2(item.unit_price),
          money2(item.return_amount || item.total_amount || item.line_total)
        ]))}
        ${verifyTotals([
          ['Subtotal', money2(ret.subtotal || ret.total_return_amount)],
          ...(Number(ret.penalty_amount || 0) ? [['Penalty / deduction', '−' + money2(ret.penalty_amount)]] : []),
          ['Refunded amount', money2(ret.refunded_amount || ret.total_return_amount), true]
        ])}
        ${verifyFooter()}
      </div>
    </div>`;
  }

  function exchangeDoc(d) {
    const exc = d.exchange || d.invoice || {};
    const p = d.party || {};
    const shop = exc.stores || {};
    const original = exc.invoices || d.invoice || {};
    const actionLabel = exc.action_type === 'customer_pays' ? 'Additional payment paid' : exc.action_type === 'shop_refunds' ? 'Store refunded' : 'Even exchange';
    const all = Array.isArray(exc.exchange_items) ? exc.exchange_items : [];
    const returned = all.filter(item => item.item_type === 'returned');
    const added = all.filter(item => item.item_type === 'new');
    return `<div class="pub-verify-card">
      ${verifyState({ title: 'Exchange invoice verified', text: 'This is an authentic EMS exchange record, confirmed against the record held by the platform.', tag: 'Exchange invoice' })}
      <div class="pub-verify-doc">
        ${verifyShopHead(shop, 'Exchange invoice', exc.exchange_number, '<span class="pub-tag pub-tag--accent">Verified</span><span class="pub-tag pub-tag--outline">' + esc(actionLabel) + '</span>')}
        ${verifyCols([
          ['Customer', [['ID', p.customer_code || 'Custom customer'], ['Name', p.name || exc.customer_name || '—'], ['Phone', p.phone || '—'], ['Address', p.address || '—']]],
          ['Exchange details', [['Date', exc.exchange_date || '—'], ['Original invoice', original.invoice_number || '—'], ['Settlement', exc.payment_method || 'Cash'], ['Action', actionLabel]]]
        ])}
        ${returned.length ? `<div><h3 class="pub-kicker" style="margin-bottom:8px">Returned items</h3>${verifyTable(['Item', 'Condition', 'Qty', 'Unit price', 'Total'], returned.map(item => [
          `<b>${esc((item.inventory_items && item.inventory_items.description) || 'Item')}</b><br><small>${esc((item.inventory_items && item.inventory_items.item_code) || '')}</small>`,
          esc(item.condition || 'sellable'),
          esc(item.quantity),
          money2(item.unit_price),
          money2(item.total_amount)
        ]))}</div>` : ''}
        ${added.length ? `<div><h3 class="pub-kicker" style="margin-bottom:8px">Replacement items</h3>${verifyTable(['Item', 'Qty', 'Unit price', 'Total'], added.map(item => [
          `<b>${esc((item.inventory_items && item.inventory_items.description) || 'Item')}</b><br><small>${esc((item.inventory_items && item.inventory_items.item_code) || '')}</small>`,
          esc(item.quantity),
          money2(item.unit_price),
          money2(item.total_amount)
        ]))}</div>` : ''}
        ${verifyTotals([
          ['Returned items total', money2(exc.returned_total)],
          ['Replacement total', money2(exc.new_items_total)],
          [`Difference · ${actionLabel}`, money2(exc.difference_amount), true]
        ])}
        ${verifyFooter()}
      </div>
    </div>`;
  }

  function invoiceDoc(d) {
    const inv = d.invoice || {};
    const p = d.party || {};
    const shop = inv.stores || {};
    const lines = Array.isArray(inv.invoice_lines) ? inv.invoice_lines : [];
    const isPurchase = inv.kind === 'purchase';
    const paid = Number(inv.total_due) <= 0;
    const typeLabel = isPurchase ? 'Purchase invoice' : 'Sales invoice';
    const partyId = p.customer_code || p.supplier_code || inv.custom_party_code || (inv.custom_party_name ? 'Custom party' : 'Not registered');
    const partyName = p.name || inv.custom_party_name || '—';
    const partyPhone = p.phone || inv.custom_party_phone || '—';
    const partyAddress = p.address || inv.custom_party_address || '—';
    const totals = [
      ['Subtotal', money2(inv.subtotal)]
    ];
    if (Number(inv.line_tax_amount || 0)) totals.push(['Item VAT', '+' + money2(inv.line_tax_amount)]);
    totals.push(['Tax', money2(inv.tax_amount)]);
    totals.push(['Discount', '−' + money2(inv.discount)]);
    if (Number(inv.line_discount_amount || 0)) totals.push(['Item discount', '−' + money2(inv.line_discount_amount)]);
    totals.push(['Paid', money2(inv.paid_amount)]);
    totals.push(['Total due', money2(inv.total_due), true]);
    return `<div class="pub-verify-card">
      ${verifyState({ title: 'Invoice verified', text: 'This is an authentic EMS invoice record, confirmed against the record held by the platform.', tag: typeLabel })}
      <div class="pub-verify-doc">
        ${verifyShopHead(shop, typeLabel, inv.invoice_number, `<span class="pub-tag pub-tag--accent">Verified</span><span class="pub-tag pub-tag--outline">${paid ? 'Paid' : 'Payment due'}</span>`)}
        ${verifyCols([
          [isPurchase ? 'Supplier' : 'Billed to', [['ID', partyId], ['Name', partyName], ['Address', partyAddress], ['Phone', partyPhone]]],
          ['Invoice details', [['Date', inv.invoice_date || '—'], ['Payment', inv.payment_method || '—'], ['Transaction', inv.transaction_id || '—'], ['Record', inv.kind === 'sale' ? 'Sale' : 'Purchase']]]
        ])}
        ${lines.length ? verifyTable(['Item', 'Qty', 'Unit', 'Unit price', 'VAT', 'Disc.', 'Total'], lines.map(line => {
          const item = line.inventory_items || {};
          return [
            `<b>${esc(item.description || 'Item')}</b><br><small>${esc(item.item_code || '')}</small>`,
            esc(line.quantity),
            esc(item.unit || ''),
            money2(line.unit_price),
            Number(line.tax_percent || 0) ? esc(line.tax_percent) + '%' : '—',
            Number(line.discount || 0) ? '−' + money2(line.discount) : '—',
            money2(line.line_total)
          ];
        })) : ''}
        ${verifyTotals(totals)}
        ${verifyFooter()}
      </div>
    </div>`;
  }

  async function renderVerification(token) {
    bindShell();
    let b = { ...DEFAULT_BRAND };
    try { b = await brand(); } catch { b = { ...DEFAULT_BRAND }; }
    applyBranding(b);
    document.title = `Record verification · ${b.website_name || 'EMS'}`;
    const loading = `<section class="pub-verify"><div class="pub-verify-card">${verifyState({ tone: 'loading', title: 'Checking the record', text: 'Confirming this document against the official EMS record…', tag: 'Verifying' })}</div></section>`;
    app.innerHTML = shellHtml(b, 'verify', loading);
    try {
      const data = await api('public/invoice/' + encodeURIComponent(token));
      const kind = data.type || data.record_type || (data.return ? 'return' : data.exchange ? 'exchange' : 'invoice');
      const doc = kind === 'return' || data.return ? returnDoc(data) : kind === 'exchange' || data.exchange ? exchangeDoc(data) : invoiceDoc(data);
      app.innerHTML = shellHtml(b, 'verify', `<section class="pub-verify"><div class="pub-shell">${doc}</div></section>`);
    } catch (error) {
      const failure = `<section class="pub-verify"><div class="pub-shell"><div class="pub-verify-card">
        ${verifyState({ tone: 'error', title: 'Record not verified', text: esc(error.message || 'This document could not be matched to a record held by EMS.') + ' If you scanned a printed document, check the QR code is complete and try again.', tag: 'Verification failed' })}
        <div class="pub-verify-doc">
          <p class="pub-small">TrueBill verifies invoices, return slips and exchange invoices. A record that cannot be verified may be mistyped, withdrawn, or issued by a system other than EMS.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/">Back to ${esc(b.product_name || 'EMS')}</a>
            <a class="pub-btn pub-btn--ghost pub-btn--sm" href="/contact">Contact the team</a>
          </div>
        </div>
      </div></div></section>`;
      app.innerHTML = shellHtml(b, 'verify', failure);
    }
  }

  /* =====================================================================
     GENERIC PUBLIC PAGE ROUTER
     ===================================================================== */
  async function renderPage(page, options) {
    bindShell();
    const slug = String(page || '').toLowerCase();
    if (slug === 'verify') { toast('A verification link is required to check a record.'); }
    app.innerHTML = `<div class="pubsite"><div class="pub-shell" style="padding-block:80px"><div class="pub-skel"><div class="pub-skel-line w40"></div><div class="pub-skel-line w70"></div><div class="pub-skel-line"></div></div></div></div>`;
    let b = { ...DEFAULT_BRAND };
    try { b = await brand(); } catch { b = { ...DEFAULT_BRAND }; }
    applyBranding(b);

    try {
      if (slug === 'app-store') {
        document.title = `App Store · ${b.website_name || 'EMS'}`;
        app.innerHTML = shellHtml(b, 'app-store', appStorePage(b));
        const mount = document.getElementById('pubStoreMount');
        const apps = await api('app-store/apps').catch(() => []);
        if (mount && document.body.contains(mount)) mountAppStore(mount, apps, { brand: b.powered_by || 'Dexter Studio', qr: getQrSvg });
        return;
      }
      if (slug === 'blog') {
        const posts = await api('public/blogs').catch(() => []);
        document.title = `Blog · ${b.website_name || 'EMS'}`;
        app.innerHTML = shellHtml(b, 'blog', blogPage(b, posts));
        return;
      }
      if (slug === 'blog-post') {
        const id = (options && options.id) || new URLSearchParams(location.search).get('id');
        let post;
        try { post = await api('public/blogs?id=' + encodeURIComponent(id || '')); }
        catch (error) {
          app.innerHTML = shellHtml(b, 'blog', `${pageHead({ crumbs: [['/', 'Home'], ['/blog', 'Blog']], kicker: 'Article', title: 'Article not found' })}
            <section class="pub-section"><div class="pub-shell"><div class="pub-empty">
              <span class="pub-empty-ic">${icon('file')}</span>
              <h2>This article is not available</h2>
              <p>${esc(error.message || 'The article may have been unpublished or the link may be incomplete.')}</p>
              <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/blog">Back to all articles</a>
            </div></div></section>`);
          return;
        }
        document.title = `${post.title} · ${b.website_name || 'EMS'}`;
        app.innerHTML = shellHtml(b, 'blog', blogPostPage(b, post));
        return;
      }
      if (slug === 'contact') {
        document.title = `Contact · ${b.website_name || 'EMS'}`;
        app.innerHTML = shellHtml(b, 'contact', contactPage(b, await cmsPage('contact')));
        wireContact();
        return;
      }
      if (slug === 'privacy') {
        document.title = `Privacy Policy · ${b.website_name || 'EMS'}`;
        app.innerHTML = shellHtml(b, 'privacy', privacyPage(b));
        return;
      }
      if (slug === 'terms') {
        const data = await cmsPage('terms');
        document.title = `${(data && data.title) || 'Terms of Service'} · ${b.website_name || 'EMS'}`;
        app.innerHTML = shellHtml(b, 'terms', termsPage(b, data));
        return;
      }
      if (slug === 'about' || slug === '') {
        const data = await cmsPage('about');
        document.title = `${(data && data.title) || 'About'} · ${b.website_name || 'EMS'}`;
        app.innerHTML = shellHtml(b, 'about', aboutPage(b, data));
        return;
      }
      /* Unknown slug: try the CMS, otherwise explain that the page is not published. */
      const data = await cmsPage(slug);
      if (data) {
        document.title = `${data.title} · ${b.website_name || 'EMS'}`;
        app.innerHTML = shellHtml(b, '', `${pageHead({ crumbs: [['/', 'Home'], ['/' + encodeURIComponent(slug), data.title]], kicker: 'Page', title: data.title })}
          <section class="pub-section"><div class="pub-shell pub-legal"><div class="pub-legal-body">${paras(data.body) || '<p class="pub-muted">This page has no content yet.</p>'}</div></div></section>${ctaHtml()}`);
        return;
      }
      app.innerHTML = shellHtml(b, '', `${pageHead({ crumbs: [['/', 'Home'], ['/' + encodeURIComponent(slug), 'Not found']], kicker: 'Not found', title: 'This page is not published' })}
        <section class="pub-section"><div class="pub-shell"><div class="pub-empty">
          <span class="pub-empty-ic">${icon('file')}</span>
          <h2>Nothing lives at this address</h2>
          <p>The page you asked for is not published on this EMS deployment. The main pages below are all available.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
            <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/">Home</a>
            <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/about">About</a>
            <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/blog">Blog</a>
            <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/contact">Contact</a>
          </div>
        </div></div></section>`);
    } catch (error) {
      app.innerHTML = shellHtml(b, '', `${pageHead({ crumbs: [['/', 'Home'], ['/' + encodeURIComponent(slug), 'Unavailable']], kicker: 'Error', title: 'This page could not be loaded' })}
        <section class="pub-section"><div class="pub-shell"><div class="pub-empty">
          <span class="pub-empty-ic">${icon('alert-triangle')}</span>
          <h2>The page is temporarily unavailable</h2>
          <p>${esc(error.message || 'The API did not respond.')}</p>
          <a class="pub-btn pub-btn--secondary pub-btn--sm" href="/">Back to the home page</a>
        </div></div></section>`);
    }
  }

  return { renderLanding, renderPage, renderVerification };
}
