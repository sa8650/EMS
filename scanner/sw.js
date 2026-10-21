/* Only static, public PWA shell is cached. Never cache /api/, sessions, QR tokens or event data. */
const CACHE='ems-scanner-shell-v6';
const SHELL=['/scanner/','/scanner/scanner.css','/scanner/scanner.js','/scanner/truebill.js','/scanner/truebill_view.js','/scanner/zxing-fallback.js','/scanner/jsbarcode.min.js','/scanner/manifest.webmanifest','/assets/android-chrome-192.png','/assets/android-chrome-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||e.request.url.includes('/api/')||new URL(e.request.url).search||!SHELL.includes(new URL(e.request.url).pathname))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)))});
