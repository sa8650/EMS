/* =====================================================================
   EMS Public API (v1) + platform API credential management
   ---------------------------------------------------------------------
   Service-to-service integration surface between EMS and external
   services — first of all the ConnectX central service, which needs
   read/write access to the EMS SMS queue to automate SMS dispatch.
   (Email never needs ConnectX: EMS sends email itself via Brevo.)

   External services NEVER talk to the database. They authenticate
   against this HTTP layer with an EMS API key and only see whitelisted
   fields.

   · Ownership   : API keys are PLATFORM credentials, created and revoked
                   ONLY by the EMS owner (Owner Console → EMS API).
                   Administrators never see or manage keys.
   · Auth        : "Authorization: Bearer emsk_…"  (or "X-API-Key: emsk_…")
   · Keys        : shown ONCE at creation; only a SHA-256 hash is stored.
   · Permissions : granular scopes — global `read` / `write`, or
                   per-resource `sms:read`, `sms:write`, `invoices:read`, …
   · Portability : every query goes through db() (Supabase ⇄ D1 ⇄ any
                   future dedicated server). The /api/v1 contract is the
                   stable integration surface — swapping the database or
                   host never breaks external services.

   Owner session routes: platform/api-keys… . Documented in API.md.
   ===================================================================== */
import { db } from './db.js';
import { smsSettingsFor, enqueueSmsJob } from './connectx_sms.js';
import { simCarrierLookup } from './connectx_sim_carriers.js';

/* ---------------- key material ---------------- */
const KEY_PREFIX = 'emsk_';
const enc = new TextEncoder();

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const key = KEY_PREFIX + secret;               // emsk_ + 64 hex chars
  return { key, prefix: key.slice(0, 13) };      // "emsk_a1b2c3d4" shown in lists
}

/* ---------------- scopes ---------------- */
const RESOURCES = ['shops', 'customers', 'suppliers', 'staff', 'inventory', 'invoices', 'emails', 'sms'];
export const VALID_SCOPES = ['read', 'write', ...RESOURCES.flatMap(r => [r + ':read', r + ':write'])];

function normalizeScopes(input) {
  const list = Array.isArray(input) ? input.map(x => String(x).trim().toLowerCase()).filter(Boolean) : [];
  const unique = [...new Set(list)];
  const invalid = unique.filter(x => !VALID_SCOPES.includes(x));
  return { scopes: unique, invalid };
}

function hasScope(scopes, resource, verb) {
  const list = Array.isArray(scopes) ? scopes : [];
  return list.includes(verb) || list.includes(resource + ':' + verb);
}

/* ---------------- CORS + response helpers (external clients need CORS) ---------------- */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-api-key,x-shop-id',
  'access-control-max-age': '86400'
};
const vjson = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS }
});
const vfail = (message, status = 400, code) => vjson({ error: message, ...(code ? { code } : {}) }, status);

async function readBody(request) { try { return await request.json(); } catch { return {}; } }

/* ---------------- whitelisted output shapes ---------------- */
const publicKeyRow = k => k ? ({
  id: k.id, name: k.name, key_prefix: k.key_prefix, store_id: k.store_id || null,
  scopes: parseScopes(k.scopes), status: k.status, expires_at: k.expires_at || null,
  last_used_at: k.last_used_at || null, created_at: k.created_at, revoked_at: k.revoked_at || null
}) : null;

function parseScopes(v) {
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}

const publicShop = s => s ? ({
  id: s.id, name: s.name, shop_code: s.shop_code, category: s.category || null,
  address: s.address || null, phone: s.phone || null, status: s.status
}) : null;

/* D1's compatibility driver returns all table columns even with select=…;
   whitelist what an external client may read rather than returning raw rows. */
function publicEmail(row, detail = false) {
  if (!row) return null;
  const addresses = value => Array.isArray(value) ? value.map(String) : [];
  return {
    id: row.id, subject: row.subject || '', from_email: row.from_email || '',
    to_emails: addresses(row.to_emails), cc_emails: addresses(row.cc_emails),
    recipient_type: row.recipient_type || '', status: row.status || 'queued',
    error_message: row.error_message || null, created_at: row.created_at, sent_at: row.sent_at || null,
    ...(detail ? { bcc_emails: addresses(row.bcc_emails), custom_body: row.custom_body || '', body_html: row.body_html || '' } : {})
  };
}

