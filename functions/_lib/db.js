import {d1SupershopSaveProduct,d1SupershopPostInvoice,d1SupershopAdjustStock,d1SupershopPostReturn,d1SupershopPostSupplierReturn,d1SupershopPostExchange} from './sshop_d1.js';

/* =====================================================================
   EMS dual database driver
   ---------------------------------------------------------------------
   One `db()` call shape for the whole API, switchable per deployment:

   · Supabase (Postgres via PostgREST)  — default
       env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
   · Cloudflare D1 (SQLite)             — opt-in
       env DB_DRIVER="d1" and a D1 binding named DB (see wrangler.toml)

   The D1 driver speaks the same PostgREST-style query strings the rest
   of the codebase already uses (eq/neq/gt/gte/lt/lte/is/in/like,
   select with parent embeds, order/limit/offset, upserts via
   on_conflict + Prefer: resolution=merge-duplicates) and emulates the
   handful of Postgres RPC functions the API relies on.
   ===================================================================== */

/* ---- column typing for SQLite (booleans / JSON / text[] live as TEXT/INT) ---- */
const BOOL_COLS = {
  administrators: ['active'], ems_owners: ['active'], stores: [],
  staff: ['active'], inventory_items: ['active'],
  clothing_products: ['active'], clothing_variants: ['active'],
  pharmacy_shelves: ['active'], pharmacy_products: ['prescription_required','tracks_batch','tracks_expiry','active'],
  pharmacy_product_units: ['allow_fractional','can_purchase','can_sell'], pharmacy_return_items: ['restocked','package_sealed'],
  supershop_products: ['active'], supershop_product_units: ['allow_fractional','can_purchase','can_sell'],
  supershop_alerts: [],
  license_plans: ['active', 'connectx_enabled', 'zudo_enabled', 'business_health_enabled', 'truebill_enabled'],
  licenses: ['connectx_enabled', 'zudo_enabled', 'business_health_enabled', 'truebill_enabled'],
  current_entitlements: ['connectx_enabled', 'zudo_enabled', 'business_health_enabled', 'truebill_enabled'],
  connectx_settings: ['id', 'enabled'], zudo_settings: ['id', 'enabled'],
  business_health_settings: ['id', 'enabled'], addon_checkout_settings: ['id'],
  addon_settings: ['enabled'], addon_coupons: ['active'],
  blog_posts: ['published'],
  helpdesk_messages: ['read_by_admin', 'read_by_owner'],
  staff_salary_invoices: ['attendance_based', 'add_outstanding', 'cut_advance'],
  connectx_devices: ['is_primary'],
  connectx_shop_sms_settings: ['enabled', 'auto_sale', 'auto_payment', 'auto_due_reminder', 'auto_return', 'auto_exchange', 'auto_refund'],
  app_store_apps: ['mandatory', 'published'],
};
const JSON_COLS = {
  staff: ['permissions'],
  api_keys: ['scopes'],
  activity_logs: ['metadata'], error_logs: ['context'],
  platform_settings: ['setting_value'], platform_activity_logs: ['metadata'],
  business_health_reports: ['snapshot'],
  connectx_shop_sms_settings: ['templates'],
  clothing_products: ['images', 'measurements'],
  clothing_variants: ['measurements'],
  clothing_size_profiles: ['sizes'],
  pharmacy_settings: ['categories'],
};
const ARRAY_COLS = {
  connectx_messages: ['to_emails', 'cc_emails', 'bcc_emails'],
};
/* business-code columns generated in Postgres by sequences */
const CODE_COLUMNS = {
  suppliers: { col: 'supplier_code', fmt: n => 'SUP-' + String(n).padStart(5, '0') },
  customers: { col: 'customer_code', fmt: n => 'CUS-' + String(n).padStart(6, '0') },
  expenses: { col: 'expense_code', fmt: n => 'EXP-' + String(n).padStart(5, '0') },
  inventory_items: { col: 'item_code', fmt: n => 'ITM-' + String(n).padStart(7, '0') },
};
const SERIAL_TABLES = new Set(['activity_logs', 'error_logs', 'platform_activity_logs', 'helpdesk_messages', 'truebill_scans', 'pharmacy_stock_movements']);
const BOOL_PK_TABLES = new Set(['zudo_settings', 'business_health_settings', 'connectx_settings', 'addon_checkout_settings']);
/* tables whose primary key is not a uuid `id` */
const NON_UUID_PK = new Set([...SERIAL_TABLES, ...BOOL_PK_TABLES, 'platform_settings', 'public_pages', 'addon_coupons', 'addon_settings', 'pharmacy_settings']);
/* timestamp-column presence (mirrors the SQLite schema) */
const HAS_UPDATED = new Set(['administrators', 'stores', 'staff', 'suppliers', 'customers', 'inventory_items', 'invoices', 'expenses',
  'ems_owners', 'license_plans', 'blog_posts', 'zudo_conversations', 'staff_salary_invoices', 'addon_checkout_settings', 'addon_settings',
  'connectx_settings', 'zudo_settings', 'business_health_settings', 'platform_settings', 'public_pages', 'current_entitlements', 'returns', 'exchanges', 'connectx_devices', 'connectx_shop_sms_settings', 'app_store_apps',
  'clothing_products', 'clothing_variants', 'clothing_size_profiles', 'pharmacy_settings', 'pharmacy_shelves', 'pharmacy_manufacturers', 'pharmacy_products', 'pharmacy_product_units', 'pharmacy_batches', 'pharmacy_alerts',
  'supershop_products', 'supershop_product_units', 'supershop_alerts']);
const NO_CREATED = new Set(['current_entitlements', 'zudo_settings', 'business_health_settings', 'connectx_settings',
  'addon_checkout_settings', 'platform_settings', 'public_pages', 'addon_settings',
  'device_logins', 'truebill_scans', 'invoice_lines']);
const UUID_DEFAULTS = { invoices: ['verification_token'], connectx_messages: ['idempotency_key'], returns: ['verification_token'], exchanges: ['verification_token'] };

/* parent embeds: resource joined through a local FK column */
const EMBEDS = {
  stores: { administrators: { table: 'administrators', fk: 'admin_id' } },
  licenses: {
    administrators: { table: 'administrators', fk: 'admin_id' },
    license_plans: { table: 'license_plans', fk: 'plan_id' },
  },
  addon_purchases: { administrators: { table: 'administrators', fk: 'admin_id' } },
  invoices: {
    stores: { table: 'stores', fk: 'store_id' },
    invoice_lines: { table: 'invoice_lines', fk: 'invoice_id', many: true,
      nested: { inventory_items: { table: 'inventory_items', fk: 'item_id' } } },
  },
  invoice_lines: {
    invoices: { table: 'invoices', fk: 'invoice_id' },
    inventory_items: { table: 'inventory_items', fk: 'item_id' },
  },
  returns: {
    stores: { table: 'stores', fk: 'store_id' },
    invoices: { table: 'invoices', fk: 'invoice_id' },
    customers: { table: 'customers', fk: 'customer_id' },
    return_items: { table: 'return_items', fk: 'return_id', many: true,
      nested: { inventory_items: { table: 'inventory_items', fk: 'item_id' } } },
    inventory_stock_movements: { table: 'inventory_stock_movements', fk: 'return_id', many: true,
      nested: { inventory_items: { table: 'inventory_items', fk: 'item_id' } } },
  },
  return_items: {
    returns: { table: 'returns', fk: 'return_id' },
    inventory_items: { table: 'inventory_items', fk: 'item_id' },
    invoice_lines: { table: 'invoice_lines', fk: 'invoice_line_id' },
  },
  exchanges: {
    stores: { table: 'stores', fk: 'store_id' },
    invoices: { table: 'invoices', fk: 'invoice_id' },
    customers: { table: 'customers', fk: 'customer_id' },
    exchange_items: { table: 'exchange_items', fk: 'exchange_id', many: true,
      nested: { inventory_items: { table: 'inventory_items', fk: 'item_id' } } },
    inventory_stock_movements: { table: 'inventory_stock_movements', fk: 'exchange_id', many: true,
      nested: { inventory_items: { table: 'inventory_items', fk: 'item_id' } } },
  },
  exchange_items: {
    exchanges: { table: 'exchanges', fk: 'exchange_id' },
    inventory_items: { table: 'inventory_items', fk: 'item_id' },
    invoice_lines: { table: 'invoice_lines', fk: 'invoice_line_id' },
  },
  inventory_stock_movements: {
    returns: { table: 'returns', fk: 'return_id' },
    exchanges: { table: 'exchanges', fk: 'exchange_id' },
    inventory_items: { table: 'inventory_items', fk: 'item_id' },
  },
};

export const isD1 = env => String(env.DB_DRIVER || '').toLowerCase() === 'd1' || (!env.SUPABASE_URL && !!env.DB);
export const dbConfigured = env => (isD1(env) ? !!env.DB : !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY));

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
const setOf = (table, map) => new Set(map[table] || []);
const nowIso = () => new Date().toISOString();

/* ============================ SUPABASE DRIVER ============================ */
async function supabaseDb(env, path, opt = {}) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, {
    ...opt,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, Prefer: 'return=representation', ...(opt.headers || {}) },
  });
  const x = await r.json().catch(() => null);
  if (!r.ok) throw Error(x?.message || 'Database request failed');
  return x;
}

