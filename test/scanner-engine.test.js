import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {ScanSession, createLoop, videoConstraints, NATIVE_BARCODE_FORMATS} from '../scanner/engine.js';

/* The decode engine. These tests stand in for a phone camera: they check the
 * decisions that decide whether a scan lands quickly — which symbologies are
 * requested, how often frames are decoded, and when a repeated code is allowed
 * through again — without needing a real camera. */

const fakeTrack = () => ({
  stop() {},
  getCapabilities: () => ({torch: true, zoom: {min: 1, max: 4}, focusMode: ['continuous', 'single-shot']}),
  applyConstraints: async () => {}
});

const fakeVideo = () => {
  const dom = new JSDOM('<!doctype html><video></video>');
  const video = dom.window.document.querySelector('video');
  video.play = async () => {};
  Object.defineProperty(video, 'videoWidth', {configurable: true, value: 1280});
  Object.defineProperty(video, 'videoHeight', {configurable: true, value: 720});
  return video;
};

test('the barcode pipeline asks only for linear symbologies, never QR', () => {
  assert.ok(NATIVE_BARCODE_FORMATS.includes('code_128'));
  assert.ok(NATIVE_BARCODE_FORMATS.includes('ean_13'));
  assert.ok(!NATIVE_BARCODE_FORMATS.includes('qr_code'), 'QR has its own session and its own tab');
});

test('camera constraints ask for a continuous-focus rear camera at a decodable size', () => {
  const constraints = videoConstraints();
  assert.equal(constraints.audio, false);
  assert.equal(constraints.video.facingMode.ideal, 'environment');
  assert.ok(constraints.video.width.ideal >= 1280, 'too small a frame loses thin barcodes');
  assert.equal(constraints.video.focusMode, 'continuous');
  assert.ok(constraints.video.advanced.some(entry => entry.focusMode === 'continuous'));
  assert.equal(videoConstraints('cam-2').video.deviceId.exact, 'cam-2');
});

test('the decode loop paces itself on measured cost instead of every frame', async () => {
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  let decodes = 0;
  let clock = 0;
  const loop = createLoop({
    decode: async () => {
      decodes += 1;
      clock += 120; // a slow phone: each decode costs 120 ms
      return null;
    },
    onCode: () => {},
    budget: 55,
    minGap: 0,
    now: () => clock
  });
  await new Promise(resolve => setTimeout(resolve, 350));
  loop.stop();
  assert.ok(decodes >= 1, 'it decodes');
  assert.ok(decodes <= 4, 'a slow decode does not schedule another frame immediately');
});

test('a decoded value is emitted once, and again only after the cooldown', () => {
  const codes = [];
  const session = new ScanSession({kind: 'barcode', cooldown: 60, onCode: value => codes.push(value)});
  const original = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    session.emit('MED-1');
    session.emit('MED-1');
    assert.deepEqual(codes, ['MED-1'], 'holding a barcode still fires once');
    now += 100;
    session.emit('MED-1');
    assert.deepEqual(codes, ['MED-1', 'MED-1'], 'after the cooldown the same code can be scanned again');
    session.resetCooldown();
    now += 10;
    session.emit('MED-1');
    assert.equal(codes.length, 3, 'resetCooldown lets the same item be added twice on purpose');
    session.emit('   ');
    assert.equal(codes.length, 3, 'an empty decode is not a scan');
  } finally {
    Date.now = original;
  }
});

test('torch and zoom are only offered when the track supports them', async () => {
  const session = new ScanSession({kind: 'qr'});
  session.track = fakeTrack();
  assert.deepEqual(session.capabilities(), {torch: true, zoom: true, focus: true});
  assert.equal(await session.setTorch(true), true);
  assert.equal(session.torchOn, true);
  assert.equal(await session.setZoom(0.5), true);

  session.track = {getCapabilities: () => ({}), applyConstraints: async () => {}};
  assert.deepEqual(session.capabilities(), {torch: false, zoom: false, focus: false});
  assert.equal(await session.setTorch(true), false, 'a failure is reported, not pretended');
});

test('a refused camera permission explains itself in operator language', async () => {
  const session = new ScanSession({kind: 'barcode'});
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          const error = new Error('Permission denied');
          error.name = 'NotAllowedError';
          throw error;
        }
      }
    }
  });
  await assert.rejects(session.start(fakeVideo()), /Allow camera access/);
  assert.equal(session.active, false);
});
