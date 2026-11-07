/* EMS Mobile Scanner — application shell.
 *
 * Responsibilities kept here: session state, routing between views, and the
 * scan → send → acknowledge flow. Networking lives in link.js, the camera in
 * engine.js, and presentation primitives in ui.js.
 *
 * Hard rules this file must keep (enforced by test/mobile-scanner.test.js):
 *   · A scan is only ever *sent*. No invoice, stock or report row is written
 *     from the phone; the existing PC endpoints remain authoritative.
 *   · The PC must acknowledge an item before the phone calls it "added".
 *   · Offline or unbound means nothing is queued silently.
 */
import { truebillCode, truebillSummary } from './truebill.js';
import { truebillDetails } from './truebill_view.js';
import { ScannerLink } from './link.js';
import { ScanSession, loadZxing, nativeSupport } from './engine.js';
import { Toaster, esc, icon, money, clockTime, shortId, eventState, LINK_LABEL, tile, empty, actionRow } from './ui.js';

const app = document.getElementById('app');

/** randomUUID with a fallback: old Android WebViews and jsdom lack it. */
const uuid = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
        const r = (Math.random() * 16) | 0;
        return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/* ── Session ─────────────────────────────────────────────────────────────── */

const KEYS = ['token', 'user', 'store', 'storeId', 'userId', 'shopType', 'paired'];
const readSession = () => {
  const get = key => sessionStorage.getItem('ems.scanner.' + key) || '';
  return {
    token: get('token'),
    user: get('user'),
    store: get('store'),
    storeId: get('storeId'),
    userId: get('userId'),
    shopType: get('shopType'),
    paired: get('paired') === '1'
  };
};

const state = {
  ...readSession(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  view: 'home',
  profile: null,
  draft: null,
  binding: null,
  draftKind: 'sale',
  locked: false,
  items: [],
  drafts: [],
  draftsError: '',
  events: [],
  busy: '',
  draftsLoading: false,
  catalogQuery: '',
  signInTab: 'account',
  camera: null,
  scanSession: null,
  cameraError: '',
  torch: false,
  installPrompt: null
};

const toaster = new Toaster(document.getElementById('toast'));

const link = new ScannerLink({
  getToken: () => state.token,
  onStatus: online => {
    state.online = online;
    paintLink();
    if (!online) toaster.warn('Offline. Scans will not send until the connection is back.', { topic: 'link' });
  }
});

const api = (path, options = {}) => link.request(path, options);
const saveSession = () => KEYS.forEach(key => sessionStorage.setItem('ems.scanner.' + key, key === 'paired' ? (state.paired ? '1' : '0') : state[key] || ''));
const clearSession = () => {
  KEYS.forEach(key => sessionStorage.removeItem('ems.scanner.' + key));
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith('ems.scanner.events.')) sessionStorage.removeItem(key);
  }
};

/* ── Scan event buffer ───────────────────────────────────────────────────── */

const eventKey = () => `ems.scanner.events.${state.storeId}.${state.userId}.${state.draft || 'none'}`;
const saveEvents = () => {
  if (!state.draft) return;
  try {
    sessionStorage.setItem(eventKey(), JSON.stringify(state.events.slice(0, 60)));
  } catch {
    /* storage full — the list is a convenience, not the source of truth */
  }
};
const restoreEvents = () => {
  try {
    state.events = JSON.parse(sessionStorage.getItem(eventKey()) || '[]');
  } catch {
    state.events = [];
  }
};

/* ── Feedback ────────────────────────────────────────────────────────────── */

let audioContext = null;
function haptic(kind = 'ok') {
  try {
    navigator.vibrate?.(kind === 'ok' ? 30 : [18, 60, 18]);
  } catch {
    /* unsupported */
  }
}
function beep(kind = 'ok') {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const at = audioContext.currentTime;
    osc.type = 'sine';
    if (kind === 'ok') {
      osc.frequency.setValueAtTime(880, at);
      osc.frequency.exponentialRampToValueAtTime(1240, at + 0.08);
    } else {
      osc.frequency.setValueAtTime(320, at);
      osc.frequency.exponentialRampToValueAtTime(200, at + 0.16);
    }
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.07, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (kind === 'ok' ? 0.14 : 0.2));
    osc.connect(gain).connect(audioContext.destination);
    osc.start(at);
    osc.stop(at + (kind === 'ok' ? 0.15 : 0.22));
  } catch {
    /* audio blocked before a user gesture */
  }
}
function scanFeedback(kind = 'ok') {
  beep(kind);
  haptic(kind);
  const frame = document.querySelector('.scanner-frame');
  if (frame) {
    frame.classList.remove('hit');
    void frame.offsetWidth;
    frame.classList.add('hit');
    setTimeout(() => frame.classList.remove('hit'), 520);
  }
}

/* ── Routing ─────────────────────────────────────────────────────────────── */

const TABS = [
  { view: 'home', label: 'Home', iconName: 'home', auth: true },
  { view: 'camera', label: 'Scan', iconName: 'scan', auth: true },
  { view: 'catalog', label: 'Catalog', iconName: 'search', auth: true },
  { view: 'verify', label: 'Verify', iconName: 'verify', auth: false }
];

