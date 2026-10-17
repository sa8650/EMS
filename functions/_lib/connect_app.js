/* =====================================================================
   EMS Connect Server
   --------------------------------------------------------------------
   EMS never talks to the Android app and never reads another product's
   database. The only integration surface is the authenticated Connect
   App endpoint (POST /connect) plus the owner-console routes below.

   Connection lifecycle
     1. Owner pastes a remote Connect Endpoint (ConnectX, InfluenceOS, …)
     2. EMS sends CONNECT_REQUEST
     3. The remote administrator approves
     4. Remote calls EMS /connect with HANDSHAKE
     5. Both sides store Connection ID + shared secret and show Connected

   SMS
     Shop queue → SEND_SMS → remote Connect Server
     SMS_RESULT returns SUCCESS or FAILED for the same Request ID.
   ===================================================================== */

import { db } from './db.js';
import {
  PROTOCOL, applicationId, connectionId, pairingCode, requestToken, sharedSecret,
  parsePerms, permsJson, signEnvelope, verifySignature, freshTimestamp,
  normalizeEndpoint, jsonResponse, failResponse, postConnect, getConnect, nowIso
} from './connect_protocol.js';

const REQUEST_TTL_MS = 30 * 60 * 1000;
const SMS_MAP = { PENDING: 'queued', PROCESSING: 'sending', SUCCESS: 'sent', FAILED: 'failed' };
const SMS_CANON = { queued: 'PENDING', sending: 'PROCESSING', sent: 'SUCCESS', failed: 'FAILED', PENDING: 'PENDING', PROCESSING: 'PROCESSING', SUCCESS: 'SUCCESS', FAILED: 'FAILED' };

export function canonSms(status) {
  return SMS_CANON[status] || status || 'PENDING';
}

function endpointFrom(request, override) {
  const saved = normalizeEndpoint(override);
  if (saved) return saved;
  try {
    const url = new URL(request.url);
    return `${url.origin}/connect`;
  } catch {
    return '';
  }
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export async function ensureIdentity(env, request) {
  let row = null;
  try {
    const rows = await db(env, 'connect_identity?id=eq.1&select=*');
    row = rows?.[0] || null;
  } catch (error) {
    const msg = String(error?.message || error);
    if (/connect_identity|schema cache|does not exist|no such table/i.test(msg)) {
      return { ready: false, error: 'Connect App tables are not installed. Apply supabase/migrations/046_connect_app.sql (or supabase/d1/migration_connect_app.sql on D1).' };
    }
    throw error;
  }
  if (!row) {
    const created = {
      id: 1,
      application_id: applicationId('EMS'),
      application_name: 'EMS',
      kind: 'product',
      endpoint_override: '',
      sms_seq: 10000,
      created_at: nowIso()
    };
    try {
      const inserted = await db(env, 'connect_identity', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(created)
      });
      row = inserted?.[0] || created;
    } catch (error) {
      const again = await db(env, 'connect_identity?id=eq.1&select=*').catch(() => []);
      row = again?.[0];
      if (!row) throw error;
    }
  }
  return {
    ready: true,
    ...row,
    connect_endpoint: endpointFrom(request, row.endpoint_override)
  };
}

export function publicIdentity(ident) {
  return {
    protocol: PROTOCOL,
    application_id: ident.application_id,
    application_name: ident.application_name || 'EMS',
    kind: ident.kind || 'product',
    connect_endpoint: ident.connect_endpoint,
    capabilities: ['sms:send', 'sms:status']
  };
}

function publicConnection(row) {
  if (!row) return null;
  return {
    connection_id: row.id,
    remote_application_id: row.remote_application_id,
    remote_application_name: row.remote_application_name,
    remote_endpoint: row.remote_endpoint,
    remote_kind: row.remote_kind,
    display_name: row.display_name,
    permissions: parsePerms(row.permissions),
    status: row.status,
    connected_at: row.connected_at,
    disconnected_at: row.disconnected_at,
    last_seen_at: row.last_seen_at,
    connected: row.status === 'ACTIVE'
  };
}

function publicRequest(row) {
  if (!row) return null;
  return {
    request_token: row.id,
    direction: row.direction,
    pairing_code: row.pairing_code,
    remote_application_id: row.remote_application_id,
    remote_application_name: row.remote_application_name,
    remote_endpoint: row.remote_endpoint,
    display_name: row.display_name,
    requested_permissions: parsePerms(row.requested_permissions),
    status: row.status,
    connection_id: row.connection_id,
    created_at: row.created_at,
    expires_at: row.expires_at
  };
}

