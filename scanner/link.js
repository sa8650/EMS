/* EMS Scanner — link layer.
 *
 * Everything the phone sends to the shop PC goes through here, so this is the
 * only place that decides *how often* we talk to the server and how we behave
 * when the connection is bad.
 *
 * Why it exists
 * -------------
 * The scanner used two fixed intervals (350 ms while waiting for an
 * acknowledgment, 3300 ms otherwise). On a fast shop LAN that is slower than
 * necessary; on a weak link it hammers the server, piles up overlapping
 * requests and makes the UI feel worse the worse the network gets.
 *
 * This module measures round-trip time as it goes and:
 *   · polls faster when the link is quick and there is work in flight,
 *   · backs off (with jitter) when requests are slow or failing,
 *   · never runs two polls at once (single-flight),
 *   · pauses while the tab is hidden and resumes immediately on focus,
 *   · keeps an explicit online/offline state instead of guessing from errors.
 */

export class LinkError extends Error {
  constructor(message, status = 0, cause) {
    super(message);
    this.name = 'LinkError';
    this.status = status;
    this.cause = cause;
    this.offline = status === 0;
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** navigator.onLine, safely, in any environment. */
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Race a promise against a deadline.
 *
 * AbortController alone is not enough: a stalled TCP connection or a proxy can
 * leave `fetch` pending long after abort() was called, and on a shop Wi-Fi that
 * is exactly what happens. The scanner must regain control and tell the
 * operator, so the timeout is enforced here as well as in the request options.
 */
function withDeadline(promise, ms, onTimeout) {
  if (!ms) return promise;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** Exponential moving average — one number, no history buffer. */
export class Ema {
  constructor(initial = 0) {
    this.value = initial;
    this.count = 0;
  }
  push(sample) {
    if (!Number.isFinite(sample) || sample < 0) return this.value;
    this.count += 1;
    const alpha = this.count < 4 ? 0.5 : 0.22; // react fast at first, smooth later
    this.value = this.value ? this.value + alpha * (sample - this.value) : sample;
    return this.value;
  }
  get() {
    return this.value;
  }
}

/**
 * Chooses the next wait, in ms, between two polls.
 *
 * `busy` means the operator is waiting for the PC to confirm the item they just
 * scanned, so we stay responsive. Everything else is an idle scan: the phone
 * only needs to notice a bill opening or closing, and polling that flat out
 * drains the battery and congests a shop Wi-Fi that is also serving the till.
 *
 * Both cases still follow the measured round trip — polling much faster than
 * the network can answer buys nothing.
 */
export function nextDelay({ rtt = 0, failures = 0, busy = false, hidden = false }) {
  if (hidden) return 2000;
  if (failures > 0) {
    const backoff = clamp(300 * 2 ** (failures - 1), 300, 4000);
    return Math.round(backoff * (0.85 + Math.random() * 0.3));
  }
  // The PC polls its own queue every 120–350 ms, so the phone gains nothing
  // below ~180 ms; it only multiplies requests.
  if (busy) return Math.round(clamp(Math.max(180, rtt * 1.6), 180, 700));
  return Math.round(clamp(Math.max(1200, rtt * 2), 1200, 4000));
}

/** Parse a fetch Response into JSON, mapping HTTP and transport failures. */
async function readJson(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new LinkError(
      response.ok ? 'The server sent a response the scanner could not read.' : `Server error (HTTP ${response.status}).`,
      response.status
    );
    throw error;
  }
  if (!response.ok) throw new LinkError(payload?.error || `Request failed (HTTP ${response.status}).`, response.status);
  return payload;
}

export class ScannerLink {
  /**
   * @param {object} options
   * @param {Function} [options.fetchImpl]   injectable fetch (tests)
   * @param {Function} [options.now]         injectable clock (tests)
   * @param {string}   [options.base]        API prefix
   * @param {Function} [options.getToken]    returns the bearer token
   * @param {Function} [options.onStatus]    (online:boolean) => void
   */
  constructor({ fetchImpl, now = () => Date.now(), base = '/api/', getToken = () => '', onStatus = () => {} } = {}) {
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.now = now;
    this.base = base;
    this.getToken = getToken;
    this.onStatus = onStatus;
    this.rtt = new Ema(0);
    this.failures = 0;
    this.inflight = 0;
    this.online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    this.lastOkAt = 0;
    this.lastError = null;
    this.requests = 0;
  }

  /** Smoothed round-trip time in ms. */
  get latency() {
    return Math.round(this.rtt.get());
  }

  setOnline(online) {
    const value = online !== false;
    if (value === this.online) return;
    this.online = value;
    if (value) this.failures = 0; // a reconnect deserves an immediate retry
    this.onStatus(value);
  }

  /**
   * One API call with a timeout, a retry for idempotent GETs, and latency
   * sampling. POSTs are never retried automatically: a scan event carries its
   * own idempotency key and the caller decides, so a silent retry cannot make
   * the UI claim a delivery the server never confirmed.
   */
  async request(path, { method = 'GET', body, timeout = 15000, retries, keepalive = false, signal } = {}) {
    if (!this.online) throw new LinkError('You are offline. Reconnect and try again.', 0);
    const attempts = retries ?? (method === 'GET' ? 1 : 0);
    let lastError;

    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeout) : 0;
      const started = this.now();
      this.inflight += 1;
      this.requests += 1;
      try {
        const request = this.fetchImpl(this.base + path, {
          method,
          cache: 'no-store',
          keepalive,
          signal: signal || (controller ? controller.signal : undefined),
          headers: {
            'content-type': 'application/json',
            ...(this.getToken() ? { authorization: 'Bearer ' + this.getToken() } : {})
          },
          ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
        });
        const response = await withDeadline(
          request,
          timeout,
          () => new LinkError('The shop PC did not answer in time. Check the connection.', 0)
        );
        const payload = await readJson(response);
        this.rtt.push(this.now() - started);
        this.failures = 0;
        this.lastOkAt = this.now();
        this.lastError = null;
        this.setOnline(true);
        return payload;
      } catch (error) {
        const timedOut = error?.name === 'AbortError';
        const wrapped = error instanceof LinkError
          ? error
          : new LinkError(
              timedOut
                ? 'The shop PC did not answer in time. Check the connection.'
                : offlineNow()
                  ? 'You are offline. Reconnect and try again.'
                  : 'Could not reach the server. Check Wi-Fi and try again.',
              0,
              error
            );
        lastError = wrapped;
        // A 4xx is an answer, not a network problem: do not retry, do not
        // count it as a connectivity failure.
        if (wrapped.status >= 400) throw wrapped;
        this.failures += 1;
        this.lastError = wrapped;
        if (offlineNow()) this.setOnline(false);
        if (attempt < attempts) await new Promise(r => setTimeout(r, 140 + attempt * 220));
      } finally {
        clearTimeout(timer);
        this.inflight = Math.max(0, this.inflight - 1);
      }
    }
    throw lastError;
  }

