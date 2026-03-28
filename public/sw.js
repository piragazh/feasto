/**
 * MealDrop Service Worker
 * ======================
 * Caching policy:
 *
 * CACHED (safe to serve stale + revalidate):
 *   - Versioned static assets: /assets/* (JS/CSS bundles with content hashes)
 *   - Static images served from /assets/*
 *   - Google Fonts and CDN font files
 *
 * NEVER CACHED (always network-first, fail hard if offline):
 *   - /api/*              — all backend API calls
 *   - /getManifest        — dynamic PWA manifest
 *   - checkout routes     — real-money flows must be fresh
 *   - POS routes          — transactional, must be fresh
 *   - admin/kitchen routes — operational, must be fresh
 *
 * UPDATE STRATEGY:
 *   - New SW activates immediately (skipWaiting)
 *   - Notifies all open clients so they can soft-reload
 *   - Clients listen for the 'SW_UPDATE_AVAILABLE' message and decide
 *     whether to reload based on route context (see pwa-lifecycle.js)
 *
 * OFFLINE SUPPORT:
 *   - Partial: app shell / menu browsing only
 *   - Payment / order submission / POS / admin will fail offline — this is correct
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `mealdrop-static-${CACHE_VERSION}`;
const FONT_CACHE   = `mealdrop-fonts-${CACHE_VERSION}`;

// Routes that must NEVER be served from cache
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
];

const isNeverCache = (url) => {
  const path = new URL(url).pathname;
  return NEVER_CACHE_PATTERNS.some((p) => p.test(path));
};

const isVersionedAsset = (url) => {
  // Vite outputs hashed filenames: /assets/index-Abc123.js
  return new URL(url).pathname.startsWith('/assets/');
};

const isFontRequest = (url) => {
  return /fonts\.(googleapis|gstatic)\.com/.test(url) ||
         /\.(woff2?|ttf|otf|eot)(\?|$)/.test(new URL(url).pathname);
};

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Activate immediately — don't wait for old clients to close
  self.skipWaiting();

  if (process?.env?.NODE_ENV !== 'production') {
    console.log('[SW] install — activating immediately');
  }
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete any caches from previous versions
      const allKeys = await caches.keys();
      const oldKeys = allKeys.filter(
        (k) => k.startsWith('mealdrop-') && k !== STATIC_CACHE && k !== FONT_CACHE
      );
      await Promise.all(oldKeys.map((k) => caches.delete(k)));

      // Also delete legacy cache names from the old `functions/serviceWorker` reference impl
      if (allKeys.includes('tablet-dashboard-v1')) {
        await caches.delete('tablet-dashboard-v1');
      }

      // Take control of all open clients immediately
      await self.clients.claim();

      // Notify all open tabs that a new SW has taken over
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATE_AVAILABLE' });
      });
    })()
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http requests
  if (!request.url.startsWith('http')) return;

  // ── Never-cache routes: always go to network ──────────────────────────────
  if (isNeverCache(request.url)) {
    // Pass through — do NOT intercept. Let the browser handle it natively.
    return;
  }

  // ── Versioned Vite assets: cache-first (they have content-hash filenames) ──
  if (isVersionedAsset(request.url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // ── Fonts: cache-first with long TTL (fonts don't change) ─────────────────
  if (isFontRequest(request.url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // ── Navigation requests (HTML): network-first, fall back to cached index ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ── Everything else: network-only (don't cache API responses, manifests, etc.) ──
  // Intentional: we do not intercept, letting the browser handle normally.
});
