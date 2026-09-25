import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

const key = 'test-session-secret';
const base = 'https://ems.example';
const packageName = 'com.ems.connectx';
const fakeUrl = 'https://github.com/sa8650/ConnectX/releases/download/v1.4.0/ConnectX-v1.4.0.apk';
const hostedApk = 'https://releases.example/ConnectX-1.5.0.apk';
const release = (extra = {}) => ({ id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', package_name: packageName,
  title: 'ConnectX SMS Gateway', description: 'Gateway', version: '1.4.0', version_code: 14,
  icon_url: '/assets/android-chrome-192.png', icon_r2_key: null, apk_url: '',
  apk_r2_key: null, r2_key: null, apk_size_bytes: 0, apk_filename: 'ConnectX-1.4.0.apk',
  mandatory: false, release_notes: 'Fixes', published: true, updated_at: '2026-09-24T00:00:00Z', ...extra });

function r2() {
  const objects = new Map();
  return {
    objects,
    async put(key, data, opts = {}) {
      const bytes = new Uint8Array(await new Response(data).arrayBuffer());
      objects.set(key, { bytes, httpMetadata: opts.httpMetadata || {} });
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.length, httpMetadata: o.httpMetadata } : null;
    },
    async get(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.length, body: o.bytes, httpMetadata: o.httpMetadata } : null;
    },
    async delete(key) { objects.delete(key); }
  };
}

function mockDb(initial = []) {
  const rows = initial.map(x => ({ ...x }));
  const original = globalThis.fetch;
  globalThis.fetch = async (requestUrl, options = {}) => {
    const url = new URL(requestUrl);
    if (url.origin !== 'https://database.example') {
      // The historically advertised GitHub v1.4.0 asset does not exist.
      assert.equal(options.method, 'HEAD');
      if (requestUrl === hostedApk) return new Response(null, { status: 200,
        headers: { 'content-type': 'application/vnd.android.package-archive', 'content-length': '128' } });
      assert.equal(requestUrl, fakeUrl);
      return new Response(null, { status: 404 });
    }
    const table = url.pathname.split('/').pop();
    if (table === 'activity_logs') return new Response('[]', { status: 201 });
    assert.equal(table, 'app_store_apps');
    const method = options.method || 'GET';
    const conditions = [...url.searchParams].filter(([k]) => ['id', 'package_name'].includes(k));
    const matches = x => conditions.every(([col, expr]) => x[col] === expr.slice(3));
    let result;
    if (method === 'GET') result = rows.filter(matches);
    if (method === 'POST') {
      result = [{ id: crypto.randomUUID(), ...JSON.parse(options.body) }];
      rows.push(result[0]);
    }
    if (method === 'PATCH') {
      result = rows.filter(matches);
      result.forEach(row => Object.assign(row, JSON.parse(options.body)));
    }
    if (method === 'DELETE') {
      result = rows.filter(matches);
      for (const row of result) rows.splice(rows.indexOf(row), 1);
    }
    if (url.searchParams.has('limit')) result = result.slice(0, Number(url.searchParams.get('limit')));
    return new Response(JSON.stringify(result), { status: method === 'POST' ? 201 : 200,
      headers: { 'content-type': 'application/json' } });
  };
  return { rows, restore: () => { globalThis.fetch = original; } };
}

async function ownerToken() {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ id: 'owner-1', role: 'owner', exp: Math.floor(Date.now() / 1000) + 300 });
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sign = await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(message));
  return message + '.' + Buffer.from(sign).toString('base64url');
}

const env = bucket => ({ SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'test',
  SESSION_SECRET: key, ...(bucket ? { VAULTIUM: bucket } : {}) });
async function call(path, { method = 'GET', body, auth, bucket } = {}) {
  const options = { method, headers: auth ? { authorization: `Bearer ${auth}` } : {} };
  if (body) {
    if (body instanceof FormData) options.body = body;
    else { options.body = JSON.stringify(body); options.headers['content-type'] = 'application/json'; }
  }
  const request = new Request(base + '/api/' + path, options);
  const response = await onRequest({ request, env: env(bucket), params: { path: path.split('?')[0].split('/') } });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
  return { response, data };
}

