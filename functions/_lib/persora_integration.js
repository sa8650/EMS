/*
 * Persora Connections — EMS side of the server-to-server integration.
 *
 * Persora (a separate product) lets an EMS administrator connect their EMS
 * account inside Persora and browse their *Vaultium* files read-only.  There
 * are no browser redirects: Persora's backend calls these endpoints directly.
 *
 * Every request to /api/persora/* must pass THREE independent gates:
 *   1. The integration is enabled in the EMS Owner Console.
 *   2. The request is signed with the shared integration secret
 *      (HMAC-SHA256 over timestamp, nonce, method, path+query, body hash and
 *      grant hash; ±5 minute clock window).  The secret only proves the
 *      caller is Persora — it never authenticates an EMS administrator.
 *   3. For data routes, a per-administrator *grant* token obtained by
 *      POST /api/persora/authorize with the administrator's own EMS email and
 *      password.  Grants are stored hashed, bound to the administrator's
 *      current password hash, slide-expire after 180 days of inactivity, and
 *      are invalidated by password change, deactivation, explicit revoke or
 *      the owner's "revoke all".
 *
 * The data surface is strictly READ-ONLY: list shops, list Vaultium file
 * metadata, stream a file.  Every query is constrained by the grant's
 * admin_id, ids are validated as UUIDs before they reach the database, and
 * internal storage keys (r2_key) are never returned.  Access additionally
 * requires that the administrator purchased Vaultium at least once (an
 * approved license with vaultium_gb > 0, or an approved Vaultium add-on —
 * historical/expired purchases count; pending/rejected never do).
 */
import { db, countRows } from './db.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PERSORA_SETTING_KEY = 'persora_integration';
export const PERSORA_SIGNATURE_WINDOW_SECONDS = 300;
export const PERSORA_GRANT_TTL_DAYS = 180;
const GRANT_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 256;
const MAX_LIST = 200;
const SCAN_LIMIT = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const REF_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const GRANT_RE = /^pg1_[A-Za-z0-9_-]{40,64}$/;

const respond = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
});
const problem = (code, message, status) => respond({ error: message, code }, status);

/* ------------------------------------------------------------ crypto */
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function sha256Hex(value) {
  const data = typeof value === 'string' ? enc.encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}
/** Canonical string both products sign. Kept in sync with Persora's cloudflare/connections.js. */
export function canonicalRequest({ timestamp, nonce, method, pathWithQuery, bodyHash, grantHash }) {
  return ['ems-persora-v1', timestamp, nonce, String(method).toUpperCase(), pathWithQuery, bodyHash, grantHash].join('\n');
}
export async function signPersoraRequest(secret, parts) {
  return hmacHex(secret, canonicalRequest(parts));
}
async function settingKey(env) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(env.SESSION_SECRET || '')), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('ems-persora-integration-v1'), info: enc.encode('shared-secret-at-rest') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptSecret(env, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await settingKey(env), enc.encode(plain));
  return 'v1.' + b64(iv) + '.' + b64(ct);
}
async function decryptSecret(env, packed) {
  try {
    const [v, iv, ct] = String(packed || '').split('.');
    if (v !== 'v1' || !iv || !ct) return null;
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await settingKey(env), unb64(ct)));
  } catch { return null; }
}
const randomToken = () => 'pg1_' + b64u(crypto.getRandomValues(new Uint8Array(32)));
const grantHashOf = async grant => 'sha256:' + await sha256Hex(grant);
const credentialMarker = async passwordHash => 'sha256:' + await sha256Hex('ems-persora-credential|' + String(passwordHash || ''));