function go(view) {
  if (view !== 'verify' && !state.token) view = 'home';
  stopCamera();
  const changed = view !== state.view;
  state.view = view;
  render();
  // A new view starts at its top. Without this, switching tabs on a short
  // landscape screen left the operator halfway down the previous page.
  if (changed) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function targetLabel() {
  if (!state.draft) return 'Choose a sale or purchase';
  return `${state.locked ? 'Closed' : 'Active'} draft · ${state.draftKind === 'purchase' ? 'Purchase' : 'Sale'} ${shortId(state.draft)}`;
}

/* ── Camera orchestration ────────────────────────────────────────────────── */

function stopCamera() {
  state.scanSession?.stop();
  state.scanSession = null;
  state.camera = null;
  state.torch = false;
}

async function startCamera(kind, video, onCode) {
  stopCamera();
  state.cameraError = '';
  const session = new ScanSession({
    kind,
    cooldown: kind === 'qr' ? 1800 : 1100,
    onCode: code => {
      scanFeedback('ok');
      onCode(code);
    },
    onState: () => paintCameraChrome()
  });
  state.scanSession = session;
  state.camera = kind;
  paintCameraChrome();
  try {
    await session.start(video);
  } catch (error) {
    state.cameraError = error.message;
    state.camera = null;
    state.scanSession = null;
    paintCameraChrome();
    toaster.bad(error.message, { topic: 'camera' });
  }
}

/** Update only the camera chrome, never re-render the whole view under the video. */
function paintCameraChrome() {
  const active = !!state.scanSession?.active;
  // An idle "Stop" is a dead control: it appears only once a stream is running,
  // and then it is the primary way out of the camera.
  document.querySelectorAll('.cam-actions [data-cam="stop"], .qr-row-copy [data-cam="stop"]').forEach(button => {
    button.hidden = !active;
  });
  const frame = document.querySelector('.scanner-frame:not(.qr-thumb)');
  if (!frame) return;
  frame.classList.toggle('live', active);
  const status = frame.querySelector('.frame-status');
  if (status) {
    status.textContent = active ? 'Scanning' : state.cameraError ? 'Camera unavailable' : 'Camera off';
    status.dataset.state = active ? 'ok' : state.cameraError ? 'bad' : 'idle';
  }
  const caps = state.scanSession?.capabilities();
  const torch = document.querySelector('[data-cam="torch"]');
  if (torch) {
    torch.hidden = !active || !caps?.torch;
    torch.setAttribute('aria-pressed', String(!!state.scanSession?.torchOn));
  }
  const hint = frame.querySelector('.frame-hint');
  if (hint) hint.textContent = active ? (state.camera === 'qr' ? 'Hold the TrueBill QR inside the frame' : 'Hold the barcode across the frame') : '';
}

function paintLink() {
  const badge = document.querySelector('.link-badge');
  if (!badge) return;
  const health = link.health();
  const info = LINK_LABEL[health] || LINK_LABEL.good;
  badge.dataset.tone = info.tone;
  badge.querySelector('b').textContent = info.text;
  badge.title = link.latency ? `${link.latency} ms round trip` : 'Measuring connection…';
}

/* ── Drafts (the PC bills this phone can scan into) ──────────────────────── */

async function loadDrafts() {
  if (!state.token) return;
  state.draftsLoading = true;
  paintDrafts();
  try {
    const drafts = await api('scanner/drafts');
    state.drafts = drafts;
    if (state.draft && !drafts.some(d => d.draft_id === state.draft)) {
      let active = false;
      try {
        active = (await api(`scanner/drafts/${state.draft}/status?binding_id=${state.binding}`)).connected;
      } catch {
        /* treat as gone */
      }
      if (!active) detachDraft('That PC bill closed. Choose another one.');
    }
  } catch (error) {
    state.draftsError = error.message;
  } finally {
    state.draftsLoading = false;
    paintDrafts();
  }
}

function detachDraft(message) {
  state.draft = null;
  state.binding = null;
  state.draftKind = 'sale';
  state.locked = true;
  state.events = [];
  if (message) toaster.warn(message, { topic: 'draft' });
}

async function selectDraft(id) {
  state.busy = 'bind';
  render();
  try {
    const result = await api(`scanner/drafts/${id}/bind`, { method: 'POST', body: {} });
    state.draft = id;
    state.binding = result.binding_id;
    state.draftKind = result.kind || 'sale';
    state.locked = false;
    state.events = [];
    state.catalogAt = 0; // a different bill may carry different stock
    restoreEvents();
    toaster.ok('Linked to ' + targetLabel(), { topic: 'draft' });
    state.poller?.kick();
    go('camera');
  } catch (error) {
    toaster.bad('Could not link that bill: ' + error.message, { topic: 'draft' });
  } finally {
    state.busy = '';
    render();
  }
}

/* ── Sending ─────────────────────────────────────────────────────────────── */

function canSend() {
  if (!state.token) return 'Sign in first.';
  if (!state.draft || !state.binding) return 'Choose a PC bill first.';
  if (state.locked) return 'That PC bill closed. Choose another.';
  if (!state.online) return 'You are offline. Reconnect to send.';
  return '';
}

async function sendEvent(event) {
  const blocked = canSend();
  if (blocked) {
    toaster.bad(blocked, { topic: 'send' });
    return;
  }
  event.status = 'sending';
  saveEvents();
  paintEvents();
  try {
    await api(`scanner/drafts/${state.draft}/events`, {
      method: 'POST',
      keepalive: true, // a scan already leaving must survive a screen lock
      body: { event_id: event.id, product_id: event.productId, binding_id: state.binding }
    });
    // The POST response is an acknowledgement of receipt, not of application:
    // the PC decides whether the item can be added. Show it as pending until
    // the next /sync reports what the PC actually did.
    event.status = 'pending';
    event.reason = '';
    state.lastSendAt = Date.now();
    toaster.ok(`${event.name} sent`, { topic: 'send' });
    // A burst of scans must not keep one bubble alive indefinitely: each new
    // item refreshes the timeout rather than inheriting the first one.
    toaster.arm(toaster.current.get('send'), 2400, 'ok');
    state.poller?.kick();
  } catch (error) {
    event.status = 'error';
    event.reason = error.message;
    toaster.bad(`${event.name} was not sent. ${error.message}`, { topic: 'send' });
  }
  saveEvents();
  paintEvents();
}

async function addItem(product) {
  const blocked = canSend();
  if (blocked) {
    toaster.bad(blocked, { topic: 'send' });
    return;
  }
  const event = {
    id: uuid(),
    productId: product.id,
    name: product.name + (product.strength ? ' · ' + product.strength : ''),
    at: new Date().toISOString(),
    status: 'sending',
    reason: ''
  };
  state.events.unshift(event);
  if (state.events.length > 60) state.events.length = 60;
  saveEvents();
  paintEvents();
  await sendEvent(event);
}

/* One round trip per poll: /sync carries the draft state, the binding state and
   every event status the draft has ever seen. The old loop called /status,
   /sync and /events separately, and the PC polled /events on its own timer. */
let syncing = false;
async function refreshEvents() {
  if (syncing || !state.draft || !state.binding || !state.online) return false;
  syncing = true;
  try {
    return await syncDraft();
  } finally {
    syncing = false;
  }
}

async function syncDraft() {
  const sync = await api(`scanner/drafts/${state.draft}/sync?binding_id=${state.binding}`);
  const wasLocked = state.locked;
  state.locked = !sync.connected;
  if (sync.kind) state.draftKind = sync.kind;
  if (state.locked && !wasLocked) {
    stopCamera();
    toaster.bad('The PC bill closed. No more scans can be sent.', { topic: 'draft' });
  }

  let changed = false;
  const byId = new Map((sync.events || []).map(row => [row.id, row]));
  for (const event of state.events) {
    const remote = byId.get(event.id);
    if (!remote) continue;
    const nextStatus = remote.status === 'error' ? 'error' : remote.status;
    if (event.status === nextStatus && (event.reason || '') === (remote.reason || '')) continue;
    const previous = event.status;
    event.status = nextStatus;
    event.reason = remote.reason || '';
    changed = true;
    if (nextStatus === 'applied' && previous !== 'applied') toaster.ok(`${event.name} added on the PC`, { topic: 'send' });
    if (nextStatus === 'rejected' && previous !== 'rejected') {
      toaster.bad(`${event.name} was not added${event.reason ? ': ' + event.reason : ''}`, { topic: 'send' });
    }
  }
  if (changed) saveEvents();
  paintEvents();
  paintTarget();
  /* Stay in the fast cadence only while something is genuinely in flight: an
     item being posted, or an item sent in the last few seconds that the PC has
     not acknowledged yet. An item the PC never acknowledges must not keep the
     phone polling flat out for the rest of the shift. */
  const inFlight = state.events.some(event => event.status === 'sending');
  const waiting = state.events.some(event => event.status === 'pending');
  return inFlight || (waiting && !!state.lastSendAt && Date.now() - state.lastSendAt < 5000);
}

/* ── Scanner: decode a code and resolve it to one product ────────────────── */

let lastLookup = { code: '', at: 0 };

async function onBarcode(code) {
  code = String(code || '').trim();
  if (!code) return;
  const blocked = canSend();
  if (blocked) {
    toaster.bad(blocked, { topic: 'scan' });
    return;
  }
  // The session already debounces the same code; this guards against a second
  // frame landing while the first lookup is still in flight.
  if (code === lastLookup.code && Date.now() - lastLookup.at < 900) return;
  lastLookup = { code, at: Date.now() };

  try {
    const rows = await api(`scanner/drafts/${state.draft}/catalog?binding_id=${state.binding}&q=${encodeURIComponent(code)}`);
    const needle = code.toLowerCase();
    const exact = rows.filter(row => row.barcode?.toLowerCase() === needle || row.sku?.toLowerCase() === needle);
    if (exact.length === 1) {
      scanFeedback('ok');
      await addItem(exact[0]);
      return;
    }
    scanFeedback('bad');
    if (exact.length > 1) {
      toaster.warn(`More than one item uses ${code}. Pick it in Catalog.`, { topic: 'scan' });
      state.catalogQuery = code;
    } else {
      toaster.bad(`No item matches ${code}. Search the catalog or assign a code.`, { topic: 'scan' });
      state.catalogQuery = code;
    }
  } catch (error) {
    scanFeedback('bad');
    toaster.bad('Lookup failed: ' + error.message, { topic: 'scan' });
  }
}

/* ── Catalog ─────────────────────────────────────────────────────────────── */

let catalogRequest = 0;
async function searchCatalog(query = '') {
  state.catalogQuery = query;
  const ticket = ++catalogRequest;
  paintCatalog({ loading: true });
  try {
    const route = state.draft && state.binding
      ? `scanner/drafts/${state.draft}/catalog?binding_id=${state.binding}&q=${encodeURIComponent(query)}`
      : `scanner/catalog?q=${encodeURIComponent(query)}`;
    const rows = await api(route);
    if (ticket !== catalogRequest) return; // a newer query already won
    state.items = rows;
    state.catalogAt = Date.now();
    paintCatalog();
  } catch (error) {
    if (ticket !== catalogRequest) return;
    state.items = [];
    paintCatalog({ error: error.message });
  }
}

/* ── TrueBill verification ───────────────────────────────────────────────── */

async function verifyInvoice(raw, source = 'manual') {
  const box = document.getElementById('verifyResult');
  if (!box) return;
  const value = String(raw || '').trim();
  if (source === 'manual' && !/^(?:PUR|SAL)-[A-Z0-9-]{3,74}$/i.test(value)) {
    toaster.bad('Invoice numbers start with PUR- or SAL-.', { topic: 'verify' });
    return;
  }
  const token = source === 'qr' ? truebillCode(value) : null;
  if (source === 'qr' && !token) {
    toaster.bad('That is not an EMS TrueBill QR.', { topic: 'verify' });
    return;
  }
  if (!state.online) {
    toaster.bad('Verification needs a connection.', { topic: 'verify' });
    return;
  }
  stopCamera();
  box.innerHTML = '<div class="verify-loading"><span class="spinner" aria-hidden="true"></span><p>Checking…</p></div>';
  try {
    const result = source === 'qr'
      ? await api('public/invoice/' + encodeURIComponent(token), { retries: 1 })
      : await api('public/invoice/lookup', { method: 'POST', body: { invoice_number: value } });
    if (!result?.verified) throw new Error('The record was not verified.');
    if (source === 'manual') {
      if (result.details_available !== false || !result.invoice_number || !['sale', 'purchase'].includes(result.kind)) {
        throw new Error('Invalid verification response.');
      }
      box.innerHTML = `<article class="verify-limited"><span class="verify-limited-ic">${icon('check', { size: 18 })}</span><div><b>${esc(result.invoice_number)}</b><p>Invoice number found</p><small>${result.kind === 'purchase' ? 'Purchase' : 'Sale'} record · scan its TrueBill QR for the full invoice.</small></div></article>`;
      toaster.ok('Invoice number found.', { topic: 'verify' });
    } else {
      if (!truebillSummary(result)) throw new Error('Invalid verification response.');
      box.innerHTML = truebillDetails(result);
      toaster.ok('Verified by EMS TrueBill.', { topic: 'verify' });
    }
  } catch (error) {
    const missing = error.status === 404;
    box.innerHTML = `<div class="verify-failed"><b>${missing ? 'No invoice found' : 'Could not check right now'}</b><p>${missing ? 'Check the number and try again.' : 'Try again when the connection is working.'}</p></div>`;
    toaster.bad(missing ? 'No matching invoice found.' : 'Verification could not be completed.', { topic: 'verify' });
  }
}

/* ── Sign in ─────────────────────────────────────────────────────────────── */

function qrLoginCode(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.origin !== location.origin || url.pathname.replace(/\/$/, '') !== '/scanner') return null;
    const code = new URLSearchParams(url.hash.slice(1)).get('login');
    return /^[a-f0-9]{64}$/i.test(code || '') ? code : null;
  } catch {
    return null;
  }
}

