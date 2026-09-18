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
  license_plans: ['active', 'connectx_enabled', 'zudo_enabled', 'business_health_enabled', 'truebill_enabled'],
  licenses: ['connectx_enabled', 'zudo_enabled', 'business_health_enabled', 'truebill_enabled'],
  current_entitlements: ['connectx_enabled', 'zudo_enabled', 'business_health_enabled', 'truebill_enabled'],
  connectx_settings: ['id', 'enabled'], zudo_settings: ['id', 'enabled'],
  business_health_settings: ['id', 'enabled'], addon_checkout_settings: ['id'],
  addon_settings: ['enabled'], addon_coupons: ['active'],
  blog_posts: ['published'],
  helpdesk_messages: ['read_by_admin', 'read_by_owner'],
  staff_salary_invoices: ['attendance_based', 'add_outstanding', 'cut_advance'],
};
const JSON_COLS = {
  staff: ['permissions'],
  activity_logs: ['metadata'], error_logs: ['context'],
  platform_settings: ['setting_value'], platform_activity_logs: ['metadata'],
  business_health_reports: ['snapshot'],
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
const SERIAL_TABLES = new Set(['activity_logs', 'error_logs', 'platform_activity_logs', 'helpdesk_messages', 'truebill_scans']);
const BOOL_PK_TABLES = new Set(['zudo_settings', 'business_health_settings', 'connectx_settings', 'addon_checkout_settings']);
/* tables whose primary key is not a uuid `id` */
const NON_UUID_PK = new Set([...SERIAL_TABLES, ...BOOL_PK_TABLES, 'platform_settings', 'public_pages', 'addon_coupons', 'addon_settings']);
/* timestamp-column presence (mirrors the SQLite schema) */
const HAS_UPDATED = new Set(['administrators', 'stores', 'staff', 'suppliers', 'customers', 'inventory_items', 'invoices', 'expenses',
  'ems_owners', 'license_plans', 'blog_posts', 'zudo_conversations', 'staff_salary_invoices', 'addon_checkout_settings', 'addon_settings',
  'connectx_settings', 'zudo_settings', 'business_health_settings', 'platform_settings', 'public_pages', 'current_entitlements']);
const NO_CREATED = new Set(['current_entitlements', 'zudo_settings', 'business_health_settings', 'connectx_settings',
  'addon_checkout_settings', 'platform_settings', 'public_pages', 'addon_settings',
  'device_logins', 'truebill_scans', 'invoice_lines']);
const UUID_DEFAULTS = { invoices: ['verification_token'], connectx_messages: ['idempotency_key'] };

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
  if (op === 'ilike') raw = raw; // SQLite LIKE is case-insensitive for ASCII; good enough for codes
  params.push(scalar(table, col, raw, isBoolCol));
  return ' ' + sqlOp + ' ?';
}
function scalar(table, col, raw, isBoolCol) {
  if (isBoolCol && (raw === 'true' || raw === 'false')) return raw === 'true' ? 1 : 0;
  if (raw === 'true') return 1; // settings id booleans
  if (raw === 'false') return 0;
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
async function d1Rpc(env, name, bodyRaw) {
  const b = bodyRaw ? (typeof bodyRaw === 'string' ? JSON.parse(bodyRaw) : bodyRaw) : {};

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
    const shops = await d1All(env, `SELECT id FROM stores WHERE admin_id=? ORDER BY created_at ASC`, [lic.admin_id]);
    let n = 0;
    for (const shop of shops) { n++; await d1Run(env, `UPDATE stores SET status=?, updated_at=? WHERE id=?`, [n <= lic.max_stores ? 'active' : 'read_only', now, shop.id]); }
    return null;
  }

  if (name === 'factory_reset_ems') {
    const children = ['invoice_lines', 'staff_salary_invoices', 'attendance', 'device_logins', 'activity_logs', 'error_logs',
      'due_recoveries', 'business_health_reports', 'zudo_messages', 'zudo_conversations', 'connectx_messages', 'helpdesk_messages',
      'truebill_scans', 'vaultium_files', 'invoices', 'inventory_items', 'expenses', 'staff', 'suppliers', 'customers', 'stores',
      'addon_purchases', 'addon_coupons', 'addon_settings', 'addon_checkout_settings', 'blog_posts', 'contact_messages', 'public_pages',
      'current_entitlements', 'licenses', 'license_plans', 'platform_activity_logs', 'platform_settings',
      'business_health_settings', 'zudo_settings', 'connectx_settings', 'administrators', 'ems_owners'];
    for (const t of children) { try { await d1Run(env, `DELETE FROM ${t}`); } catch { /* table may be empty */ } }
    try { await d1Run(env, `DELETE FROM _sequences`); } catch { /* optional table */ }
    await d1Run(env, `INSERT INTO platform_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)`, ['branding', JSON.stringify({ product_name: 'EMS V1', powered_by: 'DoxTox', website_name: 'EMS V1', public_base_url: '' }), nowIso()]);
    await d1Run(env, `INSERT INTO addon_checkout_settings(id,updated_at) VALUES(1,?) ON CONFLICT(id) DO NOTHING`, [nowIso()]);
    const addons = [
      ['connectx', 'ConnectX', 'Send business emails through EMS.', 2, 7, 365, 10, 500],
      ['zudo', 'Zudo AI', 'Read-only AI assistant for your shop.', 2, 7, 365, 10, 500],
      ['business_health', 'AI Business Health', 'Business-health reports from your data.', 2, 7, 365, 1, 50],
      ['truebill', 'TrueBill', 'Put a scannable QR code on every invoice so customers can verify authenticity.', 2, 30, 365, 1, 1],
      ['vaultium', 'Vaultium', 'Secure cloud file storage for invoices and expense documents (GB).', 0, 1, 365, 1, 100],
    ];
    for (const a of addons) { await d1Run(env, `INSERT INTO addon_settings(addon_key,title,details,unit_price,min_days,max_days,min_daily_limit,max_daily_limit,enabled,updated_at) VALUES(?,?,?,?,?,?,?,?,0,?) ON CONFLICT(addon_key) DO NOTHING`, [...a, nowIso()]); }
    const pages = [['about', 'About EMS V1'], ['terms', 'Terms & Conditions'], ['contact', 'Contact Us']];
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
    await d1Run(env, `DELETE FROM ${table}${clause}`, params);
    return [];
  }
  throw Error('Unsupported method ' + method);
}
