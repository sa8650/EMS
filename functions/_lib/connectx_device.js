/* Direct EMS ↔ ConnectX Android device API.
   EMS is the only persistent SMS queue. Device bearer tokens are random,
   one-time-issued credentials stored only as SHA-256 hashes in connectx_devices.
   ConnectX Control is not called from this module. */
import { db } from './db.js';
import { smsSettingsFor } from './connectx_sms.js';

const CLAIM_TTL_MS = 5 * 60 * 1000;
const SENT_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const PAGE_SIZE = 40;
const DEVICE_PREFIX = 'cxd_';
const DEFAULT_POLL_SECONDS = 30;
const MIN_POLL_SECONDS = 10;
const MAX_POLL_SECONDS = 300;
const isoNow = () => new Date().toISOString();
const pollIntervalSeconds = env => {
  const configured = Number(env?.CONNECTX_POLL_INTERVAL_SECONDS);
  const value = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_POLL_SECONDS;
  return Math.max(MIN_POLL_SECONDS, Math.min(MAX_POLL_SECONDS, value));
};
const q = value => encodeURIComponent(String(value ?? ''));
const safeNumber = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const uuidLike = value => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(value || ''));

function randomHex(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, b => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function bearer(request) {
  const raw = request.headers.get('authorization') || '';
  return raw.replace(/^Bearer\s+/i, '').trim();
}

function publicDevice(device) {
  return {
    id: device.id,
    device_public_id: device.device_public_id,
    device_name: device.device_name || '',
    android_version: device.android_version || '',
    app_version: device.app_version || '',
    version_code: device.version_code ?? null,
    sim_subscription_id: device.sim_subscription_id || '',
    sim_carrier: device.sim_carrier || '',
    phone_number: device.phone_number || '',
    status: device.status || 'pending_test',
    last_seen: device.last_seen || null,
    last_error: device.last_error || null
  };
}

function publicAdmin(admin) {
  if (!admin) return null;
  return {
    id: admin.id,
    admin_code: admin.admin_code || '',
    name: admin.name || '',
    email: admin.email || '',
    phone: admin.phone || '',
    address: admin.address || '',
    active: admin.active !== false,
    created_at: admin.created_at || ''
  };
}

function publicShop(shop) {
  if (!shop) return null;
  return {
    id: shop.id,
    name: shop.name || 'Shop',
    address: shop.address || '',
    phone: shop.phone || '',
    shop_code: shop.shop_code || '',
    category: shop.category || shop.shop_type || shop.business_type || '',
    status: shop.status || ''
  };
}

async function requireAdmin({ env, s, fail }) {
  if (!s || s.role !== 'admin') return { error: fail('Administrator sign-in is required.', 401) };
  const [admin] = await db(env, `administrators?id=eq.${q(s.id)}&select=id,admin_code,name,email,phone,address,active,created_at`);
  if (!admin || admin.active === false) return { error: fail('Your administrator account is inactive. Sign in again or contact EMS support.', 403) };
  return { admin };
}

async function requireDevice({ env, request, fail }) {
  const token = bearer(request);
  if (!token.startsWith(DEVICE_PREFIX) || token.length < 68) return { error: fail('A valid EMS ConnectX device token is required.', 401) };
  const digest = await hashToken(token);
  const [device] = await db(env, `connectx_devices?device_token_hash=eq.${q(digest)}&select=*`);
  if (!device || device.status === 'revoked' || !device.device_token_hash) {
    return { error: fail('This ConnectX device token is invalid or revoked. Sign in to EMS and register the device again.', 401) };
  }
  const [admin, shop] = await Promise.all([
    db(env, `administrators?id=eq.${q(device.administrator_id)}&select=id,admin_code,name,email,phone,address,active,created_at`),
    db(env, `stores?id=eq.${q(device.store_id)}&select=id,name,address,phone,shop_code,category,shop_type,business_type,status,admin_id`)
  ]).then(([a, st]) => [a[0], st[0]]);
  if (!admin || admin.active === false || !shop || String(shop.admin_id) !== String(device.administrator_id)) {
    return { error: fail('The administrator or shop for this device is no longer active.', 403) };
  }
  return { device, admin, shop };
}

function isClaimMatch(row, device, claimToken) {
  return !!row && row.status === 'processing' &&
    String(row.device_id || '') === String(device.id) &&
    String(row.claim_token || '') === String(claimToken || '');
}

async function loadJob(env, storeId, jobId) {
  if (!uuidLike(jobId)) return null;
  const [row] = await db(env, `connectx_sms_messages?id=eq.${q(jobId)}&store_id=eq.${q(storeId)}&select=*`);
  return row || null;
}

async function recoverStaleJobs(env, storeId) {
  const now = Date.now();
  const cutoff = new Date(now - CLAIM_TTL_MS).toISOString();
  const staleProcessing = await db(env,
    `connectx_sms_messages?store_id=eq.${q(storeId)}&status=eq.processing&claimed_at=lt.${q(cutoff)}&select=*`
  ).catch(() => []);
  for (const row of staleProcessing) {
    const claimedAt = Date.parse(row.claimed_at || '');
    if (!Number.isFinite(claimedAt) || now - claimedAt < CLAIM_TTL_MS) continue;
    const stillOwned = `id=eq.${q(row.id)}&store_id=eq.${q(storeId)}&status=eq.processing&claim_token=eq.${q(row.claim_token || '')}`;
    if (row.dispatch_phase === 'claimed') {
      await db(env, `connectx_sms_messages?${stillOwned}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'pending', device_id: null, claim_token: null, dispatch_phase: null,
          claimed_at: null, error_message: 'Device claim expired before SMS send began; safely returned to the queue.'
        })
      }).catch(() => []);
    } else {
      await db(env, `connectx_sms_messages?${stillOwned}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'unknown', result_at: isoNow(),
          error_message: 'The device stopped responding after sending began. Delivery is unknown; it was not automatically resent.'
        })
      }).catch(() => []);
    }
  }

  const sentCutoff = new Date(now - SENT_CONFIRM_TTL_MS).toISOString();
  const oldSent = await db(env,
    `connectx_sms_messages?store_id=eq.${q(storeId)}&status=eq.sent&sent_at=lt.${q(sentCutoff)}&select=id,claim_token`
  ).catch(() => []);
  for (const row of oldSent) {
    await db(env, `connectx_sms_messages?id=eq.${q(row.id)}&store_id=eq.${q(storeId)}&status=eq.sent`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'unknown', result_at: isoNow(),
        error_message: 'No carrier delivery confirmation arrived within 24 hours. SMS send acceptance is not recipient delivery.'
      })
    }).catch(() => []);
  }
}