const publicSms = r => r ? ({
  id: r.id, to_phone: r.to_phone, recipient_name: r.recipient_name || null,
  recipient_type: r.recipient_type || null, message_type: r.message_type || null,
  event_type: r.event_type || r.message_type || null, message_body: r.message_body,
  invoice_id: r.invoice_id || null, status: r.status, attempts: Number(r.attempts || 0),
  error_message: r.error_message || null, created_at: r.created_at, sent_at: r.sent_at || null
}) : null;

/* Clients may request the start of their local day; default is UTC midnight. */
function dayStart(request) {
  const raw = new URL(request.url).searchParams.get('utcOffsetMinutes');
  if (raw === null) return new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  if (!/^-?[0-9]{1,4}$/.test(raw)) return null;
  const offset = Number(raw);
  if (offset < -720 || offset > 840) return null;
  const shifted = Date.now() + offset * 60000;
  return new Date(Math.floor(shifted / 86400000) * 86400000 - offset * 60000).toISOString();
}

/* ---------------- entitlement (ConnectX SMS quota) ---------------- */
async function connectxSmsPlan(env, storeId) {
  const [store] = await db(env, `stores?id=eq.${storeId}&select=admin_id,status`);
  if (!store || !['active', 'read_only'].includes(store.status)) return null;
  const now = new Date().toISOString();
  const [[ent], [addon]] = await Promise.all([
    db(env, `current_entitlements?admin_id=eq.${store.admin_id}&status=eq.active&starts_at=lte.${now}&expires_at=gt.${now}&select=*`).catch(() => []),
    db(env, `addon_purchases?admin_id=eq.${store.admin_id}&addon_key=eq.connectx&status=eq.active&expires_at=gt.${now}&select=*`).catch(() => [])
  ]);
  const licLimit = ent?.connectx_enabled ? Number(ent.connectx_daily_limit || 0) : 0;
  const addonLimit = addon ? Number(addon.daily_limit || 0) : 0;
  if (!licLimit && !addonLimit) return null;
  return { daily_limit: Math.max(licLimit, addonLimit) };
}

/* =====================================================================
   API-key authentication
   ===================================================================== */
