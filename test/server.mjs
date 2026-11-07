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

const rules = await loadRules();
const port = Number(process.argv[2] || 8788);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'API not available in the static harness' }));
    return;
  }

  // 1. exact static file
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  if (await serveFile(res, join(ROOT, safe))) return;
  if (await serveFile(res, join(ROOT, safe, 'index.html'))) return;

  // 2. _redirects rewrite (status 200 keeps the URL, swaps the body)
  for (const rule of rules) {
    if (rule.status === 200 && matches(rule, pathname.replace(/\/+$/, '') || '/')) {
      const target = rule.to.endsWith('/') ? join(ROOT, rule.to, 'index.html') : join(ROOT, rule.to);
      if (await serveFile(res, target)) return;
    }
  }

  // 3. nothing matched -> Pages answers 404
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}).listen(port, '0.0.0.0', () => {
  console.log(`static harness on http://0.0.0.0:${port} (root: ${ROOT})`);
});
