/* ConnectX Android SMS Gateway — device auth, job claim, auto-queue.
   Imported by functions/api/[[path]].js. Does not replace ConnectX email. */
import { db } from './db.js';

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
    let [record] = await db(env, 'connectx_sms_messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
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
        status: 'queued',
        attempts: 0,
        idempotency_key: idempotencyKey || null,
        created_at: new Date().toISOString()
      })
    });
    return { ok: true, id: record?.id, status: 'queued' };
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

function publicDevice(d) {
  if (!d) return d;
  return {
    id: d.id,
    device_public_id: d.device_public_id,
    device_name: d.device_name,
    android_version: d.android_version,
    sim_subscription_id: d.sim_subscription_id,
    sim_carrier: d.sim_carrier,
    phone_number: d.phone_number,
    status: d.status,
    is_primary: !!d.is_primary,
    last_seen: d.last_seen,
    created_at: d.created_at,
    store_id: d.store_id,
    administrator_id: d.administrator_id
  };
}

function onlineOf(lastSeen) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) < 3 * 60 * 1000;
}

async function loadDevice(env, s) {
  if (!s?.deviceId) return null;
  let [d] = await db(env, `connectx_devices?id=eq.${s.deviceId}&select=*`);
  if (!d || d.status === 'revoked') return null;
  return d;
}

