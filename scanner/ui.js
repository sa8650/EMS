/* EMS Scanner — presentation layer.
 *
 * Deliberately small: icons, formatting, the toast queue and a few reusable
 * cards. Views live in scanner.js so routing and state stay in one place.
 *
 * Copy rules (the previous UI broke them):
 *   · No sub-headings under a title that already says the same thing.
 *   · No sentence explaining what a button labelled "Sign in" does.
 *   · An empty state is one line plus one action, never a paragraph.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape anything interpolated into markup. */
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

/* ── Icons ─────────────────────────────────────────────────────────────────
   Inline SVG, 1.8 stroke, 24-box — the same drawing rules as the rest of EMS.
   Kept locally so the scanner has no icon-font or sprite dependency (it must
   render instantly from the service-worker cache, offline). */
const PATHS = {
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16 8v8"/>',
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  tag: '<path d="M3 11V5a2 2 0 0 1 2-2h6l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  verify: '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  download: '<path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M4 20h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  arrow: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  cam: '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="12" r="3.4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><path d="M14 14h3v3h-3zM20 14v3M14 20h6"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>',
  printer: '<path d="M6 9V3h12v6"/><path d="M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>',
  signal: '<path d="M4 20V10M9 20V6M14 20v-8M19 20V4"/>'
};

export function icon(name, { size = 20, cls = '' } = {}) {
  const body = PATHS[name] || PATHS.scan;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

export const money = value =>
  Number.isFinite(Number(value))
    ? `৳ ${Number(value).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

export const clockTime = value => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

export const shortId = id => String(id || '').slice(0, 8).toUpperCase();

/* ── Status vocabulary ──────────────────────────────────────────────────── */
/* One place decides what each event state is called and how it is toned, so
   the list, the badge and the toast can never disagree. */
export const EVENT_STATE = {
  sending: { label: 'Sending', tone: 'info' },
  pending: { label: 'On its way', tone: 'warn' },
  applied: { label: 'Added', tone: 'ok' },
  rejected: { label: 'Not added', tone: 'bad' },
  error: { label: 'Not sent', tone: 'bad' }
};

export function eventState(status) {
  // Never echo an unknown server value into the UI: it would read as jargon on
  // the shop floor and, if a value were ever attacker-controlled, as injection.
  return EVENT_STATE[status] || { label: 'Unknown', tone: 'info' };
}

export const LINK_LABEL = {
  good: { text: 'Connected', tone: 'ok' },
  slow: { text: 'Slow link', tone: 'warn' },
  weak: { text: 'Unstable', tone: 'warn' },
  unstable: { text: 'Reconnecting', tone: 'bad' },
  offline: { text: 'Offline', tone: 'bad' }
};

/* ── Toasts ─────────────────────────────────────────────────────────────────
   A stack in the thumb-safe zone above the tab bar. Behaviour that matters:
   · never steals focus, never blocks the camera preview;
   · messages replace an existing toast of the same kind instead of stacking
     five copies of "Sent to the PC";
   · errors stay until dismissed or until a success for the same topic arrives;
   · max 3 visible; older ones slide out. */
export class Toaster {
  constructor(host) {
    this.host = host;
    this.current = new Map(); // topic -> element
    this.seq = 0;
  }

  show(message, { tone = 'ok', topic, timeout } = {}) {
    if (!this.host) return null;
    const text = String(message || '').trim();
    if (!text) return null;

    if (topic && this.current.has(topic)) {
      const existing = this.current.get(topic);
      const body = existing.querySelector('.toast-text');
      if (body) body.textContent = text;
      existing.dataset.tone = tone;
      existing.querySelector('.toast-glyph').innerHTML = tone === 'bad' ? icon('alert', { size: 16 }) : tone === 'warn' ? icon('clock', { size: 16 }) : icon('check', { size: 16 });
      this.arm(existing, timeout, tone);
      return existing;
    }

    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.tone = tone;
    el.dataset.topic = topic || '';
    el.id = 'toast-' + ++this.seq;
    el.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast-glyph" aria-hidden="true">${tone === 'bad' ? icon('alert', { size: 16 }) : tone === 'warn' ? icon('clock', { size: 16 }) : icon('check', { size: 16 })}</span><p class="toast-text"></p><button type="button" class="toast-close" aria-label="Dismiss"></button>`;
    el.querySelector('.toast-text').textContent = text;
    el.querySelector('.toast-close').innerHTML = icon('x', { size: 14 });
    el.querySelector('.toast-close').addEventListener('click', () => this.dismiss(el));

    this.host.append(el);
    requestAnimationFrame(() => el.classList.add('in'));

    // How many fit is a screen question, not a taste question: on a small phone
    // two toasts cover the field the operator is typing into.
    const live = [...this.host.children].filter(node => node.classList.contains('toast'));
    const cap = typeof window !== 'undefined' && window.innerHeight && window.innerHeight < 700 ? 1 : 3;
    while (live.length > cap) this.dismiss(live.shift(), true);

    if (topic) this.current.set(topic, el);
    this.arm(el, timeout, tone);
    return el;
  }

  arm(el, timeout, tone) {
    clearTimeout(el._timer);
    // Errors and warnings stay long enough to read on a moving shop floor.
    const ms = timeout ?? (tone === 'bad' ? 6500 : tone === 'warn' ? 5200 : 3200);
    el._timer = setTimeout(() => this.dismiss(el), ms);
  }

  dismiss(el, immediate = false) {
    if (!el || !el.isConnected) return;
    clearTimeout(el._timer);
    if (el.dataset.topic) this.current.delete(el.dataset.topic);
    if (immediate) {
      el.remove();
      return;
    }
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
  }

  clear() {
    // Drop pending dismiss timers too: a removed toast must not keep a callback
    // (or, in a test runner, the process) alive.
    this.host?.querySelectorAll('.toast').forEach(el => clearTimeout(el._timer));
    this.host?.replaceChildren();
    this.current.clear();
  }

  ok(message, options = {}) {
    return this.show(message, { ...options, tone: 'ok' });
  }
  warn(message, options = {}) {
    return this.show(message, { ...options, tone: 'warn' });
  }
  bad(message, options = {}) {
    return this.show(message, { ...options, tone: 'bad' });
  }
}

