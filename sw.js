// CACHE is a content hash - regenerate after changing any asset with:
// npm run sw:bump   (tools/update-sw-cache.mjs)
const CACHE = 'sdp-cache-5db975bf4f';

const ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './css/styles.css',
  './js/util.js',
  './js/app.js',
  './js/canvas.js',
  './js/design.js',
  './js/storage.js',
  './js/client.js',
  './js/palette.js',
  './js/feedback.js',
  './js/timer.js',
  './js/data/components.js',
  './js/data/questions.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const fromNetwork = fetch(req)
    .then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    fromNetwork;
    return cached;
  }

  const fresh = await fromNetwork;
  if (fresh) return fresh;
  if (req.mode === 'navigate') {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
  return Response.error();
}
