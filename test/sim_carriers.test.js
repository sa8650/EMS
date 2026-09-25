import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

const secret = 'sim-carrier-test-secret';
const base = 'https://ems.example';
const deviceId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';

async function signed(role, extra = {}) {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ id: 'owner-1', role,
    exp: Math.floor(Date.now() / 1000) + 500, ...extra });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned));
  return unsigned + '.' + Buffer.from(signature).toString('base64url');
}

function mockDb() {
  const rows = [], devices = [{ id: deviceId, store_id: storeId, status: 'active' }];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://database.example');
    const table = parsed.pathname.split('/').pop();
    if (table === 'activity_logs') return new Response('[]', { status: 201 });
    assert.ok(['connectx_sim_carriers', 'connectx_devices'].includes(table), table);
    const source = table === 'connectx_devices' ? devices : rows;
    const filter = [...parsed.searchParams].filter(([k]) => ['id', 'store_id', 'mcc_mnc'].includes(k));
    const found = () => source.filter(row => filter.every(([key, value]) => row[key] === value.slice(3)));
    const method = options.method || 'GET';
    let result = found();
    if (method === 'POST') {
      const row = { id: crypto.randomUUID(), ...JSON.parse(options.body) };
      rows.push(row); result = [row];
    } else if (method === 'PATCH') {
      result.forEach(row => Object.assign(row, JSON.parse(options.body)));
    } else if (method === 'DELETE') {
      result.forEach(row => rows.splice(rows.indexOf(row), 1));
    }
    return new Response(JSON.stringify(result), { status: method === 'POST' ? 201 : 200,
      headers: { 'content-type': 'application/json' } });
  };
  return { rows, devices, restore: () => { globalThis.fetch = previous; } };
}

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = token ? { authorization: 'Bearer ' + token } : {};
  const request = new Request(base + '/api/' + path, { method, headers,
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await onRequest({ request, env: {
    SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'stub', SESSION_SECRET: secret
  }, params: { path: path.split('?')[0].split('/') } });
  return { response, data: await response.json() };
}

test('owner-only catalog stays private; active device receives only its matching carrier', async () => {
  const db = mockDb();
  const owner = await signed('owner');
  const admin = await signed('admin');
  const device = await signed('connectx_device', { deviceId, storeId });
  try {
    assert.equal((await call('platform/sim-carriers')).response.status, 401);
    assert.equal((await call('platform/sim-carriers', { token: admin })).response.status, 403);
    const brokenRequest = new Request(base + '/api/platform/sim-carriers', {
      method: 'POST', headers: { authorization: 'Bearer ' + owner }, body: 'not-json'
    });
    const brokenResult = await onRequest({ request: brokenRequest, env: {
      SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'stub', SESSION_SECRET: secret
    }, params: { path: ['platform', 'sim-carriers'] } });
    assert.equal(brokenResult.status, 400);
    assert.equal((await call('connectx/gateway/sim-carrier?mccMnc=47001')).response.status, 401);
    assert.equal((await call('connectx/gateway/sim-carrier?mccMnc=47001', { token: admin })).response.status, 403);
    assert.deepEqual((await call('platform/sim-carriers', { token: owner })).data, []);

    assert.equal((await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Carrier', mcc_mnc: '4701', active: true, balance_ussd_code: '*1#' } })).response.status, 400);
    assert.equal((await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Carrier', mcc_mnc: '47001', active: true } })).response.status, 400);
    assert.equal((await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Carrier', mcc_mnc: '47001', active: true,
        balance_ussd_code: 'https://bad' } })).response.status, 400);

    const draft = await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Demo carrier', mcc_mnc: '47001', carrier_identifier: 'Demo', active: false } });
    assert.equal(draft.response.status, 201);
    const id = draft.data.id;
    assert.deepEqual((await call('connectx/gateway/sim-carrier?mccMnc=47001&carrierName=Demo',
      { token: device })).data, { supported: false });
    const updated = await call(`platform/sim-carriers/${id}`, { method: 'PATCH', token: owner,
      body: { active: true, balance_ussd_code: '*123#',
        balance_pattern: 'Balance: ([0-9.]+)' } });
    assert.equal(updated.response.status, 200);
    const match = await call('connectx/gateway/sim-carrier?mccMnc=47001&carrierName=Demo', { token: device });
    assert.equal(match.data.supported, true);
    assert.equal(match.data.carrier.balance_ussd_code, '*123#');
    assert.equal('sms_quota_ussd_code' in match.data.carrier, false);
    assert.equal('sms_pattern' in match.data.carrier, false);
    assert.equal('id' in match.data.carrier, false);
    assert.deepEqual((await call('connectx/gateway/sim-carrier?mccMnc=47002&carrierName=Demo',
      { token: device })).data, { supported: false }); // no guessed network match

    db.devices[0].status = 'revoked';
    assert.equal((await call('connectx/gateway/sim-carrier?mccMnc=47001', { token: device })).response.status, 403);
    db.devices[0].status = 'active';
    assert.equal((await call(`platform/sim-carriers/${id}`, { method: 'PATCH', token: owner,
      body: { active: false } })).response.status, 200);
    assert.deepEqual((await call('connectx/gateway/sim-carrier?mccMnc=47001', { token: device })).data,
      { supported: false });
    assert.equal((await call(`platform/sim-carriers/${id}`, { method: 'DELETE', token: owner })).data.deleted, true);
    assert.equal(db.rows.length, 0);
  } finally { db.restore(); }
});

test('identifier-only catalog row works when Android does not expose MCC/MNC', async () => {
  const db = mockDb(); const owner = await signed('owner');
  const device = await signed('connectx_device', { deviceId, storeId });
  try {
    const added = await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Demo operator', carrier_identifier: 'Demo Telecom',
        balance_ussd_code: '*123#', active: true } });
    assert.equal(added.response.status, 201);
    assert.equal((await call('connectx/gateway/sim-carrier?carrierName=Demo%20Telecom',
      { token: device })).data.carrier.carrier_name, 'Demo operator');
    assert.deepEqual((await call('connectx/gateway/sim-carrier?carrierName=Wrong',
      { token: device })).data, { supported: false });
  } finally { db.restore(); }
});