/* ============================== D1 HELPERS ============================== */
async function d1Run(env, sql, params = []) {
  // .all() (not .run()) so INSERT/UPDATE ... RETURNING * actually carries rows.
  const r = await env.DB.prepare(sql).bind(...params).all();
  if (!r.success) throw Error(r.error || 'D1 write failed');
  return r;
}
async function d1All(env, sql, params = []) {
  const r = await env.DB.prepare(sql).bind(...params).all();
  if (!r.success) throw Error(r.error || 'D1 query failed');
  return r.results || [];
}

function decodeRow(table, row) {
  if (!row || typeof row !== 'object') return row;
  const bools = setOf(table, BOOL_COLS), json = setOf(table, JSON_COLS), arrays = setOf(table, ARRAY_COLS);
  for (const [k, v] of Object.entries(row)) {
    if (bools.has(k) && v !== null && v !== undefined) row[k] = v === 1 || v === true;
    else if (arrays.has(k)) { if (typeof v === 'string') { try { row[k] = JSON.parse(v); } catch { row[k] = []; } } if (row[k] == null) row[k] = []; }
    else if (json.has(k) && typeof v === 'string') { try { row[k] = JSON.parse(v); } catch { /* keep raw */ } }
  }
  return row;
}

function encodeValue(table, col, v, bools, json, arrays) {
  if (v === null || v === undefined) return null;
  if (bools.has(col)) return v ? 1 : 0;
  if (arrays.has(col) || json.has(col)) {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }
  return v;
}

/* PostgREST operand → SQL operator + bound value */
function operand(table, col, token, params) {
  const dot = token.indexOf('.');
  const op = dot === -1 ? 'eq' : token.slice(0, dot);
  let raw = dot === -1 ? token : token.slice(dot + 1);
  const bools = setOf(table, BOOL_COLS);
  const isBoolCol = bools.has(col);
  if (op === 'is') {
    if (raw === 'null') return ' IS NULL';
    return ' IS ' + (raw === 'true' ? 1 : 0);
  }
  if (op === 'in') {
    const vals = raw.slice(1, -1).split(',').map(s => s.trim()).filter(s => s !== '');
    if (!vals.length) return ' IN (NULL)';
    const ph = vals.map(v => { params.push(scalar(table, col, v, isBoolCol)); return '?'; }).join(',');
    return ' IN (' + ph + ')';
  }
  const ops = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'LIKE' };
  let sqlOp = ops[op] || '=';
  if (op === 'like' || op === 'ilike') raw = raw.replaceAll('*', '%');
  params.push(scalar(table, col, raw, isBoolCol));
  return ' ' + sqlOp + ' ?';
}
function scalar(table, col, raw, isBoolCol) {
  if (isBoolCol && (raw === 'true' || raw === 'false')) return raw === 'true' ? 1 : 0;
  if (raw === 'true') return 1; // settings id booleans
  if (raw === 'false') return 0;
  if (/(?:_code|_number|_id|_token|phone|phone2|user_id|shop_code)$/.test(col)) return String(raw);
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function parseSelect(selectParam) {
  const embeds = []; // {alias, table, fk, many, nested:{}}
  const re = /(?:([a-z_][\w]*):)?([a-z_][\w]*)(?:!([a-z_][\w]*))?\(([^()]*?(?:\([^()]*\)[^()]*?)*)\)/g;
  let m;
  while ((m = re.exec(selectParam || ''))) {
    const [, alias, resource, hint, innerRaw] = m;
    embeds.push({ alias: alias || resource, resource, hint, innerRaw, nested: {} });
  }
  return embeds;
}

function resolveEmbedConfig(table, resource, hint, env) {
  const local = EMBEDS[table] || {};
  if (local[resource]) return { key: resource, ...local[resource] };
  if (hint) {
    // e.g. licenses_admin_id_fkey  →  fk col admin_id
    const stripped = hint.replace(/_fkey$/, '');
    for (const [key, cfg] of Object.entries(local)) {
      if (stripped === table + '_' + cfg.fk) return { key, ...cfg };
    }
  }
  return null;
}

async function attachEmbeds(env, table, rows, selectParam) {
  if (!rows.length || !selectParam || !selectParam.includes('(')) return rows;
  const wanted = parseSelect(selectParam);
  for (const w of wanted) {
    const cfg = resolveEmbedConfig(table, w.resource, w.hint);
    if (!cfg) continue;
    const rel = cfg.table, fk = cfg.many ? cfg.fk : cfg.fk;
    if (cfg.many) {
      const parentVals = [...new Set(rows.map(r => r.id).filter(v => v != null))];
      let children = parentVals.length ? await d1All(env, `SELECT * FROM ${rel} WHERE ${fk} IN (${parentVals.map(() => '?').join(',')})`, parentVals) : [];
      children = children.map(r => decodeRow(rel, r));
      // Cost snapshots are server-side COGS data; never expose them through generic invoice embeds.
      if (rel === 'invoice_lines') children = children.map(({ cost_price, ...safe }) => safe);
      // nested embeds e.g. invoice_lines → inventory_items
      if (w.innerRaw && w.innerRaw.includes('(')) {
        const nestedWanted = parseSelect(w.innerRaw);
        for (const nw of nestedWanted) {
          const ncfg = (cfg.nested || {})[nw.resource] || (EMBEDS[rel] || {})[nw.resource];
          if (!ncfg) continue;
          const vals = [...new Set(children.map(c => c[ncfg.fk]).filter(v => v != null))];
          let refs = vals.length ? await d1All(env, `SELECT * FROM ${ncfg.table} WHERE id IN (${vals.map(() => '?').join(',')})`, vals) : [];
          refs = refs.map(r => decodeRow(ncfg.table, r));
          const map = new Map(refs.map(r => [r.id, r]));
          for (const c of children) c[nw.alias] = map.get(c[ncfg.fk]) || null;
        }
      }
      const groups = new Map();
      for (const c of children) { (groups.get(c[fk]) || groups.set(c[fk], []).get(c[fk])).push(c); }
      for (const r of rows) r[w.alias] = groups.get(r.id) || [];
    } else {
      const vals = [...new Set(rows.map(r => r[fk]).filter(v => v != null))];
      let refs = vals.length ? await d1All(env, `SELECT * FROM ${rel} WHERE id IN (${vals.map(() => '?').join(',')})`, vals) : [];
      refs = refs.map(r => decodeRow(rel, r));
      const map = new Map(refs.map(r => [r.id, r]));
      for (const r of rows) r[w.alias] = map.get(r[fk]) || null;
    }
  }
  return rows;
}

function buildWhere(table, params) {
  const sql = [], bind = [];
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
    const col = key;
    if (!/^[a-z_][\w]*$/.test(col)) continue;
    sql.push('"' + col + '"' + operand(table, col, value, bind));
  }
  return { clause: sql.length ? ' WHERE ' + sql.join(' AND ') : '', params: bind };
}

async function nextCode(env, table) {
  const cfg = CODE_COLUMNS[table];
  const rows = await d1All(env, `SELECT ${cfg.col} AS c FROM ${table}`);
  let max = 0;
  for (const r of rows) { const n = parseInt(String(r.c || '').replace(/\D/g, ''), 10); if (!isNaN(n) && n > max) max = n; }
  return cfg.fmt(max + 1);
}

function prepareInsert(table, body) {
  const bools = setOf(table, BOOL_COLS), json = setOf(table, JSON_COLS), arrays = setOf(table, ARRAY_COLS);
  const row = { ...body };
  if (row.id === undefined) {
    if (SERIAL_TABLES.has(table)) { /* integer autoincrement */ }
    else if (BOOL_PK_TABLES.has(table)) row.id = 1;
    else if (!NON_UUID_PK.has(table)) row.id = uuid();
  }
  if (row.created_at === undefined && !NO_CREATED.has(table)) row.created_at = nowIso();
  if (row.updated_at === undefined && HAS_UPDATED.has(table)) row.updated_at = nowIso();
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    out[k] = encodeValue(table, k, v, bools, json, arrays);
  }
  return out;
}

async function applyInsertDefaults(env, table, row) {
  const cfg = CODE_COLUMNS[table];
  if (cfg && (row[cfg.col] === undefined || row[cfg.col] === null || row[cfg.col] === '')) row[cfg.col] = await nextCode(env, table);
  for (const c of UUID_DEFAULTS[table] || []) if (row[c] === undefined) row[c] = uuid();
  if (table === 'connectx_messages' && row.idempotency_key === undefined) row.idempotency_key = uuid();
  return row;
}

async function d1Insert(env, table, bodyRaw) {
  let body = typeof bodyRaw === 'string' ? JSON.parse(bodyRaw) : bodyRaw;
  const bodies = Array.isArray(body) ? body : [body];
  const out = [];
  for (const b0 of bodies) {
    let row = prepareInsert(table, b0);
    await applyInsertDefaults(env, table, row);
    const cols = Object.keys(row);
    const sql = `INSERT INTO ${table} (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${cols.map(() => '?').join(',')}) RETURNING *`;
    const r = await d1Run(env, sql, cols.map(c => row[c]));
    if (r.results && r.results[0]) out.push(decodeRow(table, r.results[0]));
  }
  return out;
}