function nextAttemptDelayMs(attempts) {
  return Math.min(15 * 60 * 1000, 30 * 1000 * (2 ** Math.max(0, attempts - 1)));
}

function statusCounts(rows) {
  const count = key => rows.filter(row => row.status === key).length;
  return {
    sent: count('sent') + count('delivered'),
    delivered: count('delivered'),
    failed: count('failed'),
    unknown: count('unknown'),
    pending: count('pending'),
    processing: count('processing'),
    cancelled: count('cancelled')
  };
}

function startOfLocalDay(offsetMinutes) {
  const now = Date.now();
  const local = new Date(now + offsetMinutes * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMinutes * 60_000).toISOString();
}

function emailItem(row) {
  return {
    ...row,
    to_emails: Array.isArray(row.to_emails) ? row.to_emails : [],
    cc_emails: Array.isArray(row.cc_emails) ? row.cc_emails : [],
    bcc_emails: Array.isArray(row.bcc_emails) ? row.bcc_emails : []
  };
}

export async function connectxDeviceRoutes(ctx) {
  const { env, request, path, method, s, json, fail, body, audit, hasPlan } = ctx;
  const adminOnly = path === 'connectx/device/shops' || path === 'connectx/device/register';
  if (!path.startsWith('connectx/device/')) return null;
  const url = new URL(request.url);

  if (adminOnly) {
    const { admin, error } = await requireAdmin({ env, s, fail });
    if (error) return error;
    if (path === 'connectx/device/shops' && method === 'GET') {
      const shops = await db(env, `stores?admin_id=eq.${q(admin.id)}&status=in.(active,read_only)&select=id,name,address,phone,shop_code,category,shop_type,business_type,status&order=created_at.asc`);
      const devices = await db(env, `connectx_devices?administrator_id=eq.${q(admin.id)}&status=neq.revoked&select=id,store_id,device_public_id,device_name,app_version,version_code,status,last_seen,sim_carrier,phone_number`);
      const recent = Date.now() - 3 * 60 * 1000;
      const result = shops.map(shop => {
        const matching = devices.filter(d => String(d.store_id) === String(shop.id));
        const active = matching.some(d => d.status === 'active' && Number.isFinite(Date.parse(d.last_seen || '')) && Date.now() - Date.parse(d.last_seen) < 3 * 60 * 1000);
        return {
          ...publicShop(shop),
          connected: active,
          devices: matching.map(d => ({ ...publicDevice(d), online: !!d.last_seen && Date.now() - Date.parse(d.last_seen) < 3 * 60 * 1000 }))
        };
      });
      return json({ administrator: publicAdmin(admin), shops: result, serverTime: isoNow(), staleAfterSeconds: Math.floor((Date.now() - (Date.now() - recent)) / 1000) });
    }

    if (path === 'connectx/device/register' && method === 'POST') {
      const b = await body(request);
      const storeId = String(b.shopId || b.storeId || '').trim();
      if (!uuidLike(storeId)) return fail('Select a valid EMS shop.', 400);
      const [store] = await db(env, `stores?id=eq.${q(storeId)}&admin_id=eq.${q(admin.id)}&select=id,name,address,phone,shop_code,category,shop_type,business_type,status,admin_id`);
      if (!store || !['active', 'read_only'].includes(store.status)) return fail('This shop is not available to this administrator.', 404);
      const plan = hasPlan ? await hasPlan(store.id) : null;
      if (!plan) return fail('ConnectX SMS license or add-on is inactive for this shop.', 403);
      const settings = await smsSettingsFor(env, store.id);
      if (!settings.enabled) return fail('SMS is disabled in this shop’s settings.', 403);

      const now = isoNow();
      const token = DEVICE_PREFIX + randomHex(32);
      const patch = {
        administrator_id: admin.id,
        store_id: store.id,
        device_name: String(b.deviceName || 'Android phone').trim().slice(0, 120),
        android_version: String(b.androidVersion || '').trim().slice(0, 30),
        app_version: String(b.appVersion || '').trim().slice(0, 40),
        version_code: Math.max(0, Math.floor(safeNumber(b.versionCode, 0))),
        sim_subscription_id: b.simSubscriptionId === undefined ? null : String(b.simSubscriptionId).slice(0, 30),
        sim_carrier: String(b.simCarrier || '').trim().slice(0, 80),
        phone_number: String(b.phoneNumber || '').trim().slice(0, 40),
        status: 'pending_test',
        device_token_hash: await hashToken(token),
        last_seen: now,
        last_error: null,
        revoked_at: null,
        updated_at: now
      };
      let device;
      const existingId = String(b.existingDeviceId || '').trim();
      if (uuidLike(existingId)) {
        const [existing] = await db(env, `connectx_devices?id=eq.${q(existingId)}&administrator_id=eq.${q(admin.id)}&store_id=eq.${q(store.id)}&select=id`);
        if (existing) {
          [device] = await db(env, `connectx_devices?id=eq.${q(existingId)}&administrator_id=eq.${q(admin.id)}&store_id=eq.${q(store.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch)
          });
        }
      }
      if (!device) {
        const devicePublicId = 'CX-' + randomHex(5).toUpperCase();
        [device] = await db(env, 'connectx_devices', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...patch, device_public_id: devicePublicId, created_at: now, is_primary: false })
        });
      }
      if (!device) throw new Error('Could not register this ConnectX device.');
      if (audit) await audit(env, { ...s, storeId: store.id }, 'register direct ConnectX device', 'connectx_device', device.id, { device_public_id: device.device_public_id });
      return json({ ok: true, device: publicDevice(device), shop: publicShop(store), administrator: publicAdmin(admin), deviceToken: token, pollIntervalSeconds: pollIntervalSeconds(env) }, 201);
    }
  }

  const { device, admin, shop, error } = await requireDevice({ env, request, fail });
  if (error) return error;

  if (path === 'connectx/device/heartbeat' && method === 'POST') {
    const b = await body(request);
    const now = isoNow();
    const patch = {
      last_seen: now,
      app_version: String(b.appVersion || device.app_version || '').trim().slice(0, 40),
      version_code: Math.max(0, Math.floor(safeNumber(b.versionCode, device.version_code || 0))),
      android_version: String(b.androidVersion || device.android_version || '').trim().slice(0, 30),
      last_error: null,
      updated_at: now
    };
    if (device.status === 'offline') patch.status = 'active';
    const [updated] = await db(env, `connectx_devices?id=eq.${q(device.id)}&status=neq.revoked`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch)
    });
    return json({ ok: true, device: publicDevice(updated || device), shop: publicShop(shop), administrator: publicAdmin(admin), serverTime: now, pollIntervalSeconds: pollIntervalSeconds(env) });
  }

  if (path === 'connectx/device/sim' && method === 'PATCH') {
    const b = await body(request);
    const subscriptionId = String(b.simSubscriptionId ?? '').trim();
    if (!/^-?\d{1,12}$/.test(subscriptionId)) return fail('A valid SIM subscription is required.', 400);
    const [updated] = await db(env, `connectx_devices?id=eq.${q(device.id)}&store_id=eq.${q(shop.id)}&status=neq.revoked`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sim_subscription_id: subscriptionId,
        sim_carrier: String(b.simCarrier || '').trim().slice(0, 80),
        phone_number: String(b.phoneNumber || '').trim().slice(0, 40),
        updated_at: isoNow()
      })
    });
    return json({ ok: true, device: publicDevice(updated || device) });
  }

  if (path === 'connectx/device/test' && method === 'POST') {
    const b = await body(request);
    if (b.ok !== true && b.ok !== false) return fail('Test result must be true or false.', 400);
    if (b.ok) {
      const plan = hasPlan ? await hasPlan(shop.id) : null;
      if (!plan) return fail('ConnectX SMS license or add-on is inactive for this shop.', 403);
    }
    const [updated] = await db(env, `connectx_devices?id=eq.${q(device.id)}&store_id=eq.${q(shop.id)}&status=neq.revoked`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: b.ok ? 'active' : 'pending_test', last_seen: isoNow(), last_error: null, updated_at: isoNow() })
    });
    return json({ ok: true, device: publicDevice(updated || device), message: b.ok ? 'Device enabled for direct SMS polling.' : 'Device remains in setup.' });
  }

  if (path === 'connectx/device/jobs/claim' && method === 'POST') {
    const b = await body(request);
    if (device.status !== 'active') return json({ jobs: [], status: device.status, pollIntervalSeconds: pollIntervalSeconds(env) });
    const plan = hasPlan ? await hasPlan(shop.id) : null;
    if (!plan) return fail('ConnectX SMS license or add-on is inactive for this shop.', 403);
    const settings = await smsSettingsFor(env, shop.id);
    if (!settings.enabled) return json({ jobs: [], status: 'sms_disabled', pollIntervalSeconds: pollIntervalSeconds(env) });
    await recoverStaleJobs(env, shop.id);
    const take = Math.max(1, Math.min(12, Math.floor(safeNumber(b.limit, 8))));
    const [noSchedule, due] = await Promise.all([
      db(env, `connectx_sms_messages?store_id=eq.${q(shop.id)}&status=eq.pending&next_attempt_at=is.null&select=*&order=created_at.asc&limit=${take * 3}`),
      db(env, `connectx_sms_messages?store_id=eq.${q(shop.id)}&status=eq.pending&next_attempt_at=lte.${q(isoNow())}&select=*&order=created_at.asc&limit=${take * 3}`)
    ]);
    const eligible = [...new Map([...noSchedule, ...due].map(row => [row.id, row])).values()]
      .filter(row => !row.next_attempt_at || Date.parse(row.next_attempt_at) <= Date.now())
      .sort((a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0));
    const jobs = [];
    for (const row of eligible) {
      if (jobs.length >= take) break;
      const claimToken = randomHex(24);
      const claimedAt = isoNow();
      const [claimed] = await db(env,
        `connectx_sms_messages?id=eq.${q(row.id)}&store_id=eq.${q(shop.id)}&status=eq.pending`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'processing', device_id: device.id, claim_token: claimToken,
            dispatch_phase: 'claimed', claimed_at: claimedAt, error_message: null
          })
        }
      );
      if (!claimed) continue;
      jobs.push({
        id: claimed.id,
        request_id: claimed.request_id || claimed.id,
        shop_id: claimed.store_id,
        phone_number: claimed.to_phone,
        message: claimed.message_body,
        message_type: claimed.message_type,
        event_type: claimed.event_type,
        recipient_name: claimed.recipient_name,
        created_at: claimed.created_at,
        claim_token: claimToken,
        attempts: Number(claimed.attempts || 0)
      });
    }
    return json({ jobs, serverTime: isoNow(), pollIntervalSeconds: pollIntervalSeconds(env) });
  }

  if (path === 'connectx/device/jobs/start' && method === 'POST') {
    const b = await body(request);
    const jobId = String(b.jobId || b.job_id || '');
    const claimToken = String(b.claimToken || b.claim_token || '');
    if (!claimIdValid(jobId) || !/^[0-9a-f]{48}$/i.test(claimToken)) return fail('A valid job ID and claim token are required.', 400);
    const row = await loadJob(env, shop.id, jobId);
    if (!row || String(row.device_id || '') !== String(device.id) || String(row.claim_token || '') !== claimToken || row.status !== 'processing') return fail('This SMS claim is no longer valid.', 409);
    if (row.dispatch_phase === 'sending') return json({ ok: true, id: row.id, attempts: Number(row.attempts || 0), sim_used: row.sim_used || device.sim_carrier || '' });
    if (row.dispatch_phase !== 'claimed') return fail('This SMS is not ready to start.', 409);
    const attempts = Number(row.attempts || 0) + 1;
    const now = isoNow();
    const [updated] = await db(env,
      `connectx_sms_messages?id=eq.${q(jobId)}&store_id=eq.${q(shop.id)}&status=eq.processing&device_id=eq.${q(device.id)}&claim_token=eq.${q(claimToken)}&dispatch_phase=eq.claimed`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dispatch_phase: 'sending', attempts, last_attempt_at: now,
          sim_used: String(device.sim_carrier || device.sim_subscription_id || '').slice(0, 100),
          error_message: null
        })
      }
    );
    if (!updated) return fail('This SMS claim changed before sending could start.', 409);
    return json({ ok: true, id: updated.id, attempts, sim_used: updated.sim_used || '' });
  }

  if (path === 'connectx/device/jobs/report' && method === 'POST') {
    const b = await body(request);
    const jobId = String(b.jobId || b.job_id || '');
    const claimToken = String(b.claimToken || b.claim_token || '');
    const reported = String(b.status || '').toLowerCase();
    const errorText = String(b.error || b.error_message || '').trim().slice(0, 500);
    if (!uuidLike(jobId) || !/^[0-9a-f]{48}$/i.test(claimToken)) return fail('A valid job ID and claim token are required.', 400);
    if (!['sent', 'delivered', 'failed', 'unknown'].includes(reported)) return fail('Unsupported SMS result status.', 400);
    let row = await loadJob(env, shop.id, jobId);
    if (!row || String(row.device_id || '') !== String(device.id) || String(row.claim_token || '') !== claimToken) return fail('This SMS result does not match the current device claim.', 409);
    if (row.status === reported || (row.status === 'delivered' && reported === 'sent')) return json({ ok: true, duplicate: true, status: row.status });
    if (!['processing', 'sent', 'unknown'].includes(row.status)) return fail('This SMS is already final and cannot be changed by this claim.', 409);
    if (reported === 'sent' && (row.dispatch_phase !== 'sending' || row.status !== 'processing')) return fail('SMS send acceptance can only be recorded for an active send.', 409);
    if (reported === 'delivered' && row.dispatch_phase !== 'sending' && !['sent', 'unknown'].includes(row.status)) return fail('Carrier delivery confirmation is not valid for this claim.', 409);

    const now = isoNow();
    let patch;
    const attemptsAfterFailure = Number(row.attempts || 0) +
      (reported === 'failed' && b.retryable === true && row.dispatch_phase === 'claimed' ? 1 : 0);
    if (reported === 'failed' && b.retryable === true && attemptsAfterFailure < MAX_ATTEMPTS) {
      const next = new Date(Date.now() + nextAttemptDelayMs(attemptsAfterFailure)).toISOString();
      patch = {
        status: 'pending', device_id: null, claim_token: null, dispatch_phase: null,
        claimed_at: null, next_attempt_at: next, attempts: attemptsAfterFailure,
        error_message: errorText || 'Android could not submit this SMS; a bounded retry is scheduled.',
        result_at: now
      };
    } else {
      patch = {
        status: reported,
        error_message: reported === 'sent' || reported === 'delivered' ? null : (errorText || (reported === 'unknown' ? 'SMS outcome could not be confirmed.' : 'Android reported a send failure.')),
        result_at: now,
        sent_at: reported === 'sent' || reported === 'delivered' ? (row.sent_at || now) : row.sent_at,
        delivered_at: reported === 'delivered' ? now : row.delivered_at,
        next_attempt_at: null,
        attempts: attemptsAfterFailure
      };
    }
    const guardStatus = ['processing', 'sent', 'unknown'].includes(row.status) ? row.status : 'processing';
    const [updated] = await db(env,
      `connectx_sms_messages?id=eq.${q(jobId)}&store_id=eq.${q(shop.id)}&status=eq.${q(guardStatus)}&device_id=eq.${q(device.id)}&claim_token=eq.${q(claimToken)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch)
      }
    );
    if (!updated) {
      row = await loadJob(env, shop.id, jobId);
      if (row && (row.status === reported || (row.status === 'delivered' && reported === 'sent'))) return json({ ok: true, duplicate: true, status: row.status });
      return fail('SMS status changed before this result was recorded.', 409);
    }
    return json({ ok: true, status: updated.status, retryScheduled: updated.status === 'pending', attempts: Number(updated.attempts || 0) });
  }

  if (path === 'connectx/device/jobs/cancel' && method === 'POST') {
    const b = await body(request);
    const jobId = String(b.jobId || b.job_id || '');
    if (!uuidLike(jobId)) return fail('A valid SMS ID is required.', 400);
    const [cancelled] = await db(env,
      `connectx_sms_messages?id=eq.${q(jobId)}&store_id=eq.${q(shop.id)}&status=eq.pending`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', result_at: isoNow(), error_message: 'Cancelled from the ConnectX Android app before sending.' })
      }
    );
    return json({ ok: true, cancelled: !!cancelled });
  }

  if (path === 'connectx/device/stats' && method === 'GET') {
    const offset = Math.max(-840, Math.min(840, Math.trunc(safeNumber(url.searchParams.get('utcOffsetMinutes'), 0))));
    const start = startOfLocalDay(offset);
    const rows = await db(env, `connectx_sms_messages?store_id=eq.${q(shop.id)}&created_at=gte.${q(start)}&select=id,status,created_at`);
    const counts = statusCounts(rows);
    const latest = [...rows].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
    return json({
      ...counts,
      lastActivity: latest?.created_at || null,
      shop: publicShop(shop), administrator: publicAdmin(admin), device: publicDevice(device),
      serverTime: isoNow()
    });
  }

  if (path === 'connectx/device/activity' && method === 'GET') {
    const range = String(url.searchParams.get('range') || 'all');
    const limit = Math.max(1, Math.min(100, Math.trunc(safeNumber(url.searchParams.get('limit'), 40))));
    const offset = Math.max(0, Math.min(5000, Math.trunc(safeNumber(url.searchParams.get('offset'), 0))));
    const minutes = Math.max(-840, Math.min(840, Math.trunc(safeNumber(url.searchParams.get('utcOffsetMinutes'), 0))));
    let filter = `store_id=eq.${q(shop.id)}`;
    if (range === 'today') filter += `&created_at=gte.${q(startOfLocalDay(minutes))}`;
    else if (range === '7d') filter += `&created_at=gte.${q(new Date(Date.now() - 7 * 86400000).toISOString())}`;
    else if (range === '30d') filter += `&created_at=gte.${q(new Date(Date.now() - 30 * 86400000).toISOString())}`;
    else if (range !== 'all') return fail('Invalid SMS history range.', 400);
    const rows = await db(env, `connectx_sms_messages?${filter}&select=*&order=created_at.desc&limit=${limit + 1}&offset=${offset}`);
    const hasMore = rows.length > limit;
    return json({ items: rows.slice(0, limit), hasMore });
  }

  if (path === 'connectx/device/emails/stats' && method === 'GET') {
    const offset = Math.max(-840, Math.min(840, Math.trunc(safeNumber(url.searchParams.get('utcOffsetMinutes'), 0))));
    const start = startOfLocalDay(offset);
    const rows = await db(env, `connectx_messages?store_id=eq.${q(shop.id)}&shop_deleted_at=is.null&created_at=gte.${q(start)}&select=*&order=created_at.desc&limit=250`);
    return json({
      sent: rows.filter(row => row.status === 'sent').length,
      failed: rows.filter(row => row.status === 'failed').length,
      pending: rows.filter(row => ['queued', 'sending'].includes(row.status)).length,
      latest: rows[0] ? emailItem(rows[0]) : null
    });
  }

  if (path === 'connectx/device/emails' && method === 'GET') {
    const page = Math.max(0, Math.min(500, Math.trunc(safeNumber(url.searchParams.get('page'), 0))));
    const snapshot = url.searchParams.get('snapshot');
    let filter = `store_id=eq.${q(shop.id)}&shop_deleted_at=is.null`;
    if (page > 0) {
      if (!snapshot || !Number.isFinite(Date.parse(snapshot))) return fail('A valid email history snapshot is required.', 400);
      filter += `&created_at=lte.${q(snapshot)}`;
    }
    const rows = await db(env, `connectx_messages?${filter}&select=*&order=created_at.desc&limit=${PAGE_SIZE + 1}&offset=${page * PAGE_SIZE}`);
    const hasMore = rows.length > PAGE_SIZE;
    const items = rows.slice(0, PAGE_SIZE).map(emailItem);
    const anchor = page === 0 ? (items[0]?.created_at || isoNow()) : snapshot;
    return json({ items, page, snapshot: anchor, hasMore });
  }

  const emailDetailMatch = path.match(/^connectx\/device\/emails\/([^/]+)$/);
  if (emailDetailMatch && method === 'GET') {
    const id = emailDetailMatch[1];
    if (!uuidLike(id)) return fail('Invalid email ID.', 400);
    const [row] = await db(env, `connectx_messages?id=eq.${q(id)}&store_id=eq.${q(shop.id)}&shop_deleted_at=is.null&select=*`);
    return row ? json(emailItem(row)) : fail('Email history item not found.', 404);
  }

  if (path === 'connectx/device/disconnect' && method === 'POST') {
    await db(env, `connectx_devices?id=eq.${q(device.id)}&store_id=eq.${q(shop.id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'revoked', device_token_hash: null, revoked_at: isoNow(), updated_at: isoNow() })
    });
    return json({ ok: true, revoked: true });
  }

  if (path === 'connectx/device/me' && method === 'GET') {
    return json({ administrator: publicAdmin(admin), shop: publicShop(shop), device: publicDevice(device) });
  }

  return null;
}

function claimIdValid(value) {
  return uuidLike(value);
}
