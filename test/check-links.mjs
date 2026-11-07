/**
 * Cross-checks every local URL the project references against the files that
 * actually exist in the repo.
 *
 * Bug family this catches (issue #2): a page that loads its CSS/JS with a
 * *relative* path works at `/` and breaks at `/shopconsole`. The check reports
 * relative references separately, because a relative reference is a latent 404
 * on every nested route even when the file exists.
 *
 *   node test/check-links.mjs      # exits 1 on problems
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const CODE_EXT = new Set(['.js', '.mjs', '.html', '.css', '.webmanifest', '.json']);

/** Directories that are not app surface (documentation, tests, build output). */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.wrangler', 'test', 'supabase', 'brand-concepts', '.arena']);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      await walk(join(dir, entry.name), out);
    } else if (CODE_EXT.has(extname(entry.name))) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const files = await walk(ROOT);

const exists = async (abs) => {
  try { await stat(abs); return true; } catch { return false; }
};

/* ── Collect references ──────────────────────────────────────────────────── */

/** Absolute site paths like "/assets/css/app.css" or "/api/foo". */
const ABSOLUTE = /["'`(]\s*(\/(?!\/)[A-Za-z0-9._~\-][A-Za-z0-9._~\-/]*\.[A-Za-z0-9]{1,8})\s*(?=["'`)?#])/g;
/** Relative asset references inside HTML attributes (the real bug). */
const HTML_RELATIVE = /<(?:script|link|img|source)[^>]*?(?:src|href)\s*=\s*"([^"]+)"/g;
/** ES module specifiers and dynamic imports. */
const MODULE_SPEC = /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g;

const absoluteRefs = new Map();   // path -> Set(origin file)
const moduleRefs = [];
const relativeAssetRefs = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const rel = relative(ROOT, file);

  for (const m of text.matchAll(ABSOLUTE)) {
    const p = m[1];
    // Ignore things that are clearly not files on disk.
    if (/^\/(api|verify|invoice|blog|owner|administrator|admin|shop|about|terms|privacy|contact|app-store)/.test(p) && !p.includes('.')) continue;
    // OOXML part names (/xl/workbook.xml, /[Content_Types].xml) live inside a
    // generated .xlsx zip — they are not URLs on this site.
    if (/^\/(xl|docProps|word|ppt|_rels)\//.test(p) || p.startsWith('/[')) continue;
    if (!absoluteRefs.has(p)) absoluteRefs.set(p, new Set());
    absoluteRefs.get(p).add(rel);
  }

  for (const m of text.matchAll(MODULE_SPEC)) {
    moduleRefs.push({ spec: m[1], file, rel });
  }

  if (extname(file) === '.html') {
    for (const m of text.matchAll(HTML_RELATIVE)) {
      const ref = m[1];
      if (/^(https?:|data:|mailto:|#|\/)/.test(ref)) continue;
      relativeAssetRefs.push({ ref, rel, resolved: join(dirname(file), ref) });
    }
  }
}

/* ── Verify ──────────────────────────────────────────────────────────────── */

const problems = [];
const ok = [];

for (const [p, origins] of absoluteRefs) {
  const abs = join(ROOT, p);
  if (await exists(abs)) ok.push(p);
  else problems.push({ kind: 'missing file', path: p, origins: [...origins] });
}

for (const { spec, file, rel } of moduleRefs) {
  const abs = resolve(dirname(file), spec);
  if (!(await exists(abs))) problems.push({ kind: 'missing module', path: spec, origins: [rel] });
}

for (const { ref, rel, resolved } of relativeAssetRefs) {
  const fileExists = await exists(resolved);
  problems.push({
    kind: 'relative asset path',
    path: ref,
    origins: [rel],
    detail: fileExists
      ? 'file exists but the URL breaks on nested routes — use a leading "/"'
      : 'target file does not exist'
  });
}

/* ── Report ──────────────────────────────────────────────────────────────── */

console.log(`Scanned ${files.length} files.`);
console.log(`  absolute refs checked : ${absoluteRefs.size} (${ok.length} resolve)`);
console.log(`  module imports        : ${moduleRefs.length}`);
console.log(`  relative asset refs   : ${relativeAssetRefs.length}`);

if (!problems.length) {
  console.log('\n✔ No broken references.');
  process.exit(0);
}

console.log(`\n✖ ${problems.length} problem(s):\n`);
for (const p of problems) {
  console.log(`  [${p.kind}] ${p.path}`);
  console.log(`      in: ${p.origins.join(', ')}`);
  if (p.detail) console.log(`      →  ${p.detail}`);
}
process.exit(1);