async function signInWithQr(code) {
  if (!code) {
    toaster.bad('That is not an EMS Scanner sign-in QR.', { topic: 'signin' });
    return;
  }
  try {
    const result = await api('scanner/login/consume', { method: 'POST', body: { token: code } });
    stopCamera();
    applySession(result, true);
    state.view = 'home';
    render();
    toaster.ok('Signed in. Choose the PC bill you are scanning into.', { topic: 'signin' });
  } catch (error) {
    toaster.bad('QR sign-in failed: ' + error.message, { topic: 'signin' });
  }
}

function applySession(result, paired = false) {
  state.token = result.token;
  state.user = result.user?.name || 'Scanner user';
  state.store = result.store?.name || 'EMS shop';
  state.storeId = result.store?.id || '';
  state.userId = result.user?.id || '';
  state.shopType = result.store?.shop_type || '';
  state.paired = paired;
  saveSession();
}

function signOut() {
  stopCamera();
  clearSession();
  Object.assign(state, { token: '', user: '', store: '', storeId: '', userId: '', shopType: '', paired: false, draft: null, binding: null, events: [], items: [], profile: null });
  state.poller?.stop();
  state.poller = null;
  state.view = 'home';
  toaster.clear();
  render();
}

/* ── Views ───────────────────────────────────────────────────────────────── */