  /**
   * Runs `task` on an adaptive cadence until `stop()` is called.
   *
   * The task reports whether it did work (so the pacer knows to stay quick) and
   * may throw; a throw is treated as a bad link and backs off.
   */
  startPolling(task, { hidden = () => typeof document !== 'undefined' && document.hidden } = {}) {
    let stopped = false;
    let timer = 0;
    let running = false;

    const tick = async () => {
      if (stopped) return;
      let busy = false;
      let threw = false;
      if (!hidden()) {
        running = true;
        try {
          busy = (await task()) === true;
        } catch {
          // The task has already shown the operator what went wrong. Count it
          // as a link failure for pacing even when the throw did not come from
          // a request (a parse error, a closed draft, a bug).
          threw = true;
        } finally {
          running = false;
        }
      }
      if (stopped) return;
      const failures = Math.max(this.failures, threw ? 1 : 0);
      timer = setTimeout(tick, nextDelay({ rtt: this.latency, failures, busy, hidden: hidden() }));
    };

    timer = setTimeout(tick, 80);
    return {
      stop() {
        stopped = true;
        clearTimeout(timer);
      },
      /** Poll right now (focus regained, item just sent). */
      kick() {
        if (stopped || running) return;
        clearTimeout(timer);
        timer = setTimeout(tick, 0);
      },
      get running() {
        return running;
      }
    };
  }

  /** Coarse health label for the UI. */
  health() {
    if (!this.online) return 'offline';
    if (this.failures > 2) return 'unstable';
    if (this.failures > 0) return 'weak';
    if (this.latency && this.latency > 1200) return 'slow';
    return 'good';
  }
}
