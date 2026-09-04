// Ultimate Sentence Repeater — offline service worker
// Bump this version string any time you edit index.html/manifest/icons
// so returning users get the update instead of a stale cached copy.
const CACHE_VERSION = 'usr-cache-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

// Cache the app shell as soon as the service worker installs, so the
// very first visit (which still needs the internet) is also the last
// time the app will ever need it.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Drop any old cache versions once the new service worker takes over.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Cache-first for anything that is part of the app shell (or same-origin
// navigation/asset requests) so the app opens instantly with zero network
// dependency. Whatever succeeds over the network also refreshes the cache
// in the background, so if you're online you still pick up updates.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests for our own origin. Everything else
  // (dictionary API, Google Translate, WhatsApp links, etc.) is left
  // alone — those are optional online features, not the app itself.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached); // offline: fall back to whatever's cached

      // Serve the cached app instantly if we have it; otherwise wait on
      // the network (only happens on that very first, uncached load).
      return cached || networkFetch;
    })
  );
});