function shell(title, body, { back = '', maxWidth = '', backId = '' } = {}) {
  const tabs = state.token ? TABS : TABS.filter(tab => !tab.auth);
  app.innerHTML = `
    <header class="bar">
      <button type="button" class="bar-btn" ${backId ? `id="${backId}"` : ''} data-nav="${back ? 'back' : 'home'}" aria-label="${back ? 'Back' : 'Home'}">${icon(back ? 'arrow' : 'home', { size: 19 })}</button>
      <div class="bar-title"><b>${esc(title)}</b></div>
      <span class="link-badge" data-tone="ok" role="status">${icon('wifi', { size: 12 })}<b>Connected</b></span>
    </header>
    <main class="page ${maxWidth}">${body}</main>
    <nav class="tabbar tabs" aria-label="Sections">
      ${tabs.map(tab => `<button type="button" class="tab" data-view="${tab.view}" aria-current="${state.view === tab.view ? 'page' : 'false'}">${icon(tab.iconName, { size: 21 })}<span>${tab.label}</span></button>`).join('')}
    </nav>`;

  app.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => go(button.dataset.view); });
  app.querySelectorAll('[data-nav]').forEach(button => {
    button.onclick = () => (button.dataset.nav === 'back' ? history.length > 1 ? history.back() : go('home') : go('home'));
  });
  paintLink();
}

function signInView() {
  state.signInTab ||= 'account';
  /* Both panels stay mounted and toggle with [hidden]: the camera element has
     to exist before the operator taps "Start camera", and switching tabs must
     never rebuild the video element under an open stream. */
  app.innerHTML = `
    <main class="signin">
      <div class="signin-brand">
        <span class="signin-mark">${icon('scan', { size: 22 })}</span>
        <div><b>EMS Scanner</b></div>
      </div>

      <h1>Sign in</h1>

      <div class="segmented" role="tablist" aria-label="Sign-in method">
        <button type="button" role="tab" id="accountTab" aria-controls="accountMode" data-signin="account" aria-selected="${state.signInTab === 'account'}">Shop account</button>
        <button type="button" role="tab" id="qrTab" aria-controls="qrMode" data-signin="qr" aria-selected="${state.signInTab === 'qr'}">PC QR code</button>
      </div>

      <div id="accountMode" role="tabpanel" aria-labelledby="accountTab" ${state.signInTab === 'account' ? '' : 'hidden'}>
        <form id="loginForm" class="form" novalidate>
          <label>Shop ID<input name="storeId" inputmode="numeric" autocomplete="organization" required></label>
          <label>User ID<input name="userId" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <button type="submit" class="btn btn-primary btn-block">Sign in</button>
        </form>
      </div>

      <div id="qrMode" role="tabpanel" aria-labelledby="qrTab" ${state.signInTab === 'qr' ? '' : 'hidden'}>
        <section class="qr-panel">
          <div class="scanner-frame qr-frame" id="loginFrame">
            <video id="loginVideo" muted playsinline autoplay></video>
            <span class="frame-corner tl"></span><span class="frame-corner tr"></span><span class="frame-corner bl"></span><span class="frame-corner br"></span>
            <div class="frame-bar"><span class="frame-status" data-state="idle">Camera off</span><span class="frame-hint"></span></div>
          </div>
          <div class="cam-actions">
            <button type="button" class="btn btn-primary" id="loginQrStart" data-cam="start">${icon('qr', { size: 17 })} Scan the code</button>
            <button type="button" class="btn" data-cam="stop" hidden>Stop</button>
          </div>
        </section>
      </div>

      <button type="button" class="link-row" id="openVerifyPublic" data-view="verify">${icon('verify', { size: 16 })} Verify an invoice without signing in</button>
    </main>`;

  app.querySelectorAll('[data-signin]').forEach(button => {
    button.onclick = () => {
      const tab = button.dataset.signin;
      if (tab === state.signInTab) return;
      stopCamera();
      state.signInTab = tab;
      signInView();
    };
  });
  app.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => go(button.dataset.view); });

  const form = app.querySelector('#loginForm');
  if (form) {
    form.onsubmit = async event => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form));
      if (!payload.storeId || !payload.userId || !payload.password) {
        toaster.bad('Fill in all three fields.', { topic: 'signin' });
        return;
      }
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      button.textContent = 'Signing in…';
      try {
        const result = await api('auth/login', { method: 'POST', body: payload });
        const shopType = result.store?.shop_type || result.store?.business_type || '';
        if (shopType && !['pharmacy', 'electronics'].includes(shopType)) {
          throw new Error('Scanner billing is for Pharmacy and Electronics shops. Invoice verification is open to everyone.');
        }
        applySession(result);
        state.view = 'home';
        render();
      } catch (error) {
        toaster.bad(error.message, { topic: 'signin' });
        button.disabled = false;
        button.textContent = 'Sign in';
      }
    };
  }

  const startBtn = app.querySelector('[data-cam="start"]');
  if (startBtn) {
    startBtn.onclick = () => {
      const video = app.querySelector('#loginVideo');
      startCamera('qr', video, code => {
        const login = qrLoginCode(code);
        if (login) void signInWithQr(login);
        else toaster.bad('That QR is not a Scanner sign-in code.', { topic: 'signin' });
      });
    };
    app.querySelector('[data-cam="stop"]').onclick = () => { stopCamera(); paintCameraChrome(); };
  }
}

