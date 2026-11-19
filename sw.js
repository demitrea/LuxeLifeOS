// LuxeLifeOS service worker — makes the app work offline.
// Bump CACHE_VERSION on every release so devices pick up the new files.
const CACHE_VERSION = 'luxelifeos-v2';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/logic/config.js',
  './js/logic/dates.js',
  './js/logic/priority.js',
  './js/logic/goals.js',
  './js/logic/boundaries.js',
  './js/logic/review.js',
  './js/logic/capture.js',
  './js/integrations/contract.js',
  './js/integrations/ics.js',
  './js/ui/shared.js',
  './js/ui/today.js',
  './js/ui/life.js',
  './js/ui/goals.js',
  './js/ui/boundaries.js',
  './js/ui/sheets.js',
  './js/ui/capture.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('luxelifeos-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first: the app opens instantly and works with no connection.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
