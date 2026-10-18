// Network-first service worker. The previous version served every asset
// cache-first forever, so visitors who had loaded the old design would never
// see a new deployment. Now the network is always tried first and the cache is
// only a fallback for offline use.
const CACHE = 'scandrift-v3';
const ASSETS = ['/', '/style.css', '/script.js', '/workspace.js', '/library.js', '/favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Only same-origin GETs for static files. Uploads, API calls and third-party
  // scripts (Paystack, fonts, ads) go straight to the network.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('/')))
  );
});