function homeView() {
  const connected = !!state.draft && !state.locked;
  const counts = {
    added: state.events.filter(e => e.status === 'applied').length,
    waiting: state.events.filter(e => e.status === 'pending' || e.status === 'sending').length
  };
  const body = `
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-kicker">${esc(state.shopType ? state.shopType.toUpperCase() + ' WORKSPACE' : state.paired ? 'LINKED FROM PC' : 'SIGNED IN')}</span>
        <h1>${esc(state.store || 'Your shop')}</h1>
        <p>${esc(state.user)}</p>
      </div>
      <button type="button" class="hero-menu" data-sheet="menu" aria-label="More options">${icon('user', { size: 18 })}</button>
    </section>

    <div class="bento">
      ${tile({
        span: 'full',
        title: 'PC bill',
        iconName: 'tag',
        tone: connected ? 'ok' : 'idle',
        cls: 'tile--draft',
        value: `<span class="tile-big" id="selectedDraft">${connected
          ? `Active draft · ${state.draftKind === 'purchase' ? 'Purchase' : 'Sale'} ${shortId(state.draft)}`
          : 'Choose a sale or purchase'}</span>`,
        note: connected ? 'Scanning is live on this phone.' : 'Open one on the shop PC first.',
        action: `<button type="button" class="tile-action" id="refreshDrafts" data-act="refresh" aria-label="Refresh PC bills">${icon('refresh', { size: 15 })}</button>`
      })}
      ${tile({
        span: 'half',
        title: 'Added',
        iconName: 'check',
        tone: counts.added ? 'ok' : 'idle',
        value: `<span class="tile-num">${counts.added}</span>`,
        note: 'Confirmed by the PC'
      })}
      ${tile({
        span: 'half',
        title: 'Waiting',
        iconName: 'clock',
        tone: counts.waiting ? 'warn' : 'idle',
        value: `<span class="tile-num">${counts.waiting}</span>`,
        note: 'Awaiting PC'
      })}
    </div>

    <div class="row-actions">
      <button type="button" class="btn btn-primary btn-block" data-view="camera">${icon('scan', { size: 18 })} Scan an item</button>
    </div>

    <section class="panel" id="draftPanel">
      <header class="panel-head">
        <h2>Bills on the shop PC</h2>
        <button type="button" class="panel-link" data-act="refresh">Refresh</button>
      </header>
      <div id="draftList" class="list"></div>
    </section>

    <section class="panel" id="eventPanel">
      <header class="panel-head"><h2>This bill</h2><span class="badge" id="eventCount"></span></header>
      <ul id="eventList" class="feed"></ul>
    </section>`;

  shell('Scanner', body);

  app.querySelectorAll('[data-act="refresh"]').forEach(button => { button.onclick = () => { void loadDrafts(); }; });
  app.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => go(button.dataset.view); });
  const menu = app.querySelector('[data-sheet="menu"]');
  if (menu) menu.onclick = openMenu;
  paintDrafts();
  paintEvents();
  void loadDrafts();
}

function cameraView() {
  const blocked = canSend();
  /* Two states, one layout:
       · camera off — a tap target that starts it, and the manual entry below;
       · camera on  — the viewfinder plus a single row of controls.
     Nothing is reserved for the tab bar (it is fixed) and nothing sits below
     the fold that the operator needs mid-scan. */
  const body = `
    <section class="scan-head">
      <button type="button" class="target" data-act="choose">
        <span class="target-dot" data-tone="${state.draft && !state.locked ? 'ok' : 'bad'}"></span>
        <span class="target-copy"><b id="selectedDraft">${esc(targetLabel())}</b><small>${blocked ? esc(blocked) : 'Ready to scan'}</small></span>
        ${icon('chevron', { size: 15 })}
      </button>
    </section>

    <section class="scan-stage">
      <button type="button" class="scan-target" id="startCam" data-cam="start">
        <span class="scan-target-ic">${icon('cam', { size: 22 })}</span>
        <span>
          <b>Start camera</b>
          <small>Point at the barcode. Torch and zoom appear when the camera supports them.</small>
        </span>
      </button>

      <div class="scanner-frame is-off" id="scanFrame" hidden>
        <video id="scanVideo" muted playsinline autoplay></video>
        <div class="frame-mask" aria-hidden="true">
          <span class="frame-corner tl"></span><span class="frame-corner tr"></span><span class="frame-corner bl"></span><span class="frame-corner br"></span>
          <span class="frame-line" aria-hidden="true"></span>
        </div>
        <div class="frame-bar">
          <span class="frame-status" data-state="idle">Starting…</span>
          <span class="frame-hint"></span>
        </div>
      </div>

      <div class="cam-actions" id="camActions" hidden>
        <button type="button" class="btn" data-cam="again" title="Allow the same code again">${icon('refresh', { size: 16 })}<span>Same again</span></button>
        <button type="button" class="btn" data-cam="torch" aria-pressed="false" hidden title="Torch">${icon('bolt', { size: 16 })}<span class="sr-only">Torch</span></button>
        <button type="button" class="btn btn-primary" data-cam="stop">Stop</button>
      </div>
    </section>

    <section class="panel">
      <header class="panel-head"><h2>Type a code</h2></header>
      <form id="manualForm" class="inline-form">
        <input name="code" inputmode="text" autocomplete="off" enterkeyhint="send" placeholder="Barcode or SKU" required>
        <button type="submit" class="btn" aria-label="Send">${icon('arrow', { size: 16 })}</button>
      </form>
    </section>

    <section class="panel">
      <header class="panel-head"><h2>Scanned</h2><span class="badge" id="eventCount"></span></header>
      <ul id="eventList" class="feed"></ul>
    </section>`;

  shell('Scan', body, { back: 'home' });

  app.querySelector('[data-act="choose"]').onclick = () => go('home');
  app.querySelectorAll('[data-cam]').forEach(button => {
    button.onclick = async () => {
      const action = button.dataset.cam;
      if (action === 'start') {
        const video = app.querySelector('#scanVideo');
        revealViewfinder();
        await startCamera('barcode', video, code => { void onBarcode(code); });
      } else if (action === 'stop') {
        stopCamera();
        hideViewfinder();
      } else if (action === 'again') {
        state.scanSession?.resetCooldown();
        lastLookup = { code: '', at: 0 };
        toaster.ok('Ready for the same item again.', { topic: 'scan' });
      } else if (action === 'torch') {
        const session = state.scanSession;
        if (!session) return;
        const ok = await session.setTorch(!session.torchOn);
        if (!ok) toaster.warn('This camera has no torch.', { topic: 'camera' });
        paintCameraChrome();
      }
    };
  });

  app.querySelector('#manualForm').onsubmit = event => {
    event.preventDefault();
    const input = event.target.elements.namedItem('code');
    void onBarcode(input.value);
    input.value = '';
  };

  paintEvents();
  paintCameraChrome();
  if (state.camera) revealViewfinder();
  void refreshEvents().then(paintEvents).catch(() => {});
}

