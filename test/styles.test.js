/**
 * Guards the stylesheet + documentation layer.
 *
 * These are cheap structural checks that catch the two mistakes that are easy to
 * make when editing EMS CSS by hand: a broken brace (which silently swallows the
 * rest of the file) and a stylesheet loaded in the wrong order.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as csstree from 'css-tree';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const STYLESHEETS = [
  'assets/css/app.css',
  'assets/css/public.css',
  'assets/css/owner.css',
  'assets/css/admin.css',
  'assets/css/app_store_view.css',
  'assets/css/shop.css',
  'assets/css/cshop.css',
  'assets/css/pshop.css',
  'assets/css/sshop.css'
];

test('every stylesheet parses without syntax errors', () => {
  for (const file of STYLESHEETS) {
    const errors = [];
    csstree.parse(read(file), { onParseError: (e) => errors.push(e.message) });
    assert.deepEqual(errors, [], `${file} has CSS syntax errors`);
  }
});

test('index.html loads the stylesheets in cascade order', () => {
  const html = read('index.html');
  const hrefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1].replace(/^\.?\//, ''));
  assert.deepEqual(hrefs, STYLESHEETS, 'stylesheet order in index.html');
  // app.css holds the base tokens; the public site must come after it and before
  // the panel themes, which re-scope the same elements.
  assert.ok(hrefs.indexOf('assets/css/app.css') < hrefs.indexOf('assets/css/public.css'));
  assert.ok(hrefs.indexOf('assets/css/public.css') < hrefs.indexOf('assets/css/owner.css'));
});

test('each surface owns its own custom-property prefix', () => {
  const prefixes = {
    'assets/css/public.css': '--pub-',
    'assets/css/owner.css': '--ob-',
    'assets/css/admin.css': '--adm-',
    'assets/css/shop.css': '--shp-'
  };
  for (const [file, prefix] of Object.entries(prefixes)) {
    const css = read(file);
    assert.ok(css.includes(`${prefix}primary`) || css.includes(`${prefix}ink`) || css.includes(`${prefix}c1`), `${file} declares ${prefix}* tokens`);
  }
});

test('public site scopes its theme to .pubsite and defines the documented tokens', () => {
  const css = read('assets/css/public.css');
  for (const token of ['--pub-primary', '--pub-canvas', '--pub-surface', '--pub-ink', '--pub-line', '--pub-ring']) {
    assert.ok(css.includes(`${token}:`), `missing token ${token}`);
  }
  assert.match(css, /\.pubsite\s*\{[^}]*--pub-primary/);
});

test('the auth modal is styled independently of the active theme', () => {
  const css = read('assets/css/app.css');
  // Console themes put body.ob-on / .adm-on / .shp-on on the document, and the
  // public element rules stop applying at that point. Anything the sign-in modal
  // needs must therefore be declared under .authlayer as well.
  for (const selector of ['.authlayer input', '.authlayer label', '.authlayer button', '.authlayer .tabs button']) {
    assert.ok(css.includes(selector), `${selector} must be styled inside the layer`);
  }
  // and no auth-layer rule may sit behind the public-only :where() guard
  const guarded = [...css.matchAll(/:where\(body:not[^{]*\{[^}]*\}/g)].map(m => m[0]).join('\n');
  assert.doesNotMatch(guarded, /\.authlayer/, 'auth-layer rules must not be theme-gated');
});

test('_redirects covers every client-side route', () => {
  const redirects = read('_redirects');
  for (const path of ['/about', '/terms', '/privacy', '/blog', '/blog/*', '/contact', '/app-store', '/verify/*', '/invoice/*', '/owner', '/administrator', '/shop', '/ownerconsole', '/ownerconsole/*', '/administratorconsole', '/administratorconsole/*', '/shopconsole', '/shopconsole/*']) {
    assert.ok(new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+/\\s+200`, 'm').test(redirects), `_redirects is missing ${path}`);
  }
  assert.doesNotMatch(redirects, /^\/api/m, 'API routes are served by Pages Functions, not rewrites');
});

test('DESIGN_SYSTEM.md documents all twelve sections', () => {
  const doc = read('DESIGN_SYSTEM.md');
  for (let i = 1; i <= 12; i += 1) {
    assert.match(doc, new RegExp(`^## ${i}\\s*[·.]\\s`, 'm'), `DESIGN_SYSTEM.md is missing section ${i}`);
  }
  assert.match(doc, /agent-bento-grid\.md/);
  assert.match(doc, /body\.ob-on/);
  assert.match(doc, /body\.adm-on/);
  assert.match(doc, /body\.shp-on/);
});
