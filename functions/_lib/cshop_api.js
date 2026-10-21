import { db } from './db.js';

const UNITS = new Set(['pcs', 'pair', 'set', 'dozen', 'meter', 'yard']);
const SIZE_SYSTEMS = new Set(['alpha', 'numeric', 'waist', 'chest', 'kids-age', 'shoe', 'one-size', 'custom']);
const nowIso = () => new Date().toISOString();
const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const bad = (message, status = 400) => ok({ error: message }, status);
const trim = (v, max = 240) => String(v ?? '').trim().slice(0, max);
const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const r3 = v => Math.round((Number(v) + Number.EPSILON) * 1000) / 1000;
const r4 = v => Math.round((Number(v) + Number.EPSILON) * 10000) / 10000;
const code = v => trim(v, 80).toUpperCase();
const token = v => trim(v, 80).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) || 'ONE';
const norm = v => trim(v, 120).toLocaleLowerCase();
const dateOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && Number.isFinite(new Date(v + 'T00:00:00Z').getTime());
const idIn = ids => `in.(${[...new Set(ids)].join(',')})`;
const write = (env, table, data, method = 'POST') => db(env, table, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const parsedBody = async request => { try { return await request.json(); } catch { return {}; } };

async function storeFor(env, storeId) {
  const [store] = await db(env, `stores?id=eq.${storeId}&select=id,admin_id,name,shop_code,status,shop_type,low_stock_threshold`);
  return store?.shop_type === 'clothing' ? store : null;
}
async function variantRows(env, storeId, activeOnly = false) {
  const [products, variants] = await Promise.all([
    db(env, `clothing_products?store_id=eq.${storeId}&select=*&order=name.asc`),
    db(env, `clothing_variants?store_id=eq.${storeId}${activeOnly ? '&active=is.true' : ''}&select=*&order=created_at.asc`),
  ]);
  if (!variants.length) return [];
  const itemIds = [...new Set(variants.map(v => v.inventory_item_id).filter(Boolean))];
  const items = itemIds.length ? await db(env, `inventory_items?id=${idIn(itemIds)}&store_id=eq.${storeId}&select=*`) : [];
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const itemMap = Object.fromEntries(items.map(i => [i.id, i]));
  return variants.map(v => {
    const item = itemMap[v.inventory_item_id] || {};
    const product = productMap[v.product_id] || null;
    return {
      ...v, product, item,
      item_id: v.inventory_item_id, item_code: item.item_code || v.variant_sku,
      description: item.description || '', unit: item.unit || product?.unit || 'pcs',
      stock: num(item.total_stock), total_stock: num(item.total_stock),
      sale_price: num(v.sale_price ?? item.sale_price), cost_price: num(v.cost_price),
      active: v.active !== false && item.active !== false && product?.active !== false,
    };
  });
}
function cleanImages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map(x => trim(x, 600)).filter(x => /^https:\/\//i.test(x));
}
function cleanMeasurements(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const unit = value.unit === 'in' ? 'in' : 'cm';
  const out = { unit };
  for (const key of ['chest', 'bust', 'waist', 'hip', 'shoulder', 'sleeve', 'length']) {
    if (value[key] === '' || value[key] == null) continue;
    const n = Number(value[key]);
    if (!Number.isFinite(n) || n < 0 || n > 5000) throw Error(`Invalid ${key} measurement.`);
    out[key] = Math.round(n * 10) / 10;
  }
  return out;
}
function validateProduct(body, storeId) {
  const name = trim(body.name, 160), style = code(body.style_code), category = trim(body.category, 80);
  const unit = trim(body.unit || 'pcs', 12), purchaseUnit = trim(body.purchase_unit || unit, 12);
  const conversion = r4(num(body.purchase_to_stock, 1)), cost = r2(num(body.cost_price)), sell = r2(num(body.sale_price)), reorder = r3(num(body.reorder_threshold));
  if (!name || !style || !category) throw Error('Product name, style code, and category are required.');
  if (!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(style)) throw Error('Style code may contain letters, numbers, dot, dash, or underscore.');
  if (!UNITS.has(unit) || !UNITS.has(purchaseUnit)) throw Error('Choose a supported stock and purchase unit.');
  if (!(conversion > 0) || conversion > 100000) throw Error('Purchase conversion must be greater than zero.');
  if (cost < 0 || sell < 0 || reorder < 0 || ![cost, sell, reorder].every(Number.isFinite)) throw Error('Prices and reorder thresholds must be non-negative numbers.');
  return {
    store_id: storeId, name, style_code: style, category,
    brand: trim(body.brand, 120) || null, supplier_id: body.supplier_id || null,
    description: trim(body.description, 2000) || null, unit, purchase_unit: purchaseUnit,
    purchase_to_stock: conversion, cost_price: cost, sale_price: sell,
    reorder_threshold: reorder, images: cleanImages(body.images),
    measurements: cleanMeasurements(body.measurements), active: body.active !== false,
  };
}
function normalizeVariantRows(body, product) {
  if (!Array.isArray(body.variants) || body.variants.length < 1 || body.variants.length > 250) throw Error('Add between 1 and 250 size/color variants.');
  const seen = new Set(), seenSku = new Set(), seenBarcode = new Set();
  return body.variants.map((raw, index) => {
    const size = trim(raw.size_label, 60) || null, color = trim(raw.color, 60) || null;
    const matrix = `${norm(size)}\u001f${norm(color)}`;
    if (seen.has(matrix)) throw Error('Each size/color combination must be unique.');
    seen.add(matrix);
    const sizeSystem = trim(raw.size_system || 'alpha', 24);
    if (!SIZE_SYSTEMS.has(sizeSystem)) throw Error(`Unsupported sizing system on variant ${index + 1}.`);
    const sku = code(raw.sku || `${product.style_code}-${token(size)}-${token(color)}`);
    if (!sku || seenSku.has(sku)) throw Error('Variant SKUs must be present and unique within this product.');
    seenSku.add(sku);
    const barcode = trim(raw.barcode, 80) || null;
    if (barcode && seenBarcode.has(barcode)) throw Error('Barcodes must be unique within this product.');
    if (barcode) seenBarcode.add(barcode);
    const cost = r2(num(raw.cost_price, product.cost_price)), sell = r2(num(raw.sale_price, product.sale_price)), reorder = r3(num(raw.reorder_threshold, product.reorder_threshold));
    const opening = r3(num(raw.opening_quantity));
    if (![cost, sell, reorder, opening].every(Number.isFinite) || cost < 0 || sell < 0 || reorder < 0 || opening < 0 || opening > 1e9) throw Error(`Invalid price, quantity, or reorder threshold on ${sku}.`);
    return {
      id: raw.id ? trim(raw.id, 80) : null, size_label: size, color,
      size_system: size ? sizeSystem : null, variant_sku: sku, barcode,
      cost_price: cost, sale_price: sell, reorder_threshold: reorder,
      measurements: cleanMeasurements(raw.measurements), active: raw.active !== false,
      opening_quantity: opening,
    };
  });
}
async function validateSupplier(env, storeId, supplierId) {
  if (!supplierId) return null;
  if (!isUuid(supplierId)) throw Error('Supplier ID is invalid.');
  const [supplier] = await db(env, `suppliers?id=eq.${encodeURIComponent(supplierId)}&store_id=eq.${storeId}&select=id`);
  if (!supplier) throw Error('Supplier must belong to this shop.');
  return supplier.id;
}
async function insertVariant(env, storeId, product, v, actorId, createdItemIds) {
  const description = [product.name, v.color, v.size_label].filter(Boolean).join(' · ');
  const [item] = await write(env, 'inventory_items', {
    store_id: storeId, item_code: v.variant_sku, description,
    unit: product.unit, sale_price: v.sale_price, total_stock: 0, active: v.active,
    category: product.category,
  });
  if (!item?.id) throw Error('Could not create the linked EMS inventory item.');
  createdItemIds.push(item.id);
  const [variant] = await write(env, 'clothing_variants', {
    store_id: storeId, product_id: product.id, inventory_item_id: item.id,
    size_label: v.size_label, size_system: v.size_system, color: v.color,
    variant_sku: v.variant_sku, barcode: v.barcode, cost_price: v.cost_price,
    sale_price: v.sale_price, reorder_threshold: v.reorder_threshold,
    measurements: v.measurements, active: v.active,
  });
  if (!variant?.id) throw Error('Could not create the clothing variant.');
  if (v.opening_quantity > 0) await db(env, 'rpc/cshop_adjust_stock', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ p_store_id: storeId, p_item_id: item.id, p_delta: v.opening_quantity,
      p_movement_type: 'opening', p_condition: 'good', p_notes: 'Opening stock from product setup', p_created_by: actorId || null }),
  });
  return variant;
}
function validateDateRange(url) {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = url.searchParams.get('startDate') || today.slice(0, 8) + '01';
  const endDate = url.searchParams.get('endDate') || today;
  if (!dateOk(startDate) || !dateOk(endDate) || startDate > endDate) throw Error('Choose a valid start and end date.');
  return { startDate, endDate };
}
async function overview(env, storeId, url) {
  const { startDate, endDate } = validateDateRange(url);
  const filter = `store_id=eq.${storeId}`;
  const [variants, sales, purchases, expenses, salesReturns, purchaseReturns, exchanges] = await Promise.all([
    variantRows(env, storeId),
    db(env, `invoices?${filter}&kind=eq.sale&invoice_date=gte.${startDate}&invoice_date=lte.${endDate}&select=*`),
    db(env, `invoices?${filter}&kind=eq.purchase&invoice_date=gte.${startDate}&invoice_date=lte.${endDate}&select=*`),
    db(env, `expenses?${filter}&expense_date=gte.${startDate}&expense_date=lte.${endDate}&select=id,total,due,paid,expense_date`),
    db(env, `returns?${filter}&return_date=gte.${startDate}&return_date=lte.${endDate}&select=*`),
    db(env, `clothing_purchase_returns?${filter}&return_date=gte.${startDate}&return_date=lte.${endDate}&select=*`),
    db(env, `exchanges?${filter}&exchange_date=gte.${startDate}&exchange_date=lte.${endDate}&status=eq.completed&select=*`),
  ]);
  const itemMap = Object.fromEntries(variants.map(v => [v.inventory_item_id, v]));
  const saleIds = sales.map(x => x.id), returnIds = salesReturns.map(x => x.id), exchangeIds = exchanges.map(x => x.id);
  const [saleLines, returnLines, exchangeLines] = await Promise.all([
    saleIds.length ? db(env, `invoice_lines?invoice_id=${idIn(saleIds)}&select=*`) : [],
    returnIds.length ? db(env, `return_items?return_id=${idIn(returnIds)}&select=*`) : [],
    exchangeIds.length ? db(env, `exchange_items?exchange_id=${idIn(exchangeIds)}&select=*`) : [],
  ]);
  const linesByInvoice = new Map();
  for (const line of saleLines) { const a = linesByInvoice.get(line.invoice_id) || []; a.push(line); linesByInvoice.set(line.invoice_id, a); }
  const salesGross = sales.reduce((n, x) => n + num(x.subtotal) + num(x.tax_amount) + num(x.line_tax_amount) - num(x.discount) - num(x.line_discount_amount), 0);
  const purchaseGross = purchases.reduce((n, x) => n + num(x.subtotal) + num(x.tax_amount) + num(x.line_tax_amount) - num(x.discount) - num(x.line_discount_amount), 0);
  const returnedValue = salesReturns.reduce((n, x) => n + num(x.total_return_amount), 0);
  const exchangeNet = exchanges.reduce((n, x) => n + num(x.new_items_total) - num(x.returned_total), 0);
  const salesRevenue = salesGross - returnedValue + exchangeNet;
  const salesDue = sales.reduce((n, x) => n + num(x.total_due), 0);
  const purchaseDue = purchases.reduce((n, x) => n + num(x.total_due), 0);
  const expenseTotal = expenses.reduce((n, x) => n + num(x.total), 0);
  const purchaseReturnsTotal = purchaseReturns.reduce((n, x) => n + num(x.total_return_amount), 0);
  const purchaseTotal = Math.max(0, purchaseGross - purchaseReturnsTotal);
  let grossProfit = 0, itemsSold = 0;
  const productTotals = new Map(), sizeTotals = new Map(), colorTotals = new Map();
  const aggregate = (itemId, qty, revenue, profit) => {
    const variant = itemMap[itemId];
    if (!variant) return;
    const product = variant.product || {};
    const p = productTotals.get(product.id) || { name: product.name || 'Product', style_code: product.style_code || '', quantity: 0, revenue: 0, profit: 0 };
    p.quantity += qty; p.revenue += revenue; p.profit += profit; productTotals.set(product.id, p);
    const size = variant.size_label || 'Unspecified'; sizeTotals.set(size, (sizeTotals.get(size) || 0) + qty);
    const color = variant.color || 'Unspecified'; colorTotals.set(color, (colorTotals.get(color) || 0) + qty);
    itemsSold += qty;
  };
  for (const invoice of sales) {
    const lines = linesByInvoice.get(invoice.id) || [];
    const gross = lines.reduce((n, x) => n + num(x.quantity) * num(x.unit_price), 0);
    for (const line of lines) {
      const variant = itemMap[line.item_id]; if (!variant) continue;
      const qty = num(line.quantity), raw = qty * num(line.unit_price), lineDiscount = num(line.discount);
      const invoiceDiscount = gross > 0 ? num(invoice.discount) * raw / gross : 0;
      const revenue = raw - lineDiscount - invoiceDiscount;
      const snapshotCost = line.cost_price == null ? num(variant.cost_price) : num(line.cost_price);
      const profit = revenue - qty * snapshotCost;
      grossProfit += profit;
      aggregate(line.item_id, qty, revenue, profit);
    }
  }
  for (const line of returnLines) {
    const variant = itemMap[line.item_id]; if (!variant) continue;
    const qty = num(line.quantity), amount = num(line.return_amount);
    const recoveredCost = String(line.condition || '').toLowerCase() === 'sellable' ? qty * num(variant.cost_price) : 0;
    const profit = -amount + recoveredCost;
    grossProfit += profit;
    aggregate(line.item_id, -qty, -amount, profit);
  }
  for (const line of exchangeLines) {
    const variant = itemMap[line.item_id]; if (!variant) continue;
    const qty = num(line.quantity), amount = num(line.total_amount);
    if (line.item_type === 'new') {
      const profit = amount - qty * num(variant.cost_price); grossProfit += profit; aggregate(line.item_id, qty, amount, profit);
    } else {
      const recoveredCost = String(line.condition || '').toLowerCase() === 'sellable' ? qty * num(variant.cost_price) : 0;
      const profit = -amount + recoveredCost; grossProfit += profit; aggregate(line.item_id, -qty, -amount, profit);
    }
  }
  const bestSellingProducts = [...productTotals.values()].filter(x => x.quantity > 0).sort((a, b) => b.quantity - a.quantity).slice(0, 10).map(x => ({ ...x, quantity: Math.round(x.quantity * 1000) / 1000, revenue: Math.round(x.revenue * 100) / 100, profit: Math.round(x.profit * 100) / 100 }));
  const rank = map => [...map.entries()].filter(([, quantity]) => quantity > 0).map(([name, quantity]) => ({ name, quantity: Math.round(quantity * 1000) / 1000 })).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  const bestSellingSizes = rank(sizeTotals).map(x => ({ size: x.name, quantity: x.quantity }));
  const bestSellingColors = rank(colorTotals).map(x => ({ color: x.name, quantity: x.quantity }));
  const productCount = new Set(variants.map(v => v.product_id).filter(Boolean)).size;
  const variantCount = variants.length;
  const activeVariantCount = variants.filter(v => v.active).length;
  const stockUnits = variants.reduce((n, v) => n + num(v.stock), 0);
  const stockValue = variants.reduce((n, v) => n + num(v.stock) * num(v.cost_price), 0);
  const lowStockVariants = variants.filter(v => v.active && num(v.stock) <= num(v.reorder_threshold)).map(v => ({
    ...v, product_name: v.product?.name || '', style_code: v.product?.style_code || '',
  }));
  return {
    startDate, endDate, productCount, variantCount, activeVariantCount,
    salesRevenue: Math.round(salesRevenue * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    stockValue: Math.round(stockValue * 100) / 100, stockUnits: Math.round(stockUnits * 1000) / 1000,
    stockUnitLabel: 'stock units', itemsSold: Math.round(itemsSold * 1000) / 1000,
    lowStockCount: lowStockVariants.length, lowStockVariants,
    bestSellingProducts, bestSellingSizes, bestSellingColors,
    purchaseTotal: Math.round(purchaseTotal * 100) / 100,
    purchaseDue: Math.round(purchaseDue * 100) / 100,
    salesDue: Math.round(salesDue * 100) / 100,
    expenseTotal: Math.round(expenseTotal * 100) / 100,
    purchaseReturnsTotal: Math.round(purchaseReturnsTotal * 100) / 100,
    salesCount: sales.length, purchaseCount: purchases.length,
    salesReturnsCount: salesReturns.length, purchaseReturnsCount: purchaseReturns.length,
    exchangeCount: exchanges.length,
  };
}
export function scopeClothingOverview(data, access = {}) {
  const result = { ...data };
  if (access.report) return result;
  const remove = (...keys) => keys.forEach(key => delete result[key]);
  if (!access.sales) {
    remove('salesRevenue', 'grossProfit', 'itemsSold', 'salesDue', 'salesCount', 'bestSellingProducts', 'bestSellingSizes', 'bestSellingColors');
  } else if (!access.inventory) {
    remove('grossProfit', 'bestSellingProducts', 'bestSellingSizes', 'bestSellingColors');
  }
  if (!access.inventory) remove('productCount', 'variantCount', 'activeVariantCount', 'stockValue', 'stockUnits', 'stockUnitLabel', 'lowStockCount', 'lowStockVariants');
  if (!access.purchase) remove('purchaseTotal', 'purchaseDue', 'purchaseReturnsTotal', 'purchaseCount', 'purchaseReturnsCount');
  if (!access.expense) remove('expenseTotal');
  if (!access.returns) remove('salesReturnsCount', 'exchangeCount');
  return result;
}

async function audit(env, s, action, entity, entityId, metadata = {}) {
  try {
    await db(env, 'activity_logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      store_id: s.storeId, actor_type: s.adminAccess ? 'admin' : (s.role || 'staff'), actor_id: s.id || null,
      action, entity_type: entity, entity_id: entityId || null, metadata,
    }) });
  } catch (e) { console.error('CShop audit failed:', e); }
}