/** Swap the start target for the viewfinder without re-rendering the page. */
function revealViewfinder() {
  const target = document.querySelector('#startCam');
  const frame = document.querySelector('#scanFrame');
  const actions = document.querySelector('#camActions');
  if (target) target.hidden = true;
  if (frame) {
    frame.hidden = false;
    frame.classList.remove('is-off');
  }
  if (actions) actions.hidden = false;
  paintCameraChrome();
}

function hideViewfinder() {
  const target = document.querySelector('#startCam');
  const frame = document.querySelector('#scanFrame');
  const actions = document.querySelector('#camActions');
  if (target) target.hidden = false;
  if (frame) {
    frame.hidden = true;
    frame.classList.add('is-off');
  }
  if (actions) actions.hidden = true;
}

function catalogView() {
  const body = `
    <section class="panel">
      <form id="catalogForm" class="search-form">
        ${icon('search', { size: 16 })}
        <input id="catalogInput" name="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Search name or code" value="${esc(state.catalogQuery)}">
      </form>
      <div id="catalogList" class="list"></div>
    </section>`;

  shell('Catalog', body);
  app.querySelector('#catalogForm').onsubmit = event => {
    event.preventDefault();
    void searchCatalog(event.target.elements.namedItem('q').value.trim());
  };
  let debounce = 0;
  app.querySelector('#catalogInput').addEventListener('input', event => {
    clearTimeout(debounce);
    const value = event.target.value.trim();
    debounce = setTimeout(() => { if (value.length > 1 || value.length === 0) void searchCatalog(value); }, 240);
  });
  /* Re-show what is already loaded instead of re-fetching it. The catalog only
     changes when the shop PC edits it, so a repeat visit within a minute is a
     cache hit, not a request. */
  const fresh = state.catalogAt && Date.now() - state.catalogAt < 60_000;
  if (fresh && state.items.length && !state.catalogQuery) {
    paintCatalog();
  } else {
    void searchCatalog(state.catalogQuery);
  }
}

function verifyView() {
  /* Verification is the one screen a guest can reach, usually while holding a
     printed bill. It leads with the number field (the common case, and the only
     one that works without a camera) and offers the QR camera as a compact
     square that sits in the same panel, so the page never opens on a large
     black rectangle. */
  const body = `
    <section class="verify-top">
      <h1>Verify invoice</h1>
    </section>

    <section class="panel">
      <header class="panel-head"><h2>Invoice number</h2></header>
      <form id="verifyForm" class="inline-form">
        <input id="verifyInput" name="code" autocomplete="off" enterkeyhint="search" placeholder="SAL-000123" required>
        <button type="submit" class="btn">${icon('arrow', { size: 16 })}</button>
      </form>

      <div class="qr-row">
        <div class="scanner-frame qr-frame qr-thumb" id="verifyFrame">
          <video id="verifyVideo" muted playsinline autoplay></video>
          <span class="frame-corner tl"></span><span class="frame-corner tr"></span><span class="frame-corner bl"></span><span class="frame-corner br"></span>
          <div class="frame-bar"><span class="frame-status" data-state="idle">Camera off</span></div>
        </div>
        <div class="qr-row-copy">
          <button type="button" class="btn btn-primary" id="verifyCamera" data-cam="start">${icon('qr', { size: 17 })} Scan TrueBill QR</button>
          <button type="button" class="btn btn-quiet" data-cam="stop" hidden>Stop</button>
        </div>
      </div>
    </section>

    <div id="verifyResult" aria-live="polite"></div>`;

  shell('Verify', body, { back: 'home', backId: 'verifyBack' });

  app.querySelectorAll('[data-cam]').forEach(button => {
    button.onclick = () => {
      if (button.dataset.cam === 'start') {
        const video = app.querySelector('#verifyVideo');
        startCamera('qr', video, code => { void verifyInvoice(code, 'qr'); });
      } else {
        stopCamera();
        paintCameraChrome();
      }
    };
  });
  app.querySelector('#verifyForm').onsubmit = event => {
    event.preventDefault();
    void verifyInvoice(event.target.elements.namedItem('code').value, 'manual');
  };
}

function installView() {
  const body = `
    <section class="panel">
      <header class="panel-head"><h2>Android · Chrome</h2></header>
      <p class="panel-text">Menu ⋮ → <b>Install app</b>.</p>
    </section>
    <section class="panel">
      <header class="panel-head"><h2>iPhone · Safari</h2></header>
      <p class="panel-text">Share → <b>Add to Home Screen</b>.</p>
    </section>
    ${state.installPrompt ? '<button type="button" class="btn btn-primary btn-block" data-act="install">Install now</button>' : ''}
    <section class="panel panel-quiet">
      <p class="panel-text">Scanning needs HTTPS, camera permission and a live bill on the shop PC.</p>
    </section>`;

  shell('Install', body, { back: 'home' });
  const install = app.querySelector('[data-act="install"]');
  if (install) {
    install.onclick = async () => {
      const prompt = state.installPrompt;
      state.installPrompt = null;
      if (prompt) await prompt.prompt();
      render();
    };
  }
}

