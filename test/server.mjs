/**
 * Local stand-in for Cloudflare Pages.
 *
 * `wrangler pages dev` refuses to boot offline in this project (the `[ai]`
 * binding requires a remote session), so this tiny server reproduces the parts
 * of the Pages behaviour the front end depends on:
 *
 *   1. static files are served from the repo root
 *   2. `_redirects` rules with status 200 are *rewrites* (URL stays, body
 *      becomes the target file) — this is what makes /ownerconsole/... reach
 *      the app shell
 *   3. an unknown path with no rule answers 404, exactly like Pages
 *
 * It exists so the SPA routing can be exercised over real HTTP (the bug in
 * issue #2 only shows up when the browser resolves a *relative* asset URL from
 * a nested route, which jsdom cannot reproduce).
 *
 *   node test/server.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/** Parse `_redirects`: `from  to  [status]` (status 200 == rewrite). */
async function loadRules() {
  const raw = await readFile(join(ROOT, '_redirects'), 'utf8');
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const parts = line.split(/\s+/);
      return { from: parts[0], to: parts[1], status: Number(parts[2] || 302) };
    });
}

function matches(rule, pathname) {
  if (rule.from.endsWith('/*')) {
    const prefix = rule.from.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + '/');
  }
  return pathname === rule.from || pathname === rule.from + '/';
}

/** Substitute `:splat` with whatever the `/*` matched. */
function applySplat(to, from, pathname) {
  if (!to.includes(':splat')) return to;
  const prefix = from.slice(0, -2);
  return to.replace(':splat', pathname.slice(prefix.length).replace(/^\//, ''));
}

async function serveFile(res, filePath, extraHeaders) {
  try {
    const bytes = await readFile(filePath);
    res.writeHead(200, {
      'content-type': TYPES[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
      ...extraHeaders
    });
    res.end(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimal read-only API fixtures so the marketing pages render their populated
 * state (pricing table, blog list, CMS pages) instead of their offline
 * fallbacks. Only `public/*` paths answer; everything else stays a 503 so the
 * console shell still exercises its error handling.
 */
function mockApi(path) {
  const pathname = path.split('?')[0];
  const ok = body => ({ status: 200, body });

  /* TrueBill verification of a token that does not exist. */
  if (pathname.startsWith('public/invoice/')) {
    return { status: 404, body: { error: 'No record matches this verification token.' } };
  }
  if (pathname === 'public/branding') {
    return ok({ product_name: 'EMS', powered_by: 'Dexter Studio', website_name: 'EMS' });
  }
  if (pathname === 'public/license-plans') {
    return ok([
      { id: 'starter', title: 'Starter', price: 0, duration_months: 1, max_stores: 1, connectx_enabled: false, zudo_enabled: false, business_health_enabled: false, truebill_enabled: false, vaultium_gb: 0 },
      { id: 'growth', title: 'Growth — 6 months', price: 4500, duration_months: 6, max_stores: 3, connectx_enabled: true, zudo_enabled: true, business_health_enabled: false, truebill_enabled: true, vaultium_gb: 2 },
      { id: 'scale', title: 'Scale — 12 months', price: 9000, duration_months: 12, max_stores: 8, connectx_enabled: true, zudo_enabled: true, business_health_enabled: true, truebill_enabled: true, vaultium_gb: 10 }
    ]);
  }
  if (pathname === 'public/blogs') {
    return ok([
      { id: '1', title: 'Closing the month without guessing', excerpt: 'A short routine for a clean close.', body: 'Body one.', published_at: '2026-10-02T00:00:00Z' },
      { id: '2', title: 'Why dues kill small retail', excerpt: 'Credit sales need a rule.', body: 'Body two.', published_at: '2026-09-18T00:00:00Z' }
    ]);
  }
  if (pathname === 'app-store/apps') {
    // Mirrors functions/_lib/app_store.js: the scanner PWA is always published.
    return ok([{
      id: 'ems-mobile-scanner-pwa', package_name: 'com.ems.mobile_scanner',
      title: 'EMS Mobile Scanner', description: 'Installable Pharmacy and Electronics billing companion.',
      version: '1.0.0', version_code: 1, icon_url: '/assets/android-chrome-192.png',
      kind: 'pwa', featured: true, category: 'Business tools', developer: 'Dexter Studio',
      web_url: '/scanner/', screenshot_urls: [], created_at: null,
      install_url: '/scanner/', download_available: true,
      release_notes: 'Pharmacy and Electronics sale/purchase scanning; Android and iPhone installation.'
    }]);
  }
  /* Session bootstrap for the three consoles (a refresh re-runs these). */
  if (pathname === 'me') {
    // Full permissions: a deep link is expected to survive a refresh, and the
    // console correctly refuses pages the staff member cannot access.
    const allow = ['view', 'add', 'edit', 'delete'];
    const sections = ['dashboard', 'supplier', 'customer', 'inventory', 'purchase', 'sales', 'expense', 'due_recover', 'returns_refunds', 'staff', 'report', 'settings', 'audit-log', 'connectx', 'zudo', 'vaultium', 'attendance', 'salary'];
    const permissions = Object.fromEntries(sections.map(s => [s, allow]));
    return ok({ id: 's1', name: 'Counter Staff', role: 'staff', permissions, store: { id: 'st1', shop_id: 1001, name: 'Main Branch', shop_type: 'electronics' }, readOnly: false, licenseExpired: false });
  }
  if (pathname === 'admin/entitlement') {
    return ok({ hasActivatedLicense: true, active: true });
  }
  if (pathname === 'public/page') {
    const slug = new URLSearchParams(path.split('?')[1] || '').get('slug');
    const titles = { about: 'About EMS', terms: 'Terms of Service', privacy: 'Privacy Policy', contact: 'Contact us' };
    if (titles[slug]) return ok({ slug, title: titles[slug], body: `Content for ${slug}.` });
    return undefined;
  }
  return undefined;
}

const rules = await loadRules();
const port = Number(process.argv[2] || 8788);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    const result = mockApi(pathname.slice(5) + (url.search || ''));
    const status = result === undefined ? 503 : result.status || 200;
    const body = result === undefined ? { error: 'No mock for this API path' } : result.body;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }

  // 1. exact static file
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  if (await serveFile(res, join(ROOT, safe))) return;
  if (await serveFile(res, join(ROOT, safe, 'index.html'))) return;

  // 2. _redirects — top to bottom, first match wins (Pages semantics)
  const bare = pathname.replace(/\/+$/, '') || '/';
  for (const rule of rules) {
    if (!matches(rule, bare)) continue;
    if (rule.status === 404) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    if (rule.status !== 200) continue; // 301/302 are navigations; not used here
    const to = applySplat(rule.to, rule.from, bare);
    const target = to.endsWith('/') ? join(ROOT, to, 'index.html') : join(ROOT, to);
    if (await serveFile(res, target)) return;
  }

  // 3. nothing matched -> Pages answers 404
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}).listen(port, '0.0.0.0', () => {
  console.log(`static harness on http://0.0.0.0:${port} (root: ${ROOT})`);
});