async function d1Upsert(env, table, conflictCols, bodyRaw) {
  const body = typeof bodyRaw === 'string' ? JSON.parse(bodyRaw) : bodyRaw;
  const bools = setOf(table, BOOL_COLS), json = setOf(table, JSON_COLS), arrays = setOf(table, ARRAY_COLS);
  const { clause, params } = buildWhere(table, new URLSearchParams(conflictCols.map(c => [c, 'eq.' + (body[c] === undefined ? 'null' : String(body[c]))])));
  const [existing] = await d1All(env, `SELECT * FROM ${table}${clause} LIMIT 1`, params);
  if (existing) {
    const sets = [], bind = [];
    for (const [k, v] of Object.entries(body)) {
      if (conflictCols.includes(k) || v === undefined) continue;
      sets.push('"' + k + '" = ?'); bind.push(encodeValue(table, k, v, bools, json, arrays));
    }
    if (!sets.length) return [decodeRow(table, existing)];
    if (HAS_UPDATED.has(table) && body.updated_at === undefined) { sets.push('"updated_at" = ?'); bind.push(nowIso()); }
    const where = conflictCols.map(c => '"' + c + '" = ?').join(' AND ');
    const cvals = conflictCols.map(c => encodeValue(table, c, body[c], bools, json, arrays));
    const r = await d1Run(env, `UPDATE ${table} SET ${sets.join(',')} WHERE ${where} RETURNING *`, [...bind, ...cvals]);
    return (r.results || []).map(x => decodeRow(table, x));
  }
  return d1Insert(env, table, body);
}

async function d1Update(env, table, search, bodyRaw) {
  const body = typeof bodyRaw === 'string' ? JSON.parse(bodyRaw) : bodyRaw;
  const bools = setOf(table, BOOL_COLS), json = setOf(table, JSON_COLS), arrays = setOf(table, ARRAY_COLS);
  const sets = [], bind = [];
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    sets.push('"' + k + '" = ?'); bind.push(encodeValue(table, k, v, bools, json, arrays));
  }
  if (HAS_UPDATED.has(table) && body.updated_at === undefined) { sets.push('"updated_at" = ?'); bind.push(nowIso()); }
  const { clause, params } = buildWhere(table, search);
  if (!clause) throw Error('Refusing to UPDATE without a filter');
  const r = await d1Run(env, `UPDATE ${table} SET ${sets.join(',')}${clause} RETURNING *`, [...bind, ...params]);
  return (r.results || []).map(x => decodeRow(table, x));
}
async function tableHasCol() { return false; }

async function d1Select(env, table, search) {
  const { clause, params } = buildWhere(table, search);
  let sql = `SELECT * FROM ${table}${clause}`;
  const order = search.get('order');
  if (order) {
    const parts = order.split(',').map(p => { const [c, dir] = p.trim().split('.'); return `"${c}" ${dir === 'asc' ? 'ASC' : 'DESC'}`; });
    sql += ' ORDER BY ' + parts.join(', ');
  }
  const limit = search.get('limit'), offset = search.get('offset');
  if (limit) sql += ' LIMIT ' + Number(limit);
  if (offset) sql += ' OFFSET ' + Number(offset);
  let rows = await d1All(env, sql, params);
  rows = rows.map(r => decodeRow(table, r));
  await attachEmbeds(env, table, rows, search.get('select'));
  return rows;
}

/* ============================ RPC EMULATION ============================ */
async function d1PharmacyDeleteProduct(env,p){
  const storeId=String(p.p_store_id||''),productId=String(p.p_product_id||'');
  if(!storeId||!productId)throw Error('Shop and medicine are required');
  const [product]=await d1All(env,`SELECT p.id,p.store_id,p.inventory_item_id,p.name,i.item_code AS sku,i.total_stock FROM pharmacy_products p JOIN inventory_items i ON i.id=p.inventory_item_id AND i.store_id=p.store_id WHERE p.id=? AND p.store_id=?`,[productId,storeId]);
  if(!product)throw Error('Medicine was not found in this shop');
  if(Math.abs(Number(product.total_stock||0))>0.0001)throw Error('Medicine has on-hand stock; deactivate it instead of deleting it');
  const checks=await Promise.all([
    d1All(env,'SELECT il.id FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id WHERE i.store_id=? AND il.item_id=? LIMIT 1',[storeId,product.inventory_item_id]),
    d1All(env,'SELECT invoice_line_id FROM pharmacy_invoice_lines WHERE store_id=? AND product_id=? LIMIT 1',[storeId,productId]),
    d1All(env,'SELECT id FROM pharmacy_stock_movements WHERE store_id=? AND product_id=? LIMIT 1',[storeId,productId]),
    d1All(env,'SELECT id FROM pharmacy_batches WHERE store_id=? AND product_id=? LIMIT 1',[storeId,productId]),
    d1All(env,'SELECT id FROM pharmacy_return_items WHERE store_id=? AND product_id=? LIMIT 1',[storeId,productId]),
    d1All(env,'SELECT id FROM inventory_stock_movements WHERE store_id=? AND item_id=? LIMIT 1',[storeId,product.inventory_item_id]),
  ]);
  if(checks.some(rows=>rows.length))throw Error('Medicine has stock or transaction history; deactivate it to keep the audit record');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM pharmacy_alerts WHERE store_id=? AND alert_key=?').bind(storeId,`low-stock:${productId}`),
    env.DB.prepare('DELETE FROM pharmacy_product_units WHERE store_id=? AND product_id=?').bind(storeId,productId),
    env.DB.prepare('DELETE FROM pharmacy_products WHERE id=? AND store_id=?').bind(productId,storeId),
    env.DB.prepare('DELETE FROM inventory_items WHERE id=? AND store_id=?').bind(product.inventory_item_id,storeId),
  ]);
  return {id:productId,name:product.name,sku:product.sku||null};
}

async function d1PharmacySaveProduct(env, p) {
  const storeId=String(p.p_store_id||''), productId=p.p_product_id||null, data=p.p_product||{}, units=Array.isArray(p.p_units)?p.p_units:[];
  const r2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100, r3=n=>Math.round((Number(n)+Number.EPSILON)*1000)/1000;
  const name=String(data.name||'').trim().slice(0,180), base=String(data.base_unit||'tablet').trim().toLowerCase(), now=nowIso();
  if(!storeId||!name)throw Error('Shop and medicine name are required');
  if(!units.length||units.length>50)throw Error('Add between 1 and 50 medicine units');
  const normalized=units.map(u=>({unit_label:String(u.unit_label||'').trim().toLowerCase().slice(0,60),factor_to_base:Number(u.factor_to_base),allow_fractional:!!u.allow_fractional,can_purchase:!!u.can_purchase,can_sell:!!u.can_sell,purchase_price:u.purchase_price==null||u.purchase_price===''?null:Number(u.purchase_price),selling_price:u.selling_price==null||u.selling_price===''?null:Number(u.selling_price)})).filter(u=>u.unit_label);
  if(!normalized.some(u=>u.unit_label===base&&u.factor_to_base===1))throw Error('Base unit must have a conversion factor of exactly 1');
  const seen=new Set();for(const u of normalized){if(seen.has(u.unit_label))throw Error('Unit labels must be unique');seen.add(u.unit_label);if(!(u.factor_to_base>0)||u.factor_to_base>1e9||![u.factor_to_base].every(Number.isFinite))throw Error('Each pack conversion must be a positive number');if((u.purchase_price!=null&&(!Number.isFinite(u.purchase_price)||u.purchase_price<0))||(u.selling_price!=null&&(!Number.isFinite(u.selling_price)||u.selling_price<0)))throw Error('Unit prices must be non-negative');}
  const sale=r2(data.sale_price),purchase=r2(data.purchase_price),wholesale=r2(data.wholesale_price??0),reorder=r3(data.reorder_threshold??5);
  if(![sale,purchase,wholesale,reorder].every(Number.isFinite)||sale<0||purchase<0||wholesale<0||reorder<0)throw Error('Prices and stock thresholds must be non-negative');
  const supplierId=data.supplier_id?String(data.supplier_id):null,locationId=data.default_location_id?String(data.default_location_id):null;
  if(supplierId){const [sup]=await d1All(env,'SELECT id FROM suppliers WHERE id=? AND store_id=?',[supplierId,storeId]);if(!sup)throw Error('Supplier must belong to this shop');}
  if(locationId){const [loc]=await d1All(env,'SELECT id FROM pharmacy_shelves WHERE id=? AND store_id=? AND active=1',[locationId,storeId]);if(!loc)throw Error('Default shelf must be active and belong to this shop');}
  let existing=null,item=null;
  if(productId){[existing]=await d1All(env,'SELECT * FROM pharmacy_products WHERE id=? AND store_id=?',[productId,storeId]);if(!existing)throw Error('Medicine was not found in this shop');[item]=await d1All(env,'SELECT * FROM inventory_items WHERE id=? AND store_id=?',[existing.inventory_item_id,storeId]);if(!item)throw Error('Linked inventory record was not found');}
  let sku=String(data.sku||'').trim().toUpperCase();if(!sku)sku=existing?.item_code||item?.item_code||('PH-'+crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase());
  if(!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(sku))throw Error('SKU may contain letters, numbers, dot, dash, or underscore');
  const description=[name,String(data.strength||'').trim(),String(data.dosage_form||'').trim()].filter(Boolean).join(' · ');
  if(existing&&(existing.base_unit!==base||item.item_code!==sku)){
    const [history]=await d1All(env,'SELECT invoice_line_id FROM pharmacy_invoice_lines WHERE product_id=? LIMIT 1',[productId]);
    if(Number(item.total_stock||0)>0||history)throw Error('SKU and base unit cannot be changed after stock or invoice history exists');
  }
  const id=productId||crypto.randomUUID(), itemId=existing?.inventory_item_id||crypto.randomUUID();
  const barcode=String(data.barcode||'').trim()||null,averageCost=existing&&Number(item?.total_stock||0)>0?Number(existing.average_cost_base??purchase):purchase;
  const product={id,store_id:storeId,inventory_item_id:itemId,name,generic_name:String(data.generic_name||'').trim()||null,brand:String(data.brand||'').trim()||null,
    strength:String(data.strength||'').trim()||null,dosage_form:String(data.dosage_form||'other').trim().toLowerCase(),category:String(data.category||'Medicine').trim().slice(0,100)||'Medicine',
    manufacturer:String(data.manufacturer||'').trim()||null,pack_size:String(data.pack_size||'').trim().slice(0,120)||null,supplier_id:supplierId,barcode,base_unit:base,purchase_price:purchase,average_cost_base:averageCost,sale_price:sale,wholesale_price:wholesale,reorder_threshold:reorder,
    default_location_id:locationId,prescription_required:!!data.prescription_required,tracks_batch:0,tracks_expiry:0,
    description:String(data.description||'').trim()||null,active:1,created_by:p.p_actor||null,created_at:existing?.created_at||now,updated_at:now};
  const itemRecord={id:itemId,store_id:storeId,item_code:sku,description,unit:base,sale_price:sale,total_stock:Number(item?.total_stock||0),active:1,created_at:item?.created_at||now,updated_at:now,category:product.category};
  const stmts=[];
  if(existing){
    stmts.push({sql:'UPDATE inventory_items SET item_code=?,description=?,unit=?,sale_price=?,active=1,updated_at=?,category=? WHERE id=? AND store_id=?',params:[sku,description,base,sale,now,product.category,itemId,storeId]});
    stmts.push({sql:'UPDATE pharmacy_products SET name=?,generic_name=?,brand=?,strength=?,dosage_form=?,category=?,manufacturer=?,pack_size=?,supplier_id=?,barcode=?,base_unit=?,purchase_price=?,average_cost_base=?,sale_price=?,wholesale_price=?,reorder_threshold=?,default_location_id=?,prescription_required=?,tracks_batch=0,tracks_expiry=0,description=?,active=1,updated_at=? WHERE id=? AND store_id=?',params:[product.name,product.generic_name,product.brand,product.strength,product.dosage_form,product.category,product.manufacturer,product.pack_size,supplierId,barcode,base,purchase,averageCost,sale,wholesale,reorder,locationId,product.prescription_required?1:0,product.description,now,id,storeId]});
  }else{
    stmts.push(insertStmt('inventory_items',[itemRecord]));
    stmts.push(insertStmt('pharmacy_products',[product]));
  }
  for(const u of normalized){
    stmts.push({sql:`INSERT INTO pharmacy_product_units(id,store_id,product_id,unit_label,factor_to_base,allow_fractional,can_purchase,can_sell,purchase_price,selling_price,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product_id,unit_label) DO UPDATE SET factor_to_base=excluded.factor_to_base,allow_fractional=excluded.allow_fractional,can_purchase=excluded.can_purchase,can_sell=excluded.can_sell,purchase_price=excluded.purchase_price,selling_price=excluded.selling_price,updated_at=excluded.updated_at`,
      params:[crypto.randomUUID(),storeId,id,u.unit_label,u.factor_to_base,u.allow_fractional?1:0,u.can_purchase?1:0,u.can_sell?1:0,u.purchase_price,u.selling_price,now,now]});
  }
  await env.DB.batch(stmts.map(x=>env.DB.prepare(x.sql).bind(...(x.params||[]))));
  return {id,inventory_item_id:itemId,sku};
}

