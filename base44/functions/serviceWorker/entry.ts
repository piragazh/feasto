// Service Worker for Tablet Dashboard PWA
// This file is typically served from /sw.js via a static file server or special route
// For now, this is a reference implementation

const CACHE_NAME = 'tablet-dashboard-v2';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

function shouldCache(request) {
    const url = new URL(request.url);

    if (request.method !== 'GET') return false;
    if (url.origin !== self.location.origin) return false;

    // Never cache app routes or source/module files — this was the loophole causing blank screens after deploys
    if (url.pathname === '/' || !url.pathname.includes('.')) return false;
    if (url.pathname.startsWith('/src/')) return false;
    if (url.pathname.startsWith('/node_modules/')) return false;

    // Only cache safe static assets
    return /\.(js|css|png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
    if (!shouldCache(event.request)) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    event.waitUntil(
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
                    );
                }
                return networkResponse;
            });
        })
    );
});