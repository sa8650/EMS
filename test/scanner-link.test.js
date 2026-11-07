import test from 'node:test';
import assert from 'node:assert/strict';
import {ScannerLink, LinkError, nextDelay, Ema} from '../scanner/link.js';

/* The link layer decides how the phone talks to the shop PC. These tests pin
 * the three things that were wrong before: a fixed cadence, no timeout, and no
 * distinction between "the network is bad" and "the server said no". */

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

test('polling cadence adapts to the measured round trip instead of a fixed timer', () => {
  const idle = nextDelay({rtt: 40, busy: false});
  const waiting = nextDelay({rtt: 40, busy: true});
  // Waiting on the PC: quick on a fast LAN, but never faster than it can answer.
  assert.ok(waiting >= 180 && waiting <= 700, `busy wait was ${waiting}`);
  // Idle scanning is lazy: nothing is waiting for the answer.
  assert.ok(idle >= 1200 && idle <= 4000, `idle wait was ${idle}`);
  assert.ok(idle > waiting * 4, 'idle is an order of magnitude lazier than busy');
  // A slow link is polled more slowly, not hammered.
  assert.ok(nextDelay({rtt: 1800, busy: true}) > waiting);
  // A hidden tab slows right down: polling a locked screen only drains battery.
  assert.ok(nextDelay({rtt: 40, busy: true, hidden: true}) > idle);
});

test('failures back off exponentially, with jitter, and never give up permanently', () => {
  const first = nextDelay({failures: 1});
  const second = nextDelay({failures: 2});
  const third = nextDelay({failures: 3});
  assert.ok(second > first * 1.5 && third > second * 1.5, 'each failure roughly doubles the wait');
  assert.ok(third < 5000, 'the wait is capped so recovery is not delayed for minutes');
  const samples = new Set(Array.from({length: 40}, () => nextDelay({failures: 3})));
  assert.ok(samples.size > 5, 'jitter keeps several phones from retrying in lockstep');
});

test('round-trip estimate reacts to a change and then smooths', () => {
  const ema = new Ema(0);
  for (let i = 0; i < 12; i += 1) ema.push(50);
  const fast = ema.get();
  ema.push(900);
  assert.ok(ema.get() > fast, 'a slow sample moves the estimate');
  assert.ok(ema.get() < 900, 'but a single sample does not rewrite it');
  ema.push(NaN);
  assert.ok(Number.isFinite(ema.get()), 'a bad sample is ignored');
});

test('a request times out instead of hanging the UI forever, and says so in plain words', async () => {
  const link = new ScannerLink({
    fetchImpl: () => new Promise(() => {}), // never settles
    getToken: () => ''
  });
  const started = Date.now();
  await assert.rejects(link.request('scanner/drafts', {timeout: 60, retries: 0}), error => {
    assert.ok(error instanceof LinkError);
    assert.equal(error.status, 0);
    assert.match(error.message, /did not answer in time/i);
    return true;
  });
  assert.ok(Date.now() - started < 2000);
});

test('a transport failure is retried for GETs but never for POSTs', async () => {
  let gets = 0;
  let posts = 0;
  const flaky = async (url, options) => {
    if (options.method === 'POST') {
      posts += 1;
      throw new TypeError('Failed to fetch');
    }
    gets += 1;
    if (gets === 1) throw new TypeError('Failed to fetch');
    return jsonResponse([{draft_id: 'd1'}]);
  };
  const link = new ScannerLink({fetchImpl: flaky});
  const drafts = await link.request('scanner/drafts');
  assert.deepEqual(drafts, [{draft_id: 'd1'}]);
  assert.equal(gets, 2, 'one retry was enough');

  await assert.rejects(link.request('scanner/drafts/x/events', {method: 'POST', body: {}}), LinkError);
  assert.equal(posts, 1, 'a scan event is never sent twice behind the operator\'s back');
});

test('a 4xx answer is treated as an answer: no retry, no offline claim', async () => {
  let calls = 0;
  const link = new ScannerLink({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({error: 'Draft is not open'}, 409);
    }
  });
  await assert.rejects(link.request('scanner/drafts/x/bind', {method: 'POST'}), error => {
    assert.equal(error.status, 409);
    assert.match(error.message, /Draft is not open/);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(link.health(), 'good', 'a rejected request is not a broken link');
});

test('offline is explicit, and reconnecting restores service immediately', async () => {
  const states = [];
  const link = new ScannerLink({fetchImpl: async () => jsonResponse({ok: true}), onStatus: value => states.push(value)});
  link.setOnline(false);
  await assert.rejects(link.request('scanner/drafts'), /offline/i);
  assert.equal(link.health(), 'offline');
  link.setOnline(true);
  assert.deepEqual(await link.request('scanner/drafts'), {ok: true});
  assert.equal(link.health(), 'good');
  assert.deepEqual(states, [false, true]);
});

test('health reports a slow link before it reports success', () => {
  const link = new ScannerLink({fetchImpl: async () => jsonResponse({})});
  link.rtt.push(1500);
  assert.equal(link.health(), 'slow');
  link.failures = 1;
  assert.equal(link.health(), 'weak');
  link.failures = 3;
  assert.equal(link.health(), 'unstable');
});

test('the poller never runs two requests at once and stops cleanly', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let runs = 0;
  const link = new ScannerLink({fetchImpl: async () => jsonResponse({})});
  Object.defineProperty(link, 'latency', {value: 20});
  const poller = link.startPolling(async () => {
    runs += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 25));
    inFlight -= 1;
    return true;
  });
  // Two idle cycles' worth of time: ~1.2 s between polls when nothing is waiting.
  await new Promise(resolve => setTimeout(resolve, 2800));
  poller.stop();
  const after = runs;
  await new Promise(resolve => setTimeout(resolve, 1600));
  assert.equal(maxInFlight, 1, 'single flight: a slow answer must not stack requests');
  assert.ok(after >= 2, 'the poller kept working while it was running');
  assert.equal(runs, after, 'stop() really stops it');
});

test('a thrown error inside the poll task does not kill the loop', async () => {
  let runs = 0;
  const link = new ScannerLink({fetchImpl: async () => jsonResponse({})});
  const poller = link.startPolling(async () => {
    runs += 1;
    throw new Error('shop PC restarted');
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  poller.stop();
  assert.ok(runs >= 2, 'the scanner keeps trying after a transient failure');
});

test('the API never reads from the HTTP cache and always carries the bearer token', async () => {
  const seen = [];
  const link = new ScannerLink({
    getToken: () => 'jwt-123',
    fetchImpl: async (url, options) => {
      seen.push({url, options});
      return jsonResponse({ok: true});
    }
  });
  await link.request('scanner/profile');
  assert.equal(seen[0].url, '/api/scanner/profile');
  assert.equal(seen[0].options.cache, 'no-store', 'a stale draft list is worse than no list');
  assert.equal(seen[0].options.headers.authorization, 'Bearer jwt-123');
});

test('keepalive is used for scan events so a screen lock cannot drop them', async () => {
  let options;
  const link = new ScannerLink({
    fetchImpl: async (url, opt) => {
      options = opt;
      return jsonResponse([]);
    }
  });
  await link.request('scanner/drafts/d1/events', {method: 'POST', keepalive: true, body: {event_id: 'e1'}});
  assert.equal(options.keepalive, true);
  assert.equal(options.body, '{"event_id":"e1"}');
});
