/* Owner-only release management. Upload the APK first, then publish its
 * verified R2 key; drafts are allowed without a binary but cannot be public. */
import { db } from './db.js';
import { apkKey, iconKey, getAppStorageBucket, releaseStatus, downloadPath, validPackage, UUID_FORMAT } from './app_store.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const fail = (message, status) => json({ error: message }, status);
const flag = value => value === true || value === 1 || value === 'true' || value === '1';
const versionCode = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const size = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : -1;
const name = value => String(value || '').trim();
const isVersion = value => /^\d+(?:\.\d+){1,3}$/.test(value);
const provided = (body, names, fallback) => {
  for (const field of names) if (Object.prototype.hasOwnProperty.call(body, field)) return body[field];
  return fallback;
};

function fields(b, existing = {}) {
  const pkg = name(b.package_name ?? b.packageName ?? existing.package_name);
  const title = name(b.title ?? existing.title);
  const version = name(b.version ?? existing.version ?? '1.0.0');
  const code = versionCode(b.version_code ?? b.versionCode ?? existing.version_code ?? 1);
  const apkSize = size(b.apk_size_bytes ?? b.apkSizeBytes ?? existing.apk_size_bytes ?? 0);
  if (!validPackage(pkg) || !title || !isVersion(version) || !code || apkSize < 0)
    return { error: 'Enter a title, valid Android package, version (e.g. 1.4.0), positive build code and valid APK size.' };
  if (existing.id && pkg !== existing.package_name)
    return { error: 'An app package cannot be renamed. Delete the old app and publish a new one.' };
  const r2Key = provided(b, ['apk_r2_key', 'apkR2Key', 'r2_key', 'r2Key'], existing.apk_r2_key || existing.r2_key || null);
  const iconR2Key = provided(b, ['icon_r2_key', 'iconR2Key'], existing.icon_r2_key || null);
  const data = {
    package_name: pkg, title, description: name(b.description ?? existing.description),
    version, version_code: code, icon_url: name(b.icon_url ?? b.iconUrl ?? existing.icon_url ?? '/assets/android-chrome-192.png'),
    icon_r2_key: iconR2Key || null,
    apk_url: name(b.apk_url ?? b.apkUrl ?? existing.apk_url),
    apk_r2_key: r2Key || null, r2_key: r2Key || null,
    apk_size_bytes: apkSize,
    apk_filename: name(b.apk_filename ?? b.apkFilename ?? existing.apk_filename ?? `${pkg}-${version}.apk`),
    mandatory: b.mandatory === undefined ? flag(existing.mandatory) : flag(b.mandatory),
    release_notes: name(b.release_notes ?? b.releaseNotes ?? existing.release_notes),
    published: b.published === undefined ? (existing.id ? flag(existing.published) : false) : flag(b.published),
    updated_at: new Date().toISOString()
  };
  if (data.apk_filename.length > 180 || !/^[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.apk$/iu.test(data.apk_filename) || data.apk_filename.includes('..'))
    return { error: 'APK download filename must end with .apk and contain no paths or unsafe characters.' };
  if (data.apk_r2_key && !apkKey(data)) return { error: 'APK storage key must belong to app-store/<package>/.' };
  if (data.icon_r2_key && !iconKey(data)) return { error: 'Icon storage key must belong to app-store/<package>/.' };
  return { data };
}

function upgradeError(old, app) {
  if (!old || !app.published) return null;
  if (app.version_code < Number(old.version_code))
    return fail('Build code cannot be lower than the currently registered build.', 409);
  if (app.version !== old.version && app.version_code <= Number(old.version_code))
    return fail('Increment the build code when publishing a new version.', 409);
  if (app.version_code > Number(old.version_code) && apkKey(app) === apkKey(old) &&
      (apkKey(app) || app.apk_url === old.apk_url))
    return fail('Upload a new APK (or supply a new working HTTPS URL) when increasing the build code.', 409);
  return null;
}

async function publishable(env, app) {
  if (!app.published) return null;
  const status = await releaseStatus(env, app);
  if (status.available) return null;
  return fail('Cannot publish without a downloadable APK. Upload a signed APK to EMS R2 or provide a working HTTPS APK URL (not the old GitHub v1.4.0 link).', 422);
}

async function cleanupReplaced(env, oldApp, newApp) {
  const bucket = getAppStorageBucket(env);
  if (!bucket) return;
  for (const key of [apkKey(oldApp), iconKey(oldApp)]) {
    if (key && key !== apkKey(newApp) && key !== iconKey(newApp)) {
      try { await bucket.delete(key); } catch (error) { console.error('App Store R2 cleanup failed:', error); }
    }
  }
}

async function upload(env, request) {
  const bucket = getAppStorageBucket(env);
  if (!bucket) return fail('App storage is not configured. Bind APP_STORAGE or VAULTIUM to an R2 bucket before uploading.', 503);
  const form = await request.formData();
  const file = form.get('file'), type = name(form.get('type') || 'apk');
  const pkg = name(form.get('packageName') || form.get('package_name'));
  if (!validPackage(pkg) || !['apk', 'icon'].includes(type)) return fail('A valid app package and upload type (apk or icon) are required.', 400);
  if (!file || typeof file === 'string' || !file.name || !file.size) return fail('Choose a non-empty file.', 400);
  const icon = type === 'icon';
  if (icon ? (file.size > 2 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) :
    (file.size > 100 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.apk')))
    return fail(icon ? 'Use a PNG, JPEG, or WebP icon under 2 MB.' : 'Use an APK file under 100 MB.', 400);
  if (!icon) {
    const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (magic[0] !== 0x50 || magic[1] !== 0x4b) return fail('The APK must be a valid ZIP-format Android package.', 400);
  }
  const key = `app-store/${pkg}/${icon ? 'icons' : 'apk'}/${Date.now()}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  try {
    await bucket.put(key, file.stream(), { httpMetadata: { contentType: icon ? file.type : 'application/vnd.android.package-archive' } });
    const saved = await bucket.head(key);
    if (!saved || Number(saved.size) !== file.size) throw Error('Uploaded file could not be verified in R2.');
  } catch (error) {
    console.error('App Store R2 upload failed:', error);
    try { await bucket.delete(key); } catch {}
    return fail('APK/icon upload failed. Check the R2 binding and retry; no release was published.', 503);
  }
  return json({ ok: true, stored_in_r2: true, ...(icon ? { icon_r2_key: key } : { apk_r2_key: key }),
    r2_key: key, filename: file.name, size_bytes: file.size,
    file_url: icon ? `/api/app-store/file/${encodeURIComponent(key)}` : downloadPath({ package_name: pkg }) });
}

export async function ownerAppStoreRoutes({ env, request, path, method, session, audit }) {
  if (path !== 'platform/app-store' && !path.startsWith('platform/app-store/')) return null;
  if (session.role !== 'owner') return fail('Forbidden.', 403);

  if (path === 'platform/app-store') {
    if (method === 'GET') {
      const rows = await db(env, 'app_store_apps?select=*&order=version_code.desc,created_at.desc');
      return json(await Promise.all(rows.map(async app => ({ ...app,
        download_available: (await releaseStatus(env, app)).available }))));
    }
    if (method !== 'POST') return fail('Method not allowed.', 405);
    const { data: record, error } = fields(await request.json());
    if (error) return fail(error, 400);
    const existing = await db(env, `app_store_apps?package_name=eq.${encodeURIComponent(record.package_name)}&select=*&limit=1`);
    const old = existing[0];
    const upgrade = upgradeError(old, record);
    if (upgrade) return upgrade;
    const missing = await publishable(env, record);
    if (missing) return missing;
    let saved;
    if (old) {
      [saved] = await db(env, `app_store_apps?id=eq.${old.id}`, { method: 'PATCH',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) });
      if (!saved) return fail('App not found.', 404);
      await cleanupReplaced(env, old, saved);
    } else {
      [saved] = await db(env, 'app_store_apps', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) });
    }
    await audit(env, session, old ? 'update app' : 'publish app', 'app_store', saved.id,
      { package_name: record.package_name, version: record.version, version_code: record.version_code });
    return json({ ok: true, app: saved }, old ? 200 : 201);
  }

  const id = path.slice('platform/app-store/'.length);
  if (id === 'upload') return method === 'POST' ? upload(env, request) : fail('Method not allowed.', 405);
  if (!id || !['PATCH', 'DELETE'].includes(method)) return fail('Method not allowed.', 405);
  let decoded;
  try { decoded = decodeURIComponent(id); } catch { return fail('Invalid app ID.', 400); }
  const query = UUID_FORMAT.test(decoded) ? `app_store_apps?id=eq.${decoded}` : `app_store_apps?package_name=eq.${encodeURIComponent(decoded)}`;
  const [old] = await db(env, `${query}&select=*&limit=1`);
  if (!old) return fail('App not found.', 404);
  if (method === 'PATCH') {
    const { data: record, error } = fields(await request.json(), old);
    if (error) return fail(error, 400);
    const upgrade = upgradeError(old, record);
    if (upgrade) return upgrade;
    const missing = await publishable(env, record);
    if (missing) return missing;
    const [saved] = await db(env, `app_store_apps?id=eq.${old.id}`, { method: 'PATCH',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) });
    if (!saved) return fail('App not found.', 404);
    await cleanupReplaced(env, old, saved);
    await audit(env, session, 'update app', 'app_store', old.id,
      { package_name: record.package_name, version: record.version, version_code: record.version_code });
    return json({ ok: true, app: saved });
  }
  await db(env, `app_store_apps?id=eq.${old.id}`, { method: 'DELETE' });
  await cleanupReplaced(env, old, {});
  await audit(env, session, 'delete app', 'app_store', old.id, { package_name: old.package_name });
  return json({ ok: true, deleted: true, count: 1 });
}