async function d1PharmacyPostInvoice(env,p){
  const storeId=String(p.p_store_id||''),kind=String(p.p_kind||''),opKey=String(p.p_operation_key||''),lines=Array.isArray(p.p_lines)?p.p_lines:[];
  const r2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100,r3=n=>Math.round((Number(n)+Number.EPSILON)*1000)/1000;
  if(!storeId||!['sale','purchase'].includes(kind)||!opKey)throw Error('Shop, operation type and retry-safe operation key are required');
  if(!lines.length||lines.length>200)throw Error('Add 1 to 200 Pharmacy invoice lines');
  const [prior]=await d1All(env,'SELECT invoice_id,operation_type FROM pharmacy_operations WHERE store_id=? AND operation_key=?',[storeId,opKey]);
  if(prior){if(prior.operation_type!==kind||!prior.invoice_id)throw Error('This operation key is already in use');const [old]=await d1All(env,'SELECT * FROM invoices WHERE id=? AND store_id=?',[prior.invoice_id,storeId]);if(old)return decodeRow('invoices',old);throw Error('The earlier Pharmacy transaction could not be found');}
  const partyId=p.p_party_id?String(p.p_party_id):null;
  if(partyId){const table=kind==='sale'?'customers':'suppliers';const [party]=await d1All(env,`SELECT id FROM ${table} WHERE id=? AND store_id=?`,[partyId,storeId]);if(!party)throw Error((kind==='sale'?'Customer':'Supplier')+' does not belong to this shop');}
  const pay=String(p.p_payment_method||'cash').toLowerCase();if(!['cash','bank','bkash','nagad','other'].includes(pay))throw Error('Payment method is invalid');
  const prepared=[];let subtotal=0,lineTaxSum=0,lineDiscSum=0;const stockRunning=new Map();
  for(const raw of lines){
    const productId=String(raw.productId||''),unitLabel=String(raw.unitLabel||'').trim().toLowerCase(),qty=Number(raw.quantity),free=Number(raw.freeQuantity||0);
    if(!productId||!unitLabel||!(qty>0)||free<0||![qty,free].every(Number.isFinite))throw Error('Medicine, unit and valid quantities are required');
    if(kind==='sale'&&free>0)throw Error('Free quantity is only valid on a purchase');
    const [row]=await d1All(env,`SELECT p.*,i.item_code,i.total_stock,i.active AS item_active FROM pharmacy_products p JOIN inventory_items i ON i.id=p.inventory_item_id AND i.store_id=p.store_id WHERE p.id=? AND p.store_id=? AND p.active=1`,[productId,storeId]);
    if(!row||row.item_active===0)throw Error('Medicine is inactive or belongs to another shop');
    const [unit]=await d1All(env,'SELECT * FROM pharmacy_product_units WHERE product_id=? AND store_id=? AND lower(unit_label)=?',[productId,storeId,unitLabel]);
    if(!unit||(kind==='sale'&&!unit.can_sell)||(kind==='purchase'&&!unit.can_purchase))throw Error('Selected unit is not enabled for this operation');
    if(!unit.allow_fractional&&(qty!==Math.trunc(qty)||free!==Math.trunc(free)))throw Error('This medicine unit does not allow fractional quantities');
    const factor=Number(unit.factor_to_base),baseQty=r3(qty*factor),freeBase=r3(free*factor);
    if(!(factor>0)||!(baseQty>0))throw Error('Converted quantity must be greater than zero');
    let price=Number(raw.unitPrice);if(!Number.isFinite(price)||price<0)throw Error('Unit price must be non-negative');
    if(kind==='sale'&&!p.p_allow_price_override)price=unit.selling_price==null?Number(row.sale_price)*factor:Number(unit.selling_price);
    const taxPct=Number(raw.taxPercent||0),discount=r2(Number(raw.discount||0));
    if(!Number.isFinite(taxPct)||taxPct<0||!Number.isFinite(discount)||discount<0)throw Error('Tax and discount must be non-negative');
    const lsub=r2(qty*price),ltax=r2(lsub*taxPct/100);if(discount>lsub+ltax)throw Error('Line discount cannot exceed line value');
    const mrp=Number(raw.salePrice??row.sale_price);if(!Number.isFinite(mrp)||mrp<0)throw Error('MRP must be non-negative');
    if(!stockRunning.has(productId))stockRunning.set(productId,Number(row.total_stock||0));
    if(kind==='sale'){
      const after=r3(stockRunning.get(productId)-baseQty);if(after<0)throw Error('Insufficient Pharmacy stock; refresh and retry');stockRunning.set(productId,after);
    }else stockRunning.set(productId,r3(stockRunning.get(productId)+baseQty+freeBase));
    prepared.push({raw,row,unit,productId,unitLabel,qty,free,factor,baseQty,freeBase,price,taxPct,discount,lsub,ltax,mrp});
    subtotal+=lsub;lineTaxSum+=ltax;lineDiscSum+=discount;
  }
  const taxPct=Number(p.p_tax_percent||0),discount=r2(Number(p.p_discount||0)),paid=r2(Number(p.p_paid_amount||0));
  const tax=r2(subtotal*taxPct/100),total=r2(subtotal+lineTaxSum+tax-lineDiscSum-discount);
  if(!Number.isFinite(taxPct)||taxPct<0||discount<0||paid<0||paid>total)throw Error('Invoice tax, discount or paid amount is invalid');
  const now=nowIso(),invoiceId=crypto.randomUUID(),invoiceNo=String(p.p_invoice_number||''),invoiceDate=String(p.p_invoice_date||new Date().toISOString().slice(0,10));
  if(!invoiceNo||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(invoiceDate))throw Error('Invoice number and valid invoice date are required');
  const invoice={id:invoiceId,store_id:storeId,kind,invoice_number:invoiceNo,party_id:partyId,invoice_date:invoiceDate,payment_method:pay,transaction_id:p.p_transaction_id||null,notes:p.p_notes||null,
    subtotal:r2(subtotal),tax_percent:taxPct,discount,tax_amount:tax,line_tax_amount:r2(lineTaxSum),line_discount_amount:r2(lineDiscSum),paid_amount:paid,total_due:r2(total-paid),created_by:p.p_created_by||null,
    verification_token:crypto.randomUUID(),created_at:now,updated_at:now};
  const stmts=[insertStmt('invoices',[invoice])];
  for(const x of prepared){
    const lineId=crypto.randomUUID(),lineTotal=r2(x.lsub+x.ltax-x.discount),received=r3(x.baseQty+x.freeBase);
    if(kind==='sale'){
      stmts.push({sql:`INSERT INTO invoice_lines(id,invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price)
        VALUES(?,?,?,?,?,?,?,?,ROUND(COALESCE((SELECT average_cost_base FROM pharmacy_products WHERE id=? AND store_id=?),0)*?,2))`,
        params:[lineId,invoiceId,x.row.inventory_item_id,x.qty,x.price,lineTotal,x.taxPct,x.discount,x.productId,storeId,x.factor]});
      stmts.push({sql:`INSERT INTO pharmacy_invoice_lines(invoice_line_id,store_id,product_id,unit_label,unit_factor,quantity_base,free_quantity_base,unit_cost_base,mrp_per_base,created_at)
        SELECT ?,?,?,?, ?,?,0,COALESCE(p.average_cost_base,p.purchase_price,0),?,? FROM pharmacy_products p WHERE p.id=? AND p.store_id=?`,
        params:[lineId,storeId,x.productId,x.unitLabel,x.factor,x.baseQty,x.mrp,now,x.productId,storeId]});
      stmts.push({sql:'UPDATE inventory_items SET total_stock=total_stock-?,updated_at=? WHERE id=? AND store_id=?',params:[x.baseQty,now,x.row.inventory_item_id,storeId]});
      stmts.push({sql:`INSERT INTO pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        SELECT ?,?,NULL,'sale',?,total_stock+?,total_stock,'invoice',?,?,?, ?,? FROM inventory_items WHERE id=? AND store_id=?`,
        params:[storeId,x.productId,x.baseQty,x.baseQty,invoiceId,'Pharmacy POS '+invoiceNo,opKey+':sale:'+lineId,p.p_created_by||null,now,x.row.inventory_item_id,storeId]});
    }else{
      const incomingCost=x.qty*x.price;
      stmts.push(insertStmt('invoice_lines',[{id:lineId,invoice_id:invoiceId,item_id:x.row.inventory_item_id,quantity:x.qty,unit_price:x.price,line_total:lineTotal,tax_percent:x.taxPct,discount:x.discount,cost_price:x.price}]));
      stmts.push(insertStmt('pharmacy_invoice_lines',[{invoice_line_id:lineId,store_id:storeId,product_id:x.productId,unit_label:x.unitLabel,unit_factor:x.factor,quantity_base:received,free_quantity_base:x.freeBase,unit_cost_base:received>0?incomingCost/received:0,mrp_per_base:x.mrp,created_at:now}]));
      stmts.push({sql:`UPDATE pharmacy_products SET average_cost_base=ROUND(((SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?)*COALESCE(average_cost_base,purchase_price,0)+?)/NULLIF((SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?)+?,0),6),updated_at=? WHERE id=? AND store_id=?`,
        params:[x.row.inventory_item_id,storeId,incomingCost,x.row.inventory_item_id,storeId,received,now,x.productId,storeId]});
      stmts.push({sql:'UPDATE inventory_items SET total_stock=total_stock+?,updated_at=? WHERE id=? AND store_id=?',params:[received,now,x.row.inventory_item_id,storeId]});
      stmts.push({sql:`INSERT INTO pharmacy_stock_movements(store_id,product_id,batch_id,movement_type,quantity_base,stock_before,stock_after,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        SELECT ?,?,NULL,'purchase',?,total_stock-?,total_stock,'invoice',?,?,?, ?,? FROM inventory_items WHERE id=? AND store_id=?`,
        params:[storeId,x.productId,received,received,invoiceId,'Purchase receipt '+invoiceNo,opKey+':purchase:'+lineId,p.p_created_by||null,now,x.row.inventory_item_id,storeId]});
    }
  }
  stmts.push(insertStmt('pharmacy_operations',[{id:crypto.randomUUID(),store_id:storeId,operation_key:opKey,operation_type:kind,invoice_id:invoiceId,created_by:p.p_created_by||null,created_at:now}]));
  await env.DB.batch(stmts.map(x=>env.DB.prepare(x.sql).bind(...(x.params||[]))));
  const [created]=await d1All(env,'SELECT * FROM invoices WHERE id=? AND store_id=?',[invoiceId,storeId]);return decodeRow('invoices',created);
}

