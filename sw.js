// Ultimate Sentence Repeater — robust offline service worker
// Bump this version whenever index.html or other app files change.
const CACHE_VERSION = 'usr-cache-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Cache every available shell file, but don't let an optional file
    // (for example an icon/manifest) make the whole service worker fail.
    await Promise.allSettled(
      APP_SHELL.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response.ok) await cache.put(url, response.clone());
        } catch (_) {
          // Optional shell resource unavailable — continue installing.
        }
      })
    );

    // The app itself is mandatory. If this cannot be cached during the
    // first online visit, retrying installation is safer than activating
    // a worker that cannot provide the app offline.
    const app = await cache.match('./index.html');
    if (!app) throw new Error('index.html could not be cached');

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_VERSION)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests. External services such as
  // Google Translate and the dictionary API remain normal online requests.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigation is the important case: always give the installed PWA a
  // cached document when the network is unavailable.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const network = await fetch(req);
        if (network && network.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put('./index.html', network.clone());
        }
        return network;
      } catch (_) {
        const cached = await caches.match('./index.html');
        if (cached) return cached;

        return new Response(
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="background:#000;color:#fff;font-family:system-ui;text-align:center;padding:20vh 1rem">App is not cached yet. Open it once while online.</body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // Cache-first for app assets. Network updates the cache when available.
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });

    try {
      const network = await fetch(req);
      if (network && network.ok) {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(req, network.clone());
      }
      return network;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