async function touchDevice(env, deviceId, patch = {}) {
  await db(env, `connectx_devices?id=eq.${deviceId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ last_seen: new Date().toISOString(), ...patch })
  }).catch(() => {});
}

export async function connectxSmsRoutes(ctx) {
  const { env, request, path, method, s, json, fail, body, token, audit, allowed } = ctx;
  if (!s) return null;

  /* ---- Administrator: shops for ConnectX app ---- */
  if (path === 'connectx/gateway/shops' && method === 'GET') {
    if (s.role !== 'admin') return fail('Administrator sign-in required.', 403);
    let stores = await db(env, `stores?admin_id=eq.${s.id}&select=id,name,address,phone,shop_code,status,category&order=created_at.desc`);
    let devices = await db(env, `connectx_devices?administrator_id=eq.${s.id}&status=neq.revoked&select=id,store_id,device_name,phone_number,sim_carrier,status,is_primary,last_seen`).catch(() => []);
    let byStore = {};
    for (let d of devices) (byStore[d.store_id] ||= []).push(publicDevice(d));
    return json({
      administrator: { id: s.id, email: s.email || null },
      shops: stores.map(st => ({
        id: st.id,
        name: st.name,
        address: st.address,
        phone: st.phone,
        shop_code: st.shop_code,
        status: st.status,
        category: st.category,
        connected: (byStore[st.id] || []).some(d => d.status === 'active' || d.status === 'pending_test'),
        devices: byStore[st.id] || []
      }))
    });
  }

  if (path === 'connectx/gateway/register' && method === 'POST') {
    if (s.role !== 'admin') return fail('Administrator sign-in required.', 403);
    let b = await body(request);
    let storeId = b.storeId || b.shop_id;
    if (!storeId) return fail('Shop is required.', 400);
    let [store] = await db(env, `stores?id=eq.${storeId}&admin_id=eq.${s.id}&select=id,name,address,phone,admin_id,status`);
    if (!store) return fail('Shop not found for this administrator.', 404);
    let [admin] = await db(env, `administrators?id=eq.${s.id}&select=id,name,email`);
    let existing = await db(env, `connectx_devices?store_id=eq.${storeId}&status=neq.revoked&select=id`);
    let isPrimary = existing.length === 0 || !!b.isPrimary;
    if (isPrimary) {
      await db(env, `connectx_devices?store_id=eq.${storeId}&is_primary=eq.true`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_primary: false })
      }).catch(() => {});
    }
    let publicId = 'CX-' + crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    let [device] = await db(env, 'connectx_devices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        administrator_id: s.id,
        store_id: storeId,
        device_public_id: publicId,
        device_name: String(b.deviceName || b.device_name || 'Android phone').slice(0, 120),
        android_version: String(b.androidVersion || b.android_version || '').slice(0, 40) || null,
        sim_subscription_id: b.simSubscriptionId != null ? String(b.simSubscriptionId) : null,
        sim_carrier: b.simCarrier || b.sim_carrier || null,
        phone_number: b.phoneNumber || b.phone_number || null,
        status: 'pending_test',
        is_primary: isPrimary,
        last_seen: new Date().toISOString()
      })
    });
    await smsSettingsFor(env, storeId);
    await db(env, 'connectx_shop_sms_settings?on_conflict=store_id', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ store_id: storeId, enabled: true, gateway_mode: 'connectx', updated_at: new Date().toISOString() })
    }).catch(() => {});
    let deviceToken = await token({
      id: device.id,
      role: 'connectx_device',
      deviceId: device.id,
      storeId,
      adminId: s.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 400
    }, env.SESSION_SECRET);
    await audit(env, { ...s, storeId }, 'register ConnectX device', 'connectx', device.id, { device_name: device.device_name, phone: device.phone_number });
    return json({
      device: publicDevice(device),
      deviceToken,
      shop: { id: store.id, name: store.name, address: store.address, phone: store.phone },
      administrator: { id: admin?.id, name: admin?.name, email: admin?.email }
    }, 201);
  }

  /* ---- Shop session: settings + device management ---- */
  if (path === 'shop/sms-settings') {
    if (!s.storeId) return fail('Shop access required.', 403);
    if (method === 'GET') {
      let settings = await smsSettingsFor(env, s.storeId);
      let devices = await db(env, `connectx_devices?store_id=eq.${s.storeId}&select=*&order=created_at.desc`).catch(() => []);
      let today = new Date().toISOString().slice(0, 10);
      let jobs = await db(env, `connectx_sms_messages?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&select=id,status`).catch(() => []);
      return json({
        ...settings,
        devices: devices.map(d => ({ ...publicDevice(d), online: onlineOf(d.last_seen) && d.status !== 'revoked' })),
        today: {
          sent: jobs.filter(j => j.status === 'sent').length,
          failed: jobs.filter(j => j.status === 'failed').length,
          pending: jobs.filter(j => j.status === 'queued' || j.status === 'sending').length
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

  if (path === 'connectx/devices' && method === 'GET') {
    if (s.role === 'admin' && !s.storeId) {
      let stores = await db(env, `stores?admin_id=eq.${s.id}&select=id,name`);
      let devices = await db(env, `connectx_devices?administrator_id=eq.${s.id}&select=*&order=last_seen.desc`).catch(() => []);
      let names = Object.fromEntries(stores.map(x => [x.id, x.name]));
      return json(devices.map(d => ({ ...publicDevice(d), shop_name: names[d.store_id] || null, online: onlineOf(d.last_seen) && d.status !== 'revoked' })));
    }
    if (!s.storeId) return fail('Shop access required.', 403);
    let devices = await db(env, `connectx_devices?store_id=eq.${s.storeId}&select=*&order=created_at.desc`).catch(() => []);
    return json(devices.map(d => ({ ...publicDevice(d), online: onlineOf(d.last_seen) && d.status !== 'revoked' })));
  }

  if (path.match(/^connectx\/devices\/[^/]+\/revoke$/) && method === 'POST') {
    let id = path.split('/')[2];
    let filter = s.storeId ? `id=eq.${id}&store_id=eq.${s.storeId}` : `id=eq.${id}&administrator_id=eq.${s.id}`;
    if (s.role !== 'admin' && !s.adminAccess && !allowed(s, 'settings', 'edit')) return fail('Permission denied.', 403);
    let [d] = await db(env, `connectx_devices?${filter}&select=*`);
    if (!d) return fail('Device not found.', 404);
    await db(env, `connectx_devices?id=eq.${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'revoked', is_primary: false })
    });
    await audit(env, s, 'revoke ConnectX device', 'connectx', id, { device_name: d.device_name });
    return json({ ok: true });
  }

  if (path.match(/^connectx\/devices\/[^/]+\/primary$/) && method === 'POST') {
    let id = path.split('/')[2];
    if (!s.storeId) return fail('Shop access required.', 403);
    if (s.role !== 'admin' && !s.adminAccess && !allowed(s, 'settings', 'edit')) return fail('Permission denied.', 403);
    let [d] = await db(env, `connectx_devices?id=eq.${id}&store_id=eq.${s.storeId}&select=*`);
    if (!d || d.status === 'revoked') return fail('Device not found.', 404);
    await db(env, `connectx_devices?store_id=eq.${s.storeId}&is_primary=eq.true`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_primary: false })
    }).catch(() => {});
    await db(env, `connectx_devices?id=eq.${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_primary: true })
    });
    return json({ ok: true });
  }

  /* ---- Device token routes ---- */
  if (s.role !== 'connectx_device') return null;

  let device = await loadDevice(env, s);
  if (!device) return fail('This ConnectX device has been revoked. Sign in again.', 403);
  if (device.store_id !== s.storeId) return fail('Device is not authorised for this shop.', 403);

  if (path === 'connectx/gateway/heartbeat' && method === 'POST') {
    let b = await body(request);
    let patch = { status: device.status === 'pending_test' ? 'pending_test' : 'active' };
    if (b.androidVersion) patch.android_version = String(b.androidVersion).slice(0, 40);
    if (b.deviceName) patch.device_name = String(b.deviceName).slice(0, 120);
    await touchDevice(env, device.id, patch);
    let settings = await smsSettingsFor(env, device.store_id);
    let [store] = await db(env, `stores?id=eq.${device.store_id}&select=id,name,address,phone`);
    let [admin] = await db(env, `administrators?id=eq.${device.administrator_id}&select=id,name,email`);
    return json({
      ok: true,
      device: publicDevice({ ...device, ...patch, last_seen: new Date().toISOString() }),
      shop: store,
      administrator: admin,
      smsEnabled: !!settings.enabled
    });
  }

  if (path === 'connectx/gateway/sim' && method === 'PATCH') {
    let b = await body(request);
    let patch = {};
    if (b.simSubscriptionId != null) patch.sim_subscription_id = String(b.simSubscriptionId);
    if (b.simCarrier != null) patch.sim_carrier = String(b.simCarrier).slice(0, 80);
    if (b.phoneNumber != null) patch.phone_number = String(b.phoneNumber).slice(0, 32);
    await touchDevice(env, device.id, patch);
    return json({ ok: true });
  }

  if (path === 'connectx/gateway/test' && method === 'POST') {
    let b = await body(request);
    await touchDevice(env, device.id, { status: b.ok === false ? 'pending_test' : 'active' });
    if (b.ok !== false && b.record !== false) {
      await enqueueSmsJob(env, {
        storeId: device.store_id,
        userId: device.administrator_id,
        phone: b.phone || device.phone_number,
        name: 'Test',
        recipientType: 'manual',
        messageType: 'TEST',
        eventType: 'TEST',
        messageBody: b.message || `ConnectX test from gateway ${device.device_name || ''}.`,
        idempotencyKey: `TEST:${device.id}:${Date.now()}`
      }).catch(() => {});
    }
    return json({ ok: true, status: b.ok === false ? 'pending_test' : 'active' });
  }

  if (path === 'connectx/gateway/disconnect' && method === 'POST') {
    await db(env, `connectx_devices?id=eq.${device.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'revoked', is_primary: false })
    });
    return json({ ok: true });
  }

  if (path === 'connectx/gateway/claim' && method === 'POST') {
    await touchDevice(env, device.id, { status: device.status === 'pending_test' ? 'pending_test' : 'active' });
    let b = await body(request);
    let limit = Math.min(20, Math.max(1, Number(b.limit || 8)));
    let stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let sending = await db(env, `connectx_sms_messages?store_id=eq.${device.store_id}&status=eq.sending&select=id,claimed_at,device_id`).catch(() => []);
    for (let j of sending) {
      if (!j.claimed_at || j.claimed_at < stale) {
        await db(env, `connectx_sms_messages?id=eq.${j.id}&store_id=eq.${device.store_id}&status=eq.sending`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'queued', claimed_at: null })
        }).catch(() => {});
      }
    }
    let queued = await db(env, `connectx_sms_messages?store_id=eq.${device.store_id}&status=eq.queued&select=*&order=created_at.asc&limit=${limit}`);
    let claimed = [];
    for (let job of queued) {
      let upd = await db(env, `connectx_sms_messages?id=eq.${job.id}&store_id=eq.${device.store_id}&status=eq.queued`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'sending',
          device_id: device.id,
          claimed_at: new Date().toISOString(),
          attempts: Number(job.attempts || 0) + 1
        })
      }).catch(() => null);
      if (upd != null) {
        claimed.push({
          id: job.id,
          shop_id: device.store_id,
          administrator_id: device.administrator_id,
          phone_number: job.to_phone,
          message: job.message_body,
          event_type: job.event_type || job.message_type,
          message_type: job.message_type,
          recipient_name: job.recipient_name,
          invoice_id: job.invoice_id,
          created_at: job.created_at,
          attempts: Number(job.attempts || 0) + 1
        });
      }
    }
    return json({ jobs: claimed });
  }

  if (path === 'connectx/gateway/report' && method === 'POST') {
    let b = await body(request);
    let id = b.jobId || b.id;
    if (!id) return fail('jobId is required.', 400);
    let status = b.status === 'sent' ? 'sent' : 'failed';
    let [job] = await db(env, `connectx_sms_messages?id=eq.${id}&store_id=eq.${device.store_id}&select=*`);
    if (!job) return fail('SMS job not found for this shop.', 404);
    if (job.device_id && job.device_id !== device.id && job.status === 'sent') {
      return json({ ok: true, duplicate: true });
    }
    let patch = {
      status,
      device_id: device.id,
      error_message: status === 'failed' ? String(b.error || 'SMS could not be sent').slice(0, 400) : null
    };
    if (status === 'sent') patch.sent_at = new Date().toISOString();
    await db(env, `connectx_sms_messages?id=eq.${id}&store_id=eq.${device.store_id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    await touchDevice(env, device.id, { status: 'active' });
    return json({ ok: true, status });
  }

  if (path === 'connectx/gateway/stats' && method === 'GET') {
    let today = new Date().toISOString().slice(0, 10);
    let jobs = await db(env, `connectx_sms_messages?store_id=eq.${device.store_id}&created_at=gte.${today}T00:00:00Z&select=id,status,sent_at,created_at`);
    let last = await db(env, `connectx_sms_messages?store_id=eq.${device.store_id}&select=created_at,sent_at,status&order=created_at.desc&limit=1`);
    await touchDevice(env, device.id);
    let [store] = await db(env, `stores?id=eq.${device.store_id}&select=id,name,address,phone`);
    let [admin] = await db(env, `administrators?id=eq.${device.administrator_id}&select=id,name,email`);
    return json({
      sent: jobs.filter(j => j.status === 'sent').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      pending: jobs.filter(j => j.status === 'queued' || j.status === 'sending').length,
      lastActivity: last[0]?.sent_at || last[0]?.created_at || null,
      device: publicDevice(device),
      shop: store,
      administrator: admin
    });
  }

  if (path === 'connectx/gateway/activity' && method === 'GET') {
    let qs = new URL(request.url).searchParams;
    let range = qs.get('range') || 'today';
    let days = range === '30d' || range === '30' ? 30 : range === '7d' || range === '7' ? 7 : 1;
    let since = new Date(Date.now() - days * 86400000).toISOString();
    let rows = await db(env, `connectx_sms_messages?store_id=eq.${device.store_id}&created_at=gte.${since}&select=id,to_phone,recipient_name,message_type,event_type,status,error_message,message_body,created_at,sent_at,invoice_id&order=created_at.desc&limit=250`);
    return json({ shop_id: device.store_id, items: rows });
  }

  if (path === 'connectx/gateway/me' && method === 'GET') {
    let [store] = await db(env, `stores?id=eq.${device.store_id}&select=id,name,address,phone,shop_code`);
    let [admin] = await db(env, `administrators?id=eq.${device.administrator_id}&select=id,name,email`);
    let shops = await db(env, `connectx_devices?administrator_id=eq.${device.administrator_id}&status=neq.revoked&select=store_id,status,device_name`);
    return json({ device: publicDevice(device), shop: store, administrator: admin, connectedStoreIds: [...new Set(shops.map(x => x.store_id))] });
  }

  return fail('Unknown ConnectX gateway endpoint.', 404);
}