/* ── Small view helpers ─────────────────────────────────────────────────── */

/**
 * A bento tile.
 *
 * `span` is expressed in the six-column grid the whole design system uses:
 *   'full'  → 6 columns (a whole row on a phone)
 *   'half'  → 3 columns
 *   'third' → 2 columns
 * Spans must add up to 6 within a row, or the grid leaves a hole — which is
 * exactly the kind of breakage that makes a bento look accidental.
 */
const SPANS = {full: 'tile--full', half: 'tile--half', third: 'tile--third'};

export const tile = ({span = 'full', title = '', value = '', note = '', iconName = '', tone = '', body = '', cls = '', action = ''}) => `
  <section class="tile ${SPANS[span] || SPANS.full} ${cls}" ${tone ? `data-tone="${tone}"` : ''}>
    ${iconName || title || value ? `<header class="tile-head">${iconName ? `<span class="tile-ic">${icon(iconName, { size: 17 })}</span>` : ''}${title ? `<h2 class="tile-title">${esc(title)}</h2>` : ''}${action}</header>` : ''}
    ${value ? `<div class="tile-value">${value}</div>` : ''}
    ${note ? `<p class="tile-note">${esc(note)}</p>` : ''}
    ${body}
  </section>`;

/** One-line empty state with a single action. */
export const empty = ({ text, action = '' }) => `<p class="empty">${esc(text)}${action}</p>`;

/** A link-styled button that reads as a row. */
export const actionRow = ({ id, iconName, label, hint = '', tone = '' }) => `
  <button type="button" class="act ${tone ? `act--${tone}` : ''}" ${id ? `id="${id}"` : ''}>
    <span class="act-ic">${icon(iconName, { size: 18 })}</span>
    <span class="act-copy"><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    ${icon('chevron', { size: 16, cls: 'act-arrow' })}
  </button>`;
