// Service Worker for Tablet Dashboard PWA
// This file is typically served from /sw.js via a static file server or special route
// For now, this is a reference implementation

const CACHE_NAME = 'tablet-dashboard-v2';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isAppCodeRequest =
        url.pathname.includes('/src/') ||
        url.pathname.includes('/node_modules/.vite/') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.jsx') ||
        url.pathname.endsWith('.ts') ||
        url.pathname.endsWith('.tsx') ||
        url.pathname.endsWith('.mjs');

    if (isAppCodeRequest) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).then((response) => {
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(() => caches.match(event.request));
        })
    );
});