function profileView() {
  const body = `
    <section class="hero hero--plain">
      <div class="hero-copy"><h1>${esc(state.user)}</h1><p>${esc(state.store)}</p></div>
    </section>
    <section class="panel">
      <div id="profileDetails" class="list">${empty({ text: 'Loading…' })}</div>
    </section>
    <section class="panel panel-quiet">
      <div class="row-actions">
        <button type="button" class="btn" data-view="install">${icon('download', { size: 16 })} Install app</button>
        <button type="button" class="btn btn-danger" data-act="signout">${icon('power', { size: 16 })} Sign out</button>
      </div>
    </section>`;

  shell('Profile', body, { back: 'home' });
  app.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => go(button.dataset.view); });
  app.querySelector('[data-act="signout"]').onclick = () => {
    if (confirm('Sign out of the scanner?')) signOut();
  };

  void (async () => {
    const box = document.getElementById('profileDetails');
    if (!box) return;
    try {
      const profile = await api('scanner/profile');
      state.profile = profile;
      box.innerHTML = `
        ${row('Name', profile.user.name || state.user)}
        ${row('Login', profile.user.user_id || '—')}
        ${row('Shop', `${profile.shop.name} · ${profile.shop.code}`)}
        ${row('Role', profile.user.role)}
        ${row('Scanner', profile.canScan ? 'Ready' : 'Billing permission missing')}
        ${row('Sign-in', profile.paired ? 'PC QR code' : 'Shop account')}`;
    } catch (error) {
      box.innerHTML = empty({ text: 'Profile unavailable: ' + error.message });
    }
  })();
}

const row = (label, value) => `<div class="list-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

/* ── Menus and sheets ────────────────────────────────────────────────────── */

function openMenu() {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-backdrop';
  sheet.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Menu">
      <span class="sheet-grip" aria-hidden="true"></span>
      ${actionRow({ id: 'sheetProfile', iconName: 'user', label: 'Profile' })}
      ${actionRow({ id: 'sheetInstall', iconName: 'download', label: 'Install app' })}
      ${actionRow({ id: 'sheetVerify', iconName: 'verify', label: 'Verify an invoice' })}
      ${actionRow({ id: 'sheetSignout', iconName: 'power', label: 'Sign out', tone: 'danger' })}
    </div>`;
  document.body.append(sheet);
  const close = () => sheet.remove();
  sheet.addEventListener('click', event => { if (event.target === sheet) close(); });
  sheet.querySelector('#sheetProfile').onclick = () => { close(); go('profile'); };
  sheet.querySelector('#sheetInstall').onclick = () => { close(); go('install'); };
  sheet.querySelector('#sheetVerify').onclick = () => { close(); go('verify'); };
  sheet.querySelector('#sheetSignout').onclick = () => { close(); if (confirm('Sign out of the scanner?')) signOut(); };
  requestAnimationFrame(() => sheet.classList.add('in'));
}

/**
 * Shelf/bill label for one item: a CODE128 barcode plus name and price.
 *
 * This is the only place JsBarcode is used. It renders into an inline SVG, so
 * the sheet is crisp at any size and prints without a second request.
 */
