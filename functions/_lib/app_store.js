/* Public, read-only EMS App Store routes. Never expose Vaultium's private keys:
 * even when both products share an R2 binding, only keys attached to a
 * published app under app-store/<package>/ may be served anonymously. */
import { db } from './db.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const fail = (message, status) => json({ error: message }, status);
export const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validPackage = value => /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(String(value || ''));
export const getAppStorageBucket = env => env.APP_STORAGE || env.APPS_BUCKET || env.VAULTIUM || env.MEDIA_BUCKET || null;
export const isPublished = app => app?.published === true || app?.published === 1 || app?.published === 'true' || app?.published === '1';
const isAppKey = (key, app) => typeof key === 'string' &&
  key.startsWith(`app-store/${app.package_name}/`) && !key.split('/').includes('..');

function keyFromFileUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const path = new URL(url, 'https://ems.invalid').pathname;
    const marker = '/api/app-store/file/';
    return path.startsWith(marker) ? decodeURIComponent(path.slice(marker.length)) : null;
  } catch { return null; }
}
export function apkKey(app) {
  const key = app.apk_r2_key || app.r2_key || keyFromFileUrl(app.apk_url);
  return isAppKey(key, app) ? key : null;
}
export function iconKey(app) {
  const key = app.icon_r2_key || keyFromFileUrl(app.icon_url);
  return isAppKey(key, app) ? key : null;
}
export const downloadPath = app => `/api/app-store/download/${encodeURIComponent(app.package_name)}`;

function externalApkUrl(app) {
  try {
    const url = new URL(app.apk_url);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname.startsWith('/api/app-store/') ||
        /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?)/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

/* A version is an update only if there is an actual downloadable binary.
 * A broken external link (including the old, nonexistent GitHub v1.4.0
 * release) must never be reported as an installable update. */
export async function releaseStatus(env, app) {
  const key = apkKey(app), bucket = getAppStorageBucket(env);
  if (key) {
    if (!bucket) return { available: false };
    try {
      const object = await bucket.head(key);
      return { available: !!object && Number(object.size) > 0, source: 'r2', key };
    } catch (error) {
      console.error('App Store R2 HEAD failed:', error);
      return { available: false };
    }
  }
  const external = externalApkUrl(app);
  if (!external) return { available: false };
  try {
    const response = await fetch(external, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(7000) });
    const type = response.headers.get('content-type') || '';
    const length = response.headers.get('content-length');
    return { available: response.ok && !/text\/html|application\/json/i.test(type) &&
      (length === null || Number(length) > 0), source: 'external', url: external };
  } catch (error) {
    console.error('App Store external APK check failed:', error);
    return { available: false };
  }
}