// These tests call the real Pages function and fake only Supabase/R2/remote HEAD.
// Runs serially because the Supabase mock is an HTTP stub on global fetch.
test('public catalog is empty without an owner release; private routes remain gated', async () => {
  const db = mockDb();
  try {
    assert.deepEqual((await call('app-store/apps')).data, []);
    assert.equal(db.rows.length, 0); // no phantom v1.4.0 seed
    assert.equal((await call('app-store/check-update?package=com.ems.connectx')).response.status, 404);
    assert.equal((await call('platform/app-store')).response.status, 401);
    assert.equal((await call('vaultium/file/any')).response.status, 401);
  } finally { db.restore(); }
});

test('broken GitHub links cannot masquerade as an available update', async () => {
  const db = mockDb([release({ apk_url: fakeUrl })]);
  try {
    const { data: [app] } = await call('app-store/apps');
    assert.equal(app.download_available, false);
    assert.equal(app.download_url, null);
    assert.equal((await call('app-store/check-update?versionCode=13')).response.status, 503);
    assert.equal((await call(`app-store/download/${packageName}`)).response.status, 503);
  } finally { db.restore(); }
});

test('owner uploads a real APK; anonymous download and version comparison work', async () => {
  const db = mockDb();
  const bucket = r2(), auth = await ownerToken();
  try {
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 21, 32, 43, 54]);
    const form = new FormData();
    form.set('packageName', packageName);
    form.set('type', 'apk');
    form.set('file', new File([bytes], 'ConnectX-v1.4.0.apk', { type: 'application/vnd.android.package-archive' }));
    const { response: uploaded, data: info } = await call('platform/app-store/upload', { method: 'POST', body: form, auth, bucket });
    assert.equal(uploaded.status, 200);
    assert.equal(info.stored_in_r2, true);
    assert.equal(bucket.objects.size, 1);
    // Unreferenced uploads cannot be downloaded until published.
    assert.equal((await call(`app-store/file/${encodeURIComponent(info.r2_key)}`, { bucket })).response.status, 404);
    const { response: published, data: added } = await call('platform/app-store', { method: 'POST', auth, bucket,
      body: { package_name: packageName, title: 'ConnectX SMS Gateway', version: '1.4.0', version_code: 14,
        apk_r2_key: info.r2_key, apk_filename: 'ConnectX-SMS-Gateway-v1.4.0.apk',
        apk_size_bytes: info.size_bytes, published: true } });
    assert.equal(published.status, 201);
    assert.equal(added.app.apk_r2_key, info.r2_key);
    const { data: [app] } = await call('app-store/apps', { bucket });
    assert.equal(app.download_available, true);
    assert.equal(app.download_url, `/api/app-store/download/${packageName}`);
    assert.equal(app.apk_filename, 'ConnectX-SMS-Gateway-v1.4.0.apk');
    assert.equal('r2_key' in app, false); // no storage keys in public metadata
    assert.equal((await call('app-store/check-update?versionCode=13', { bucket })).data.hasUpdate, true);
    const latest = (await call('app-store/check-update?versionCode=14', { bucket })).data;
    assert.equal(latest.hasUpdate, false);
    assert.equal(latest.downloadUrl, `${base}/api/app-store/download/${packageName}`);
    const download = await call(`app-store/download/${packageName}`, { bucket });
    assert.equal(download.response.status, 200);
    assert.equal(download.response.headers.get('content-type'), 'application/vnd.android.package-archive');
    assert.match(download.response.headers.get('content-disposition'), /filename="ConnectX-SMS-Gateway-v1\.4\.0\.apk"/);
    assert.deepEqual(new Uint8Array(await download.response.arrayBuffer()), bytes);
    // A filename-only edit changes response headers, NOT APK bytes/build/signature.
    const rename = await call(`platform/app-store/${added.app.id}`, { method: 'PATCH', auth, bucket,
      body: { apk_filename: 'ConnectX-Better-Name.apk' } });
    assert.equal(rename.response.status, 200);
    assert.equal(rename.data.app.version_code, 14);
    assert.equal(rename.data.app.apk_r2_key, info.r2_key);
    const renamedDownload = await call(`app-store/download/${packageName}`, { bucket });
    assert.match(renamedDownload.response.headers.get('content-disposition'), /filename="ConnectX-Better-Name\.apk"/);
    assert.deepEqual(new Uint8Array(await renamedDownload.response.arrayBuffer()), bytes);
    assert.equal((await call('app-store/check-update?versionCode=14', { bucket })).data.hasUpdate, false);
    const unsafe = await call(`platform/app-store/${added.app.id}`, { method: 'PATCH', auth, bucket,
      body: { apk_filename: '../fake.apk' } });
    assert.equal(unsafe.response.status, 400);
    const direct = await call(`app-store/file/${encodeURIComponent(info.r2_key)}`, { bucket });
    assert.equal(direct.response.status, 200);
    assert.match(direct.response.headers.get('content-disposition'), /filename="ConnectX-Better-Name\.apk"/);
    assert.equal((await call('app-store/file/admin%2Fprivate%2Finvoice.pdf', { bucket })).response.status, 404);
    const removed = await call(`platform/app-store/${added.app.id}`, { method: 'DELETE', auth, bucket });
    assert.equal(removed.data.deleted, true);
    assert.equal(bucket.objects.size, 0);
    assert.equal((await call(`app-store/download/${packageName}`, { bucket })).response.status, 404);
  } finally { db.restore(); }
});