async function authenticate(env, request) {
  let raw = request.headers.get('x-api-key') || '';
  if (!raw) {
    const auth = request.headers.get('authorization') || '';
    if (auth.toLowerCase().startsWith('bearer ')) raw = auth.slice(7).trim();
  }
  if (!raw) return { error: vfail('Missing API key. Send "Authorization: Bearer emsk_…" or "X-API-Key".', 401, 'missing_key') };
  if (!raw.startsWith(KEY_PREFIX) || raw.length < 40) return { error: vfail('Malformed API key.', 401, 'invalid_key') };

  const keyHash = await sha256Hex(raw);
  const [key] = await db(env, `api_keys?key_hash=eq.${keyHash}&select=*`).catch(() => []);
  if (!key) return { error: vfail('Invalid API key.', 401, 'invalid_key') };
  if (key.status !== 'active') return { error: vfail('This API key has been revoked.', 401, 'revoked_key') };
  if (key.expires_at && new Date(key.expires_at) <= new Date()) return { error: vfail('This API key has expired.', 401, 'expired_key') };

  key.scopes = parseScopes(key.scopes);

  /* heartbeat: throttled last_used_at update (also powers "online" in the console) */
  const last = key.last_used_at ? new Date(key.last_used_at).getTime() : 0;
  if (Date.now() - last > 30 * 1000) {
    await db(env, `api_keys?id=eq.${key.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ last_used_at: new Date().toISOString() })
    }).catch(() => {});
  }
  return { key };
}

/* Resolve which shop the request targets. Keys are platform credentials:
   a key optionally locked to a shop is limited to that shop; otherwise the
   service passes ?shop_id= (or X-Shop-Id) to select any EMS shop. */
async function resolveShop(env, key, request) {
  const qs = new URL(request.url).searchParams;
  const requested = qs.get('shop_id') || qs.get('store_id') || request.headers.get('x-shop-id') || key.store_id || '';
  if (!requested) return { error: vfail('Pass ?shop_id=… (or the X-Shop-Id header) to select a shop.', 400, 'shop_required') };
  if (key.store_id && requested !== key.store_id) return { error: vfail('This API key is locked to another shop.', 403, 'shop_locked') };
  const [store] = await db(env, `stores?id=eq.${requested}&select=id,name,address,phone,shop_code,status,category,admin_id`).catch(() => []);
  if (!store) return { error: vfail('Shop not found.', 404, 'shop_not_found') };
  if (store.status === 'inactive') return { error: vfail('This shop is inactive.', 403, 'shop_inactive') };
  return { store };
}

/* Shop is optional for fleet-level SMS endpoints: the ConnectX central
   service may operate across every EMS shop with one credential. */
async function resolveShopOptional(env, key, request) {
  const qs = new URL(request.url).searchParams;
  const requested = qs.get('shop_id') || qs.get('store_id') || request.headers.get('x-shop-id') || key.store_id || '';
  if (!requested) return { store: null };
  return resolveShop(env, key, request);
}

const limitOf = (request, def = 100, max = 500) => {
  const raw = new URL(request.url).searchParams.get('limit');
  const n = Number(raw || def);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* =====================================================================
   PUBLIC API ROUTER — mounted at /api/v1/*  (no EMS session, key only)
   ===================================================================== */
export async function publicApiRoutes({ env, request, path, method }) {
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const sub = path === 'v1' ? '' : path.slice(3); // strip "v1/"

  /* unauthenticated discovery endpoint */
  if ((sub === '' || sub === 'index') && method === 'GET') {
    return vjson({
      name: 'EMS Public API', version: 'v1',
      documentation: 'API.md',
      authentication: 'Authorization: Bearer <emsk_…>  (or X-API-Key header)',
      scopes: VALID_SCOPES
    });
  }

  const auth = await authenticate(env, request);
  if (auth.error) return auth.error;
  const { key } = auth;
  const deny = (resource, verb) => vfail(`This API key does not have the "${resource}:${verb}" (or global "${verb}") scope.`, 403, 'insufficient_scope');

  /* ---- identity / connection ---- */
  if (sub === 'ping' && method === 'GET') {
    return vjson({ ok: true, name: key.name, key_prefix: key.key_prefix, scopes: key.scopes, shop_locked: !!key.store_id, expires_at: key.expires_at || null, server_time: new Date().toISOString() });
  }

  if (sub === 'me' && method === 'GET') {
    const stores = await db(env, `stores?${key.store_id ? `id=eq.${key.store_id}&` : ''}select=id,status`);
    return vjson({
      key: publicKeyRow(key),
      platform: 'EMS',
      shops_total: stores.length,
      shops_active: stores.filter(s => s.status === 'active').length
    });
  }

  /* heartbeat for the ConnectX central service: connection state (+ shop summary when one is selected) */
  if (sub === 'heartbeat' && method === 'POST') {
    const shop = await resolveShopOptional(env, key, request);
    if (shop.error) return shop.error;
    const out = { ok: true, scopes: key.scopes, server_time: new Date().toISOString() };
    if (shop.store) {
      const settings = await smsSettingsFor(env, shop.store.id);
      out.shop = publicShop(shop.store);
      out.smsEnabled = !!settings.enabled;
    }
    return vjson(out);
  }

  /* ---- shops ---- */
  if (sub === 'shops' && method === 'GET') {
    if (!hasScope(key.scopes, 'shops', 'read')) return deny('shops', 'read');
    const stores = await db(env, `stores?${key.store_id ? `id=eq.${key.store_id}&` : ''}select=id,name,address,phone,shop_code,status,category&order=created_at.desc&limit=${limitOf(request, 200)}`);
    return vjson({ items: stores.map(publicShop) });
  }
  if (sub.match(/^shops\/[^/]+$/) && method === 'GET') {
    if (!hasScope(key.scopes, 'shops', 'read')) return deny('shops', 'read');
    const id = sub.split('/')[1];
    if (!UUID_RE.test(id)) return vfail('Invalid shop ID.', 400);
    if (key.store_id && key.store_id !== id) return vfail('This API key is locked to another shop.', 403);
    const [store] = await db(env, `stores?id=eq.${id}&select=id,name,address,phone,shop_code,status,category`);
    if (!store) return vfail('Shop not found.', 404);
    return vjson(publicShop(store));
  }

  /* ---- contacts (read-only) ---- */
  const contactRoutes = {
    customers: { table: 'customers', cols: 'id,customer_code,name,address,phone,email,created_at' },
    suppliers: { table: 'suppliers', cols: 'id,supplier_code,name,address,phone,email,created_at' },
    staff:     { table: 'staff',     cols: 'id,full_name,phone,email,user_id,active,created_at' }
  };
  if (contactRoutes[sub] && method === 'GET') {
    if (!hasScope(key.scopes, sub, 'read')) return deny(sub, 'read');
    const shop = await resolveShop(env, key, request);
    if (shop.error) return shop.error;
    const { table, cols } = contactRoutes[sub];
    const rows = await db(env, `${table}?store_id=eq.${shop.store.id}&select=${cols}&order=created_at.desc&limit=${limitOf(request)}`);
    const allowed = new Set(cols.split(','));
    return vjson({ shop_id: shop.store.id, items: rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => allowed.has(k)))) });
  }

  /* ---- inventory (read-only) ---- */
  if (sub === 'inventory' && method === 'GET') {
    if (!hasScope(key.scopes, 'inventory', 'read')) return deny('inventory', 'read');
    const shop = await resolveShop(env, key, request);
    if (shop.error) return shop.error;
    const cols = 'id,item_code,description,category,unit,sale_price,total_stock,active,created_at';
    const rows = await db(env, `inventory_items?store_id=eq.${shop.store.id}&select=${cols}&order=description.asc&limit=${limitOf(request, 200)}`);
    const allowed = new Set(cols.split(','));
    return vjson({ shop_id: shop.store.id, items: rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => allowed.has(k)))) });
  }

  /* ---- invoices (read-only) ---- */
  if (sub === 'invoices' && method === 'GET') {
    if (!hasScope(key.scopes, 'invoices', 'read')) return deny('invoices', 'read');
    const shop = await resolveShop(env, key, request);
    if (shop.error) return shop.error;
    const kind = new URL(request.url).searchParams.get('kind');
    const kindFilter = ['sale', 'purchase'].includes(kind) ? `&kind=eq.${kind}` : '';
    const rows = await db(env, `invoices?store_id=eq.${shop.store.id}${kindFilter}&select=id,invoice_number,kind,invoice_date,subtotal,paid_amount,total_due,payment_method,custom_party_name,custom_party_phone,created_at&order=created_at.desc&limit=${limitOf(request)}`);
    return vjson({
      shop_id: shop.store.id,
      items: rows.map(r => ({
        id: r.id, invoice_number: r.invoice_number, kind: r.kind, invoice_date: r.invoice_date,
        total: r.subtotal, paid: r.paid_amount, due: r.total_due, payment_method: r.payment_method,
        party_name: r.custom_party_name || null, party_phone: r.custom_party_phone || null, created_at: r.created_at
      }))
    });
  }
  if (sub.match(/^invoices\/[^/]+$/) && method === 'GET') {
    if (!hasScope(key.scopes, 'invoices', 'read')) return deny('invoices', 'read');
    const shop = await resolveShop(env, key, request);
    if (shop.error) return shop.error;
    const id = sub.split('/')[1];
    if (!UUID_RE.test(id)) return vfail('Invalid invoice ID.', 400);
    const [inv] = await db(env, `invoices?id=eq.${id}&store_id=eq.${shop.store.id}&select=*,invoice_lines(*,inventory_items(item_code,description,unit))`);
    if (!inv) return vfail('Invoice not found for this shop.', 404);
    return vjson({
      id: inv.id, invoice_number: inv.invoice_number, kind: inv.kind, invoice_date: inv.invoice_date,
      total: inv.subtotal, paid: inv.paid_amount, due: inv.total_due, payment_method: inv.payment_method,
      notes: inv.notes || null, party_name: inv.custom_party_name || null, party_phone: inv.custom_party_phone || null,
      created_at: inv.created_at,
      lines: (inv.invoice_lines || []).map(l => ({
        id: l.id, item_code: l.inventory_items?.item_code || null, description: l.inventory_items?.description || l.description || null,
        unit: l.inventory_items?.unit || null, quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total
      }))
    });
  }

  /* ---- outgoing ConnectX email history (read-only) ---- */
  if ((sub === 'emails' || sub === 'emails/stats' || sub.startsWith('emails/')) && method === 'GET') {
    if (!hasScope(key.scopes, 'emails', 'read')) return deny('emails', 'read');
    const shop = await resolveShop(env, key, request);
    if (shop.error) return shop.error;
    const visible = `store_id=eq.${shop.store.id}&shop_deleted_at=is.null`;

    if (sub === 'emails/stats') {
      const today = dayStart(request);
      if (!today) return vfail('Invalid UTC offset.', 400);
      const [todayRows, latest] = await Promise.all([
        db(env, `connectx_messages?${visible}&created_at=gte.${today}&select=status,sent_at`),
        db(env, `connectx_messages?${visible}&select=id,subject,from_email,to_emails,cc_emails,recipient_type,status,error_message,created_at,sent_at&order=created_at.desc,id.desc&limit=1`)
      ]);
      return vjson({
        sent: todayRows.filter(r => r.status === 'sent').length,
        failed: todayRows.filter(r => r.status === 'failed').length,
        pending: todayRows.filter(r => r.status === 'queued' || r.status === 'sending').length,
        latest: publicEmail(latest[0])
      });
    }
    if (sub === 'emails') {
      const qs = new URL(request.url).searchParams;
      const rawPage = qs.get('page') || '0';
      if (!/^(0|[1-9][0-9]{0,4})$/.test(rawPage) || Number(rawPage) > 10000) return vfail('Invalid email history page.', 400);
      const page = Number(rawPage);
      const pageSize = 30;
      const rows = await db(env, `connectx_messages?${visible}&select=id,subject,from_email,to_emails,cc_emails,recipient_type,status,error_message,created_at,sent_at&order=created_at.desc,id.desc&limit=${pageSize + 1}&offset=${page * pageSize}`);
      return vjson({ items: rows.slice(0, pageSize).map(r => publicEmail(r)), page, hasMore: rows.length > pageSize });
    }
    const id = sub.slice('emails/'.length);
    if (!UUID_RE.test(id)) return vfail('Invalid email ID.', 400);
    const [message] = await db(env, `connectx_messages?${visible}&id=eq.${id}&select=id,subject,from_email,to_emails,cc_emails,bcc_emails,recipient_type,status,error_message,created_at,sent_at,custom_body,body_html&limit=1`);
    if (!message) return vfail('Email not found for this shop.', 404);
    return vjson(publicEmail(message, true));
  }

  /* ---- SMS: settings + history (read) ---- */
  if (sub === 'sms/settings' && method === 'GET') {
    if (!hasScope(key.scopes, 'sms', 'read')) return deny('sms', 'read');
    const shop = await resolveShop(env, key, request);
    if (shop.error) return shop.error;
    const settings = await smsSettingsFor(env, shop.store.id);
    return vjson({
      shop_id: shop.store.id, enabled: !!settings.enabled,
      auto_sale: !!settings.auto_sale, auto_payment: !!settings.auto_payment,
      auto_due_reminder: !!settings.auto_due_reminder, auto_return: !!settings.auto_return,
      auto_exchange: !!settings.auto_exchange, auto_refund: !!settings.auto_refund
    });
  }

  if (sub === 'sms/queue' && method === 'GET') {
    if (!hasScope(key.scopes, 'sms', 'read')) return deny('sms', 'read');
    const shop = await resolveShopOptional(env, key, request);
    if (shop.error) return shop.error;
    const filter = shop.store ? `store_id=eq.${shop.store.id}&` : '';
    const rows = await db(env, `connectx_sms_messages?${filter}status=eq.queued&select=*&order=created_at.asc&limit=${limitOf(request, 50, 100)}`);
    return vjson({ shop_id: shop.store?.id || null, items: rows.map(r => ({ ...publicSms(r), shop_id: r.store_id })) });
  }

  if (sub === 'sms/messages' && method === 'GET') {
    if (!hasScope(key.scopes, 'sms', 'read')) return deny('sms', 'read');
    const shop = await resolveShopOptional(env, key, request);
    if (shop.error) return shop.error;
    const qs = new URL(request.url).searchParams;
    const range = qs.get('range') || 'today';
    const days = range === '30d' || range === '30' ? 30 : range === '7d' || range === '7' ? 7 : 1;
    const since = range === 'today' ? dayStart(request) : new Date(Date.now() - days * 86400000).toISOString();
    if (!since) return vfail('Invalid UTC offset.', 400);
    const filter = shop.store ? `store_id=eq.${shop.store.id}&` : '';
    const rows = await db(env, `connectx_sms_messages?${filter}created_at=gte.${since}&select=*&order=created_at.desc&limit=250`);
    return vjson({ shop_id: shop.store?.id || null, items: rows.map(r => ({ ...publicSms(r), shop_id: r.store_id })) });
  }

  if (sub === 'sms/stats' && method === 'GET') {
    if (!hasScope(key.scopes, 'sms', 'read')) return deny('sms', 'read');
    const shop = await resolveShopOptional(env, key, request);
    if (shop.error) return shop.error;
    const today = dayStart(request);
    if (!today) return vfail('Invalid UTC offset.', 400);
    const filter = shop.store ? `store_id=eq.${shop.store.id}&` : '';
    const [jobs, last] = await Promise.all([
      db(env, `connectx_sms_messages?${filter}created_at=gte.${today}&select=id,status,sent_at,created_at`),
      db(env, `connectx_sms_messages?${filter}select=created_at,sent_at,status&order=created_at.desc&limit=1`)
    ]);
    return vjson({
      shop_id: shop.store?.id || null,
      sent: jobs.filter(j => j.status === 'sent').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      pending: jobs.filter(j => j.status === 'queued' || j.status === 'sending').length,
      lastActivity: last[0]?.sent_at || last[0]?.created_at || null,
      shop: shop.store ? publicShop(shop.store) : null
    });
  }

  /* ---- SIM carrier catalog lookup (owner-managed USSD balance codes) ---- */
  if (sub === 'sim-carrier' && method === 'GET') {
    if (!hasScope(key.scopes, 'sms', 'read')) return deny('sms', 'read');
    const qs = new URL(request.url).searchParams;
    const result = await simCarrierLookup(env, qs.get('mccMnc'), qs.get('carrierName'));
    if (result.error) return vfail(result.error, 400);
    return vjson(result);
  }

  /* ---- SMS: gateway dispatch (write) — how the ConnectX app sends ---- */
  if (sub === 'sms/claim' && method === 'POST') {
    if (!hasScope(key.scopes, 'sms', 'write')) return deny('sms', 'write');
    const shop = await resolveShopOptional(env, key, request);
    if (shop.error) return shop.error;
    const filter = shop.store ? `store_id=eq.${shop.store.id}&` : '';
    const b = await readBody(request);
    const limit = Math.min(20, Math.max(1, Number(b.limit || 8)));
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    /* release jobs stuck in "sending" (a gateway crashed mid-dispatch) */
    const sending = await db(env, `connectx_sms_messages?${filter}status=eq.sending&select=id,claimed_at&limit=100`).catch(() => []);
    for (const j of sending) {
      if (!j.claimed_at || j.claimed_at < stale) {
        await db(env, `connectx_sms_messages?id=eq.${j.id}&status=eq.sending`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'queued', claimed_at: null })
        }).catch(() => {});
      }
    }
    const queued = await db(env, `connectx_sms_messages?${filter}status=eq.queued&select=*&order=created_at.asc&limit=${limit}`);
    const claimed = [];
    for (const job of queued) {
      const upd = await db(env, `connectx_sms_messages?id=eq.${job.id}&status=eq.queued`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'sending', device_id: key.id, claimed_at: new Date().toISOString(),
          attempts: Number(job.attempts || 0) + 1
        })
      }).catch(() => null);
      /* a conditional PATCH that updated zero rows returns [] — never dispatch unclaimed jobs */
      if (Array.isArray(upd) && upd.length > 0) {
        claimed.push({ ...publicSms(job), shop_id: job.store_id, attempts: Number(job.attempts || 0) + 1, phone_number: job.to_phone, message: job.message_body });
      }
    }
    return vjson({ jobs: claimed });
  }

  if (sub === 'sms/report' && method === 'POST') {
    if (!hasScope(key.scopes, 'sms', 'write')) return deny('sms', 'write');
    const b = await readBody(request);
    const id = b.jobId || b.id;
    if (!id || !UUID_RE.test(String(id))) return vfail('jobId is required.', 400);
    const status = b.status === 'sent' ? 'sent' : 'failed';
    const [job] = await db(env, `connectx_sms_messages?id=eq.${id}&select=*`);
    if (!job) return vfail('SMS job not found.', 404);
    if (key.store_id && job.store_id !== key.store_id) return vfail('This API key is locked to another shop.', 403, 'shop_locked');
    if (job.device_id && job.device_id !== key.id && job.status === 'sent') return vjson({ ok: true, duplicate: true });
    const patch = {
      status, device_id: key.id,
      error_message: status === 'failed' ? String(b.error || 'SMS could not be sent').slice(0, 400) : null
    };
    if (status === 'sent') patch.sent_at = new Date().toISOString();
    await db(env, `connectx_sms_messages?id=eq.${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch)
    });
    return vjson({ ok: true, status, shop_id: job.store_id });
  }

  if ((sub === 'sms/cancel' && method === 'POST') || (sub.match(/^sms\/jobs\/[^/]+$/) && method === 'DELETE')) {
    if (!hasScope(key.scopes, 'sms', 'write')) return deny('sms', 'write');
    let id;
    if (method === 'DELETE') id = sub.split('/')[2];
    else { const b = await readBody(request); id = b.jobId || b.id; }
    if (!id || !UUID_RE.test(String(id))) return vfail('jobId is required.', 400);
    const [job] = await db(env, `connectx_sms_messages?id=eq.${id}&select=*`);
    if (!job) return vfail('SMS job not found.', 404);
    if (key.store_id && job.store_id !== key.store_id) return vfail('This API key is locked to another shop.', 403, 'shop_locked');
    if (job.status !== 'queued') return vfail('SMS is no longer queued. Refresh history before retrying.', 409);
    const removed = await db(env, `connectx_sms_messages?id=eq.${id}&status=eq.queued`, { method: 'DELETE' });
    if (!removed.length) return vfail('SMS was already claimed. Refresh history.', 409);
    return vjson({ ok: true, cancelled: true });
  }

  if (sub === 'sms/send' && method === 'POST') {
    if (!hasScope(key.scopes, 'sms', 'write')) return deny('sms', 'write');
    const shop = await resolveShop(env, key, request);
    if (shop.error) return shop.error;
    const b = await readBody(request);
    const phone = String(b.phone || b.to_phone || '').replace(/[^0-9+]/g, '');
    const message = String(b.message || b.message_body || '').trim();
    if (phone.length < 6) return vfail('A valid recipient phone number is required.', 400);
    if (!message) return vfail('Message body is required.', 400);
    if (message.length > 1000) return vfail('Message body exceeds 1000 characters.', 400);

    const settings = await smsSettingsFor(env, shop.store.id);
    if (!settings.enabled) return vfail('SMS is disabled for this shop by the administrator.', 403);
    const plan = await connectxSmsPlan(env, shop.store.id);
    if (!plan) return vfail('ConnectX is not available for this shop. Purchase a ConnectX add-on or an eligible license.', 403);
    const today = new Date().toISOString().slice(0, 10);
    const usedToday = await db(env, `connectx_sms_messages?store_id=eq.${shop.store.id}&created_at=gte.${today}T00:00:00Z&status=in.(queued,sending,sent)&select=id`);
    const maxDaily = plan.daily_limit || 100;
    if (usedToday.length >= maxDaily) return vfail(`This shop has reached its daily ConnectX SMS limit (${maxDaily}/day).`, 429);

    const result = await enqueueSmsJob(env, {
      storeId: shop.store.id, userId: null, phone,
      name: String(b.recipientName || b.recipient_name || '').trim() || null,
      recipientType: ['customer', 'supplier', 'staff', 'manual'].includes(b.recipientType) ? b.recipientType : 'manual',
      invoiceId: UUID_RE.test(String(b.invoiceId || '')) ? b.invoiceId : null,
      messageType: String(b.messageType || 'API Message').slice(0, 60),
      eventType: 'API', messageBody: message,
      idempotencyKey: b.idempotencyKey ? String(b.idempotencyKey).slice(0, 120) : null
    });
    if (result.skipped === 'duplicate') return vjson({ ok: true, duplicate: true, id: result.id || null });
    if (result.skipped) return vfail('SMS could not be queued: ' + result.skipped, 400);
    return vjson({ ok: true, id: result.id, status: 'queued' }, 201);
  }

  return vfail('Unknown API v1 endpoint. See API.md for the endpoint reference.', 404, 'not_found');
}

