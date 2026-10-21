/* EMS-owned SMS queue, shop settings and transaction-triggered messages.
   ConnectX Android authenticates directly to EMS and claims these persistent
   rows over HTTPS. No relay/control website participates in dispatch. */
import { db } from './db.js';

const DEFAULT_TEMPLATES = {
  SALE: 'Hi {name}, thanks for your purchase at {shop}. Invoice {invoice}: total BDT {total}, paid BDT {paid}, due BDT {due}.',
  PAYMENT: 'Hi {name}, {shop} received your payment of BDT {amount} for {invoice}. Remaining due: BDT {due}. Thank you.',
  DUE_REMINDER: 'Dear {name}, reminder from {shop} for invoice {invoice}. Outstanding due: BDT {due}. Please settle when convenient.',
  RETURN: 'Hi {name}, your return {invoice} at {shop} is complete. Return value: BDT {amount}. Thank you.',
  EXCHANGE: 'Hi {name}, your exchange {invoice} at {shop} is complete. Settlement: BDT {amount}. Thank you.',
  REFUND: 'Hi {name}, {shop} issued a refund of BDT {amount} for {invoice}. Thank you.'
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
  // Never silently substitute defaults when saved settings cannot be read: that
  // could dispatch SMS with the wrong template or after a shop disabled SMS.
  let [row] = await db(env, `connectx_shop_sms_settings?store_id=eq.${storeId}&select=*`);
  if (!row) {
    return {
      store_id: storeId, enabled: true, gateway_mode: 'direct',
      auto_sale: true, auto_payment: true, auto_due_reminder: false,
      auto_return: true, auto_exchange: true, auto_refund: true,
      templates: DEFAULT_TEMPLATES
    };
  }
  let t = row.templates;
  if (typeof t === 'string') t = JSON.parse(t);
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
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const requestId = `SMS-${id.toUpperCase()}`;
    const [record] = await db(env, 'connectx_sms_messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        id,
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
        status: 'pending',
        request_id: requestId,
        attempts: 0,
        idempotency_key: idempotencyKey || null,
        created_at: now
      })
    });
    return { ok: true, id: record?.id || id, request_id: record?.request_id || requestId, status: 'pending' };
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
    if (!settings.enabled) return { skipped: 'disabled' };
    let flag = {
      SALE: settings.auto_sale,
      PAYMENT: settings.auto_payment,
      DUE_REMINDER: settings.auto_due_reminder,
      RETURN: settings.auto_return,
      EXCHANGE: settings.auto_exchange,
      REFUND: settings.auto_refund
    }[event];
    if (!flag) return { skipped: 'disabled' };
    let [store] = await db(env, `stores?id=eq.${s.storeId}&select=name,admin_id,status`);
    let phone = extra.phone || invoice?.custom_party_phone || '';
    let name = extra.name || invoice?.custom_party_name || extra.customerName || 'Customer';
    let recipientId = extra.recipientId || extra.partyId || invoice?.party_id || extra.customerId || null;
    if (!phone && recipientId) {
      let table = extra.partyTable || 'customers';
      let [party] = await db(env, `${table}?id=eq.${recipientId}&store_id=eq.${s.storeId}&select=name,phone`);
      if (party) { phone = party.phone; name = party.name || name; }
    }
    if (!phone && extra.partyId) {
      let [party] = await db(env, `customers?id=eq.${extra.partyId}&store_id=eq.${s.storeId}&select=name,phone`);
      if (party) { phone = party.phone; name = party.name || name; }
    }
    let invoiceNumber = extra.invoiceNumber || invoice?.invoice_number || extra.returnNumber || extra.exchangeNumber || '';
    let total = extra.total ?? (invoice ? Number(invoice.subtotal||0)+Number(invoice.tax_amount||0)+Number(invoice.line_tax_amount||0)-Number(invoice.line_discount_amount||0)-Number(invoice.discount||0) : 0);
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
    if (!cleanPhone(phone)) return { skipped: 'no_phone' };
    if (!store || !['active','read_only'].includes(store.status) || s.licenseExpired) return { skipped: 'no_plan' };
    const now = new Date().toISOString();
    const [licenses, addons] = await Promise.all([
      db(env,`licenses?admin_id=eq.${store.admin_id}&status=eq.active&expires_at=gt.${now}&select=connectx_enabled,connectx_daily_limit,starts_at,created_at&order=created_at.desc&limit=25`),
      db(env,`addon_purchases?admin_id=eq.${store.admin_id}&addon_key=eq.connectx&status=eq.active&expires_at=gt.${now}&select=daily_limit&order=created_at.desc&limit=1`)
    ]);
    const license = licenses.filter(x => !x.starts_at || x.starts_at <= now).sort((a,b) => new Date(b.starts_at||b.created_at||0)-new Date(a.starts_at||a.created_at||0))[0];
    const maxDaily = Math.max(license?.connectx_enabled ? Number(license.connectx_daily_limit||0) : 0, Number(addons[0]?.daily_limit||0));
    if (!maxDaily) return { skipped: 'no_plan' };
    const [duplicate] = await db(env,`connectx_sms_messages?store_id=eq.${s.storeId}&idempotency_key=eq.${encodeURIComponent(idemp)}&select=id`);
    if (duplicate) return { skipped: 'duplicate', id: duplicate.id };
    const today = now.slice(0,10);
    const used = await db(env,`connectx_sms_messages?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&status=in.(pending,processing,sent,delivered,unknown)&select=id,event_type,invoice_id`);
    if (used.length >= maxDaily) return { skipped: 'daily_limit' };
    return await enqueueSmsJob(env, {
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
    return { skipped: 'error' };
  }
}

