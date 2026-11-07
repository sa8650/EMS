/* EMS Scanner — camera and decode engine.
 *
 * One module owns both camera pipelines (linear barcodes and QR), so the rest
 * of the app never touches a MediaStream directly.
 *
 * What "better" means here, concretely
 * -----------------------------------
 * 1. Native detector when available, ZXing as the fallback. Safari has no
 *    BarcodeDetector, so iPhone always took the slow path; it now gets the same
 *    picture-in, code-out loop with a work budget instead of decoding every
 *    animation frame.
 * 2. Torch, zoom and focus are exposed where the platform supports them — a
 *    dim pharmacy shelf is the most common reason a scan does not land.
 * 3. The camera stream is requested in the resolution the decoder actually
 *    wants (1280×720 ideal), not the browser default.
 * 4. Decoding is throttled by measured cost, so a slow phone does not lock up
 *    its UI while a fast phone decodes every frame.
 * 5. The last decoded value is debounced by caller-supplied confirmation, so
 *    holding a barcode still does not fire the same scan repeatedly.
 */

/* Linear symbologies a pharmacy shelf or an electronics carton actually uses.
   QR is handled by its own session so the two pipelines never mix: scanning a
   barcode view for QR codes was what made the old camera feel random. */
/* rAF is the right clock for a camera frame loop, but it does not exist in a
   hidden tab, in some WebViews, or under a test runner. Fall back to a timer
   rather than throwing away the loop. */
const scheduleFrame = callback =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 16);
const cancelFrame = handle => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle);
};

const LINEAR_FORMATS = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_39'];
export const NATIVE_BARCODE_FORMATS = LINEAR_FORMATS;

/** Camera constraints tuned for barcode work on phone cameras. */
export function videoConstraints(deviceId) {
  return {
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      // Continuous autofocus matters more than resolution for a moving hand.
      focusMode: 'continuous',
      advanced: [{ focusMode: 'continuous' }]
    }
  };
}

/** ZXing format constants for the linear pipeline. */
function nativeFormatsForZxing() {
  const { BarcodeFormat } = globalThis.ZXing || {};
  if (!BarcodeFormat) return undefined;
  return [BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODE_39].filter(Boolean);
}

/** True when the browser can decode this class of code natively. */
export async function nativeSupport(kind) {
  const Detector = globalThis.BarcodeDetector;
  if (!Detector || typeof Detector.getSupportedFormats !== 'function') return null;
  try {
    const formats = await Detector.getSupportedFormats();
    const wanted = kind === 'qr' ? ['qr_code'] : LINEAR_FORMATS;
    if (!formats.some(f => wanted.includes(f))) return null;
    return { Detector, formats: formats.filter(f => wanted.includes(f)) };
  } catch {
    return null;
  }
}

/**
 * Lazily load the bundled ZXing build. Never a CDN: the scanner has to work on
 * a shop LAN with no internet, and a network dependency here is a hard failure
 * exactly when the operator needs it.
 *
 * The module import is kept as a literal so bundlers and the service worker can
 * see it (test/mobile-scanner.test.js asserts on it too).
 */
let zxingPromise = null;
export function loadZxing() {
  const moduleImport = () => import('/scanner/zxing-fallback.js');
  zxingPromise ||= moduleImport().catch(error => {
    zxingPromise = null; // let the next scan retry a transient failure
    throw error;
  });
  return zxingPromise;
}

/**
 * A decode loop with a time budget.
 *
 * `decode()` is expected to return the code string or null. The loop keeps its
 * own duty cycle: if a decode takes longer than `budget` ms it waits before the
 * next frame instead of trying every frame, which is what made older phones
 * feel frozen while scanning.
 */
export function createLoop({ decode, onCode, onError = () => {}, budget = 55, minGap = 90, now = () => Date.now() }) {
  let raf = 0;
  let stopped = false;
  let busy = false;
  let lastGap = minGap;

  const frame = async () => {
    if (stopped) return;
    if (!busy) {
      busy = true;
      const started = now();
      try {
        const code = await decode();
        if (code) onCode(code);
      } catch (error) {
        onError(error);
      } finally {
        // Learn how expensive decoding is on this device and pace accordingly.
        const cost = now() - started;
        lastGap = cost > budget ? Math.min(cost * 2, 400) : minGap;
        busy = false;
      }
    }
    if (!stopped) {
      if (lastGap > minGap) {
        setTimeout(() => {
          if (!stopped) raf = scheduleFrame(frame);
        }, lastGap - minGap);
      } else {
        raf = scheduleFrame(frame);
      }
    }
  };

  // Decode the first frame right away: the operator has already pointed the
  // phone at the label, so waiting a full frame only adds latency.
  void frame();
  return {
    stop() {
      stopped = true;
      cancelFrame(raf);
    }
  };
}

/**
 * Camera session: owns the stream, the track capabilities and the decode loop.
 *
 * Emits at most one code per `cooldown` ms; the caller can force the next scan
 * of the same code with `resetCooldown()` (the "scan the same item again"
 * action, which is a real workflow when a customer buys two of something).
 */