test('publishing without binary or R2 binding is rejected, drafts can be saved', async () => {
  const db = mockDb();
  const auth = await ownerToken();
  try {
    const rejected = await call('platform/app-store', { method: 'POST', auth, body: {
      title: 'ConnectX', package_name: packageName, version: '1.4.0', version_code: 14,
      apk_url: fakeUrl, published: true } });
    assert.equal(rejected.response.status, 422);
    assert.equal(db.rows.length, 0);
    const form = new FormData();
    form.set('packageName', packageName);
    form.set('file', new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'a.apk'));
    assert.equal((await call('platform/app-store/upload', { method: 'POST', body: form, auth })).response.status, 503);
    const draft = await call('platform/app-store', { method: 'POST', auth, body: {
      title: 'ConnectX', package_name: packageName, version: '1.4.0', version_code: 14, published: false } });
    assert.equal(draft.response.status, 201);
    assert.deepEqual((await call('app-store/apps')).data, []);
  } finally { db.restore(); }
});

test('newly published builds replace the old APK; hidden versions and private objects stay private', async () => {
  const bucket = r2();
  const oldKey = `${'app-store/'}${packageName}/apk/old.apk`;
  const newKey = `${'app-store/'}${packageName}/apk/new.apk`;
  const icon = `${'app-store/'}${packageName}/icons/logo.png`;
  await bucket.put(oldKey, new Uint8Array([80, 75, 3, 4]));
  await bucket.put(newKey, new Uint8Array([80, 75, 3, 4, 10]));
  await bucket.put(icon, new Uint8Array([137, 80, 78, 71]), { httpMetadata: { contentType: 'image/png' } });
  await bucket.put('private-admin/expense.pdf', new Uint8Array([1, 2, 3]));
  const db = mockDb([release({ version: '1.4.0', version_code: 14,
    apk_r2_key: oldKey, r2_key: oldKey, apk_size_bytes: 4, published: true }),
    release({ id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', version: '2.0.0', version_code: 20,
      apk_r2_key: newKey, r2_key: newKey, published: false })]);
  const auth = await ownerToken();
  try {
    assert.equal((await call('app-store/check-update?versionCode=13', { bucket })).data.versionCode, 14);
    assert.equal((await call(`app-store/file/${encodeURIComponent(newKey)}`, { bucket })).response.status, 404);
    assert.equal((await call('app-store/file/private-admin%2Fexpense.pdf', { bucket })).response.status, 404);
    // A version bump without new bytes would advertise an APK with the wrong build.
    const stale = await call(`platform/app-store/${db.rows[0].id}`, { method: 'PATCH', auth, bucket,
      body: { version: '1.5.0', version_code: 15, published: true } });
    assert.equal(stale.response.status, 409);
    // Publish a replacement for the same package; the old object is removed after DB update.
    const patched = await call(`platform/app-store/${db.rows[0].id}`, { method: 'PATCH', auth, bucket, body: {
      version: '1.5.0', version_code: 15, apk_r2_key: newKey, apk_url: '',
      apk_size_bytes: 5, icon_r2_key: icon, icon_url: `/api/app-store/file/${encodeURIComponent(icon)}`,
      published: true } });
    assert.equal(patched.response.status, 200);
    assert.equal(bucket.objects.has(oldKey), false);
    assert.equal((await call('app-store/check-update?versionCode=14', { bucket })).data.versionCode, 15);
    assert.equal((await call(`app-store/file/${encodeURIComponent(icon)}`, { bucket })).response.headers.get('content-type'), 'image/png');
    assert.equal((await call(`app-store/file/${encodeURIComponent(newKey)}`, { bucket })).response.status, 200);
    assert.equal((await call(`app-store/file/${encodeURIComponent(icon)}`, { method: 'POST', auth, bucket })).response.status, 405);
  } finally { db.restore(); }
});