function openLabel(item) {
  if (!item?.barcode) {
    toaster.bad('No barcode assigned to this item.', { topic: 'label' });
    return;
  }
  if (typeof window.JsBarcode !== 'function') {
    toaster.bad('Barcode rendering is not available offline yet.', { topic: 'label' });
    return;
  }
  const sheet = document.createElement('div');
  sheet.className = 'sheet-backdrop';
  sheet.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Print label">
      <span class="sheet-grip" aria-hidden="true"></span>
      <div class="label-sheet" id="labelSheet">
        <b>${esc(state.store || 'EMS')}</b>
        <span>${esc(item.name)} ${esc(item.strength || '')}</span>
        <svg id="labelBarcode"></svg>
        <small>${esc(money(item.selling_price ?? item.price))} · ${esc(item.barcode)}</small>
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-primary btn-block" data-act="print">${icon('printer', { size: 16 })} Print</button>
        <button type="button" class="btn" data-act="close">Close</button>
      </div>
    </div>`;
  document.body.append(sheet);
  const close = () => sheet.remove();
  sheet.addEventListener('click', event => { if (event.target === sheet) close(); });
  sheet.querySelector('[data-act="close"]').onclick = close;
  sheet.querySelector('[data-act="print"]').onclick = () => window.print();
  requestAnimationFrame(() => sheet.classList.add('in'));
  try {
    window.JsBarcode(sheet.querySelector('#labelBarcode'), item.barcode, { format: 'CODE128', width: 2, height: 64, displayValue: true, margin: 8, fontSize: 13 });
  } catch (error) {
    toaster.bad('Barcode rendering failed: ' + error.message, { topic: 'label' });
    close();
  }
}

/* ── Partial painters ────────────────────────────────────────────────────── */
/* These exist so a poll or a keystroke never re-renders the camera video
   element, which would restart the stream. Only the affected fragment repaints. */

function paintDrafts() {
  const list = document.getElementById('draftList');
  if (!list) return;
  if (state.draftsLoading && !state.drafts?.length) {
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    return;
  }
  const drafts = state.drafts || [];
  if (!drafts.length) {
    list.innerHTML = empty({ text: state.draftsError || 'No open bill on the PC. Open a sale or purchase on the shop computer.' });
    return;
  }
  list.innerHTML = drafts.map(draft => {
    const selected = draft.draft_id === state.draft;
    return `<button type="button" class="list-item ${selected ? 'is-selected' : ''}" data-draft="${esc(draft.draft_id)}" data-select="${esc(draft.draft_id)}">
      <span class="list-mark">${icon(draft.kind === 'purchase' ? 'download' : 'tag', { size: 16 })}</span>
      <span class="list-copy"><b>${draft.kind === 'purchase' ? 'Purchase' : 'Sale'} · ${esc(shortId(draft.draft_id))}</b><small>PC ${esc(shortId(draft.terminal_label))}</small></span>
      <span class="list-state">${selected ? icon('check', { size: 16 }) : icon('chevron', { size: 15 })}</span>
    </button>`;
  }).join('');
  list.querySelectorAll('[data-draft]').forEach(button => {
    button.onclick = () => { if (state.busy !== 'bind') void selectDraft(button.dataset.draft); };
  });
}

function paintTarget() {
  const target = document.querySelector('.target');
  if (!target) return;
  const blocked = canSend();
  const connected = !!state.draft && !state.locked;
  target.querySelector('.target-dot').dataset.tone = connected ? 'ok' : 'bad';
  target.querySelector('.target-copy b').textContent = targetLabel();
  target.querySelector('.target-copy small').textContent = blocked || 'Ready to scan';
  const homeTile = document.querySelector('.tile--draft #selectedDraft');
  if (homeTile) {
    homeTile.textContent = connected
      ? `Active draft · ${state.draftKind === 'purchase' ? 'Purchase' : 'Sale'} ${shortId(state.draft)}`
      : 'Choose a sale or purchase';
  }
}

function paintEvents() {
  const lists = document.querySelectorAll('#eventList');
  if (!lists.length) return;
  const rows = state.events.slice(0, 40);
  const markup = rows.length
    ? rows.map(event => {
        const status = eventState(event.status);
        return `<li class="feed-row">
          <span class="feed-mark" data-tone="${status.tone}">${status.tone === 'ok' ? icon('check', { size: 14 }) : status.tone === 'bad' ? icon('x', { size: 14 }) : icon('clock', { size: 14 })}</span>
          <span class="feed-copy"><b>${esc(event.name)}</b><small>${esc(clockTime(event.at))} · ${esc(status.label)}${event.reason ? ' · ' + esc(event.reason) : ''}</small></span>
          ${event.status === 'error' ? `<button type="button" class="feed-act" data-retry="${esc(event.id)}">Retry</button>`
            : event.status === 'applied' || event.status === 'rejected' ? `<button type="button" class="feed-act" data-repeat="${esc(event.id)}">+1</button>` : ''}
        </li>`;
      }).join('')
    : `<li class="feed-empty">${icon('scan', { size: 18 })}<span>No scans yet</span></li>`;

  lists.forEach(list => { list.innerHTML = markup; });
  document.querySelectorAll('#eventCount').forEach(badge => {
    badge.textContent = state.events.length ? String(state.events.length) : '';
    badge.hidden = !state.events.length;
  });
  document.querySelectorAll('[data-retry]').forEach(button => {
    button.onclick = () => { const event = state.events.find(e => e.id === button.dataset.retry); if (event) void sendEvent(event); };
  });
  document.querySelectorAll('[data-repeat]').forEach(button => {
    button.onclick = () => {
      const event = state.events.find(e => e.id === button.dataset.repeat);
      if (event) void addItem({ id: event.productId, name: event.name.split(' · ')[0] });
    };
  });
}

function paintCatalog({ loading = false, error = '' } = {}) {
  const list = document.getElementById('catalogList');
  if (!list) return;
  if (loading) {
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    return;
  }
  if (error) {
    list.innerHTML = empty({ text: error });
    return;
  }
  if (!state.items.length) {
    list.innerHTML = empty({ text: state.catalogQuery ? `Nothing matches “${state.catalogQuery}”.` : 'No items in this shop yet.' });
    return;
  }
  const canAdd = !!state.draft && !state.locked;
  list.innerHTML = state.items.map(item => {
    const out = state.draftKind === 'sale' && Number(item.available_stock) <= 0;
    return `<div class="list-item list-item--static">
      <span class="list-copy"><b>${esc(item.name)} ${esc(item.strength || '')}</b>
        <small>${esc(item.dosage_form || '')}${item.dosage_form ? ' · ' : ''}${esc(item.sku || item.barcode || 'No code')} · ${esc(item.available_stock)} ${esc(item.base_unit || '')}${out ? ' · out of stock' : ''}</small></span>
      ${item.barcode ? `<button type="button" class="icon-btn" data-label="${esc(item.id)}" aria-label="Print label for ${esc(item.name)}">${icon('printer', { size: 16 })}</button>` : ''}
      <button type="button" class="btn btn-mini" data-add="${esc(item.id)}" ${!canAdd || out ? 'disabled' : ''}>Add</button>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-add]').forEach(button => {
    button.onclick = () => { const item = state.items.find(i => i.id === button.dataset.add); if (item) void addItem(item); };
  });
  list.querySelectorAll('[data-label]').forEach(button => {
    button.onclick = () => {
      const item = state.items.find(i => i.id === button.dataset.label);
      if (item) openLabel(item);
    };
  });
}

/* ── Boot ────────────────────────────────────────────────────────────────── */

let booted = false;
function render() {
  document.body.classList.toggle('is-authed', !!state.token);
  if (state.token && !state.poller) startPolling();
  if (!state.token && state.view !== 'verify') {
    state.view = 'home';
    signInView();
    paintLink();
    return;
  }
  if (!booted) {
    booted = true;
    document.querySelector('.boot')?.remove();
  }
  if (state.view === 'home') return homeView();
  if (state.view === 'camera') return cameraView();
  if (state.view === 'catalog') return catalogView();
  if (state.view === 'verify') return verifyView();
  if (state.view === 'install') return installView();
  if (state.view === 'profile') return profileView();
  return homeView();
}

/**
 * Pull the decoder while the operator is still choosing a bill, so the first
 * scan on a browser without BarcodeDetector does not wait for a 442 KB chunk.
 *
 * It is skipped when the browser decodes natively — downloading a decoder the
 * device will never use is a slow, expensive no-op on exactly the phones that
 * are already the fastest.
 */
async function warmDecoder() {
  if (state.warmed) return;
  state.warmed = true;
  try {
    const native = await nativeSupport('barcode');
    if (native) return;
  } catch {
    /* if the capability probe fails, warming is the safer bet */
  }
  const run = () => {
    loadZxing().catch(() => {});
    navigator.serviceWorker?.controller?.postMessage({ type: 'warm' });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 800);
}

function startPolling() {
  warmDecoder();
  state.poller?.stop();
  state.poller = link.startPolling(() => refreshEvents());
}

window.addEventListener('online', () => { link.setOnline(true); state.poller?.kick(); paintLink(); });
window.addEventListener('offline', () => { link.setOnline(false); stopCamera(); paintLink(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopCamera();
  } else if (state.token) {
    state.poller?.kick();
  }
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  state.installPrompt = event;
  if (state.view === 'profile' || state.view === 'install') render();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/scanner/sw.js', { scope: '/scanner/' }).catch(() => {});
}

const params = new URLSearchParams(location.hash.slice(1));
const loginCode = params.get('login');
const legacyPair = params.get('pair');

if (loginCode || legacyPair) {
  history.replaceState(null, '', '/scanner/');
  render();
  if (legacyPair) {
    toaster.bad('This older draft QR is retired. Use the PC top-bar sign-in QR.', { topic: 'signin' });
  } else {
    void signInWithQr(loginCode);
  }
} else {
  render();
  if (state.token) startPolling();
}

/* Exported for the test harness only. */
export { state, link, verifyInvoice, onBarcode, addItem, refreshEvents, render, startCamera, stopCamera, signInWithQr };