async function d1PharmacyIntakeReturn(env,p){
  const storeId=String(p.p_store_id||''),invoiceId=String(p.p_invoice_id||''),key=String(p.p_idempotency_key||''),items=Array.isArray(p.p_items)?p.p_items:[],now=nowIso();
  const r3=n=>Math.round((Number(n)+Number.EPSILON)*1000)/1000;
  if(!storeId||!invoiceId||!key||!items.length||items.length>100)throw Error('Shop, original invoice, idempotency key and 1–100 return lines are required');
  const [prior]=await d1All(env,'SELECT operation_type,result_id FROM pharmacy_operations WHERE store_id=? AND operation_key=?',[storeId,key]);
  if(prior){if(prior.operation_type!=='return'||!prior.result_id)throw Error('This operation key is already used');const [old]=await d1All(env,'SELECT * FROM pharmacy_returns WHERE id=? AND store_id=?',[prior.result_id,storeId]);if(old)return {...old,idempotent:true};throw Error('The earlier Pharmacy return could not be found');}
  const [invoice]=await d1All(env,"SELECT * FROM invoices WHERE id=? AND store_id=? AND kind='sale'",[invoiceId,storeId]);
  const [saleOp]=await d1All(env,"SELECT id FROM pharmacy_operations WHERE store_id=? AND invoice_id=? AND operation_type='sale'",[storeId,invoiceId]);
  if(!invoice||!saleOp)throw Error('Original invoice is not a Pharmacy sale in this shop');
  const id=crypto.randomUUID(),returnNumber=String(p.p_return_number||'').trim(),reason=String(p.p_reason||'').trim();
  if(!returnNumber||!reason)throw Error('Return number and reason are required');
  const customer=String(p.p_customer_name||'Walk-in customer').trim()||'Walk-in customer';
  const normalized=[];
  for(const raw of items){
    const lineId=String(raw.invoice_line_id||''),qty=r3(raw.quantity_base);
    if(!lineId||!(qty>0)||!Number.isFinite(qty))throw Error('Each return line needs a source sale line and positive quantity');
    const [link]=await d1All(env,`SELECT pil.product_id,pil.quantity_base FROM pharmacy_invoice_lines pil JOIN invoice_lines il ON il.id=pil.invoice_line_id WHERE pil.invoice_line_id=? AND pil.store_id=? AND il.invoice_id=?`,[lineId,storeId,invoiceId]);
    if(!link)throw Error('Return line is not linked to the original Pharmacy sale');
    const [returned]=await d1All(env,'SELECT COALESCE(SUM(ri.quantity_base),0) AS quantity FROM pharmacy_return_items ri JOIN pharmacy_returns pr ON pr.id=ri.return_id WHERE pr.store_id=? AND pr.invoice_id=? AND ri.invoice_line_id=?',[storeId,invoiceId,lineId]);
    if(qty>Number(link.quantity_base||0)-Number(returned?.quantity||0)+0.0001)throw Error('Return quantity exceeds the unreturned quantity from this Pharmacy sale');
    const [stock]=await d1All(env,'SELECT i.total_stock FROM pharmacy_products p JOIN inventory_items i ON i.id=p.inventory_item_id WHERE p.id=? AND p.store_id=?',[link.product_id,storeId]);
    if(!stock)throw Error('Linked Pharmacy stock record was not found');
    normalized.push({lineId,productId:link.product_id,qty,stock:Number(stock.total_stock||0)});
  }
  const returnRow={id,store_id:storeId,invoice_id:invoiceId,return_number:returnNumber,customer_name:customer,return_date:new Date().toISOString().slice(0,10),return_type:'return',amount:0,refund_method:'none',disposition:'quarantined',reason,notes:String(p.p_notes||'').trim()||null,idempotency_key:key,created_by:p.p_created_by||null,created_at:now};
  const stmts=[insertStmt('pharmacy_returns',[returnRow])];
  for(const x of normalized){
    stmts.push(insertStmt('pharmacy_return_items',[{id:crypto.randomUUID(),return_id:id,store_id:storeId,invoice_line_id:x.lineId,product_id:x.productId,batch_id:null,quantity_base:x.qty,condition:'quarantined',reason,amount:0,restocked:0,created_at:now}]));
    stmts.push(insertStmt('pharmacy_stock_movements',[{store_id:storeId,product_id:x.productId,batch_id:null,movement_type:'customer_return_intake',quantity_base:x.qty,stock_before:x.stock,stock_after:x.stock,reference_type:'pharmacy_return',reference_id:id,reason,idempotency_key:key+':intake:'+x.lineId,created_by:p.p_created_by||null,created_at:now}]));
  }
  stmts.push(insertStmt('pharmacy_operations',[{id:crypto.randomUUID(),store_id:storeId,operation_key:key,operation_type:'return',invoice_id:invoiceId,result_id:id,created_by:p.p_created_by||null,created_at:now}]));
  await env.DB.batch(stmts.map(x=>env.DB.prepare(x.sql).bind(...(x.params||[]))));
  return returnRow;
}

