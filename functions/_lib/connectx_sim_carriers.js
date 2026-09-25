/* Owner-managed USSD catalog. Codes are NEVER seeded or available anonymously.
 * Only the requested active carrier is returned to a registered ConnectX device.
 * The phone (not EMS) sends USSD after a deliberate Refresh + CALL_PHONE grant. */
import { db } from './db.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const fail = (message, status = 400) => json({ error: message }, status);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value) => String(value ?? '').trim();
const bool = (value) => value === true || value === 1 || value === 'true' || value === '1';
const sameName = (value) => clean(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const unsafePattern = /\([^)]*[+*{][^)]*\)[+*{]/;
const field = (body, existing, key, fallback = '') =>
  Object.prototype.hasOwnProperty.call(body, key) ? body[key] : (existing?.[key] ?? fallback);

function validate(body, existing = {}) {
  const carrier_name = clean(field(body, existing, 'carrier_name')).slice(0, 100);
  const mcc_mnc = clean(field(body, existing, 'mcc_mnc')) || null;
  const carrier_identifier = clean(field(body, existing, 'carrier_identifier')).slice(0, 100);
  const balance_ussd_code = clean(field(body, existing, 'balance_ussd_code'));
  const balance_pattern = clean(field(body, existing, 'balance_pattern'));
  const active = bool(field(body, existing, 'active', false));
  if (!carrier_name || (!mcc_mnc && !carrier_identifier))
    return { error: 'Enter a carrier name and its MCC/MNC or exact Android carrier identifier.' };
  if (mcc_mnc && !/^\d{5,6}$/.test(mcc_mnc)) return { error: 'MCC/MNC must be 5 or 6 digits.' };
  // Limit to plain USSD dial strings, never a phone number, URL, or command text.
  const validCode = c => !c || (c.length <= 25 && /^\*(?=[0-9*]*[0-9])[0-9*]+#$/.test(c));
  if (!validCode(balance_ussd_code))
    return { error: 'Use a short dial code such as *123# (digits and * only, ending in #).' };
  if (active && !balance_ussd_code)
    return { error: 'Set a verified balance USSD code before activating a carrier.' };
  if (balance_pattern.length > 160) return { error: 'Balance response pattern must be 160 characters or fewer.' };
  if (balance_pattern) {
    if (unsafePattern.test(balance_pattern)) return { error: 'Avoid nested repeated groups in response patterns.' };
    try { new RegExp(balance_pattern, 'iu'); } catch { return { error: 'Invalid balance response pattern. Use a regular expression with one capturing group for the number.' }; }
    if (!/\((?!\?)/.test(balance_pattern)) return { error: 'The response pattern must contain a capturing group for the number.' };
  }
  return { data: { carrier_name, mcc_mnc, carrier_identifier, balance_ussd_code,
    balance_pattern, active, updated_at: new Date().toISOString() } };
}

// Whitelist owner response fields too: old databases must never serve retired
// quota codes from cached rows while a balance-only migration is rolling out.
function carrierView(row) {
  const { id, carrier_name, mcc_mnc, carrier_identifier, balance_ussd_code,
    balance_pattern, active, created_at, updated_at } = row;
  return { id, carrier_name, mcc_mnc, carrier_identifier, balance_ussd_code,
    balance_pattern, active, created_at, updated_at };
}

async function readBody(request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

// Identifier-only rows must be unambiguous when the phone cannot report an MCC/MNC.
function duplicate(rows, candidate) {
  if (candidate.mcc_mnc && rows.some(row => row.mcc_mnc === candidate.mcc_mnc))
    return 'This MCC/MNC is already configured.';
  if (!candidate.mcc_mnc && rows.some(row => !row.mcc_mnc &&
      sameName(row.carrier_identifier) === sameName(candidate.carrier_identifier)))
    return 'This carrier identifier is already configured without an MCC/MNC.';
  return null;
}

export async function simCarrierRoutes({ env, request, path, method, session, audit }) {
  const ownerList = path === 'platform/sim-carriers';
  const ownerItem = path.startsWith('platform/sim-carriers/');
  const deviceLookup = path === 'connectx/gateway/sim-carrier';
  if (!ownerList && !ownerItem && !deviceLookup) return null;

  if (deviceLookup) {
    if (method !== 'GET') return fail('Method not allowed.', 405);
    if (session.role !== 'connectx_device' || !session.deviceId || !session.storeId)
      return fail('A connected ConnectX device is required.', 403);
    const [device] = await db(env, `connectx_devices?id=eq.${encodeURIComponent(session.deviceId)}&store_id=eq.${encodeURIComponent(session.storeId)}&select=id,status`);
    if (!device || device.status === 'revoked') return fail('This device is no longer connected.', 403);
    const params = new URL(request.url).searchParams;
    const numeric = clean(params.get('mccMnc'));
    const identifier = sameName(params.get('carrierName'));
    if (numeric && !/^\d{5,6}$/.test(numeric)) return fail('Invalid MCC/MNC.', 400);
    if (!numeric && (!identifier || identifier.length > 100)) return json({ supported: false });
    const rows = await db(env, 'connectx_sim_carriers?select=*');
    const exact = numeric ? rows.find(row => row.mcc_mnc === numeric) : null;
    // Name fallback ONLY for catalog rows without MCC/MNC. Never override an
    // inactive numeric match or guess a different carrier's USSD code.
    const byName = !exact && identifier ? rows.filter(row => !row.mcc_mnc &&
      sameName(row.carrier_identifier || row.carrier_name) === identifier) : [];
    const match = exact || (byName.length === 1 ? byName[0] : null);
    if (!match || !bool(match.active) || !match.balance_ussd_code)
      return json({ supported: false });
    return json({ supported: true, carrier: {
      carrier_name: match.carrier_name, mcc_mnc: match.mcc_mnc,
      balance_ussd_code: match.balance_ussd_code, balance_pattern: match.balance_pattern
    } });
  }

  if (session.role !== 'owner') return fail('Only the EMS platform owner can manage SIM carriers.', 403);
  if (ownerList) {
    if (method === 'GET')
      return json((await db(env, 'connectx_sim_carriers?select=*&order=carrier_name.asc')).map(carrierView));
    if (method !== 'POST') return fail('Method not allowed.', 405);
    const body = await readBody(request);
    if (!body) return fail('Provide a JSON object.', 400);
    const { data, error } = validate(body);
    if (error) return fail(error);
    const rows = await db(env, 'connectx_sim_carriers?select=mcc_mnc,carrier_identifier');
    const conflict = duplicate(rows, data);
    if (conflict) return fail(conflict, 409);
    const [saved] = await db(env, 'connectx_sim_carriers', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    await audit(env, session, 'add SIM carrier', 'connectx_sim_carrier', saved.id,
      { carrier_name: saved.carrier_name, mcc_mnc: saved.mcc_mnc });
    return json(carrierView(saved), 201);
  }

  const id = path.slice('platform/sim-carriers/'.length);
  if (!uuid.test(id)) return fail('Invalid carrier ID.');
  if (method !== 'PATCH' && method !== 'DELETE') return fail('Method not allowed.', 405);
  const [old] = await db(env, `connectx_sim_carriers?id=eq.${id}&select=*`);
  if (!old) return fail('Carrier not found.', 404);
  if (method === 'DELETE') {
    await db(env, `connectx_sim_carriers?id=eq.${id}`, { method: 'DELETE' });
    await audit(env, session, 'delete SIM carrier', 'connectx_sim_carrier', id, { carrier_name: old.carrier_name });
    return json({ deleted: true });
  }
  const body = await readBody(request);
  if (!body) return fail('Provide a JSON object.', 400);
  const { data, error } = validate(body, old);
  if (error) return fail(error);
  if (data.mcc_mnc !== old.mcc_mnc || data.carrier_identifier !== old.carrier_identifier) {
    const rows = await db(env, 'connectx_sim_carriers?select=id,mcc_mnc,carrier_identifier');
    const conflict = duplicate(rows.filter(row => row.id !== id), data);
    if (conflict) return fail(conflict, 409);
  }
  const [saved] = await db(env, `connectx_sim_carriers?id=eq.${id}`, { method: 'PATCH',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  await audit(env, session, 'update SIM carrier', 'connectx_sim_carrier', id,
    { carrier_name: saved.carrier_name, active: saved.active });
  return json(carrierView(saved));
}