export async function connectxSmsRoutes(ctx) {
  const { env, request, path, method, s, json, fail, body, audit, allowed } = ctx;
  if (!s) return null;

  /* ---- Shop session: SMS settings ---- */
  if (path === 'shop/sms-settings') {
    if (!s.storeId || (!allowed(s,'connectx','view') && !s.adminAccess)) return fail('ConnectX view permission required.', 403);
    if (method === 'GET') {
      let settings = await smsSettingsFor(env, s.storeId);
      let today = new Date().toISOString().slice(0, 10);
      let jobs = await db(env, `connectx_sms_messages?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&select=id,status`).catch(() => []);
      return json({
        ...settings,
        today: {
          sent: jobs.filter(j => j.status === 'sent' || j.status === 'delivered').length,
          delivered: jobs.filter(j => j.status === 'delivered').length,
          failed: jobs.filter(j => j.status === 'failed').length,
          unknown: jobs.filter(j => j.status === 'unknown').length,
          pending: jobs.filter(j => j.status === 'pending').length,
          processing: jobs.filter(j => j.status === 'processing').length
        }
      });
    }
    if (method === 'PATCH') {
      if (!allowed(s, 'settings', 'edit') && s.role !== 'admin' && !s.adminAccess) return fail('Permission denied.', 403);
      if (ctx.hasPlan && !(await ctx.hasPlan())) return fail('ConnectX license or add-on is inactive. SMS settings are read-only.', 403);
      let b = await body(request);
      let patch = { store_id: s.storeId, updated_at: new Date().toISOString() };
      for (let k of ['enabled', 'auto_sale', 'auto_payment', 'auto_due_reminder', 'auto_return', 'auto_exchange', 'auto_refund']) {
        if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') return fail(k+' must be true or false.',400); patch[k] = b[k]; }
      }
      if (b.gateway_mode !== undefined && b.gateway_mode !== 'direct') return fail('SMS is delivered directly between EMS and the ConnectX Android app.', 400);
      if (b.templates !== undefined) {
        if (!b.templates || Array.isArray(b.templates) || typeof b.templates !== 'object' ||
            Object.entries(b.templates).some(([key,value]) => !Object.hasOwn(DEFAULT_TEMPLATES,key) || typeof value !== 'string' || !value.trim() || value.length > 1000))
          return fail('SMS templates must be non-empty text (up to 1,000 characters) for a supported notification type.', 400);
        const current = await smsSettingsFor(env, s.storeId);
        patch.templates = { ...current.templates, ...b.templates };
      }
      let [row] = await db(env, 'connectx_shop_sms_settings?on_conflict=store_id', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(patch)
      });
      await audit(env, s, 'update SMS settings', 'settings', s.storeId, { fields: Object.keys(b) });
      return json(row || patch);
    }
  }

  /* Explicit batch trigger. No background cron exists on Pages; this is never
   * advertised as a scheduled reminder. Daily idempotency prevents repeat sends. */
  if (path === 'shop/sms/due-reminders' && method === 'POST') {
    if (!s.storeId || !allowed(s,'connectx','add') || !allowed(s,'sales','view')) return fail('ConnectX send and sales view permissions required.',403);
    if (s.readOnly || s.licenseExpired) return fail('Shop is read-only.',403);
    const plan = ctx.hasPlan ? await ctx.hasPlan() : null;
    if (!plan) return fail('ConnectX license or add-on is inactive.',403);
    const settings = await smsSettingsFor(env,s.storeId);
    if (!settings.enabled || !settings.auto_due_reminder) return fail('Enable SMS and due reminders in saved settings first.',403);
    const today = new Date().toISOString().slice(0,10);
    const [invoices, existing] = await Promise.all([
      db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.sale&total_due=gt.0&invoice_date=lt.${today}&select=*&order=invoice_date.asc&limit=100`),
      db(env,`connectx_sms_messages?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&status=in.(pending,processing,sent,delivered,unknown)&select=id,event_type,invoice_id`)
    ]);
    const limit = Math.max(0, Math.min(25, Number(plan.connectx_daily_limit||plan.daily_limit||0)-existing.length));
    if (!limit) return fail('Daily ConnectX SMS limit reached.',429);
    const alreadyReminded = new Set(existing.filter(x=>x.event_type==='DUE_REMINDER').map(x=>x.invoice_id));
    let queued=0, duplicates=invoices.filter(x=>alreadyReminded.has(x.id)).length, noRecipient=0, errors=0;
    const candidates=invoices.filter(x=>!alreadyReminded.has(x.id));
    for (const invoice of candidates.slice(0,limit)) {
      const result = await enqueueAutoSms(env,s,'DUE_REMINDER',invoice,{amount:invoice.total_due,idempotencyKey:`DUE_REMINDER:${today}:${invoice.id}`});
      if (result?.ok) queued++; else if (result?.skipped==='duplicate') duplicates++;
      else if (result?.skipped==='no_phone') noRecipient++; else errors++;
    }
    await audit(env,s,'queue due reminder SMS','sms',s.storeId,{queued,duplicates,noRecipient,errors});
    return json({queued,duplicates,noRecipient,errors,limited:candidates.length>limit});
  }

  return null;
}
