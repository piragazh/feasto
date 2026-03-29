/**
 * MealDrop Service Worker
 * Safe for Vite lazy-loaded routes.
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `mealdrop-static-${CACHE_VERSION}`;
const FONT_CACHE = `mealdrop-fonts-${CACHE_VERSION}`;
const LEGACY_CACHES = ['tablet-dashboard-v1', 'tablet-dashboard-v2'];

const NEVER_CACHE_PATTERNS = [
  /^\/api\//,
  /\/getManifest/,
  /^\/Checkout/i,
  /^\/POSDashboard/i,
  /^\/KioskDashboard/i,
  /^\/KitchenDisplay/i,
  /^\/TabletDashboard/i,
  /^\/AdminDashboard/i,
  /^\/AdminRestaurants/i,
  /^\/SuperAdmin/i,
  /^\/RestaurantDashboard/i,
  /^\/CustomerDisplay/i,
  /^\/src\//,
  /^\/node_modules\/.vite\//,
];

const isNeverCache = (url) => {
  const path = new URL(url).pathname;
  return NEVER_CACHE_PATTERNS.some((p) => p.test(path));
};

const isVersionedAsset = (url) => {
  const path = new URL(url).pathname;
  return path.startsWith('/assets/');
};

const isFontRequest = (url) => {
  return /fonts\.(googleapis|gstatic)\.com/.test(url) || /\.(woff2?|ttf|otf|eot)(\?|$)/.test(new URL(url).pathname);
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      self.skipWaiting();
      const cache = await caches.open(STATIC_CACHE);
      await cache.add('/');
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const allKeys = await caches.keys();
      const oldKeys = allKeys.filter(
        (k) => (k.startsWith('mealdrop-') && k !== STATIC_CACHE && k !== FONT_CACHE) || LEGACY_CACHES.includes(k)
      );
      await Promise.all(oldKeys.map((k) => caches.delete(k)));

      await self.clients.claim();

      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATE_AVAILABLE' });
      });
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  if (isNeverCache(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isVersionedAsset(request.url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (isFontRequest(request.url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedHome = await caches.match('/');
        return cachedHome || Response.error();
      })
    );
  }
});