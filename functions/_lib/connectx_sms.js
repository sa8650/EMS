/* ConnectX SMS subsystem — per-shop settings, templates and the outgoing
   SMS job queue. Imported by functions/api/[[path]].js.

   SMS leaves EMS only through the Connect App connection to ConnectX.
   The Android app is never contacted from EMS. */
import { db } from './db.js';
import { nextSmsRequestId, insertSmsRow, dispatchSmsRecord } from './connect_app.js';

const DEFAULT_TEMPLATES = {
  SALE: 'Hi {name}, thanks for your purchase at {shop}. Invoice {invoice}: total BDT {total}, paid BDT {paid}, due BDT {due}.',
  PAYMENT: 'Hi {name}, {shop} received your payment of BDT {amount} for {invoice}. Remaining due: BDT {due}. Thank you.',
  DUE_REMINDER: 'Dear {name}, reminder from {shop} for invoice {invoice}. Outstanding due: BDT {due}. Please settle when convenient.',
  RETURN: 'Hi {name}, your return {invoice} at {shop} is complete. Refunded: BDT {amount}. Thank you.',
  EXCHANGE: 'Hi {name}, your exchange {invoice} at {shop} is complete. Settlement: BDT {amount}. Thank you.',
  REFUND: 'Hi {name}, {shop} issued a refund of BDT {amount} for {invoice}. Thank you.',
  TEST: 'ConnectX test from {shop}. Your SMS gateway is working.'
};

const money = v => Number(v || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(name|shop|invoice|total|paid|due|amount)\}/g, (_, k) => vars[k] ?? '');
}

function cleanPhone(v) {
  let d = String(v || '').replace(/[^0-9+]/g, '');
  return d.length >= 6 ? d : '';
}

export async function smsSettingsFor(env, storeId) {
  let [row] = await db(env, `connectx_shop_sms_settings?store_id=eq.${storeId}&select=*`).catch(() => []);
  if (!row) {
    return {
      store_id: storeId, enabled: true, gateway_mode: 'connectx',
      auto_sale: true, auto_payment: true, auto_due_reminder: false,
      auto_return: true, auto_exchange: true, auto_refund: true,
      templates: DEFAULT_TEMPLATES
    };
  }
  let t = row.templates;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = {}; } }
  row.templates = { ...DEFAULT_TEMPLATES, ...(t || {}) };
  return row;
}

export async function enqueueSmsJob(env, {
  storeId, userId, phone, name, recipientId, recipientType, invoiceId,
  messageType, eventType, messageBody, idempotencyKey
}) {
  let to = cleanPhone(phone);
  if (!to) return { skipped: 'no_phone' };
  let settings = await smsSettingsFor(env, storeId);
  if (!settings.enabled) return { skipped: 'sms_disabled' };
  if (idempotencyKey) {
    let [dup] = await db(env, `connectx_sms_messages?store_id=eq.${storeId}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id`).catch(() => []);
    if (dup) return { skipped: 'duplicate', id: dup.id };
  }
  try {
    const requestId = await nextSmsRequestId(env);
    const record = await insertSmsRow(env, {
      store_id: storeId,
      user_id: userId || null,
      recipient_type: recipientType || 'customer',
      recipient_id: recipientId || null,
      recipient_name: name || null,
      to_phone: to,
      message_type: messageType || eventType || 'SMS',
      event_type: eventType || messageType || null,
      invoice_id: invoiceId || null,
      message_body: messageBody,
      status: 'PENDING',
      request_id: requestId,
      attempts: 0,
      idempotency_key: idempotencyKey || null,
      created_at: new Date().toISOString()
    });
    const dispatched = await dispatchSmsRecord(env, record).catch(() => null);
    return { ok: true, id: record?.id, request_id: requestId, status: dispatched?.status || 'PENDING' };
  } catch (e) {
    if (/duplicate|unique|idempotency/i.test(String(e.message || ''))) return { skipped: 'duplicate' };
    console.error('enqueueSmsJob', e);
    return { skipped: 'error', error: e.message };
  }
}