/* ------------------------------------------------------------ settings */
async function readSetting(env) {
  const [row] = await db(env, `platform_settings?setting_key=eq.${PERSORA_SETTING_KEY}&select=*`);
  const value = row?.setting_value && typeof row.setting_value === 'object' ? row.setting_value : {};
  return { exists: !!row, value, updatedAt: row?.updated_at || null };
}
async function writeSetting(env, value, ownerId, key = PERSORA_SETTING_KEY) {
  const body = JSON.stringify({ setting_key: key, setting_value: value, updated_by: ownerId || null, updated_at: new Date().toISOString() });
  await db(env, 'platform_settings?on_conflict=setting_key', { method: 'POST', headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body });
}
const STATUS_KEY = 'persora_integration_status';
async function readVerified(env) {
  const [row] = await db(env, `platform_settings?setting_key=eq.${STATUS_KEY}&select=setting_value`);
  return row?.setting_value?.last_verified_at || null;
}
async function touchVerified(env) {
  const last = Date.parse(await readVerified(env) || 0) || 0;
  if (Date.now() - last > 60_000) await writeSetting(env, { last_verified_at: new Date().toISOString() }, null, STATUS_KEY);
}
/** Effective config: enabled flag (console) + secret (env var wins over console). */
async function effectiveConfig(env) {
  const { value, updatedAt } = await readSetting(env);
  const envSecret = String(env.PERSORA_INTEGRATION_SECRET || '');
  let secret = null, source = null, readable = true;
  if (envSecret) { secret = envSecret; source = 'environment'; }
  else if (value.secret_ciphertext) {
    secret = await decryptSecret(env, value.secret_ciphertext);
    source = 'console';
    readable = !!secret;
  }
  return { enabled: value.enabled === true, secret: secret && secret.length >= MIN_SECRET_LENGTH ? secret : null, source, readable, value, updatedAt };
}

/* ------------------------------------------------------------ eligibility */
/**
 * Vaultium eligibility = the administrator has purchased Vaultium at least once.
 * Approved (active or since-expired) licenses carrying Vaultium storage, an
 * approved Vaultium add-on purchase, or a current entitlement with Vaultium
 * storage all count. Pending and rejected requests never count.
 */
export async function vaultiumEligibility(env, adminId) {
  const [licenses, addons, entitlements] = await Promise.all([
    db(env, `licenses?admin_id=eq.${adminId}&vaultium_gb=gt.0&status=in.(active,expired)&select=id,status,vaultium_gb,expires_at,created_at&order=created_at.asc&limit=50`),
    db(env, `addon_purchases?admin_id=eq.${adminId}&addon_key=eq.vaultium&status=in.(active,expired)&select=id,status,daily_limit,expires_at,created_at&order=created_at.asc&limit=50`),
    db(env, `current_entitlements?admin_id=eq.${adminId}&select=vaultium_gb,status,expires_at`).catch(() => []),
  ]);
  const now = Date.now();
  const live = r => r && r.status === 'active' && (!r.expires_at || Date.parse(r.expires_at) > now);
  const ent = (entitlements || []).find(e => Number(e?.vaultium_gb || 0) > 0);
  const sources = [];
  if (licenses.length) sources.push('license');
  if (addons.length) sources.push('addon');
  if (ent && !sources.length) sources.push('entitlement');
  const firstDates = [...licenses, ...addons].map(r => r.created_at).filter(Boolean).sort();
  const currentlyActive = licenses.some(live) || addons.some(live) || !!(ent && live(ent));
  return {
    eligible: sources.length > 0,
    sources,
    first_purchased_at: firstDates[0] || null,
    vaultium_active: currentlyActive,
    reason: sources.length ? null : 'This EMS administrator has never purchased Vaultium.',
  };
}

