// Service worker served at /sw.js
Deno.serve((req) => {
    const sw = `
const CACHE_NAME = 'mealdrop-v2';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) return;
    if (url.pathname.startsWith('/api/') || url.pathname.includes('/functions/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok && (
                    event.request.destination === 'script' ||
                    event.request.destination === 'style' ||
                    event.request.destination === 'image' ||
                    event.request.destination === 'font'
                )) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
`;

    return new Response(sw, {
        status: 200,
        headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-cache',
            'Service-Worker-Allowed': '/'
        }
    });
});