/* =====================================================================
   OWNER CONSOLE ROUTES — the EMS owner (platform) creates, manages and
   revokes API credentials. Administrators have NO access to these.
   Session routes under: platform/api-keys…
   ===================================================================== */
const MAX_ACTIVE_KEYS = 25;

async function ownerLog(env, s, action, id, metadata = {}) {
  try {
    await db(env, 'platform_activity_logs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_id: s.id, action, entity_type: 'api_key', entity_id: id || null, metadata })
    });
  } catch (e) { console.error('api_key owner log failed:', e); }
}

export async function apiKeyOwnerRoutes(ctx) {
  const { env, request, path, method, s, json, fail, body } = ctx;
  if (!path.startsWith('platform/api-keys')) return null;
  if (!s || s.role !== 'owner') return fail('Forbidden', 403);

  if (path === 'platform/api-keys' && method === 'GET') {
    const [rows, stores] = await Promise.all([
      db(env, 'api_keys?select=*&order=created_at.desc').catch(() => []),
      db(env, 'stores?select=id,name,shop_code&order=name.asc').catch(() => [])
    ]);
    const names = Object.fromEntries(stores.map(x => [x.id, x.name]));
    return json({
      scopes: VALID_SCOPES,
      stores,
      items: rows.map(k => ({ ...publicKeyRow(k), shop_name: k.store_id ? (names[k.store_id] || 'Unknown shop') : null }))
    });
  }

  if (path === 'platform/api-keys' && method === 'POST') {
    const b = await body(request);
    const name = String(b.name || '').trim();
    if (!name || name.length > 80) return fail('Credential name is required (max 80 characters).');
    const { scopes, invalid } = normalizeScopes(b.scopes);
    if (!scopes.length) return fail('Select at least one permission scope.');
    if (invalid.length) return fail('Invalid scopes: ' + invalid.join(', '));

    let storeId = null;
    if (b.storeId) {
      const [store] = await db(env, `stores?id=eq.${b.storeId}&select=id`);
      if (!store) return fail('Selected shop not found.', 404);
      storeId = store.id;
    }
    const existing = await db(env, 'api_keys?status=eq.active&select=id').catch(() => []);
    if (existing.length >= MAX_ACTIVE_KEYS) return fail(`Maximum of ${MAX_ACTIVE_KEYS} active API keys reached. Revoke unused keys first.`, 409);

    let expiresAt = null;
    if (b.expiresInDays !== undefined && b.expiresInDays !== null && b.expiresInDays !== '') {
      const days = Number(b.expiresInDays);
      if (!Number.isFinite(days) || days < 1 || days > 3650) return fail('Expiry must be between 1 and 3650 days.');
      expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    }

    const { key, prefix } = generateKey();
    const keyHash = await sha256Hex(key);
    const [row] = await db(env, 'api_keys', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        owner_id: s.id, store_id: storeId, name, key_prefix: prefix, key_hash: keyHash,
        scopes, status: 'active', expires_at: expiresAt, created_at: new Date().toISOString()
      })
    });
    await ownerLog(env, s, 'create API key', row.id, { name, scopes, store_id: storeId, expires_at: expiresAt });
    /* the plaintext key is returned exactly once and never stored */
    return json({ apiKey: key, key: publicKeyRow(row) }, 201);
  }

  const m = path.match(/^platform\/api-keys\/([^/]+)(?:\/(revoke))?$/);
  if (!m) return fail('Unknown API credential endpoint.', 404);
  const id = m[1];
  const [row] = await db(env, `api_keys?id=eq.${id}&select=*`).catch(() => []);
  if (!row) return fail('API key not found.', 404);

  if (m[2] === 'revoke' && method === 'POST') {
    if (row.status === 'revoked') return json({ ok: true, key: publicKeyRow(row) });
    const [upd] = await db(env, `api_keys?id=eq.${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'revoked', revoked_at: new Date().toISOString() })
    });
    await ownerLog(env, s, 'revoke API key', id, { name: row.name });
    return json({ ok: true, key: publicKeyRow(upd || { ...row, status: 'revoked' }) });
  }

  if (!m[2] && method === 'PATCH') {
    const b = await body(request);
    const patch = {};
    if (b.name !== undefined) {
      const name = String(b.name || '').trim();
      if (!name || name.length > 80) return fail('Credential name is required (max 80 characters).');
      patch.name = name;
    }
    if (b.scopes !== undefined) {
      const { scopes, invalid } = normalizeScopes(b.scopes);
      if (!scopes.length) return fail('Select at least one permission scope.');
      if (invalid.length) return fail('Invalid scopes: ' + invalid.join(', '));
      patch.scopes = scopes;
    }
    if (!Object.keys(patch).length) return fail('Nothing to update.');
    const [upd] = await db(env, `api_keys?id=eq.${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch)
    });
    await ownerLog(env, s, 'update API key', id, { changed: Object.keys(patch) });
    return json(publicKeyRow(upd || row));
  }

  if (!m[2] && method === 'DELETE') {
    await db(env, `api_keys?id=eq.${id}`, { method: 'DELETE' });
    await ownerLog(env, s, 'delete API key', id, { name: row.name });
    return json({ ok: true });
  }

  return fail('Unknown API credential endpoint.', 404);
}

/* Aggregate, non-secret gateway status shared with administrator views:
   admins see WHETHER the ConnectX SMS service is connected — never the keys. */
export async function gatewayStatus(env) {
  const rows = await db(env, 'api_keys?status=eq.active&select=id,scopes,last_used_at,store_id,expires_at').catch(() => []);
  const now = Date.now();
  const live = rows.filter(k => !k.expires_at || new Date(k.expires_at) > new Date());
  const sms = live.filter(k => { const sc = parseScopes(k.scopes); return sc.includes('write') || sc.includes('sms:write'); });
  const lastSeen = sms.reduce((a, k) => (k.last_used_at && (!a || k.last_used_at > a)) ? k.last_used_at : a, null);
  return {
    configured: sms.length > 0,
    online: sms.some(k => k.last_used_at && (now - new Date(k.last_used_at).getTime()) < 3 * 60 * 1000),
    lastSeen,
    lockedStoreIds: sms.filter(k => k.store_id).map(k => k.store_id),
    hasGlobal: sms.some(k => !k.store_id)
  };
}