async function touchConnection(env, id) {
  await db(env, `connect_connections?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ last_seen_at: nowIso() })
  }).catch(() => {});
}

export async function nextSmsRequestId(env) {
  try {
    const ident = await ensureIdentity(env, { url: 'https://ems.local/connect' });
    if (!ident.ready) return 'SMS-' + Date.now().toString(36).toUpperCase();
    for (let i = 0; i < 6; i++) {
      const current = Number(ident.sms_seq || 10000);
      const next = current + 1 + i;
      const updated = await db(env, `connect_identity?id=eq.1&sms_seq=eq.${current}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ sms_seq: next })
      }).catch(() => []);
      if (updated?.[0]) return 'SMS-' + String(next).padStart(5, '0');
      const fresh = await db(env, 'connect_identity?id=eq.1&select=sms_seq').catch(() => []);
      if (fresh?.[0]) ident.sms_seq = fresh[0].sms_seq;
    }
  } catch { /* fall through */ }
  return 'SMS-' + Date.now().toString(36).toUpperCase();
}

async function patchSms(env, id, patch) {
  const attempts = [patch];
  if (patch.status && SMS_MAP[patch.status]) attempts.push({ ...patch, status: SMS_MAP[patch.status] });
  let last;
  for (const body of attempts) {
    try {
      const rows = await db(env, `connectx_sms_messages?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return rows?.[0] || body;
    } catch (error) {
      last = error;
      if (!/check|constraint|request_id|connection_id|sim_used|result_at/i.test(String(error?.message || error))) throw error;
    }
  }
  if (last) console.error('patchSms', last);
  return null;
}

export async function insertSmsRow(env, row) {
  const withoutNewCols = { ...row };
  for (const k of ['request_id', 'connection_id', 'sim_used', 'result_at']) delete withoutNewCols[k];
  const attempts = [
    row,
    { ...row, status: 'queued' },
    { ...withoutNewCols, status: row.status },
    { ...withoutNewCols, status: 'queued' }
  ];
  let last;
  for (const body of attempts) {
    try {
      const rows = await db(env, 'connectx_sms_messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return rows?.[0] || body;
    } catch (error) {
      last = error;
      if (!/check|constraint|request_id|connection_id|sim_used|result_at|column/i.test(String(error?.message || error))) throw error;
    }
  }
  throw last;
}

async function activeSmsConnection(env) {
  const rows = await db(env, 'connect_connections?status=eq.ACTIVE&select=*&order=connected_at.desc').catch(() => []);
  return (rows || []).find(r => parsePerms(r.permissions).includes('sms:send')) || null;
}

export async function dispatchSmsRecord(env, record) {
  if (!record?.id) return { skipped: 'no_record' };
  const status = canonSms(record.status);
  if (status === 'SUCCESS' || status === 'FAILED') return { skipped: 'final', status };
  const conn = await activeSmsConnection(env);
  if (!conn) {
    await patchSms(env, record.id, { status: 'PENDING', error_message: 'Waiting for an active Connect App connection with sms:send.' });
    return { ok: false, status: 'PENDING', error: 'not_connected' };
  }
  let requestId = record.request_id;
  if (!requestId) {
    requestId = await nextSmsRequestId(env);
    await patchSms(env, record.id, { request_id: requestId, status: 'PENDING' });
  }
  const envelope = await signEnvelope({
    action: 'SEND_SMS',
    applicationId: (await ensureIdentity(env, { url: conn.remote_endpoint || 'https://ems.local/connect' })).application_id,
    connectionId: conn.id,
    secret: conn.shared_secret,
    payload: {
      request_id: requestId,
      recipient: record.to_phone,
      message: record.message_body,
      shop_id: record.store_id || '',
      meta: {
        recipient_name: record.recipient_name || '',
        message_type: record.message_type || '',
        shop_id: record.store_id || ''
      }
    }
  });
  const res = await postConnect(conn.remote_endpoint, envelope);
  if (!res.httpOk || res.data?.ok === false) {
    const reason = res.data?.error || 'ConnectX did not accept the SMS request.';
    await patchSms(env, record.id, { status: 'PENDING', connection_id: conn.id, request_id: requestId, error_message: reason });
    return { ok: false, status: 'PENDING', request_id: requestId, error: reason };
  }
  await touchConnection(env, conn.id);
  const remoteStatus = canonSms(res.data?.status || 'PENDING');
  await patchSms(env, record.id, {
    status: remoteStatus,
    connection_id: conn.id,
    request_id: requestId,
    error_message: remoteStatus === 'FAILED' ? (res.data?.reason || 'Rejected') : null
  });
  return { ok: true, status: remoteStatus, request_id: requestId, duplicate: !!res.data?.duplicate };
}

export async function dispatchPendingSms(env) {
  const rows = await db(env, 'connectx_sms_messages?status=in.(queued,PENDING)&select=*&order=created_at.asc&limit=25').catch(() => []);
  const out = [];
  for (const row of rows || []) {
    out.push(await dispatchSmsRecord(env, row));
  }
  return out;
}

async function notifyRemote(env, conn, action, payload) {
  if (!conn?.remote_endpoint || !conn.shared_secret) return { ok: false };
  if (conn.status === 'DISCONNECTED' && !['DISCONNECT', 'SET_STATUS'].includes(action)) return { ok: false };
  const ident = await ensureIdentity(env, { url: conn.remote_endpoint });
  const envelope = await signEnvelope({
    action,
    applicationId: ident.application_id,
    connectionId: conn.id,
    secret: conn.shared_secret,
    payload
  });
  return postConnect(conn.remote_endpoint, envelope);
}

async function loadConnection(env, id) {
  const rows = await db(env, `connect_connections?id=eq.${encodeURIComponent(id)}&select=*`).catch(() => []);
  return rows?.[0] || null;
}

async function applySmsResult(env, connection, payload) {
  const requestId = String(payload?.request_id || '').trim();
  const status = canonSms(payload?.status);
  if (!requestId) return failResponse('request_id is required.', 400, 'request_id');
  if (!['SUCCESS', 'FAILED', 'PROCESSING', 'PENDING'].includes(status)) return failResponse('Invalid SMS status.', 400, 'status');
  const rows = await db(env, `connectx_sms_messages?request_id=eq.${encodeURIComponent(requestId)}&select=*`).catch(() => []);
  const row = (rows || []).find(r => !r.connection_id || r.connection_id === connection.id) || rows?.[0];
  if (!row) return failResponse('Unknown Request ID.', 404, 'unknown_request');
  const current = canonSms(row.status);
  if ((current === 'SUCCESS' || current === 'FAILED') && current !== status) {
    return jsonResponse({ ok: true, request_id: requestId, status: current, duplicate: true });
  }
  await patchSms(env, row.id, {
    status,
    connection_id: connection.id,
    sim_used: payload?.sim_used || row.sim_used || null,
    error_message: status === 'FAILED' ? String(payload?.reason || 'FAILED').slice(0, 400) : null,
    result_at: payload?.timestamp || nowIso(),
    sent_at: status === 'SUCCESS' ? (payload?.timestamp || nowIso()) : row.sent_at || null
  });
  await touchConnection(env, connection.id);
  return jsonResponse({ ok: true, request_id: requestId, status });
}

async function handleHandshake(env, request, envelope) {
  const p = envelope.payload || {};
  const token = String(p.request_token || '').trim();
  const code = String(p.pairing_code || '').trim();
  const connId = String(p.connection_id || '').trim();
  if (!token || !code || !connId || !p.shared_secret) return failResponse('Handshake is incomplete.', 400, 'handshake');
  const rows = await db(env, `connect_requests?id=eq.${encodeURIComponent(token)}&select=*`).catch(() => []);
  const pending = rows?.[0];
  if (!pending || pending.direction !== 'outbound') return failResponse('Unknown connection request.', 404, 'unknown_request');
  if (pending.pairing_code !== code) return failResponse('Pairing code does not match.', 403, 'pairing_code');
  if (pending.status === 'CONSUMED' && pending.connection_id === connId) {
    const ident = await ensureIdentity(env, request);
    return jsonResponse({ ok: true, status: 'ACTIVE', connection_id: connId, ...publicIdentity(ident) });
  }
  if (pending.status !== 'PENDING_APPROVAL') return failResponse('This connection request is no longer waiting.', 409, 'not_pending');
  if (pending.expires_at && Date.parse(pending.expires_at) < Date.now()) return failResponse('Connection request expired. Send a new one.', 410, 'expired');
  const remoteEndpoint = normalizeEndpoint(p.connect_endpoint);
  if (!remoteEndpoint) return failResponse('Remote Connect Endpoint is invalid.', 400, 'endpoint');
  const record = {
    id: connId,
    remote_application_id: envelope.application_id,
    remote_application_name: String(p.application_name || 'Remote app').slice(0, 80),
    remote_endpoint: remoteEndpoint,
    remote_kind: String(p.kind || 'gateway').slice(0, 40),
    permissions: permsJson(p.permissions || pending.requested_permissions),
    shared_secret: String(p.shared_secret),
    status: 'ACTIVE',
    display_name: pending.display_name || p.application_name || 'Connected app',
    connected_at: nowIso(),
    last_seen_at: nowIso(),
    created_at: nowIso()
  };
  await db(env, 'connect_connections', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(record)
  });
  await db(env, `connect_requests?id=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'CONSUMED', connection_id: connId, remote_application_id: envelope.application_id, remote_application_name: record.remote_application_name, remote_endpoint: remoteEndpoint })
  });
  const ident = await ensureIdentity(env, request);
  return jsonResponse({
    ok: true,
    status: 'ACTIVE',
    connection_id: connId,
    application_id: ident.application_id,
    application_name: ident.application_name,
    connect_endpoint: ident.connect_endpoint
  });
}

