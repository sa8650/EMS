/* =====================================================================
   Connect App protocol v1
   --------------------------------------------------------------------
   A small, product-agnostic envelope so any application (EMS, ConnectX,
   InfluenceOS, CareOS, an Android gateway, …) can connect to any other
   without sharing a database.

   Transport: HTTPS POST to the remote Connect Endpoint (…/connect).
   After approval, every call is HMAC-SHA256 signed with the connection
   shared secret. The secret never appears in website responses.

   Canonical string (UTF-8, LF):
     connect-app/1 \n ACTION \n application_id \n connection_id \n
     timestamp \n nonce \n sha256(stableJson(payload))
   ===================================================================== */

export const PROTOCOL = 'connect-app/1';
export const SKEW_MS = 10 * 60 * 1000;
export const KNOWN_PERMISSIONS = ['sms:send', 'sms:status', 'sms:deliver'];

const enc = new TextEncoder();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomToken(prefix, n = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${s}`;
}
export const applicationId = prefix => randomToken(prefix, 8);
export const connectionId = () => randomToken('CXN', 12);
export function pairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const d = [...bytes].map(b => String(b % 10)).join('');
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}
export function requestToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'req_' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function sharedSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const nonce = () => requestToken().slice(4, 28);
export const nowIso = () => new Date().toISOString();

export function parsePerms(value) {
  if (Array.isArray(value)) return [...new Set(value.map(x => String(x).trim()).filter(Boolean))];
  if (value == null || value === '') return [];
  if (typeof value === 'object') return parsePerms(Object.values(value));
  try { return parsePerms(JSON.parse(value)); } catch { return []; }
}
export const permsJson = list => JSON.stringify(parsePerms(list));

export function stableStringify(value) {
  if (value === undefined) return undefined;
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(v => stableStringify(v) ?? 'null').join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + (stableStringify(value[k]) ?? 'null')).join(',') + '}';
  }
  return 'null';
}

export async function sha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(value)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function hmacHex(data, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(data)));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function canonicalString({ action, applicationId: appId, connectionId: connId, timestamp, nonce: n, payloadHash }) {
  return [PROTOCOL, action, appId || '', connId || '', timestamp || '', n || '', payloadHash || ''].join('\n');
}

export async function signEnvelope({ action, applicationId: appId, connectionId: connId = '', payload = {}, secret }) {
  const timestamp = nowIso();
  const n = nonce();
  const payloadHash = await sha256Hex(stableStringify(payload) ?? '{}');
  const signature = await hmacHex(canonicalString({ action, applicationId: appId, connectionId: connId, timestamp, nonce: n, payloadHash }), secret);
  return {
    protocol: PROTOCOL,
    action,
    application_id: appId,
    connection_id: connId || '',
    timestamp,
    nonce: n,
    payload,
    signature
  };
}

export async function verifySignature(envelope, secret) {
  if (!envelope || !secret) return false;
  const payloadHash = await sha256Hex(stableStringify(envelope.payload || {}) ?? '{}');
  const expected = await hmacHex(canonicalString({
    action: envelope.action,
    applicationId: envelope.application_id,
    connectionId: envelope.connection_id || '',
    timestamp: envelope.timestamp,
    nonce: envelope.nonce,
    payloadHash
  }), secret);
  const got = String(envelope.signature || '');
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export function freshTimestamp(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return false;
  return Math.abs(Date.now() - t) <= SKEW_MS;
}

/** Accept a full Connect Endpoint or a site origin; always return …/connect. */
export function normalizeEndpoint(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { return ''; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (!url.hostname || url.username || url.password) return '';
  const path = url.pathname.replace(/\/+$/, '');
  const base = `${url.protocol}//${url.host}`;
  if (!path || path === '/') return `${base}/connect`;
  if (path === '/connect' || path.endsWith('/connect')) return `${base}${path}`;
  return `${base}${path}/connect`;
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept'
    }
  });
}
export const failResponse = (error, status = 400, code = 'bad_request') =>
  jsonResponse({ ok: false, error, code }, status);

export async function postConnect(endpoint, body, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: String(text || '').slice(0, 240) }; }
    return { httpOk: res.ok, status: res.status, data };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return { httpOk: false, status: 0, data: { ok: false, error: aborted ? 'Connect endpoint timed out.' : (error?.message || 'Connect endpoint unreachable.') } };
  } finally {
    clearTimeout(timer);
  }
}

export async function getConnect(endpoint, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, { method: 'GET', headers: { accept: 'application/json' }, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { httpOk: res.ok, status: res.status, data };
  } catch (error) {
    return { httpOk: false, status: 0, data: { error: error?.message || 'Unreachable' } };
  } finally {
    clearTimeout(timer);
  }
}
