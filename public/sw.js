const SHELL_CACHE = 'wmc-shell-cache-v3';
const PAGES_CACHE = 'wmc-pages-cache-v3';

const APP_SHELL_URLS = [
  '/',
  '/songs',
  '/tuner',
  '/live',
  '/favorites',
  '/setlists',
  '/settings',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== SHELL_CACHE && key !== PAGES_CACHE) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache live session API or SSE streams
  if (url.pathname.startsWith('/api/')) return;

  // Network-first with offline cache fallback for static assets & icons
  // Ensures fresh JS/CSS bundles in development while preserving offline access
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response('Offline asset unavailable.', { status: 503 });
        })
    );
    return;
  }

  // Network-first with cache fallback for page navigations and RSC payloads
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && request.mode === 'navigate') {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const directMatch = await caches.match(request);
        if (directMatch) return directMatch;

        const cleanPathMatch = await caches.match(url.pathname);
        if (cleanPathMatch) return cleanPathMatch;

        if (request.mode === 'navigate') {
          const fallbackRoot = await caches.match('/');
          if (fallbackRoot) return fallbackRoot;
        }

        return new Response('Offline - resource not cached locally.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
  );
});