async function signedConnection(env, envelope, { allowPaused = false } = {}) {
  if (!envelope?.connection_id || !envelope?.application_id) return { error: failResponse('connection_id and application_id are required.', 401, 'unauthorized') };
  if (!freshTimestamp(envelope.timestamp)) return { error: failResponse('Request timestamp is outside the allowed window.', 401, 'stale') };
  const conn = await loadConnection(env, envelope.connection_id);
  if (!conn || (conn.status !== 'ACTIVE' && !(allowPaused && conn.status === 'PAUSED'))) return { error: failResponse(conn?.status === 'PAUSED' ? 'Connection is paused.' : 'Connection is not active.', 403, 'not_connected') };
  if (conn.remote_application_id && conn.remote_application_id !== envelope.application_id) {
    return { error: failResponse('Application ID does not match this connection.', 403, 'application_id') };
  }
  if (!(await verifySignature(envelope, conn.shared_secret))) return { error: failResponse('Signature check failed.', 401, 'bad_signature') };
  return { conn };
}

export async function handleConnect(request, env) {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return jsonResponse({ ok: true });
  const ident = await ensureIdentity(env, request);
  if (!ident.ready) return failResponse(ident.error, 503, 'not_ready');
  if (method === 'GET') return jsonResponse({ ok: true, ...publicIdentity(ident) });
  if (method !== 'POST') return failResponse('Use POST.', 405, 'method');
  const envelope = await readJson(request);
  if (envelope.protocol && envelope.protocol !== PROTOCOL) return failResponse('Unsupported Connect protocol.', 400, 'protocol');
  const action = String(envelope.action || '').toUpperCase();

  if (action === 'CONNECT_REQUEST') {
    const p = envelope.payload || {};
    const token = String(p.request_token || '').trim();
    const endpoint = normalizeEndpoint(p.connect_endpoint);
    if (!envelope.application_id || !token || !endpoint) return failResponse('Connection request is incomplete.', 400, 'request');
    const existing = await db(env, `connect_requests?id=eq.${encodeURIComponent(token)}&select=id`).catch(() => []);
    if (!existing?.length) {
      await db(env, 'connect_requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: token,
          direction: 'inbound',
          pairing_code: String(p.pairing_code || ''),
          remote_application_id: envelope.application_id,
          remote_application_name: String(p.application_name || 'Remote app').slice(0, 80),
          remote_endpoint: endpoint,
          display_name: String(p.display_name || p.application_name || 'Remote app').slice(0, 80),
          requested_permissions: permsJson(p.requested_permissions),
          status: 'PENDING_APPROVAL',
          created_at: nowIso(),
          expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString()
        })
      });
    }
    return jsonResponse({ ok: true, status: 'PENDING_APPROVAL', request_token: token, pairing_code: p.pairing_code || null });
  }

  if (action === 'HANDSHAKE') return handleHandshake(env, request, envelope);
  if (action === 'SET_STATUS') return applyRemoteStatus(env, envelope);

  const allowPaused = ['PING', 'SMS_RESULT', 'VERIFY_ADMIN', 'APP_SHOPS', 'APP_EMAILS', 'APP_SMS', 'DISCONNECT'].includes(action);
  const signed = await signedConnection(env, envelope, { allowPaused });
  if (signed.error) return signed.error;
  const conn = signed.conn;
  const payload = envelope.payload || {};

  if (action === 'PING') {
    await touchConnection(env, conn.id);
    return jsonResponse({ ok: true, status: 'ACTIVE', application_id: ident.application_id, application_name: ident.application_name, connect_endpoint: ident.connect_endpoint });
  }
  if (action === 'SMS_RESULT') return applySmsResult(env, conn, payload);
  if (action === 'VERIFY_ADMIN') return verifyAdminForPhone(env, payload);
  if (action === 'APP_SHOPS') return appShops(env, payload);
  if (action === 'APP_EMAILS') return appEmails(env, payload);
  if (action === 'APP_SMS') return appSms(env, payload);
  if (action === 'DISCONNECT') {
    await db(env, `connect_connections?id=eq.${encodeURIComponent(conn.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'DISCONNECTED', disconnected_at: nowIso() })
    });
    return jsonResponse({ ok: true, status: 'DISCONNECTED', connection_id: conn.id });
  }
  return failResponse('Unknown Connect action.', 400, 'action');
}


function b64u(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Same PBKDF2 check EMS login uses. The password is never stored or returned. */
async function passwordMatches(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!iterations || iterations > 100000) return false;
  const salt = parts[2];
  const expected = parts[3];
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations, hash: 'SHA-256' },
    await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password || '')), 'PBKDF2', false, ['deriveBits']),
    256
  );
  const got = b64u(bits);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

function publicAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    admin_code: row.admin_code || null,
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || '',
    active: row.active !== false && row.active !== 0,
    created_at: row.created_at || null
  };
}

async function shopsForAdmin(env, adminId) {
  const rows = await db(env, `stores?admin_id=eq.${encodeURIComponent(adminId)}&select=id,name,address,phone,shop_code,category,status&order=name.asc`).catch(() => []);
  return (rows || []).filter(s => s.status !== 'inactive').map(s => ({
    id: s.id,
    name: s.name,
    address: s.address || '',
    phone: s.phone || '',
    shop_code: s.shop_code || '',
    category: s.category || '',
    status: s.status || 'active',
    connected: false
  }));
}

async function loadAdmin(env, login) {
  const raw = String(login || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const rows = await db(env, `administrators?email=eq.${encodeURIComponent(raw.toLowerCase())}&select=*`).catch(() => []);
    return rows?.[0] || null;
  }
  const rows = await db(env, `administrators?admin_code=eq.${encodeURIComponent(raw)}&select=*`).catch(() => []);
  return rows?.[0] || null;
}

async function verifyAdminForPhone(env, payload) {
  const login = String(payload?.email || payload?.user_id || payload?.userId || '').trim();
  const password = String(payload?.password || '');
  if (!login || !password) return failResponse('Email or Administrator ID, and a password, are required.', 400, 'credentials');
  const admin = await loadAdmin(env, login);
  if (!admin || !(await passwordMatches(password, admin.password_hash))) {
    return failResponse('Wrong email, Administrator ID, or password.', 401, 'unauthorized');
  }
  if (admin.active === false || admin.active === 0) {
    return failResponse('Your administrator account is deactivated. Contact EMS support.', 403, 'inactive');
  }
  const shops = await shopsForAdmin(env, admin.id);
  return jsonResponse({ ok: true, administrator: publicAdmin(admin), shops });
}

async function appShops(env, payload) {
  const adminId = String(payload?.admin_id || '').trim();
  if (!adminId) return failResponse('admin_id is required.', 400, 'admin');
  const rows = await db(env, `administrators?id=eq.${encodeURIComponent(adminId)}&select=id,admin_code,name,email,phone,address,active,created_at`).catch(() => []);
  const admin = rows?.[0];
  if (!admin || admin.active === false || admin.active === 0) return failResponse('Administrator not found.', 404, 'admin');
  return jsonResponse({ ok: true, administrator: publicAdmin(admin), shops: await shopsForAdmin(env, admin.id) });
}

async function shopOwned(env, adminId, shopId) {
  const rows = await db(env, `stores?id=eq.${encodeURIComponent(shopId)}&admin_id=eq.${encodeURIComponent(adminId)}&select=id,status`).catch(() => []);
  return rows?.[0] && rows[0].status !== 'inactive' ? rows[0] : null;
}

function emailPublic(row, detail) {
  if (!row) return null;
  const list = v => {
    if (Array.isArray(v)) return v.map(String);
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
  };
  return {
    id: row.id,
    subject: row.subject || '',
    from_email: row.from_email || '',
    to_emails: list(row.to_emails),
    cc_emails: list(row.cc_emails),
    bcc_emails: detail ? list(row.bcc_emails) : undefined,
    recipient_type: row.recipient_type || '',
    status: row.status || 'queued',
    error_message: row.error_message || null,
    created_at: row.created_at,
    sent_at: row.sent_at || null,
    ...(detail ? { custom_body: row.custom_body || '', body_html: row.body_html || '' } : {})
  };
}

async function appEmails(env, payload) {
  const adminId = String(payload?.admin_id || '').trim();
  const shopId = String(payload?.shop_id || '').trim();
  if (!await shopOwned(env, adminId, shopId)) return failResponse('This shop is not available for that administrator.', 403, 'shop');
  const op = String(payload?.op || 'stats');
  if (op === 'detail') {
    const id = String(payload?.email_id || '').trim();
    const rows = await db(env, `connectx_messages?id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(shopId)}&select=*`).catch(() => []);
    if (!rows?.[0]) return failResponse('Email not found.', 404, 'email');
    return jsonResponse({ ok: true, email: emailPublic(rows[0], true) });
  }
  if (op === 'page') {
    const page = Math.max(0, Number(payload.page) || 0);
    const limit = 30;
    const rows = await db(env, `connectx_messages?store_id=eq.${encodeURIComponent(shopId)}&shop_deleted_at=is.null&select=id,subject,from_email,to_emails,cc_emails,recipient_type,status,error_message,created_at,sent_at&order=created_at.desc&limit=${limit + 1}&offset=${page * limit}`).catch(() => []);
    const items = (rows || []).slice(0, limit).map(r => emailPublic(r, false));
    return jsonResponse({ ok: true, items, page, hasMore: (rows || []).length > limit, snapshot: nowIso() });
  }
  const since = String(payload?.since || new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const rows = await db(env, `connectx_messages?store_id=eq.${encodeURIComponent(shopId)}&created_at=gte.${encodeURIComponent(since)}&select=id,status,sent_at,created_at&limit=500`).catch(() => []);
  const latest = await db(env, `connectx_messages?store_id=eq.${encodeURIComponent(shopId)}&shop_deleted_at=is.null&select=id,subject,from_email,to_emails,cc_emails,recipient_type,status,error_message,created_at,sent_at&order=created_at.desc&limit=1`).catch(() => []);
  const list = rows || [];
  return jsonResponse({
    ok: true,
    sent: list.filter(r => r.status === 'sent').length,
    failed: list.filter(r => r.status === 'failed').length,
    pending: list.filter(r => r.status === 'queued' || r.status === 'sending').length,
    latest: emailPublic(latest?.[0], false)
  });
}

function phoneSmsStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'SUCCESS' || s === 'SENT') return 'sent';
  if (s === 'FAILED') return 'failed';
  if (s === 'PROCESSING' || s === 'SENDING') return 'sending';
  return 'queued';
}

function smsPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    request_id: row.request_id || '',
    to_phone: row.to_phone || '',
    recipient_name: row.recipient_name || 'Recipient',
    message_type: row.message_type || 'SMS',
    event_type: row.message_type || 'SMS',
    status: phoneSmsStatus(row.status),
    error_message: row.error_message || '',
    message_body: row.message_body || '',
    created_at: row.created_at,
    sent_at: row.sent_at || row.result_at || '',
    invoice_id: row.invoice_id || null
  };
}

async function appSms(env, payload) {
  const adminId = String(payload?.admin_id || '').trim();
  const shopId = String(payload?.shop_id || '').trim();
  if (!await shopOwned(env, adminId, shopId)) return failResponse('This shop is not available for that administrator.', 403, 'shop');
  const since = String(payload?.since || '1970-01-01T00:00:00.000Z');
  const selects = [
    'id,request_id,to_phone,recipient_name,message_type,message_body,status,error_message,created_at,sent_at,result_at,invoice_id',
    'id,request_id,to_phone,recipient_name,message_type,message_body,status,error_message,created_at,sent_at',
    'id,to_phone,message_body,status,error_message,created_at'
  ];
  let rows = [];
  for (const select of selects) {
    try {
      rows = await db(env, `connectx_sms_messages?store_id=eq.${encodeURIComponent(shopId)}&created_at=gte.${encodeURIComponent(since)}&select=${select}&order=created_at.desc&limit=500`);
      break;
    } catch { rows = []; }
  }
  return jsonResponse({ ok: true, items: (rows || []).map(smsPublic).filter(Boolean) });
}

async function applyRemoteStatus(env, envelope) {
  const conn = await loadConnection(env, envelope.connection_id);
  if (!conn) return failResponse('Unknown connection.', 403, 'not_connected');
  if (conn.remote_application_id && conn.remote_application_id !== envelope.application_id) return failResponse('Application ID does not match this connection.', 403, 'application_id');
  if (!(await verifySignature(envelope, conn.shared_secret))) return failResponse('Signature check failed.', 401, 'bad_signature');
  return applyConnectionStatus(env, conn.id, envelope.payload?.status, { notify: false });
}

async function applyConnectionStatus(env, id, status, { notify = true } = {}) {
  const conn = await loadConnection(env, id);
  if (!conn) return failResponse('Connection not found.', 404, 'not_found');
  const next = String(status || '').toUpperCase();
  if (!['ACTIVE', 'PAUSED', 'DISCONNECTED', 'DELETED'].includes(next)) return failResponse('Choose active, pause, disconnect, or delete.', 400, 'status');
  if (notify) await notifyRemote(env, conn, 'SET_STATUS', { status: next }).catch(() => {});
  if (next === 'DELETED') {
    await db(env, `connect_connections?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return jsonResponse({ ok: true, status: 'DELETED' });
  }
  const patch = { status: next };
  if (next === 'ACTIVE') patch.disconnected_at = null;
  if (next === 'DISCONNECTED') patch.disconnected_at = nowIso();
  await db(env, `connect_connections?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch)
  });
  return jsonResponse({ ok: true, status: next });
}

export async function connectGatewayStatus(env) {
  const rows = await db(env, 'connect_connections?status=eq.ACTIVE&select=id,permissions,last_seen_at').catch(() => []);
  const sms = (rows || []).filter(r => parsePerms(r.permissions).includes('sms:send'));
  const lastSeen = sms.reduce((a, r) => (r.last_seen_at && (!a || r.last_seen_at > a) ? r.last_seen_at : a), null);
  const online = sms.some(r => r.last_seen_at && (Date.now() - new Date(r.last_seen_at).getTime()) < 15 * 60 * 1000);
  return { configured: sms.length > 0, online, lastSeen, lockedStoreIds: [], hasGlobal: sms.length > 0 };
}

export async function connectOwnerRoutes(ctx) {
  const { env, request, path, method, s, json, fail } = ctx;
  if (!path.startsWith('platform/connect-app')) return null;
  if (!s || s.role !== 'owner') return fail('Forbidden', 403);
  const ident = await ensureIdentity(env, request);
  if (!ident.ready && path === 'platform/connect-app' && method === 'GET') {
    return json({ ready: false, error: ident.error, migration: 'supabase/migrations/046_connect_app.sql' });
  }
  if (!ident.ready) return fail(ident.error, 503);

  if (path === 'platform/connect-app' && method === 'GET') {
    const [connections, requests, sms] = await Promise.all([
      db(env, 'connect_connections?select=*&order=created_at.desc').catch(() => []),
      db(env, 'connect_requests?select=*&order=created_at.desc&limit=30').catch(() => []),
      db(env, 'connectx_sms_messages?select=id,request_id,to_phone,status,error_message,sim_used,created_at,sent_at&order=created_at.desc&limit=20').catch(() => [])
    ]);
    await dispatchPendingSms(env).catch(() => {});
    return json({
      ready: true,
      identity: publicIdentity(ident),
      endpoint_override: ident.endpoint_override || '',
      connections: (connections || []).map(publicConnection),
      requests: (requests || []).map(publicRequest),
      recent_sms: (sms || []).map(r => ({ ...r, status: canonSms(r.status) }))
    });
  }

  if (path === 'platform/connect-app/endpoint' && method === 'POST') {
    const b = await readJson(request);
    const endpoint = b.endpoint ? normalizeEndpoint(b.endpoint) : '';
    if (b.endpoint && !endpoint) return fail('Enter a valid https Connect Endpoint.', 400);
    await db(env, 'connect_identity?id=eq.1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint_override: endpoint })
    });
    const next = await ensureIdentity(env, request);
    return json({ ok: true, identity: publicIdentity(next) });
  }

  if (path === 'platform/connect-app/request' && method === 'POST') {
    const b = await readJson(request);
    const remote = normalizeEndpoint(b.remote_endpoint);
    if (!remote) return fail('Paste the other app’s Connect Endpoint, for example https://connectxweb.pages.dev/connect', 400);
    if (remote === ident.connect_endpoint) return fail('That is this EMS Connect Endpoint. Paste the other app’s endpoint.', 400);
    const probe = await getConnect(remote);
    if (!probe.httpOk || probe.data?.protocol !== PROTOCOL) {
      return fail(probe.data?.error || 'That address did not answer as a Connect App. Check the Connect Endpoint and try again.', 502);
    }
    const token = requestToken();
    const code = pairingCode();
    const display = String(b.display_name || ident.application_name || 'EMS').slice(0, 80);
    const permissions = parsePerms(b.permissions?.length ? b.permissions : ['sms:send']);
    await db(env, 'connect_requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: token,
        direction: 'outbound',
        pairing_code: code,
        remote_application_id: probe.data.application_id || null,
        remote_application_name: probe.data.application_name || 'Remote app',
        remote_endpoint: remote,
        display_name: display,
        requested_permissions: permsJson(permissions),
        status: 'PENDING_APPROVAL',
        created_at: nowIso(),
        expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString()
      })
    });
    const sent = await postConnect(remote, {
      protocol: PROTOCOL,
      action: 'CONNECT_REQUEST',
      application_id: ident.application_id,
      connection_id: '',
      timestamp: nowIso(),
      nonce: requestToken().slice(4, 20),
      payload: {
        application_name: ident.application_name,
        kind: 'product',
        connect_endpoint: ident.connect_endpoint,
        display_name: display,
        requested_permissions: permissions,
        pairing_code: code,
        request_token: token
      }
    });
    if (!sent.httpOk || sent.data?.ok === false) {
      await db(env, `connect_requests?id=eq.${encodeURIComponent(token)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'FAILED' })
      }).catch(() => {});
      return fail(sent.data?.error || 'The other app did not accept the connection request.', 502);
    }
    return json({
      ok: true,
      status: 'PENDING_APPROVAL',
      request: publicRequest({
        id: token, direction: 'outbound', pairing_code: code,
        remote_application_id: probe.data.application_id,
        remote_application_name: probe.data.application_name,
        remote_endpoint: remote, display_name: display,
        requested_permissions: permissions, status: 'PENDING_APPROVAL',
        created_at: nowIso()
      })
    }, 201);
  }

  const cancel = path.match(/^platform\/connect-app\/requests\/([^/]+)\/cancel$/);
  if (cancel && method === 'POST') {
    const id = decodeURIComponent(cancel[1]);
    await db(env, `connect_requests?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' })
    });
    return json({ ok: true });
  }

  const statusRoute = path.match(/^platform\/connect-app\/connections\/([^/]+)\/status$/);
  if (statusRoute && method === 'POST') {
    const b = await readJson(request);
    return applyConnectionStatus(env, decodeURIComponent(statusRoute[1]), b.status);
  }

  const disc = path.match(/^platform\/connect-app\/connections\/([^/]+)\/disconnect$/);
  if (disc && method === 'POST') {
    const id = decodeURIComponent(disc[1]);
    const conn = await loadConnection(env, id);
    if (!conn) return fail('Connection not found.', 404);
    if (conn.status === 'ACTIVE') await notifyRemote(env, conn, 'DISCONNECT', { reason: 'Disconnected by EMS owner' }).catch(() => {});
    await db(env, `connect_connections?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'DISCONNECTED', disconnected_at: nowIso() })
    });
    return json({ ok: true, status: 'DISCONNECTED' });
  }

  const ping = path.match(/^platform\/connect-app\/connections\/([^/]+)\/ping$/);
  if (ping && method === 'POST') {
    const conn = await loadConnection(env, decodeURIComponent(ping[1]));
    if (!conn || conn.status !== 'ACTIVE') return fail('Connection is not active.', 409);
    const res = await notifyRemote(env, conn, 'PING', {});
    if (!res.httpOk || res.data?.ok === false) return fail(res.data?.error || 'Ping failed.', 502);
    await touchConnection(env, conn.id);
    return json({ ok: true, status: 'ACTIVE', remote: res.data });
  }

  if (path === 'platform/connect-app/dispatch' && method === 'POST') {
    const results = await dispatchPendingSms(env);
    return json({ ok: true, results });
  }

  const approve = path.match(/^platform\/connect-app\/requests\/([^/]+)\/approve$/);
  if (approve && method === 'POST') {
    const token = decodeURIComponent(approve[1]);
    const rows = await db(env, `connect_requests?id=eq.${encodeURIComponent(token)}&select=*`);
    const pending = rows?.[0];
    if (!pending || pending.direction !== 'inbound') return fail('Connection request not found.', 404);
    if (pending.status !== 'PENDING_APPROVAL') return fail('This request is not waiting for approval.', 409);
    const connId = connectionId();
    const secret = sharedSecret();
    const permissions = parsePerms(pending.requested_permissions);
    const granted = permissions.length ? permissions : ['sms:send'];
    const call = await postConnect(pending.remote_endpoint, {
      protocol: PROTOCOL,
      action: 'HANDSHAKE',
      application_id: ident.application_id,
      connection_id: '',
      timestamp: nowIso(),
      nonce: requestToken().slice(4, 20),
      payload: {
        request_token: pending.id,
        pairing_code: pending.pairing_code,
        connection_id: connId,
        permissions: granted,
        shared_secret: secret,
        application_name: 'EMS',
        connect_endpoint: ident.connect_endpoint,
        kind: 'product'
      }
    });
    if (!call.httpOk || call.data?.ok === false) return fail(call.data?.error || 'The other app did not confirm the handshake.', 502);
    await db(env, 'connect_connections', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: connId,
        remote_application_id: call.data.application_id || pending.remote_application_id,
        remote_application_name: call.data.application_name || pending.remote_application_name || 'Remote app',
        remote_endpoint: normalizeEndpoint(call.data.connect_endpoint) || pending.remote_endpoint,
        remote_kind: 'gateway',
        permissions: permsJson(granted),
        shared_secret: secret,
        status: 'ACTIVE',
        display_name: pending.display_name || call.data.application_name || 'Connected app',
        connected_at: nowIso(),
        last_seen_at: nowIso(),
        created_at: nowIso()
      })
    });
    await db(env, `connect_requests?id=eq.${encodeURIComponent(token)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'CONSUMED', connection_id: connId })
    });
    return json({ ok: true, status: 'ACTIVE', connection_id: connId });
  }

  return fail('Unknown Connect App route.', 404);
}

export async function cancelRemoteSms(env, requestId) {
  if (!requestId) return;
  const conn = await activeSmsConnection(env);
  if (!conn) return;
  await notifyRemote(env, conn, 'CANCEL_SMS', { request_id: requestId }).catch(() => {});
}