test('one verified balance code is sufficient; identifier-only names remain unique', async () => {
  const db = mockDb(); const owner = await signed('owner');
  const device = await signed('connectx_device', { deviceId, storeId });
  try {
    const add = await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Single-code operator', carrier_identifier: 'Operator X',
        balance_ussd_code: '*1#', active: true,
        sms_quota_ussd_code: '*9#', sms_pattern: 'SMS: ([0-9]+)' } });
    assert.equal(add.response.status, 201);
    assert.equal('sms_quota_ussd_code' in add.data, false); // legacy fields must not be persisted
    assert.equal('sms_pattern' in add.data, false);
    // Even if a legacy two-code database has not yet been migrated, the owner
    // catalog must not re-expose retired quota settings.
    db.rows[0].sms_quota_ussd_code = '*9#';
    assert.equal('sms_quota_ussd_code' in (await call('platform/sim-carriers', { token: owner })).data[0], false);
    const result = await call('connectx/gateway/sim-carrier?carrierName=Operator%20X', { token: device });
    assert.equal(result.data.carrier.balance_ussd_code, '*1#');
    assert.equal('sms_quota_ussd_code' in result.data.carrier, false);
    assert.equal((await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Duplicate', carrier_identifier: 'operator x', balance_ussd_code: '*2#' } })).response.status, 409);
    const other = await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Other', carrier_identifier: 'Operator Y', balance_ussd_code: '*2#', active: true } });
    assert.equal(other.response.status, 201);
    assert.equal((await call(`platform/sim-carriers/${other.data.id}`, { method: 'PATCH', token: owner,
      body: { carrier_identifier: 'OPERATOR X' } })).response.status, 409);
    assert.equal((await call('platform/sim-carriers', { method: 'POST', token: owner,
      body: { carrier_name: 'Unsafe', carrier_identifier: 'Unsafe', balance_pattern: '(a+)+',
        balance_ussd_code: '*2#', active: true } })).response.status, 400);
  } finally { db.restore(); }
});
