import { useEffect, useRef } from 'react';

/**
 * Registers the service worker and tells it which media files this screen is
 * showing, so they are stored for offline playback.
 *
 * On the standalone /MediaScreen page the full list is sent (SET_MEDIA_URLS),
 * letting the worker also delete files no longer in use. Elsewhere (e.g. the
 * kiosk idle overlay) files are only added (PRECACHE_URLS), never pruned.
 *
 * @param {Array}  content         - PromotionalContent records
 * @param {Array}  wallContent     - MediaWallContent records (optional)
 * @param {boolean} isOnline       - current online status
 */
const MEDIA_TYPES = ['video', 'image', 'gif'];

export function useMediaPrecache(content = [], wallContent = [], isOnline = true) {
    const lastSentRef = useRef('');

    // Register Service Worker once (same file/scope as pwa-lifecycle — harmless if already registered)
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
            console.warn('[Precache] SW registration failed:', err);
        });
    }, []);

    useEffect(() => {
        if (!isOnline) return;
        if (!('serviceWorker' in navigator)) return;

        const urls = [...new Set(
            [...(content || []), ...(wallContent || [])]
                .filter(item => item?.media_url && MEDIA_TYPES.includes(item.media_type))
                .map(item => item.media_url)
        )].sort();

        const signature = urls.join('|');
        if (!urls.length || signature === lastSentRef.current) return;

        const prune = /^\/MediaScreen/i.test(window.location.pathname);
        const message = { type: prune ? 'SET_MEDIA_URLS' : 'PRECACHE_URLS', urls };

        const send = (worker) => {
            if (!worker) return;
            worker.postMessage(message);
            lastSentRef.current = signature;
        };

        if (navigator.serviceWorker.controller) {
            send(navigator.serviceWorker.controller);
        } else {
            navigator.serviceWorker.ready.then((reg) => send(reg.active)).catch(() => {});
        }
    }, [content, wallContent, isOnline]);
}
