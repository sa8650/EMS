/* EMS Scanner service worker.
 *
 * Caches the *static* shell only — never /api/, never a session, never a QR
 * token, never an event payload. Browsing them from the cache would show one
 * operator another operator's bill.
 *
 * v7 changes:
 *   · the two new modules (link.js, engine.js, ui.js) are part of the shell, so
 *     the first scan after install no longer waits on the network for them;
 *   · navigation is network-first with an instant cached fallback, so opening
 *     the app on a weak shop Wi-Fi shows the UI immediately;
 *   · stale-while-revalidate for shell assets: the second launch is instant and
 *     an update still arrives on the next one;
 *   · a background warm-up fetches the ZXing decoder while the operator is
 *     still signing in, so the first scan does not pay for a 442 KB download.
 */
/* Bump the version whenever a shell file changes: the old cache is deleted on
   activate, which is what makes an update reach the phone. */
const CACHE = 'ems-scanner-shell-v7';

const SHELL = [
  '/scanner/',
  '/scanner/scanner.css',
  '/scanner/scanner.js',
  '/scanner/link.js',
  '/scanner/engine.js',
  '/scanner/ui.js',
  '/scanner/truebill.js',
  '/scanner/truebill_view.js',
  '/scanner/zxing-fallback.js',
  '/scanner/jsbarcode.min.js',
  '/scanner/manifest.webmanifest',
  '/assets/android-chrome-192.png',
  '/assets/android-chrome-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is atomic — one 404 would throw away the whole shell, so each
      // entry is cached on its own and a missing icon cannot break the install.
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Anything that is not a plain same-origin GET of a shell file is left alone.
  // Written as separate guards on purpose: these two are the safety rules the
  // test suite pins, and they should be impossible to merge away by accident.
  if (request.method !=='GET') return; // never cache a mutation
  if (url.pathname.includes('/api/')) return; // never cache an API answer
  if (url.origin !== self.location.origin || url.search) return;

  const isDocument = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  const isShell = SHELL.includes(url.pathname);
  if (!isDocument && !isShell) return;

  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/scanner/')) || Response.error())
    );
    return;
  }

  // Shell asset: answer from cache immediately, refresh in the background.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* Warm the decoder during idle time so the first decode is instant. */
self.addEventListener('message', event => {
  if (event.data?.type !== 'warm') return;
  event.waitUntil(
    caches.match('/scanner/zxing-fallback.js').then(hit => hit || fetch('/scanner/zxing-fallback.js').then(r => {
      if (r.ok) caches.open(CACHE).then(cache => cache.put('/scanner/zxing-fallback.js', r.clone()));
      return r;
    }).catch(() => null))
  );
});
