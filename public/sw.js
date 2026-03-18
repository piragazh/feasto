const CACHE_NAME = 'screen-media-v2';

// Match media file extensions (also handles CDN URLs without clean extensions via content-type)
const MEDIA_PATTERN = /\.(mp4|webm|ogg|mov|jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Cache-first strategy for media assets
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = request.url;

    // Only intercept GET requests for media
    if (request.method !== 'GET') return;
    if (!MEDIA_PATTERN.test(url)) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(request, { ignoreVary: true });
            if (cached) return cached;

            try {
                // Use no-cors for cross-origin CDN assets to avoid CORS failures
                const fetchRequest = new Request(url, {
                    mode: url.startsWith(self.location.origin) ? 'same-origin' : 'no-cors',
                    credentials: 'omit',
                });
                const response = await fetch(fetchRequest);
                if (response.type === 'opaque' || response.ok) {
                    await cache.put(request, response.clone());
                }
                return response;
            } catch {
                // Truly offline and not cached — return empty 503
                return new Response('', { status: 503, statusText: 'Offline' });
            }
        })
    );
});

// Background pre-caching triggered by the app
self.addEventListener('message', (event) => {
    if (event.data?.type !== 'PRECACHE_URLS') return;
    const urls = (event.data.urls || []).filter(Boolean);
    if (!urls.length) return;

    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const url of urls) {
                try {
                    // Skip if already cached
                    const existing = await cache.match(url, { ignoreVary: true });
                    if (existing) continue;

                    const fetchRequest = new Request(url, {
                        mode: url.startsWith(self.location.origin) ? 'same-origin' : 'no-cors',
                        credentials: 'omit',
                    });
                    const response = await fetch(fetchRequest);
                    if (response.type === 'opaque' || response.ok) {
                        await cache.put(url, response);
                        console.log('[SW] Pre-cached:', url.split('?')[0].split('/').pop());
                    }
                } catch (err) {
                    console.warn('[SW] Failed to pre-cache:', url, err.message);
                }
            }
            console.log('[SW] Pre-cache complete for', urls.length, 'assets');
        })
    );
});