/* ------------------------------------------------------------ signature gate */
async function verifySignedRequest(request, cfg, rawBody) {
  const ts = request.headers.get('x-persora-timestamp') || '';
  const nonce = request.headers.get('x-persora-nonce') || '';
  const signature = (request.headers.get('x-persora-signature') || '').toLowerCase();
  if (!/^\d{9,12}$/.test(ts) || !NONCE_RE.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return problem('signature_invalid', 'Request signature is missing or malformed.', 401);
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > PERSORA_SIGNATURE_WINDOW_SECONDS) return problem('request_expired', 'Request timestamp is outside the allowed window.', 401);
  const url = new URL(request.url);
  const grant = request.headers.get('x-ems-grant') || '';
  const expected = await signPersoraRequest(cfg.secret, {
    timestamp: ts, nonce, method: request.method, pathWithQuery: url.pathname + url.search,
    bodyHash: await sha256Hex(rawBody), grantHash: await sha256Hex(grant),
  });
  if (!timingSafeEqual(expected, signature)) return problem('signature_invalid', 'Request signature is invalid.', 401);
  return null;
}

/* ------------------------------------------------------------ grants */
const PUBLIC_ADMIN = a => ({ id: a.id, admin_code: a.admin_code || null, name: a.name || '', email: a.email || '' });

async function loadGrant(env, request) {
  const grant = request.headers.get('x-ems-grant') || '';
  if (!GRANT_RE.test(grant)) return { error: problem('grant_invalid', 'The EMS connection is no longer valid. Reconnect EMS.', 401) };
  const [row] = await db(env, `persora_grants?token_hash=eq.${encodeURIComponent(await grantHashOf(grant))}&select=*`);
  const invalid = { error: problem('grant_invalid', 'The EMS connection is no longer valid. Reconnect EMS.', 401) };
  if (!row || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return invalid;
  const [admin] = await db(env, `administrators?id=eq.${row.admin_id}&select=id,admin_code,name,email,active,password_hash`);
  if (!admin) return invalid;
  if (!admin.active) return { error: problem('account_inactive', 'This EMS administrator account is deactivated.', 403) };
  if (!timingSafeEqual(await credentialMarker(admin.password_hash), row.credential_marker)) {
    // Password changed since the grant was issued: retire the grant permanently.
    await db(env, `persora_grants?id=eq.${row.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_reason: 'credentials_changed' }) }).catch(() => {});
    return invalid;
  }
  const last = Date.parse(row.last_used_at || row.created_at || 0) || 0;
  if (Date.now() - last > GRANT_TOUCH_INTERVAL_MS) {
    const now = new Date();
    await db(env, `persora_grants?id=eq.${row.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ last_used_at: now.toISOString(), expires_at: new Date(now.getTime() + PERSORA_GRANT_TTL_DAYS * 864e5).toISOString() }) }).catch(() => {});
  }
  return { grant: row, admin };
}

async function adminStores(env, adminId) {
  return db(env, `stores?admin_id=eq.${adminId}&select=id,name,shop_code,status,shop_type,business_type,category,created_at&order=created_at.asc`);
}
const fileView = f => ({
  id: f.id, store_id: f.store_id, filename: f.filename, content_type: f.content_type || 'application/octet-stream',
  size_bytes: Number(f.size_bytes || 0), created_at: f.created_at, invoice_number: f.invoice_number || null, expense_code: f.expense_code || null,
  category: f.invoice_id || f.invoice_number ? 'invoice' : f.expense_id || f.expense_code ? 'expense' : 'file',
});

/* ------------------------------------------------------------ public (signed) routes */
/**
 * Handles /api/persora/*. Returns null for any other path so the main router
 * continues. Mounted BEFORE the EMS browser-session gate: these requests are
 * authenticated by signature + grant, never by an EMS cookie/session.
 */
