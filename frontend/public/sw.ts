/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `tmh-app-shell-${CACHE_VERSION}`;
const OFFLINE_FALLBACK = '/offline.html';

// Assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      console.log('[SW] Precaching app shell');
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache failed:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== APP_SHELL_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first for API/media, cache first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache media URLs (CloudFront signed URLs)
  if (url.hostname === 'media.teammediahub.co' || url.search.includes('Policy=') || url.search.includes('Signature=')) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_FALLBACK) || new Response('Offline - Media unavailable')));
    return;
  }

  // Never cache API calls
  if (url.hostname === 'api.teammediahub.co' || request.method !== 'GET') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_FALLBACK) || new Response('Offline - API unavailable')));
    return;
  }

  // For app shell navigation (HTML), use network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache redirects or error responses
          if (response.status === 200 && response.type !== 'error') {
            const clonedResponse = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(async () => {
          // Fall back to cached version if offline
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }
          // Last resort: offline page
          return caches.match(OFFLINE_FALLBACK) || new Response('You are offline', { status: 503 });
        })
    );
    return;
  }

  // For other assets (JS/CSS/images), use cache-first
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          // Cache successful responses
          if (response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached || caches.match(OFFLINE_FALLBACK) || new Response('Offline');
    })
  );
});

// Handle messages from clients (e.g., skip waiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