export class ScanSession {
  constructor({ kind = 'barcode', cooldown = 1200, onCode, onState = () => {}, onError = () => {} } = {}) {
    this.kind = kind; // 'barcode' | 'qr'
    this.cooldown = cooldown;
    this.onCode = onCode;
    this.onState = onState;
    this.onError = onError;
    this.stream = null;
    this.video = null;
    this.loop = null;
    this.controls = null;
    this.lastCode = '';
    this.lastAt = 0;
    this.track = null;
    this.native = false;
    this.torchOn = false;
    this._resetCooldown = () => {};
    /* One place decides whether a decoded value counts as a new scan. Manual
       entry, a hardware keyboard-wedge scanner and the camera all go through
       it, so the "same item twice" rule is identical everywhere. */
    this.emit = value => {
      const code = String(value || '').trim();
      if (!code) return;
      const now = Date.now();
      if (code === this.lastCode && now - this.lastAt < this.cooldown) return;
      this.lastCode = code;
      this.lastAt = now;
      this.onCode(code);
    };
  }

  get active() {
    return !!this.stream;
  }

  capabilities() {
    const track = this.track;
    if (!track?.getCapabilities) return { torch: false, zoom: false, focus: false };
    let caps = {};
    try {
      caps = track.getCapabilities() || {};
    } catch {
      return { torch: false, zoom: false, focus: false };
    }
    return {
      torch: !!caps.torch,
      zoom: !!caps.zoom,
      focus: !!(caps.focusMode || []).includes?.('continuous')
    };
  }

  async setTorch(on) {
    const track = this.track;
    // Ask before trying: applyConstraints resolves even when the track silently
    // ignores an unsupported advanced constraint, which would leave the UI
    // claiming a torch the phone does not have.
    if (!track || !this.capabilities().torch) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: !!on }] });
      this.torchOn = !!on;
      return true;
    } catch {
      return false;
    }
  }

  async setZoom(value) {
    const track = this.track;
    if (!track?.getCapabilities) return false;
    try {
      const caps = track.getCapabilities();
      if (!caps.zoom) return false;
      const raw = caps.zoom.min + (caps.zoom.max - caps.zoom.min) * Math.min(1, Math.max(0, value));
      await track.applyConstraints({ advanced: [{ zoom: raw }] });
      return true;
    } catch {
      return false;
    }
  }

  /** Give the operator a fresh scan of the same code. */
  resetCooldown() {
    this.lastCode = '';
    this.lastAt = 0;
    this._resetCooldown();
  }

  async start(video, { deviceId } = {}) {
    this.stop();
    if (!video) throw new Error('Camera preview is not available.');
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot open the camera. Use HTTPS or enter the code manually.');
    }
    this.video = video;
    this.onState('starting');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(videoConstraints(deviceId));
    } catch (error) {
      const name = error?.name || '';
      const message = /NotAllowed|Security/i.test(name)
        ? 'Camera permission was blocked. Allow camera access for this site, or type the code instead.'
        : /NotFound|Overconstrained/i.test(name)
          ? 'No usable camera was found. Type the code instead.'
          : /NotReadable|TrackStart/i.test(name)
            ? 'The camera is in use by another app. Close it and try again.'
            : 'The camera could not start. Type the code instead.';
      this.onState('error');
      throw new Error(message);
    }

    // The user can cancel while the permission prompt is open.
    if (!video.isConnected) {
      stream.getTracks().forEach(t => t.stop());
      this.onState('idle');
      return false;
    }

    this.stream = stream;
    this.track = (typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks()[0] : stream.getTracks?.()[0]) || null;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* autoplay rejection is not fatal; the frame callback still fires */
    }
    this.onState('scanning');

    const emit = this.emit;

    const native = await nativeSupport(this.kind);
    if (native) {
      this.native = true;
      const detector = new native.Detector({ formats: native.formats });
      this.loop = createLoop({
        decode: async () => {
          const results = await detector.detect(video);
          return results?.[0]?.rawValue || null;
        },
        onCode: emit,
        onError: () => {}
      });
      return true;
    }

    // Fallback: bundled ZXing. Same budgeted loop, so both paths behave alike.
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const { BrowserMultiFormatReader } = await loadZxing();
    // One reader reused for the whole session: constructing it per frame was
    // the other half of the old first-scan stall.
    const reader = new BrowserMultiFormatReader();
    const formats = this.kind === 'barcode' ? nativeFormatsForZxing() : undefined;
    if (Array.isArray(formats) && formats.length && reader.possibleFormats) {
      try {
        // Narrowing the search space is what makes ZXing fast enough on a phone.
        // Never assign an empty list: it would clear the reader's hints.
        reader.possibleFormats = formats;
      } catch {
        /* older builds expose only constructor options; the default formats stay */
      }
    }
    this.reader = reader;

    const decodeFrame = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h || !context) return null;
      // Decode the centre band only: full-frame greyscale on a 1280×720 frame is
      // the single most expensive step on an older phone.
      const bandH = Math.round(h * (this.kind === 'qr' ? 0.72 : 0.45));
      const bandY = Math.round((h - bandH) / 2);
      canvas.width = w;
      canvas.height = bandH;
      context.drawImage(video, 0, bandY, w, bandH, 0, 0, w, bandH);
      try {
        const result = reader.decode(canvas);
        return result?.getText?.() || null;
      } catch {
        // ZXing throws NotFound on every empty frame; that is the normal case,
        // not an error worth surfacing to the operator.
        return null;
      }
    };

    this.loop = createLoop({ decode: decodeFrame, onCode: emit, onError: () => {} });
    return true;
  }

  stop() {
    this.loop?.stop();
    this.loop = null;
    this.controls = null;
    try {
      this.stream?.getTracks().forEach(track => track.stop());
    } catch {
      /* already stopped */
    }
    this.stream = null;
    this.track = null;
    this.torchOn = false;
    if (this.video) {
      try {
        this.video.srcObject = null;
      } catch {
        /* detached element */
      }
    }
    this.video = null;
    this.onState('idle');
  }
}
