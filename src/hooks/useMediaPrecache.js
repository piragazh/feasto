import { useEffect, useRef } from 'react';

/**
 * Registers the service worker and instructs it to pre-cache all
 * media URLs extracted from the provided content array.
 *
 * @param {Array}  content         - PromotionalContent records
 * @param {Array}  wallContent     - MediaWallContent records (optional)
 * @param {boolean} isOnline       - current online status
 */
export function useMediaPrecache(content = [], wallContent = [], isOnline = true) {
    const precachedRef = useRef(new Set());
    const swReadyRef   = useRef(false);

    // Register Service Worker once
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then((reg) => {
                swReadyRef.current = true;
                console.log('[Precache] Service worker registered, scope:', reg.scope);
            })
            .catch((err) => {
                console.warn('[Precache] SW registration failed:', err);
            });
    }, []);

    // Whenever content changes AND we're online, send new URLs to the SW
    useEffect(() => {
        if (!isOnline) return;
        if (!('serviceWorker' in navigator)) return;

        const allItems = [...content, ...wallContent];
        const newUrls = allItems
            .filter(item => item?.media_url && (item.media_type === 'video' || item.media_type === 'image' || item.media_type === 'gif'))
            .map(item => item.media_url)
            .filter(url => !precachedRef.current.has(url));

        if (!newUrls.length) return;

        const send = (controller) => {
            controller.postMessage({ type: 'PRECACHE_URLS', urls: newUrls });
            newUrls.forEach(url => precachedRef.current.add(url));
            console.log('[Precache] Sent', newUrls.length, 'URL(s) to service worker');
        };

        if (navigator.serviceWorker.controller) {
            send(navigator.serviceWorker.controller);
        } else {
            // Wait for the SW to claim this page
            navigator.serviceWorker.ready.then((reg) => {
                if (reg.active) send(reg.active);
            });
        }
    }, [content, wallContent, isOnline]);
}