export async function clothingApi({ env, s, path, method, request, allowed }) {
  if (!path.startsWith('clothing/')) return null;
  if (!s?.storeId) return bad('Shop access required.', 403);
  const store = await storeFor(env, s.storeId);
  if (!store) return bad('This route is available only to Clothing shops.', 403);
  const storeId = store.id;
  const can = (section, action = 'view') => allowed(s, section, action);
  const requirePermission = (section, action) => can(section, action) ? null : bad('Permission denied.', 403);

  if (path === 'clothing/overview' && method === 'GET') {
    const report = new URL(request.url).searchParams.get('report') === 'true';
    if (report && !can('report', 'view')) return bad('Permission denied.', 403);
    if (!report && !can('dashboard', 'view') && !can('report', 'view')) return bad('Permission denied.', 403);
    const reportAccess = report || can('report', 'view');
    const access = {
      report: reportAccess,
      sales: reportAccess || can('sales', 'view'),
      inventory: reportAccess || can('inventory', 'view'),
      purchase: reportAccess || can('purchase', 'view'),
      returns: reportAccess || can('returns_refunds', 'view'),
      expense: reportAccess || can('expense', 'view'),
    };
    try {
      const data = await overview(env, storeId, new URL(request.url));
      return ok(scopeClothingOverview(data, access));
    } catch (e) { return bad(e.message || 'Could not load clothing metrics.', 400); }
  }

  if (path === 'clothing/activity' && method === 'GET') {
    const access = {
      sales: can('sales', 'view'), purchases: can('purchase', 'view'),
      returns: can('returns_refunds', 'view'), expenses: can('expense', 'view'),
      inventory: can('inventory', 'view'),
    };
    if (!Object.values(access).some(Boolean)) return bad('Permission denied.', 403);
    const filter = `store_id=eq.${storeId}`;
    const query = path => db(env, path).catch(() => []);
    try {
      const [sales, purchases, returns, exchanges, purchaseReturns, expenses, logs] = await Promise.all([
        access.sales ? query(`invoices?${filter}&kind=eq.sale&select=id,invoice_number,subtotal,tax_amount,line_tax_amount,discount,line_discount_amount,created_at,invoice_date&order=created_at.desc&limit=6`) : [],
        access.purchases ? query(`invoices?${filter}&kind=eq.purchase&select=id,invoice_number,subtotal,tax_amount,line_tax_amount,discount,line_discount_amount,created_at,invoice_date&order=created_at.desc&limit=6`) : [],
        access.returns ? query(`returns?${filter}&select=id,return_number,total_return_amount,created_at,return_date&order=created_at.desc&limit=5`) : [],
        access.returns ? query(`exchanges?${filter}&status=eq.completed&select=id,exchange_number,difference_amount,new_items_total,created_at,exchange_date&order=created_at.desc&limit=5`) : [],
        access.purchases ? query(`clothing_purchase_returns?${filter}&select=id,return_number,total_return_amount,created_at,return_date&order=created_at.desc&limit=4`) : [],
        access.expenses ? query(`expenses?${filter}&select=id,total,expense_date,created_at&order=created_at.desc&limit=4`) : [],
        access.inventory ? query(`activity_logs?${filter}&select=id,action,entity_type,entity_id,metadata,created_at&order=created_at.desc&limit=10`) : [],
      ]);
      const invoiceAmount = x => r2(num(x.subtotal) + num(x.tax_amount) + num(x.line_tax_amount) - num(x.discount) - num(x.line_discount_amount));
      const feed = [
        ...sales.map(x => ({ id: `sale:${x.id}`, kind: 'sale', title: 'Sales invoice posted', detail: x.invoice_number || 'Sales invoice', timestamp: x.created_at || x.invoice_date, amount: invoiceAmount(x) })),
        ...purchases.map(x => ({ id: `purchase:${x.id}`, kind: 'purchase', title: 'Purchase received', detail: x.invoice_number || 'Purchase invoice', timestamp: x.created_at || x.invoice_date, amount: invoiceAmount(x) })),
        ...returns.map(x => ({ id: `return:${x.id}`, kind: 'return', title: 'Sales return posted', detail: x.return_number || 'Customer return', timestamp: x.created_at || x.return_date, amount: r2(x.total_return_amount) })),
        ...exchanges.map(x => ({ id: `exchange:${x.id}`, kind: 'exchange', title: 'Sales exchange completed', detail: x.exchange_number || 'Customer exchange', timestamp: x.created_at || x.exchange_date, amount: r2(x.difference_amount) })),
        ...purchaseReturns.map(x => ({ id: `purchase-return:${x.id}`, kind: 'purchase_return', title: 'Purchase return posted', detail: x.return_number || 'Supplier return', timestamp: x.created_at || x.return_date, amount: r2(x.total_return_amount) })),
        ...expenses.map(x => ({ id: `expense:${x.id}`, kind: 'expense', title: 'Shop expense recorded', detail: x.expense_date || 'Expense', timestamp: x.created_at || x.expense_date, amount: r2(x.total) })),
        ...logs.filter(x => ['clothing product', 'clothing variant', 'inventory'].includes(String(x.entity_type || '').toLowerCase())).map(x => {
          const meta = x.metadata && typeof x.metadata === 'object' ? x.metadata : {};
          const action = String(x.action || '').toLowerCase(), entity = String(x.entity_type || '').toLowerCase();
          const isStyle = entity === 'clothing product';
          const kind = isStyle ? 'style' : 'stock';
          const title = isStyle ? (action.includes('create') ? 'Clothing style added' : 'Clothing style updated') : action.includes('transfer') ? 'Variant stock transferred' : 'Variant stock updated';
          const detail = [meta.name || meta.variant_sku || meta.sku || meta.style_code, meta.quantity ? `Qty ${meta.quantity}` : (meta.delta ? `Change ${meta.delta}` : '')].filter(Boolean).join(' · ') || 'Clothing inventory activity';
          return { id: `inventory:${x.id}`, kind, title, detail, timestamp: x.created_at, amount: null };
        }),
      ];
      feed.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      return ok(feed.slice(0, 10));
    } catch (e) { return bad(e.message || 'Could not load Clothing activity.', 400); }
  }

  if (path === 'clothing/products' && method === 'GET') {
    const denied = requirePermission('inventory', 'view'); if (denied) return denied;
    const [products, variants] = await Promise.all([
      db(env, `clothing_products?store_id=eq.${storeId}&select=*&order=name.asc`), variantRows(env, storeId),
    ]);
    const grouped = new Map(); for (const v of variants) { const list = grouped.get(v.product_id) || []; list.push(v); grouped.set(v.product_id, list); }
    return ok(products.map(p => ({ ...p, variants: grouped.get(p.id) || [] })));
  }

  if (path === 'clothing/products' && method === 'POST') {
    const denied = requirePermission('inventory', 'add'); if (denied) return denied;
    const body = await parsedBody(request); let product, savedProductRef, variants, createdItemIds = [];
    try {
      product = validateProduct(body, storeId);
      product.supplier_id = await validateSupplier(env, storeId, product.supplier_id);
      variants = normalizeVariantRows(body, product);
      const duplicateStyle = await db(env, `clothing_products?store_id=eq.${storeId}&style_code=eq.${encodeURIComponent(product.style_code)}&select=id`);
      if (duplicateStyle.length) return bad('That style code is already in use in this shop.', 409);
      const [savedProduct] = await write(env, 'clothing_products', product);
      if (!savedProduct?.id) throw Error('Could not save clothing product.');
      savedProductRef = savedProduct;
      const created = [];
      for (const v of variants) created.push(await insertVariant(env, storeId, savedProduct, v, s.id, createdItemIds));
      await audit(env, s, 'create', 'clothing product', savedProduct.id, { name: savedProduct.name, style_code: savedProduct.style_code, variants: created.length });
      const resultRows = await variantRows(env, storeId);
      return ok({ ...savedProduct, variants: resultRows.filter(v => v.product_id === savedProduct.id) }, 201);
    } catch (e) {
      if (createdItemIds.length) await db(env, `inventory_stock_movements?store_id=eq.${storeId}&item_id=${idIn(createdItemIds)}`, { method: 'DELETE' }).catch(() => {});
      if (savedProductRef?.id) await db(env, `clothing_products?id=eq.${savedProductRef.id}&store_id=eq.${storeId}`, { method: 'DELETE' }).catch(() => {});
      if (createdItemIds.length) await db(env, `inventory_items?id=${idIn(createdItemIds)}&store_id=eq.${storeId}`, { method: 'DELETE' }).catch(() => {});
      return bad(e.message || 'Could not create clothing product.', /already exists|duplicate|UNIQUE/i.test(e.message || '') ? 409 : 400);
    }
  }

  const productMatch = path.match(/^clothing\/products\/([^/]+)$/);
  if (productMatch && method === 'PATCH') {
    const denied = requirePermission('inventory', 'edit'); if (denied) return denied;
    const productId = decodeURIComponent(productMatch[1]), body = await parsedBody(request); if(!isUuid(productId))return bad('Product ID is invalid.',400); let createdItemIds = [];
    const [existing] = await db(env, `clothing_products?id=eq.${productId}&store_id=eq.${storeId}&select=*`);
    if (!existing) return bad('Product not found.', 404);
    try {
      const next = validateProduct({ ...existing, ...body, store_id: storeId }, storeId);
      next.supplier_id = await validateSupplier(env, storeId, next.supplier_id);
      let incoming = Array.isArray(body.variants) ? normalizeVariantRows(body, next) : null;
      const [styleConflict] = await db(env, `clothing_products?store_id=eq.${storeId}&style_code=eq.${encodeURIComponent(next.style_code)}&select=id`);
      if (styleConflict && styleConflict.id !== productId) return bad('That style code is already in use in this shop.', 409);
      const [updated] = await db(env, `clothing_products?id=eq.${productId}&store_id=eq.${storeId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...next, updated_at: nowIso() }) });
      if (incoming) {
        const existingVariants = await db(env, `clothing_variants?store_id=eq.${storeId}&product_id=eq.${productId}&select=*`);
        const existingMap = Object.fromEntries(existingVariants.map(v => [v.id, v]));
        for (const v of incoming) {
          if (v.id) {
            const old = existingMap[v.id]; if (!old) throw Error('A variant does not belong to this product.');
            const [inv] = await db(env, `inventory_items?id=eq.${old.inventory_item_id}&store_id=eq.${storeId}&select=id`);
            if (!inv) throw Error('A linked inventory record is missing.');
            await db(env, `clothing_variants?id=eq.${old.id}&store_id=eq.${storeId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
              size_label: v.size_label, size_system: v.size_system, color: v.color, variant_sku: v.variant_sku,
              barcode: v.barcode, cost_price: v.cost_price, sale_price: v.sale_price,
              reorder_threshold: v.reorder_threshold, measurements: v.measurements, active: v.active, updated_at: nowIso(),
            }) });
            const desc = [updated.name, v.color, v.size_label].filter(Boolean).join(' · ');
            await db(env, `inventory_items?id=eq.${old.inventory_item_id}&store_id=eq.${storeId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
              item_code: v.variant_sku, description: desc, unit: updated.unit, sale_price: v.sale_price, active: v.active, category: updated.category, updated_at: nowIso(),
            }) });
            delete existingMap[v.id];
          } else {
            await insertVariant(env, storeId, updated, v, s.id, createdItemIds);
          }
        }
        if (Object.keys(existingMap).length) throw Error('A saved variant is missing from the submitted matrix. Refresh and try again.');
      }
      await audit(env, s, 'update', 'clothing product', productId, { name: updated.name, style_code: updated.style_code, variants: incoming?.length });
      const all = await variantRows(env, storeId);
      return ok({ ...updated, variants: all.filter(v => v.product_id === productId) });
    } catch (e) {
      if (createdItemIds.length) {
        await db(env, `inventory_stock_movements?store_id=eq.${storeId}&item_id=${idIn(createdItemIds)}`, { method: 'DELETE' }).catch(() => {});
        for (const id of createdItemIds) await db(env, `clothing_variants?inventory_item_id=eq.${id}&store_id=eq.${storeId}`, { method: 'DELETE' }).catch(() => {});
        await db(env, `inventory_items?id=${idIn(createdItemIds)}&store_id=eq.${storeId}`, { method: 'DELETE' }).catch(() => {});
      }
      return bad(e.message || 'Could not update clothing product.', /already exists|duplicate|UNIQUE/i.test(e.message || '') ? 409 : 400);
    }
  }

  if (path === 'clothing/variants' && method === 'GET') {
    const denied = requirePermission('inventory', 'view'); if (denied) return denied;
    const onlyActive = new URL(request.url).searchParams.get('active') === 'true';
    return ok(await variantRows(env, storeId, onlyActive));
  }
  const variantMatch = path.match(/^clothing\/variants\/([^/]+)$/);
  if (variantMatch && method === 'PATCH') {
    const denied = requirePermission('inventory', 'edit'); if (denied) return denied;
    const variantId = decodeURIComponent(variantMatch[1]), body = await parsedBody(request); if(!isUuid(variantId))return bad('Variant ID is invalid.',400);
    const [variant] = await db(env, `clothing_variants?id=eq.${variantId}&store_id=eq.${storeId}&select=*`);
    if (!variant) return bad('Variant not found.', 404);
    const sku = code(body.variant_sku ?? variant.variant_sku), barcode = trim(body.barcode ?? variant.barcode, 80) || null;
    const cost = r2(num(body.cost_price ?? variant.cost_price, NaN)), sell = r2(num(body.sale_price ?? variant.sale_price, NaN)), reorder = r3(num(body.reorder_threshold ?? variant.reorder_threshold, NaN));
    if (!sku || ![cost, sell, reorder].every(Number.isFinite) || cost < 0 || sell < 0 || reorder < 0) return bad('Enter a valid SKU, non-negative prices and reorder threshold.', 400);
    try {
      const [product] = await db(env, `clothing_products?id=eq.${variant.product_id}&store_id=eq.${storeId}&select=name,unit,category`);
      if (!product) return bad('Product not found.', 404);
      const patch = { variant_sku: sku, barcode, cost_price: cost, sale_price: sell, reorder_threshold: reorder, active: body.active === undefined ? variant.active : body.active === true, updated_at: nowIso() };
      const [updated] = await db(env, `clothing_variants?id=eq.${variantId}&store_id=eq.${storeId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
      await db(env, `inventory_items?id=eq.${variant.inventory_item_id}&store_id=eq.${storeId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        item_code: sku, description: [product.name, variant.color, variant.size_label].filter(Boolean).join(' · '),
        sale_price: sell, active: patch.active, category: product.category, updated_at: nowIso(),
      }) });
      await audit(env, s, 'update', 'clothing variant', variantId, { variant_sku: sku, barcode, cost_price: cost, sale_price: sell });
      return ok({ ...updated, item_id: variant.inventory_item_id });
    } catch (e) { return bad(e.message || 'Could not update variant.', /already exists|duplicate|UNIQUE/i.test(e.message || '') ? 409 : 400); }
  }

  if (path === 'clothing/stores' && method === 'GET') {
    const denied = requirePermission('inventory', 'view'); if (denied) return denied;
    if(!s.adminAccess)return ok([]);
    return ok(await db(env, `stores?admin_id=eq.${store.admin_id}&shop_type=eq.clothing&status=eq.active&select=id,name,shop_code,status&order=name.asc`));
  }
  if (path === 'clothing/stock-history' && method === 'GET') {
    const denied = requirePermission('inventory', 'view'); if (denied) return denied;
    const variantId = new URL(request.url).searchParams.get('variantId');
    if (!isUuid(variantId)) return bad('Variant ID is invalid.', 400);
    const [variant] = await db(env, `clothing_variants?id=eq.${encodeURIComponent(variantId)}&store_id=eq.${storeId}&select=inventory_item_id`);
    if (!variant) return bad('Variant not found.', 404);
    return ok(await db(env, `inventory_stock_movements?store_id=eq.${storeId}&item_id=eq.${variant.inventory_item_id}&select=*&order=created_at.desc&limit=500`));
  }
  if (path === 'clothing/stock-adjustment' && method === 'POST') {
    const denied = requirePermission('inventory', 'edit'); if (denied) return denied;
    const body = await parsedBody(request), variantId = trim(body.variantId, 80);
    if(!isUuid(variantId))return bad('Variant ID is invalid.',400);
    const [variant] = await db(env, `clothing_variants?id=eq.${variantId}&store_id=eq.${storeId}&select=id,inventory_item_id,variant_sku`);
    if (!variant) return bad('Variant not found.', 404);
    const [item] = await db(env, `inventory_items?id=eq.${variant.inventory_item_id}&store_id=eq.${storeId}&select=id,total_stock`);
    if (!item) return bad('Linked inventory item not found.', 404);
    const action = trim(body.action, 24), current = num(item.total_stock);
    let delta = 0, movementType = 'adjustment', condition = 'good';
    if (action === 'adjustment') {
      const quantity = r3(num(body.quantity, NaN));
      if (!(quantity > 0) || !Number.isFinite(quantity)) return bad('Adjustment quantity must be greater than zero.', 400);
      delta = body.direction === 'decrease' ? -quantity : quantity;
      movementType = 'adjustment'; condition = 'good';
    } else if (action === 'damaged') {
      const quantity = r3(num(body.quantity, NaN));
      if (!(quantity > 0) || !Number.isFinite(quantity)) return bad('Damaged quantity must be greater than zero.', 400);
      delta = -quantity; movementType = 'damaged'; condition = 'damaged';
    } else if (action === 'reconciliation') {
      const counted = r3(num(body.countedQuantity, NaN));
      if (!Number.isFinite(counted) || counted < 0) return bad('Counted stock must be zero or greater.', 400);
      delta = counted - current; movementType = 'reconciliation'; condition = 'good';
      if (Math.abs(delta) < 0.0005) return bad('Physical count matches current stock; no adjustment was needed.', 400);
    } else return bad('Unknown stock movement type.', 400);
    try {
      const result = await db(env, 'rpc/cshop_adjust_stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        p_store_id: storeId, p_item_id: item.id, p_delta: delta, p_movement_type: movementType,
        p_condition: condition, p_notes: trim(body.notes, 500) || null, p_created_by: s.id || null,
      }) });
      await audit(env, s, 'stock ' + movementType, 'clothing variant', variant.id, { sku: variant.variant_sku, delta, notes: trim(body.notes, 500) });
      return ok(result);
    } catch (e) { return bad(e.message || 'Could not adjust stock.', /negative|insufficient|not belong/i.test(e.message || '') ? 409 : 400); }
  }
  if (path === 'clothing/stock-transfer' && method === 'POST') {
    const denied = requirePermission('inventory', 'edit'); if (denied) return denied;
    if(!s.adminAccess)return bad('Administrator access is required for inter-store transfers.',403);
    const body = await parsedBody(request), variantId = trim(body.variantId, 80), targetStoreId = trim(body.targetStoreId, 80), quantity = r3(num(body.quantity, NaN));
    if(!isUuid(variantId)||!isUuid(targetStoreId))return bad('Source variant or target shop ID is invalid.',400);
    if (!(quantity > 0) || !Number.isFinite(quantity)) return bad('Choose a target shop and a positive transfer quantity.', 400);
    const [source] = await db(env, `clothing_variants?id=eq.${variantId}&store_id=eq.${storeId}&select=*`);
    if (!source) return bad('Source variant not found.', 404);
    if (!source.active) return bad('Only active variants can be transferred.', 409);
    const [sourceProduct] = await db(env, `clothing_products?id=eq.${source.product_id}&store_id=eq.${storeId}&select=style_code,unit`);
    const [targetStore] = await db(env, `stores?id=eq.${targetStoreId}&admin_id=eq.${store.admin_id}&shop_type=eq.clothing&status=eq.active&select=id`);
    if (!targetStore) return bad('Target must be an active Clothing shop owned by the same administrator.', 403);
    const targetProducts = await db(env, `clothing_products?store_id=eq.${targetStoreId}&select=id,style_code,unit`);
    const targetProduct = targetProducts.find(p => norm(p.style_code) === norm(sourceProduct?.style_code));
    if (!targetProduct) return bad('The target shop needs a matching clothing style before stock can be transferred.', 409);
    if (targetProduct.unit !== sourceProduct.unit) return bad('Source and target product stock units must match.', 409);
    const targetVariants = await db(env, `clothing_variants?store_id=eq.${targetStoreId}&product_id=eq.${targetProduct.id}&select=*`);
    const target = targetVariants.find(v => v.active && norm(v.size_label) === norm(source.size_label) && norm(v.color) === norm(source.color));
    if (!target) return bad('No matching size/color variant exists in the target shop.', 409);
    try {
      const result = await db(env, 'rpc/cshop_transfer_stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        p_source_store_id: storeId, p_source_item_id: source.inventory_item_id,
        p_source_variant_id: source.id, p_target_store_id: targetStoreId,
        p_target_item_id: target.inventory_item_id, p_target_variant_id: target.id,
        p_quantity: quantity, p_notes: trim(body.notes, 500) || null, p_created_by: s.id || null,
      }) });
      await audit(env, s, 'transfer clothing stock out', 'clothing variant', source.id, { target_store_id: targetStoreId, target_variant_id: target.id, quantity });
      await audit(env, { ...s, storeId: targetStoreId }, 'receive clothing stock transfer', 'clothing variant', target.id, { source_store_id: storeId, source_variant_id: source.id, quantity });
      return ok(result);
    } catch (e) { return bad(e.message || 'Could not transfer stock.', /negative|insufficient|not found|only between/i.test(e.message || '') ? 409 : 400); }
  }

  if (path === 'clothing/purchase-returns' && method === 'GET') {
    const denied = requirePermission('purchase', 'view'); if (denied) return denied;
    const returns = await db(env, `clothing_purchase_returns?store_id=eq.${storeId}&select=*&order=return_date.desc,created_at.desc`);
    if (!returns.length) return ok([]);
    const invoiceIds = [...new Set(returns.map(x => x.purchase_invoice_id))], supplierIds = [...new Set(returns.map(x => x.supplier_id).filter(Boolean))], returnIds = returns.map(x => x.id);
    const [invoices, suppliers, items] = await Promise.all([
      invoiceIds.length ? db(env, `invoices?id=${idIn(invoiceIds)}&store_id=eq.${storeId}&select=id,invoice_number,invoice_date`) : [],
      supplierIds.length ? db(env, `suppliers?id=${idIn(supplierIds)}&store_id=eq.${storeId}&select=id,name,supplier_code`) : [],
      db(env, `clothing_purchase_return_items?return_id=${idIn(returnIds)}&select=*`),
    ]);
    const invoiceMap = Object.fromEntries(invoices.map(x => [x.id, x])), supplierMap = Object.fromEntries(suppliers.map(x => [x.id, x]));
    const itemsMap = new Map(); for (const x of items) { const a = itemsMap.get(x.return_id) || []; a.push(x); itemsMap.set(x.return_id, a); }
    return ok(returns.map(r => ({ ...r, purchase_invoice_number: invoiceMap[r.purchase_invoice_id]?.invoice_number || '', supplier_name: supplierMap[r.supplier_id]?.name || '', items: itemsMap.get(r.id) || [] })));
  }
  if (path === 'clothing/purchase-returns' && method === 'POST') {
    const denied = requirePermission('purchase', 'add'); if (denied) return denied;
    const body = await parsedBody(request), invoiceId = trim(body.purchaseInvoiceId, 80), reason = trim(body.reason, 240), notes = trim(body.notes, 1000) || null;
    if(!isUuid(invoiceId))return bad('Purchase invoice ID is invalid.',400);
    if (!reason) return bad('Purchase invoice and return reason are required.', 400);
    const [invoice] = await db(env, `invoices?id=eq.${invoiceId}&store_id=eq.${storeId}&kind=eq.purchase&select=id,invoice_number,party_id`);
    if (!invoice) return bad('Purchase invoice not found in this shop.', 404);
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 250) return bad('Select at least one purchase line to return.', 400);
    const lines = new Map();
    for (const raw of body.items) {
      const lineId = trim(raw.invoiceLineId, 80), quantity = r3(num(raw.quantity, NaN));
      if (!isUuid(lineId) || !(quantity > 0) || !Number.isFinite(quantity)) return bad('Each returned line needs a valid invoice line and positive quantity.', 400);
      lines.set(lineId, (lines.get(lineId) || 0) + quantity);
    }
    const items = [...lines].map(([invoice_line_id, quantity]) => ({ invoice_line_id, quantity }));
    const d = new Date(), returnDate = dateOk(body.returnDate) ? body.returnDate : d.toISOString().slice(0, 10);
    const returnNumber = `PR-${returnDate.replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    try {
      const result = await db(env, 'rpc/cshop_post_purchase_return', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        p_store_id: storeId, p_invoice_id: invoice.id, p_return_number: returnNumber,
        p_return_date: returnDate, p_reason: reason, p_notes: notes, p_created_by: s.id || null, p_items: items,
      }) });
      await audit(env, s, 'post clothing purchase return', 'clothing purchase return', result.id, { return_number: returnNumber, invoice_number: invoice.invoice_number, total_return_amount: result.total_return_amount });
      return ok(result, 201);
    } catch (e) { return bad(e.message || 'Could not post purchase return.', /already returned|exceeds|insufficient|not belong|purchase invoice/i.test(e.message || '') ? 409 : 400); }
  }

  if (path === 'clothing/size-profiles' && method === 'GET') {
    const denied = requirePermission('inventory', 'view'); if (denied) return denied;
    return ok(await db(env, `clothing_size_profiles?store_id=eq.${storeId}&select=*&order=category.asc`));
  }
  if (path === 'clothing/size-profiles' && method === 'POST') {
    const denied = requirePermission('inventory', 'edit'); if (denied) return denied;
    const body = await parsedBody(request), category = trim(body.category, 80), sizeSystem = trim(body.size_system, 24);
    const sizes = Array.isArray(body.sizes) ? body.sizes.map(x => trim(x, 40)).filter(Boolean) : [];
    if (!category || !SIZE_SYSTEMS.has(sizeSystem) || !sizes.length || sizes.length > 100) return bad('Category, sizing system, and 1–100 sizes are required.', 400);
    if (new Set(sizes.map(norm)).size !== sizes.length) return bad('Size labels must be unique.', 400);
    const [saved] = await db(env, 'clothing_size_profiles?on_conflict=store_id,category', { method: 'POST', headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({
      store_id: storeId, category, size_system: sizeSystem, sizes, updated_by: s.id || null, updated_at: nowIso(),
    }) });
    await audit(env, s, 'save clothing size profile', 'clothing size profile', saved?.id, { category, size_system: sizeSystem, sizes: sizes.length });
    return ok(await db(env, `clothing_size_profiles?store_id=eq.${storeId}&select=*&order=category.asc`));
  }
  const profileMatch = path.match(/^clothing\/size-profiles\/([^/]+)$/);
  if (profileMatch && method === 'DELETE') {
    const denied = requirePermission('inventory', 'edit'); if (denied) return denied;
    const profileId = decodeURIComponent(profileMatch[1]);
    if(!isUuid(profileId))return bad('Size profile ID is invalid.',400);
    const deleted = await db(env, `clothing_size_profiles?id=eq.${profileId}&store_id=eq.${storeId}`, { method: 'DELETE' });
    if (!deleted.length) return bad('Size profile not found.', 404);
    await audit(env, s, 'delete clothing size profile', 'clothing size profile', profileId);
    return ok({ ok: true });
  }

  return bad('Clothing route not found.', 404);
}