test('failed APK upload cannot return a success URL or create a release', async () => {
  const db = mockDb();
  const bucket = r2(), auth = await ownerToken();
  bucket.put = async () => { throw Error('R2 failed'); };
  const originalError = console.error;
  console.error = () => {}; // Simulated R2 failure is expected in this test.
  try {
    const form = new FormData();
    form.set('packageName', packageName);
    form.set('file', new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'test.apk'));
    assert.equal((await call('platform/app-store/upload', { method: 'POST', body: form, bucket })).response.status, 401);
    const upload = await call('platform/app-store/upload', { method: 'POST', body: form, auth, bucket });
    assert.equal(upload.response.status, 503);
    assert.equal(upload.data.ok, undefined);
    assert.equal(db.rows.length, 0);
  } finally { console.error = originalError; db.restore(); }
});

test('owner may switch from R2 to a verified HTTPS-hosted binary', async () => {
  const bucket = r2(), key = `app-store/${packageName}/apk/old.apk`, auth = await ownerToken();
  await bucket.put(key, new Uint8Array([80, 75, 3, 4]));
  const db = mockDb([release({ apk_r2_key: key, r2_key: key, apk_size_bytes: 4 })]);
  try {
    const updated = await call(`platform/app-store/${db.rows[0].id}`, { method: 'PATCH', auth, bucket,
      body: { version: '1.5.0', version_code: 15, apk_url: hostedApk,
        apk_r2_key: null, r2_key: null, apk_size_bytes: 128, published: true } });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.data.app.apk_r2_key, null);
    assert.equal(bucket.objects.has(key), false);
    const download = await call(`app-store/download/${packageName}`, { bucket });
    assert.equal(download.response.status, 302);
    assert.equal(download.response.headers.get('location'), hostedApk);
  } finally { db.restore(); }
});

test('owner can unpublish a mislabeled build, correct its metadata, and republish the same APK', async () => {
  const bucket = r2();
  const oldApk = `app-store/${packageName}/apk/actually-build-14.apk`;
  await bucket.put(oldApk, new Uint8Array([80, 75, 3, 4]));
  const db = mockDb([release({ version: '1.5.0', version_code: 15,
    apk_r2_key: oldApk, r2_key: oldApk, apk_size_bytes: 4,
    apk_filename: 'ConnectX-v1.5.0-build15.apk', mandatory: true, published: true })]);
  const auth = await ownerToken();
  const path = `platform/app-store/${db.rows[0].id}`;
  try {
    // Protect real upgrade history: a published build cannot be downgraded in one step.
    const direct = await call(path, { method: 'PATCH', auth, bucket,
      body: { version: '1.4.0', version_code: 14 } });
    assert.equal(direct.response.status, 409);
    // Unpublish and correct the metadata without destroying the stored APK.
    const draft = await call(path, { method: 'PATCH', auth, bucket,
      body: { version: '1.4.0', version_code: 14,
        apk_filename: 'ConnectX-v1.4.0-build14.apk', mandatory: false, published: false } });
    assert.equal(draft.response.status, 200);
    assert.equal(draft.data.app.apk_r2_key, oldApk);
    assert.equal(bucket.objects.has(oldApk), true);
    assert.deepEqual((await call('app-store/apps', { bucket })).data, []);
    // The same recorded build can then be published again, provided the APK is available.
    const republished = await call(path, { method: 'PATCH', auth, bucket,
      body: { published: true } });
    assert.equal(republished.response.status, 200);
    assert.equal(republished.data.app.version_code, 14);
    const release14 = (await call('app-store/check-update?versionCode=14', { bucket })).data;
    assert.equal(release14.hasUpdate, false); // Nothing new for a phone already on build 14.
    assert.equal((await call('app-store/check-update?versionCode=13', { bucket })).data.hasUpdate, true);
    const download = await call(`app-store/download/${packageName}`, { bucket });
    assert.equal(download.response.status, 200);
    assert.match(download.response.headers.get('content-disposition'), /ConnectX-v1\.4\.0-build14\.apk/);
  } finally { db.restore(); }
});