async function d1PharmacyReleaseReturn(env,p){
  throw Error('Pharmacy customer returns remain quarantined; aggregate stock release is not enabled under the approved policy');
}

async function d1Rpc(env, name, bodyRaw) {
  const b = bodyRaw ? (typeof bodyRaw === 'string' ? JSON.parse(bodyRaw) : bodyRaw) : {};
  if(name==='pharmacy_delete_product')return d1PharmacyDeleteProduct(env,b);
  if(name==='pharmacy_save_product')return d1PharmacySaveProduct(env,b);
  if(name==='pharmacy_post_invoice')return d1PharmacyPostInvoice(env,b);
  if(name==='pharmacy_intake_return')return d1PharmacyIntakeReturn(env,b);
  if(name==='pharmacy_release_return')return d1PharmacyReleaseReturn(env,b);
  if(name==='supershop_save_product')return d1SupershopSaveProduct(env,b);
  if(name==='supershop_post_invoice')return d1SupershopPostInvoice(env,b);
  if(name==='supershop_adjust_stock')return d1SupershopAdjustStock(env,b);
  if(name==='supershop_post_return')return d1SupershopPostReturn(env,b);
  if(name==='supershop_post_supplier_return')return d1SupershopPostSupplierReturn(env,b);
  if(name==='supershop_post_exchange')return d1SupershopPostExchange(env,b);

  if (name === 'next_ems_invoice_number' || name === 'peek_ems_invoice_number') {
    const kind = b.p_kind, prefix = kind === 'sale' ? 'SAL-' : 'PUR-';
    const rows = await d1All(env, `SELECT invoice_number FROM invoices WHERE kind=?`, [kind]);
    let max = 0;
    for (const r of rows) { const n = parseInt(String(r.invoice_number || '').replace(/\D/g, ''), 10); if (!isNaN(n) && n > max) max = n; }
    if (name === 'peek_ems_invoice_number') return prefix + String(max + 1).padStart(6, '0');
    const seq = await d1All(env, `SELECT value FROM _sequences WHERE name=?`, [kind]);
    let next = Math.max(max + 1, (seq[0]?.value || 0) + 1);
    await d1Run(env, `INSERT INTO _sequences(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value`, [kind, next]);
    return prefix + String(next).padStart(6, '0');
  }

  if (name === 'cshop_adjust_stock') {
    const p = b, delta = Number(p.p_delta), storeId = p.p_store_id, itemId = p.p_item_id;
    if (!Number.isFinite(delta) || delta === 0) throw Error('Stock adjustment must be a non-zero number');
    const validTypes = new Set(['adjustment', 'damaged', 'reconciliation', 'purchase_return', 'opening']);
    if (!validTypes.has(p.p_movement_type)) throw Error('Invalid stock movement type');
    const [variant] = await d1All(env, 'SELECT id FROM clothing_variants WHERE store_id=? AND inventory_item_id=?', [storeId, itemId]);
    if (!variant) throw Error('Clothing variant does not belong to this shop');
    const [beforeRow] = await d1All(env, 'SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?', [itemId, storeId]);
    if (!beforeRow) throw Error('Inventory item not found in this shop');
    const before = Number(beforeRow.total_stock || 0), after = before + delta;
    if (after < 0) throw Error('This adjustment would make stock negative');
    const now = nowIso();
    const changed = await d1Run(env, 'UPDATE inventory_items SET total_stock=total_stock+?,updated_at=? WHERE id=? AND store_id=? AND total_stock+?>=0 RETURNING *', [delta, now, itemId, storeId, delta]);
    const updated = changed.results?.[0];
    if (!updated) throw Error('Stock changed while this adjustment was being saved. Please retry.');
    const actualAfter = Number(updated.total_stock || 0), actualBefore = actualAfter - delta;
    try {
      await d1Insert(env, 'inventory_stock_movements', {
        store_id: storeId, item_id: itemId, movement_type: p.p_movement_type,
        quantity: Math.abs(delta), stock_before: actualBefore, stock_after: actualAfter,
        condition: p.p_condition || 'good', notes: p.p_notes || null, created_by: p.p_created_by || null,
      });
    } catch (err) {
      await d1Run(env, 'UPDATE inventory_items SET total_stock=total_stock-?,updated_at=? WHERE id=? AND store_id=? AND total_stock=?', [delta, nowIso(), itemId, storeId, actualAfter]).catch(() => {});
      throw err;
    }
    return { item_id: itemId, stock_before: actualBefore, stock_after: actualAfter, delta };
  }

  if (name === 'cshop_post_purchase_return') {
    const p=b, storeId=p.p_store_id, invoiceId=p.p_invoice_id, rows=Array.isArray(p.p_items)?p.p_items:[];
    if(!storeId||!invoiceId||!p.p_return_number||!String(p.p_reason||'').trim()||!rows.length)throw Error('Purchase invoice, return number, reason and items are required');
    const [invoice]=await d1All(env,"SELECT id,store_id,kind,party_id,invoice_number,total_due FROM invoices WHERE id=? AND store_id=? AND kind='purchase'",[invoiceId,storeId]);
    if(!invoice)throw Error('Purchase invoice does not belong to this shop');
    const grouped=new Map();
    for(const x of rows){const lineId=String(x.invoice_line_id||''),qty=Number(x.quantity);if(!lineId||!(qty>0)||!Number.isFinite(qty))throw Error('Return quantities must be positive');grouped.set(lineId,(grouped.get(lineId)||0)+qty)}
    const items=[];let total=0;
    for(const [lineId,quantity] of [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
      const [line]=await d1All(env,`SELECT il.id,il.item_id,il.quantity AS purchased,il.unit_price,i.total_stock,cv.id AS variant_id FROM invoice_lines il JOIN inventory_items i ON i.id=il.item_id AND i.store_id=? JOIN clothing_variants cv ON cv.inventory_item_id=i.id AND cv.store_id=? WHERE il.id=? AND il.invoice_id=?`,[storeId,storeId,lineId,invoiceId]);
      if(!line)throw Error('Purchase line is not a Clothing variant in this shop');
      const [returned]=await d1All(env,'SELECT COALESCE(SUM(ri.quantity),0) AS quantity FROM clothing_purchase_return_items ri JOIN clothing_purchase_returns r ON r.id=ri.return_id WHERE r.store_id=? AND ri.invoice_line_id=?',[storeId,lineId]);
      if(quantity>Number(line.purchased)-Number(returned?.quantity||0))throw Error('Return quantity exceeds the unreturned quantity on the purchase invoice');
      if(quantity>Number(line.total_stock||0))throw Error('Insufficient variant stock to return to the supplier');
      const unitCost=Number(line.unit_price||0),amount=Math.round(quantity*unitCost*100)/100;
      total+=amount;items.push({invoice_line_id:lineId,item_id:line.item_id,variant_id:line.variant_id,quantity,unit_cost:unitCost,total_amount:amount,stock_before:Number(line.total_stock||0)});
    }
    total=Math.round(total*100)/100;
    const returnId=crypto.randomUUID(),returnDate=p.p_return_date||new Date().toISOString().slice(0,10),now=nowIso(),movementIds=[],oldDue=Number(invoice.total_due||0),newDue=Math.max(0,oldDue-total);
    const statements=[env.DB.prepare('INSERT INTO clothing_purchase_returns(id,store_id,purchase_invoice_id,supplier_id,return_number,return_date,total_return_amount,reason,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(returnId,storeId,invoiceId,invoice.party_id||null,p.p_return_number,returnDate,total,String(p.p_reason).trim(),p.p_notes||null,p.p_created_by||null)];
    const updateIndexes=[];
    for(const x of items){
      updateIndexes.push(statements.length);
      statements.push(env.DB.prepare('UPDATE inventory_items SET total_stock=total_stock-?,updated_at=? WHERE id=? AND store_id=? AND total_stock>=? RETURNING total_stock').bind(x.quantity,now,x.item_id,storeId,x.quantity));
      statements.push(env.DB.prepare('INSERT INTO clothing_purchase_return_items(id,return_id,invoice_line_id,item_id,variant_id,quantity,unit_cost,total_amount) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),returnId,x.invoice_line_id,x.item_id,x.variant_id,x.quantity,x.unit_cost,x.total_amount));
      const movementId=crypto.randomUUID();movementIds.push(movementId);
      statements.push(env.DB.prepare("INSERT INTO inventory_stock_movements(id,store_id,item_id,movement_type,quantity,stock_before,stock_after,condition,notes,created_by) VALUES(?,?,?,'purchase_return',?,?,?,?,?,?)").bind(movementId,storeId,x.item_id,x.quantity,x.stock_before,x.stock_before-x.quantity,'returned_to_supplier',`Purchase return ${p.p_return_number}`,p.p_created_by||null));
    }
    const dueIndex=statements.length;
    statements.push(env.DB.prepare('UPDATE invoices SET total_due=MAX(0,total_due-?),updated_at=? WHERE id=? AND store_id=? RETURNING total_due').bind(total,now,invoiceId,storeId));
    let results;
    try{
      results=await env.DB.batch(statements);
      const failed=updateIndexes.some(i=>!results?.[i]?.results?.length)||!results?.[dueIndex]?.results?.length;
      if(failed)throw Error('Stock or invoice balance changed while posting the supplier return. Please refresh and retry.');
    }catch(err){
      for(let i=0;i<items.length;i++){
        const changed=results?.[updateIndexes[i]]?.results?.[0];
        if(changed)await d1Run(env,'UPDATE inventory_items SET total_stock=total_stock+?,updated_at=? WHERE id=? AND store_id=?',[items[i].quantity,nowIso(),items[i].item_id,storeId]).catch(()=>{});
      }
      if(results?.[dueIndex]?.results?.length)await d1Run(env,'UPDATE invoices SET total_due=?,updated_at=? WHERE id=? AND store_id=? AND total_due=?',[oldDue,nowIso(),invoiceId,storeId,newDue]).catch(()=>{});
      await d1Run(env,'DELETE FROM clothing_purchase_returns WHERE id=?',[returnId]).catch(()=>{});
      if(movementIds.length)await d1Run(env,`DELETE FROM inventory_stock_movements WHERE id IN (${movementIds.map(()=>'?').join(',')})`,movementIds).catch(()=>{});
      throw err;
    }
    return {id:returnId,store_id:storeId,purchase_invoice_id:invoiceId,return_number:p.p_return_number,return_date:returnDate,total_return_amount:total,reason:String(p.p_reason).trim(),notes:p.p_notes||null};
  }

  if (name === 'cshop_transfer_stock') {
    const p = b, qty = Number(p.p_quantity), sourceStore = p.p_source_store_id, targetStore = p.p_target_store_id;
    if (!(qty > 0) || !Number.isFinite(qty) || sourceStore === targetStore) throw Error('Choose a different target shop and a positive quantity');
    const shops = await d1All(env, 'SELECT id,admin_id,shop_type FROM stores WHERE id IN (?,?)', [sourceStore, targetStore]);
    const sourceShop = shops.find(x => x.id === sourceStore), targetShop = shops.find(x => x.id === targetStore);
    if (!sourceShop || !targetShop || sourceShop.admin_id !== targetShop.admin_id || sourceShop.shop_type !== 'clothing' || targetShop.shop_type !== 'clothing') {
      throw Error('Stock can only move between Clothing shops owned by the same administrator');
    }
    const [sourceVariant] = await d1All(env, 'SELECT id FROM clothing_variants WHERE id=? AND store_id=? AND inventory_item_id=? AND active=1', [p.p_source_variant_id, sourceStore, p.p_source_item_id]);
    const [targetVariant] = await d1All(env, 'SELECT id FROM clothing_variants WHERE id=? AND store_id=? AND inventory_item_id=? AND active=1', [p.p_target_variant_id, targetStore, p.p_target_item_id]);
    if (!sourceVariant || !targetVariant) throw Error('Source or target variant was not found');
    const [sourceRow] = await d1All(env, 'SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?', [p.p_source_item_id, sourceStore]);
    const [targetRow] = await d1All(env, 'SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?', [p.p_target_item_id, targetStore]);
    if (!sourceRow || !targetRow) throw Error('Source or target inventory item was not found');
    const sourceBefore = Number(sourceRow.total_stock || 0), targetBefore = Number(targetRow.total_stock || 0);
    if (sourceBefore < qty) throw Error('Insufficient stock for transfer');
    const now = nowIso();
    const sourceUpdated = await d1Run(env, 'UPDATE inventory_items SET total_stock=total_stock-?,updated_at=? WHERE id=? AND store_id=? AND total_stock>=? RETURNING *', [qty, now, p.p_source_item_id, sourceStore, qty]);
    const sourceAfterRow = sourceUpdated.results?.[0];
    if (!sourceAfterRow) throw Error('Stock changed while transfer was being saved. Please retry.');
    const sourceAfter = Number(sourceAfterRow.total_stock || 0);
    const targetUpdated = await d1Run(env, 'UPDATE inventory_items SET total_stock=total_stock+?,updated_at=? WHERE id=? AND store_id=? RETURNING *', [qty, now, p.p_target_item_id, targetStore]);
    const targetAfterRow = targetUpdated.results?.[0];
    if (!targetAfterRow) {
      await d1Run(env, 'UPDATE inventory_items SET total_stock=total_stock+?,updated_at=? WHERE id=? AND store_id=? AND total_stock=?', [qty, nowIso(), p.p_source_item_id, sourceStore, sourceAfter]).catch(() => {});
      throw Error('Target stock could not be updated. Please retry.');
    }
    const targetAfter = Number(targetAfterRow.total_stock || 0), movementIds = [crypto.randomUUID(), crypto.randomUUID()], transferId = crypto.randomUUID();
    try {
      await d1Insert(env, 'inventory_stock_movements', [
        { id: movementIds[0], store_id: sourceStore, item_id: p.p_source_item_id, movement_type: 'transfer_out', quantity: qty, stock_before: sourceBefore, stock_after: sourceAfter, condition: 'transferred', notes: p.p_notes || null, created_by: p.p_created_by || null },
        { id: movementIds[1], store_id: targetStore, item_id: p.p_target_item_id, movement_type: 'transfer_in', quantity: qty, stock_before: targetBefore, stock_after: targetAfter, condition: 'transferred', notes: p.p_notes || null, created_by: p.p_created_by || null },
      ]);
      await d1Insert(env, 'clothing_stock_transfers', {
        id: transferId, source_store_id: sourceStore, target_store_id: targetStore, source_variant_id: p.p_source_variant_id,
        target_variant_id: p.p_target_variant_id, quantity: qty, notes: p.p_notes || null, created_by: p.p_created_by || null,
      });
    } catch (err) {
      await d1Run(env, 'DELETE FROM inventory_stock_movements WHERE id IN (?,?)', movementIds).catch(() => {});
      await d1Run(env, 'DELETE FROM clothing_stock_transfers WHERE id=?', [transferId]).catch(() => {});
      await d1Run(env, 'UPDATE inventory_items SET total_stock=total_stock-?,updated_at=? WHERE id=? AND store_id=? AND total_stock=?', [qty, nowIso(), p.p_target_item_id, targetStore, targetAfter]).catch(() => {});
      await d1Run(env, 'UPDATE inventory_items SET total_stock=total_stock+?,updated_at=? WHERE id=? AND store_id=? AND total_stock=?', [qty, nowIso(), p.p_source_item_id, sourceStore, sourceAfter]).catch(() => {});
      throw err;
    }
    return { quantity: qty, source_stock: sourceAfter, target_stock: targetAfter };
  }

  if (name === 'post_invoice') {
    const p = b;
    if (!['purchase', 'sale'].includes(p.p_kind) || !Array.isArray(p.p_lines) || !p.p_lines.length) throw Error('Invoice type and at least one line are required');
    const r2 = n => Math.round(n * 100) / 100;
    const lines = p.p_lines;
    let subtotal = 0, lineTaxSum = 0, lineDiscSum = 0;
    for (const ln of lines) {
      const qty = Number(ln.quantity), price = Number(ln.unitPrice);
      const lt = Number(ln.taxPercent || 0), ld = r2(Number(ln.discount || 0));
      if (!(qty > 0) || price < 0 || lt < 0 || ld < 0) throw Error('Invalid item quantity, price, VAT, or discount');
      const item = await d1All(env, `SELECT * FROM inventory_items WHERE id=? AND store_id=?`, [ln.itemId, p.p_store_id]);
      if (!item[0]) throw Error('Inventory item does not belong to this shop');
      if (p.p_kind === 'sale' && Number(item[0].total_stock) < qty) throw Error('Insufficient stock for item ' + item[0].item_code);
      const lsub = qty * price, ltax = r2(lsub * lt / 100);
      if (ld > lsub + ltax) throw Error('Item discount cannot exceed the item total for ' + item[0].item_code);
      subtotal += lsub; lineTaxSum += ltax; lineDiscSum += ld;
    }
    const tax = r2(subtotal * Number(p.p_tax_percent || 0) / 100);
    const discount = Number(p.p_discount || 0), paid = Number(p.p_paid_amount || 0);
    const total = subtotal + tax + lineTaxSum - discount - lineDiscSum;
    if (paid > total) throw Error('Paid amount cannot exceed invoice total');
    const invId = uuid(), now = nowIso();
    const inv = {
      id: invId, store_id: p.p_store_id, kind: p.p_kind, invoice_number: p.p_invoice_number, party_id: p.p_party_id || null,
      invoice_date: p.p_invoice_date, payment_method: p.p_payment_method || 'cash', transaction_id: p.p_transaction_id || null,
      notes: p.p_notes || null, subtotal: r2(subtotal), tax_percent: Number(p.p_tax_percent || 0), discount, tax_amount: tax,
      paid_amount: paid, total_due: r2(total - paid), line_tax_amount: r2(lineTaxSum), line_discount_amount: r2(lineDiscSum),
      created_by: p.p_created_by || null,
      verification_token: uuid(), created_at: now, updated_at: now,
    };
    const stmts = [insertStmt('invoices', [inv])];
    for (const ln of lines) {
      const qty = Number(ln.quantity), price = Number(ln.unitPrice);
      const lt = Number(ln.taxPercent || 0), ld = r2(Number(ln.discount || 0));
      const lsub = qty * price;
      stmts.push(insertStmt('invoice_lines', [{
        id: uuid(), invoice_id: invId, item_id: ln.itemId, quantity: qty, unit_price: price,
        tax_percent: lt, discount: ld, line_total: r2(lsub + r2(lsub * lt / 100) - ld),
      }]));
      stmts.push({ sql: `UPDATE inventory_items SET total_stock=total_stock+?, updated_at=? WHERE id=?`, params: [p.p_kind === 'purchase' ? qty : -qty, now, ln.itemId] });
    }
    await env.DB.batch(stmts.map(s=>env.DB.prepare(s.sql).bind(...(s.params||[]))));
    const [row] = await d1All(env, `SELECT * FROM invoices WHERE id=?`, [invId]);
    return decodeRow('invoices', row);
  }

  if (name === 'delete_posted_invoice') {
    const [inv] = await d1All(env, `SELECT * FROM invoices WHERE id=? AND store_id=?`, [b.p_invoice_id, b.p_store_id]);
    if (!inv) throw Error('Invoice not found');
    const [ret] = await d1All(env, `SELECT id FROM returns WHERE invoice_id=? LIMIT 1`, [inv.id]);
    if (ret) throw Error('Cannot delete invoice: it has associated sales returns.');
    const [exc] = await d1All(env, `SELECT id FROM exchanges WHERE invoice_id=? LIMIT 1`, [inv.id]);
    if (exc) throw Error('Cannot delete invoice: it has associated sales exchanges.');
    const lines = await d1All(env, `SELECT * FROM invoice_lines WHERE invoice_id=?`, [inv.id]);
    const stmts = [];
    for (const ln of lines) {
      if (inv.kind === 'purchase') {
        const [it] = await d1All(env, `SELECT total_stock FROM inventory_items WHERE id=?`, [ln.item_id]);
        if (it && Number(it.total_stock) < Number(ln.quantity)) throw Error('Cannot delete purchase invoice: stock for this item has already been sold or adjusted');
      }
      stmts.push({ sql: `UPDATE inventory_items SET total_stock=total_stock+?, updated_at=? WHERE id=?`, params: [inv.kind === 'purchase' ? -Number(ln.quantity) : Number(ln.quantity), nowIso(), ln.item_id] });
    }
    stmts.push({ sql: `DELETE FROM invoices WHERE id=?`, params: [inv.id] });
    await env.DB.batch(stmts.map(s=>env.DB.prepare(s.sql).bind(...(s.params||[]))));
    return null;
  }

  if (name === 'apply_current_entitlement') {
    const [lic] = await d1All(env, `SELECT * FROM licenses WHERE id=?`, [b.p_license_id]);
    if (!lic) throw Error('License not found');
    const nowDate = new Date();
    if (lic.status !== 'active' || (lic.starts_at && new Date(lic.starts_at) > nowDate) || !lic.expires_at || new Date(lic.expires_at) <= nowDate) throw Error('Only a currently valid active license can be applied');
    const now = nowIso();
    await d1Run(env, `INSERT INTO current_entitlements
      (admin_id,current_license_id,shop_limit,connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,business_health_enabled,business_health_daily_limit,truebill_enabled,vaultium_gb,status,starts_at,expires_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(admin_id) DO UPDATE SET current_license_id=excluded.current_license_id,shop_limit=excluded.shop_limit,
      connectx_enabled=excluded.connectx_enabled,connectx_daily_limit=excluded.connectx_daily_limit,zudo_enabled=excluded.zudo_enabled,zudo_daily_limit=excluded.zudo_daily_limit,
      business_health_enabled=excluded.business_health_enabled,business_health_daily_limit=excluded.business_health_daily_limit,truebill_enabled=excluded.truebill_enabled,vaultium_gb=excluded.vaultium_gb,
      status='active',starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at`,
      [lic.admin_id, lic.id, lic.max_stores, lic.connectx_enabled | 0, lic.connectx_daily_limit || 0, lic.zudo_enabled | 0, lic.zudo_daily_limit || 0,
       lic.business_health_enabled | 0, lic.business_health_daily_limit || 0, lic.truebill_enabled | 0, Number(lic.vaultium_gb || 0), 'active', lic.starts_at, lic.expires_at, now]);
    const shops = await d1All(env, `SELECT id,status FROM stores WHERE admin_id=? ORDER BY created_at ASC,id ASC`, [lic.admin_id]);
    let n = 0;
    for (const shop of shops) { n++; const status=shop.status==='inactive'?'inactive':(n <= lic.max_stores ? 'active' : 'read_only'); await d1Run(env, `UPDATE stores SET status=?, updated_at=? WHERE id=?`, [status, now, shop.id]); }
    return null;
  }

  if (name === 'factory_reset_ems') {
    const children = ['clothing_purchase_return_items', 'clothing_purchase_returns', 'clothing_stock_transfers', 'clothing_size_profiles', 'clothing_variants', 'clothing_products',
      'exchange_items', 'exchanges', 'return_items', 'returns', 'inventory_stock_movements',
      'api_keys', 'invoice_lines', 'staff_salary_invoices', 'attendance', 'device_logins', 'activity_logs', 'error_logs',
      'due_recoveries', 'business_health_reports', 'zudo_messages', 'zudo_conversations', 'connectx_messages', 'connectx_sms_messages', 'connect_connections', 'connect_requests', 'connect_identity', 'helpdesk_messages',
      'truebill_scans', 'vaultium_files', 'invoices', 'inventory_items', 'expenses', 'staff', 'suppliers', 'customers', 'stores',
      'addon_purchases', 'addon_coupons', 'addon_settings', 'addon_checkout_settings', 'blog_posts', 'contact_messages', 'public_pages',
      'current_entitlements', 'licenses', 'license_plans', 'platform_activity_logs', 'platform_settings',
      'business_health_settings', 'zudo_settings', 'connectx_settings', 'administrators', 'ems_owners'];
    for (const t of children) { try { await d1Run(env, `DELETE FROM ${t}`); } catch { /* table may be empty */ } }
    try { await d1Run(env, `DELETE FROM _sequences`); } catch { /* optional table */ }
    await d1Run(env, `INSERT INTO platform_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)`, ['branding', JSON.stringify({ product_name: 'EMS', powered_by: 'Dexter Studio', website_name: 'EMS', public_base_url: '' }), nowIso()]);
    await d1Run(env, `INSERT INTO addon_checkout_settings(id,updated_at) VALUES(1,?) ON CONFLICT(id) DO NOTHING`, [nowIso()]);
    const addons = [
      ['connectx', 'ConnectX', 'Send business emails through EMS.', 2, 7, 365, 10, 500],
      ['zudo', 'Zudo AI', 'Read-only AI assistant for your shop.', 2, 7, 365, 10, 500],
      ['business_health', 'AI Business Health', 'Business-health reports from your data.', 2, 7, 365, 1, 50],
      ['truebill', 'TrueBill', 'Put a scannable QR code on every invoice so customers can verify authenticity.', 2, 30, 365, 1, 1],
      ['vaultium', 'Vaultium', 'Secure cloud file storage for invoices and expense documents (GB).', 0, 1, 365, 1, 100],
    ];
    for (const a of addons) { await d1Run(env, `INSERT INTO addon_settings(addon_key,title,details,unit_price,min_days,max_days,min_daily_limit,max_daily_limit,enabled,updated_at) VALUES(?,?,?,?,?,?,?,?,0,?) ON CONFLICT(addon_key) DO NOTHING`, [...a, nowIso()]); }
    const pages = [['about', 'About EMS'], ['terms', 'Terms & Conditions'], ['contact', 'Contact Us']];
    for (const [slug, title] of pages) { await d1Run(env, `INSERT INTO public_pages(slug,title,body,updated_at) VALUES(?,?,?,?) ON CONFLICT(slug) DO NOTHING`, [slug, title, '', nowIso()]); }
    return null;
  }

  throw Error('Unknown RPC: ' + name);
}

function insertStmt(table, rows) {
  const cols = Object.keys(rows[0]);
  return {
    sql: `INSERT INTO ${table} (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    params: cols.map(c => rows[0][c]),
  };
}

/* ================================ ENTRY ================================ */
export async function db(env, path, opt = {}) {
  if (!isD1(env)) return supabaseDb(env, path, opt);

  const qIndex = path.indexOf('?');
  const head = qIndex === -1 ? path : path.slice(0, qIndex);
  const search = new URLSearchParams(qIndex === -1 ? '' : path.slice(qIndex + 1));

  /* RPC */
  if (head.startsWith('rpc/')) {
    const name = head.slice(4);
    return d1Rpc(env, name, opt.body);
  }

  const segments = head.split('/');
  const table = segments[0];
  if (!/^[a-z_][\w]*$/.test(table)) throw Error('Invalid table name');
  const method = (opt.method || 'GET').toUpperCase();

  if (method === 'GET') return d1Select(env, table, search);

  if (method === 'POST') {
    const conflict = search.get('on_conflict');
    if (conflict) return d1Upsert(env, table, conflict.split(','), opt.body);
    return d1Insert(env, table, opt.body);
  }
  if (method === 'PATCH') {
    if (segments[1]) search.set('id', 'eq.' + segments[1]);
    return d1Update(env, table, search, opt.body);
  }
  if (method === 'DELETE') {
    if (segments[1]) search.set('id', 'eq.' + segments[1]);
    const { clause, params } = buildWhere(table, search);
    if (!clause) throw Error('Refusing to DELETE without a filter');
    // Match Supabase's Prefer: return=representation. In particular, a
    // conditional SMS cancellation must know whether it actually deleted a
    // queued job or lost a race to another gateway's claim.
    const r = await d1Run(env, `DELETE FROM ${table}${clause} RETURNING *`, params);
    return (r.results || []).map(row => decodeRow(table, row));
  }
  throw Error('Unsupported method ' + method);
}
