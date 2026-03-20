// MealDrop PWA Service Worker - Offline Content Caching
const CACHE_VERSION = 'v1-mealdrop';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
];

const CACHE_PATTERNS = {
  static: `${CACHE_VERSION}-static`,
  api: `${CACHE_VERSION}-api`,
  images: `${CACHE_VERSION}-images`
};

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_PATTERNS.static)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !Object.values(CACHE_PATTERNS).includes(name))
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Chrome extensions and non-http(s) requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // API calls: Network-first, fall back to cache
  if (url.pathname.includes('/api/') || url.pathname.includes('/entities/') || url.pathname.includes('/functions/')) {
    return event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok) {
            const clonedResponse = response.clone();
            caches.open(CACHE_PATTERNS.api).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // Fall back to cached API response
          return caches.match(request).then((cached) => {
            return cached || new Response(
              JSON.stringify({ error: 'Offline - cached data unavailable' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
  }

  // Images: Cache-first, fall back to network
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname)) {
    return event.respondWith(
      caches.open(CACHE_PATTERNS.images)
        .then((cache) => {
          return cache.match(request).then((cached) => {
            return cached || fetch(request).then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            }).catch(() => {
              // Return placeholder for missing images
              return caches.match('/placeholder-image.png')
                .then((placeholder) => placeholder || response);
            });
          });
        })
    );
  }

  // Static assets: Cache-first
  return event.respondWith(
    caches.match(request)
      .then((cached) => {
        return cached || fetch(request).then((response) => {
          if (response.ok && (request.destination === 'script' || request.destination === 'style')) {
            const clonedResponse = response.clone();
            caches.open(CACHE_PATTERNS.static).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        });
      })
  );
});