export async function enqueueAutoSms(env, s, event, invoice, extra = {}) {
  if (!s?.storeId) return;
  try {
    let settings = await smsSettingsFor(env, s.storeId);
    if (!settings.enabled) return;
    let flag = {
      SALE: settings.auto_sale,
      PAYMENT: settings.auto_payment,
      DUE_REMINDER: settings.auto_due_reminder,
      RETURN: settings.auto_return,
      EXCHANGE: settings.auto_exchange,
      REFUND: settings.auto_refund
    }[event];
    if (!flag) return;
    let [store] = await db(env, `stores?id=eq.${s.storeId}&select=name,admin_id`);
    let phone = extra.phone || invoice?.custom_party_phone || '';
    let name = extra.name || invoice?.custom_party_name || extra.customerName || 'Customer';
    let recipientId = extra.recipientId || extra.partyId || invoice?.party_id || extra.customerId || null;
    if (!phone && recipientId) {
      let table = extra.partyTable || 'customers';
      let [party] = await db(env, `${table}?id=eq.${recipientId}&select=name,phone`).catch(() => []);
      if (party) { phone = party.phone; name = party.name || name; }
    }
    if (!phone && extra.partyId) {
      let [party] = await db(env, `customers?id=eq.${extra.partyId}&select=name,phone`).catch(() => []);
      if (party) { phone = party.phone; name = party.name || name; }
    }
    let invoiceNumber = extra.invoiceNumber || invoice?.invoice_number || extra.returnNumber || extra.exchangeNumber || '';
    let total = extra.total ?? invoice?.subtotal ?? 0;
    let paid = extra.paid ?? invoice?.paid_amount ?? 0;
    let due = extra.due ?? invoice?.total_due ?? 0;
    let amount = extra.amount ?? paid;
    let vars = {
      name, shop: store?.name || 'Shop', invoice: invoiceNumber,
      total: money(total), paid: money(paid), due: money(due), amount: money(amount)
    };
    let tpl = (settings.templates && settings.templates[event]) || DEFAULT_TEMPLATES[event];
    let body = fillTemplate(tpl, vars);
    let idemp = extra.idempotencyKey || `${event}:${invoice?.id || extra.sourceId || ''}:${s.storeId}`;
    await enqueueSmsJob(env, {
      storeId: s.storeId,
      userId: s.id,
      phone, name, recipientId,
      recipientType: 'customer',
      invoiceId: extra.invoiceId || invoice?.id || null,
      messageType: extra.messageType || event,
      eventType: event,
      messageBody: body,
      idempotencyKey: idemp
    });
  } catch (e) {
    console.error('enqueueAutoSms', event, e);
  }
}

export async function connectxSmsRoutes(ctx) {
  const { env, request, path, method, s, json, fail, body, audit, allowed } = ctx;
  if (!s) return null;

  /* Legacy device-token routes. The phone connects to ConnectX, not to EMS. */
  if (path.startsWith('connectx/gateway/') || path.startsWith('connectx/devices')) {
    return fail('This endpoint has been removed. SMS is delivered through Connect App. The Android app talks only to ConnectX.', 410);
  }

  /* ---- Shop session: SMS settings ---- */
  if (path === 'shop/sms-settings') {
    if (!s.storeId) return fail('Shop access required.', 403);
    if (method === 'GET') {
      let settings = await smsSettingsFor(env, s.storeId);
      let today = new Date().toISOString().slice(0, 10);
      let jobs = await db(env, `connectx_sms_messages?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&select=id,status`).catch(() => []);
      return json({
        ...settings,
        today: {
          sent: jobs.filter(j => j.status === 'sent' || j.status === 'SUCCESS').length,
          failed: jobs.filter(j => j.status === 'failed' || j.status === 'FAILED').length,
          pending: jobs.filter(j => ['queued','sending','PENDING','PROCESSING'].includes(j.status)).length
        }
      });
    }
    if (method === 'PATCH') {
      if (!allowed(s, 'settings', 'edit') && s.role !== 'admin' && !s.adminAccess) return fail('Permission denied.', 403);
      let b = await body(request);
      let patch = { store_id: s.storeId, updated_at: new Date().toISOString() };
      for (let k of ['enabled', 'auto_sale', 'auto_payment', 'auto_due_reminder', 'auto_return', 'auto_exchange', 'auto_refund']) {
        if (b[k] !== undefined) patch[k] = !!b[k];
      }
      if (b.gateway_mode) patch.gateway_mode = String(b.gateway_mode);
      if (b.templates && typeof b.templates === 'object') patch.templates = { ...DEFAULT_TEMPLATES, ...b.templates };
      let [row] = await db(env, 'connectx_shop_sms_settings?on_conflict=store_id', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(patch)
      });
      await audit(env, s, 'update SMS settings', 'settings', s.storeId, { fields: Object.keys(b) });
      return json(row || patch);
    }
  }

  return null;
}
