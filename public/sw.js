/*
 * Conservative service worker: NETWORK-FIRST for everything, so a new deploy is
 * never masked by a stale cache. The only thing cached is a static offline
 * fallback page, shown when a navigation fails because the device is offline.
 * API, auth, and image requests are always passed straight to the network.
 */
const CACHE = 'lms-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle top-level page navigations; let everything else hit the network
  // untouched (no content caching → no staleness).
  if (req.mode !== 'navigate') return;

  event.respondWith(
    fetch(req).catch(() => caches.match(OFFLINE_URL)),
  );
});