export async function persoraIntegrationRoutes({ env, request, path, method, checkPassword, audit }) {
  if (path !== 'persora' && !path.startsWith('persora/')) return null;
  const cfg = await effectiveConfig(env);
  if (!cfg.enabled || !cfg.secret) return problem('integration_disabled', 'The Persora integration is disabled on this EMS server.', 403);
  const rawBody = ['GET', 'HEAD'].includes(method) ? '' : await request.text();
  if (rawBody.length > 16384) return problem('payload_too_large', 'Request body is too large.', 413);
  const sigError = await verifySignedRequest(request, cfg, rawBody);
  if (sigError) return sigError;
  // Record the most recent successful handshake for the Owner Console (≤ once/minute).
  // Stored under its own key so it can never race with an owner config change.
  await touchVerified(env).catch(() => {});
  let input = {};
  if (rawBody) { try { input = JSON.parse(rawBody); } catch { return problem('bad_request', 'Request body must be JSON.', 400); } }
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};

  if (path === 'persora/ping') {
    if (method !== 'POST' && method !== 'GET') return problem('method_not_allowed', 'Method not allowed.', 405);
    return respond({ ok: true, service: 'ems', integration: 'persora', version: 1, time: new Date().toISOString() });
  }

  if (path === 'persora/authorize') {
    if (method !== 'POST') return problem('method_not_allowed', 'Method not allowed.', 405);
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    const ref = String(input.persora_user_ref || '');
    const label = String(input.label || 'Persora').slice(0, 80);
    if (!email || email.length > 254 || !password || password.length > 512) return problem('invalid_credentials', 'Enter your EMS administrator email and password.', 400);
    if (!REF_RE.test(ref)) return problem('bad_request', 'A valid Persora user reference is required.', 400);
    const [admin] = await db(env, `administrators?email=eq.${encodeURIComponent(email)}&select=id,admin_code,name,email,active,password_hash`);
    // Same checks and same generic message as the EMS administrator login.
    if (!admin || !admin.password_hash) return problem('invalid_credentials', 'Wrong email or password.', 401);
    if (!await checkPassword(password, admin.password_hash)) return problem('invalid_credentials', 'Wrong email or password.', 401);
    if (!admin.active) return problem('account_inactive', 'Your administrator account is deactivated. Contact EMS support.', 403);
    const eligibility = await vaultiumEligibility(env, admin.id);
    if (!eligibility.eligible) return problem('vaultium_not_eligible', 'Vaultium is not available for this EMS account. It must have purchased Vaultium at least once.', 403);
    const nowIso = new Date().toISOString();
    // One live grant per Persora user: reconnecting retires the previous one.
    await db(env, `persora_grants?persora_user_ref=eq.${encodeURIComponent(ref)}&revoked_at=is.null`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revoked_at: nowIso, revoked_reason: 'replaced' }) });
    const grant = randomToken();
    const [row] = await db(env, 'persora_grants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      admin_id: admin.id, token_hash: await grantHashOf(grant), credential_marker: await credentialMarker(admin.password_hash),
      persora_user_ref: ref, label, last_used_at: nowIso, expires_at: new Date(Date.now() + PERSORA_GRANT_TTL_DAYS * 864e5).toISOString(),
    }) });
    if (audit) await audit(env, { id: admin.id, role: 'admin' }, 'persora.connected', 'persora_grant', row?.id || null, { label });
    return respond({ grant, grant_id: row?.id || null, admin: PUBLIC_ADMIN(admin), eligibility, expires_at: row?.expires_at || null }, 201);
  }

  // ---- everything below requires a valid grant ----
  const ctx = await loadGrant(env, request);
  if (ctx.error) return ctx.error;
  const { grant, admin } = ctx;

  if (path === 'persora/revoke') {
    if (method !== 'POST') return problem('method_not_allowed', 'Method not allowed.', 405);
    await db(env, `persora_grants?id=eq.${grant.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_reason: 'disconnected' }) });
    if (audit) await audit(env, { id: admin.id, role: 'admin' }, 'persora.disconnected', 'persora_grant', grant.id, {});
    return respond({ ok: true });
  }

  // Read-only surface. Any write verb is refused by the API itself.
  if (method !== 'GET') return problem('read_only', 'EMS Vaultium is read-only through Persora.', 405);

  const eligibility = await vaultiumEligibility(env, admin.id);
  if (!eligibility.eligible) return problem('vaultium_not_eligible', 'Vaultium is not available for this EMS account.', 403);

  if (path === 'persora/account') {
    const stores = await adminStores(env, admin.id);
    const counts = await Promise.all(stores.map(s => countRows(env, 'vaultium_files', `admin_id=eq.${admin.id}&store_id=eq.${s.id}`).catch(() => null)));
    return respond({
      admin: PUBLIC_ADMIN(admin),
      eligibility,
      stores: stores.map((s, i) => ({ id: s.id, name: s.name, shop_code: s.shop_code, status: s.status, shop_type: s.shop_type || s.business_type || null, category: s.category || null, file_count: counts[i] })),
      total_files: counts.reduce((sum, n) => sum + (Number(n) || 0), 0),
      grant: { id: grant.id, created_at: grant.created_at, expires_at: grant.expires_at },
    });
  }

  if (path === 'persora/files') {
    const url = new URL(request.url);
    const storeId = url.searchParams.get('store_id') || '';
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 120);
    const limit = Math.min(MAX_LIST, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, Math.min(SCAN_LIMIT, parseInt(url.searchParams.get('offset') || '0', 10) || 0));
    let scope = `admin_id=eq.${admin.id}`;
    if (storeId) {
      if (!UUID_RE.test(storeId)) return problem('not_found', 'Shop not found.', 404);
      const [store] = await db(env, `stores?id=eq.${storeId}&admin_id=eq.${admin.id}&select=id`);
      if (!store) return problem('not_found', 'Shop not found.', 404);
      scope += `&store_id=eq.${store.id}`;
    }
    let rows = await db(env, `vaultium_files?${scope}&select=id,admin_id,store_id,filename,content_type,size_bytes,created_at,invoice_id,invoice_number,expense_id,expense_code&order=created_at.desc&limit=${SCAN_LIMIT}`);
    rows = rows.filter(r => r.admin_id === admin.id);
    if (q) rows = rows.filter(r => [r.filename, r.invoice_number, r.expense_code].some(v => String(v || '').toLowerCase().includes(q)));
    const page = rows.slice(offset, offset + limit);
    return respond({ files: page.map(fileView), total: rows.length, offset, limit, has_more: offset + limit < rows.length });
  }

  const content = path.match(/^persora\/files\/([^/]+)\/content$/);
  if (content) {
    const id = content[1];
    if (!UUID_RE.test(id)) return problem('not_found', 'File not found.', 404);
    const [file] = await db(env, `vaultium_files?id=eq.${id}&admin_id=eq.${admin.id}&select=*`);
    if (!file || file.admin_id !== admin.id) return problem('not_found', 'File not found.', 404);
    const [store] = await db(env, `stores?id=eq.${file.store_id}&admin_id=eq.${admin.id}&select=id`);
    if (!store) return problem('not_found', 'File not found.', 404);
    if (!env.VAULTIUM) return problem('storage_unavailable', 'Vaultium storage is not configured on this EMS server.', 503);
    const obj = await env.VAULTIUM.get(file.r2_key);
    if (!obj) return problem('not_found', 'File is missing from storage.', 404);
    const name = String(file.filename || 'file').replace(/[\r\n"]/g, '_');
    return new Response(obj.body, { headers: {
      'content-type': file.content_type || 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'x-ems-file-name': encodeURIComponent(name),
      'x-ems-file-size': String(Number(file.size_bytes || obj.size || 0)),
      'x-ems-store-id': file.store_id,
      'x-ems-reference': encodeURIComponent(String(file.invoice_number || file.expense_code || '')),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    } });
  }
  if (path.startsWith('persora/files/')) return problem('read_only', 'EMS Vaultium is read-only through Persora.', 405);
  return problem('not_found', 'Endpoint not found.', 404);
}

/* ------------------------------------------------------------ owner console routes */
async function ownerStatus(env) {
  const cfg = await effectiveConfig(env);
  const nowIso = new Date().toISOString();
  const active = await db(env, `persora_grants?revoked_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}&select=id,last_used_at&order=last_used_at.desc&limit=1000`).catch(() => []);
  const hint = cfg.source === 'environment' ? String(env.PERSORA_INTEGRATION_SECRET || '').slice(-4) : String(cfg.value.secret_last4 || '');
  return {
    enabled: cfg.enabled,
    secretConfigured: !!cfg.secret,
    secretReadable: cfg.readable,
    secretSource: cfg.source,
    secretHint: cfg.secret && hint ? '••••' + hint : null,
    ready: cfg.enabled && !!cfg.secret,
    updatedAt: cfg.updatedAt,
    lastVerifiedAt: await readVerified(env).catch(() => null),
    activeGrants: active.length,
    lastUsedAt: active[0]?.last_used_at || null,
    minSecretLength: MIN_SECRET_LENGTH,
  };
}
async function ownerLog(env, s, action, meta) {
  try { await db(env, 'platform_activity_logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner_id: s.id, action, entity_type: 'persora_integration', entity_id: PERSORA_SETTING_KEY, metadata: meta || {} }) }); }
  catch (e) { console.error('Owner audit failed'); }
}

/** /api/platform/persora-integration — EMS Owner Console configuration. */
export async function persoraOwnerRoutes({ env, request, path, method, s, readBody }) {
  if (path !== 'platform/persora-integration' && !path.startsWith('platform/persora-integration/')) return null;
  if (s?.role !== 'owner') return respond({ error: 'Forbidden' }, 403);
  if (path === 'platform/persora-integration' && method === 'GET') return respond(await ownerStatus(env));
  if (path === 'platform/persora-integration' && method === 'PATCH') {
    const b = await readBody(request);
    const { value } = await readSetting(env);
    const next = { ...value };
    const changes = {};
    if (b.enabled !== undefined) { next.enabled = b.enabled === true || b.enabled === 'true'; changes.enabled = next.enabled; }
    if (b.secret !== undefined && b.secret !== null && b.secret !== '') {
      if (env.PERSORA_INTEGRATION_SECRET) return respond({ error: 'The shared secret is managed by the PERSORA_INTEGRATION_SECRET environment variable on this server.' }, 409);
      const secret = String(b.secret);
      if (secret.length < MIN_SECRET_LENGTH || secret.length > MAX_SECRET_LENGTH || !/^[\x21-\x7e]+$/.test(secret)) return respond({ error: `The shared secret must be ${MIN_SECRET_LENGTH}–${MAX_SECRET_LENGTH} printable characters without spaces.` }, 400);
      next.secret_ciphertext = await encryptSecret(env, secret);
      next.secret_last4 = secret.slice(-4);
      next.secret_rotated_at = new Date().toISOString();
      changes.secretReplaced = true;
    }
    if (b.clearSecret === true) {
      delete next.secret_ciphertext; delete next.secret_last4; next.secret_rotated_at = new Date().toISOString();
      changes.secretCleared = true;
    }
    if (next.enabled && !(env.PERSORA_INTEGRATION_SECRET || next.secret_ciphertext)) return respond({ error: 'Set a shared secret before enabling the Persora integration.' }, 400);
    next.updated_by = s.id;
    await writeSetting(env, next, s.id);
    await ownerLog(env, s, 'persora_integration.updated', changes);
    return respond(await ownerStatus(env));
  }
  if (path === 'platform/persora-integration/revoke-all' && method === 'POST') {
    const rows = await db(env, 'persora_grants?revoked_at=is.null', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_reason: 'owner_revoked_all' }) });
    await ownerLog(env, s, 'persora_integration.revoked_all', { count: Array.isArray(rows) ? rows.length : 0 });
    return respond({ ok: true, revoked: Array.isArray(rows) ? rows.length : 0, status: await ownerStatus(env) });
  }
  return respond({ error: 'Endpoint not found.' }, 404);
}