function publishedApps(rows) {
  // Supabase has UNIQUE(package_name); handle old D1 installations that do not.
  const packages = new Set();
  return rows.filter(isPublished).sort((a, b) => Number(b.version_code) - Number(a.version_code) ||
    String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).filter(app => {
    const pkg = String(app.package_name || '').toLowerCase();
    if (!pkg || packages.has(pkg)) return false;
    packages.add(pkg);
    return true;
  });
}
const rowsForStore = async env => publishedApps(await db(env, 'app_store_apps?select=*'));
const filename = value => String(value || 'app.apk').replace(/[\r\n\\/"]/g, '_').slice(0, 180);
const disposition = value => `attachment; filename="${filename(value).replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename(value))}`;

export async function publicAppStoreRoutes({ env, request, path, method }) {
  const listing = path === 'app-store/apps';
  const checking = path === 'app-store/check-update';
  const downloading = path.startsWith('app-store/download/');
  const file = path.startsWith('app-store/file/');
  if (!listing && !checking && !downloading && !file) return null;
  if (method !== 'GET' && !((downloading || file) && method === 'HEAD')) return fail('Method not allowed.', 405);

  const apps = await rowsForStore(env);
  if (listing) {
    const result = await Promise.all(apps.map(async app => {
      const status = await releaseStatus(env, app);
      return {
        id: app.id, package_name: app.package_name, title: app.title,
        description: app.description, version: app.version,
        version_code: Number(app.version_code), icon_url: app.icon_url,
        apk_filename: app.apk_filename, apk_size_bytes: Number(app.apk_size_bytes || 0),
        mandatory: !!app.mandatory, release_notes: app.release_notes,
        updated_at: app.updated_at, download_available: status.available,
        download_url: status.available ? downloadPath(app) : null
      };
    }));
    return json(result);
  }

  if (checking) {
    const params = new URL(request.url).searchParams;
    const pkg = (params.get('package') || 'com.ems.connectx').trim();
    const app = apps.find(row => row.package_name.toLowerCase() === pkg.toLowerCase());
    if (!app) return fail('No published release for this app.', 404);
    const status = await releaseStatus(env, app);
    if (!status.available) return fail('The latest release is registered, but its APK is not available. Ask the EMS owner to upload a signed APK or fix its download URL.', 503);
    const installed = Number(params.get('versionCode') ?? params.get('version_code') ?? 0);
    const versionCode = Number(app.version_code);
    const url = new URL(downloadPath(app), request.url).href;
    return json({
      ok: true, hasUpdate: versionCode > (Number.isSafeInteger(installed) && installed >= 0 ? installed : 0),
      title: app.title, description: app.description,
      latestVersion: app.version, version: app.version, versionCode, version_code: versionCode,
      mandatory: !!app.mandatory, downloadUrl: url, download_url: url,
      apk_filename: app.apk_filename, apk_size_bytes: Number(app.apk_size_bytes || 0),
      releaseNotes: app.release_notes || '', release_notes: app.release_notes || '',
      updated_at: app.updated_at
    });
  }

  if (downloading) {
    let id;
    try { id = decodeURIComponent(path.slice('app-store/download/'.length)); } catch { return fail('Invalid app ID.', 400); }
    const app = apps.find(row => row.id === id || row.package_name.toLowerCase() === id.toLowerCase());
    if (!app) return fail('App not found.', 404);
    const status = await releaseStatus(env, app);
    if (!status.available) return fail('APK file is not available. Ask the EMS owner to upload a signed APK.', 503);
    if (status.source === 'external') return Response.redirect(status.url, 302);
    const bucket = getAppStorageBucket(env);
    const object = method === 'HEAD' ? await bucket.head(status.key) : await bucket.get(status.key);
    if (!object || !object.size) return fail('APK file is missing from storage.', 503);
    return new Response(method === 'HEAD' ? null : object.body, {
      headers: { 'content-type': 'application/vnd.android.package-archive',
        'content-disposition': disposition(app.apk_filename || `${app.package_name}.apk`),
        'content-length': String(object.size), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
  }

  // Legacy upload URLs may point to /file/<key>. Match the key to a published
  // app record BEFORE touching R2; arbitrary Vaultium or unpublished app keys
  // are never served, even when the caller has an EMS session.
  let key;
  try { key = decodeURIComponent(path.slice('app-store/file/'.length)); } catch { return fail('Invalid file key.', 400); }
  if (!key.startsWith('app-store/')) return fail('File not found.', 404);
  const app = apps.find(row => iconKey(row) === key || apkKey(row) === key);
  if (!app) return fail('File not found.', 404);
  const bucket = getAppStorageBucket(env);
  if (!bucket) return fail('App storage is not configured.', 503);
  const object = method === 'HEAD' ? await bucket.head(key) : await bucket.get(key);
  if (!object) return fail('File is missing from storage.', 404);
  const isApk = apkKey(app) === key;
  const iconType = /^(image\/(png|jpeg|webp))$/i.test(object.httpMetadata?.contentType || '')
    ? object.httpMetadata.contentType : 'application/octet-stream';
  return new Response(method === 'HEAD' ? null : object.body, {
    headers: { 'content-type': isApk ? 'application/vnd.android.package-archive' : iconType,
      'content-disposition': isApk ? disposition(app.apk_filename || `${app.package_name}.apk`) :
        (iconType.startsWith('image/') ? 'inline' : 'attachment'),
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}
