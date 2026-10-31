import { useEffect, useState } from 'react';

/**
 * Screen drawing resolution: the real number of pixels the screen's browser
 * draws the page at (CSS size × device pixel ratio). Many 4K TVs and sticks
 * draw apps at Full HD and let the TV scale up — this shows which is which.
 */

/** What this device draws at, for the check-in. */
export function measureDrawing(win = typeof window !== 'undefined' ? window : null) {
    if (!win?.screen) return {};
    const dpr = Number(win.devicePixelRatio) || 1;
    const w = Math.round((Number(win.screen.width) || 0) * dpr);
    const h = Math.round((Number(win.screen.height) || 0) * dpr);
    if (!w || !h) return {};
    return { drawing: `${w}x${h}`, pixel_ratio: Math.round(dpr * 100) / 100 };
}

const parseSize = (s) => {
    const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(s || '').trim());
    return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
};

/** Drawing size a screen reported, or null if it hasn't reported one yet. */
export function screenDrawing(screen) {
    return parseSize(screen?.screen_info?.drawing);
}

export function resolutionLabel({ w, h }) {
    const long = Math.max(w, h);
    if (long >= 3800) return '4K';
    if (long >= 2500) return 'QHD';
    if (long >= 1900) return 'Full HD';
    if (long >= 1260) return 'HD';
    return 'low resolution';
}

/**
 * The area content is drawn into on this screen. When the player rotates
 * content (portrait-mounted TV), width and height swap.
 * Unknown screens are assumed Full HD.
 */
export function contentArea(screen) {
    const d = screenDrawing(screen) || { w: 1920, h: 1080, assumed: true };
    const rotated = ['portrait', 'portrait_flipped'].includes(screen?.orientation);
    return rotated ? { w: d.h, h: d.w, assumed: !!d.assumed } : { ...d, assumed: !!d.assumed };
}

/**
 * Is an image too small for a screen? Images fill the screen (cover), so the
 * screen enlarges them by max(area.w / img.w, area.h / img.h). More than 25%
 * enlargement starts to look soft.
 */
export function imageFit(img, screen) {
    if (!img?.w || !img?.h) return null;
    const area = contentArea(screen);
    const scale = Math.max(area.w / img.w, area.h / img.h);
    return { lowRes: scale > 1.25, scale, area };
}

// ── Image size lookup (cached per URL) ─────────────────────────────────────
const sizeCache = new Map();

export function useImageSize(url) {
    const [size, setSize] = useState(() => (url && sizeCache.get(url)) || null);
    useEffect(() => {
        if (!url) { setSize(null); return; }
        if (sizeCache.has(url)) { setSize(sizeCache.get(url)); return; }
        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            const s = { w: img.naturalWidth, h: img.naturalHeight };
            if (s.w && s.h) sizeCache.set(url, s);
            if (!cancelled) setSize(s.w && s.h ? s : null);
        };
        img.onerror = () => { if (!cancelled) setSize(null); };
        img.src = url;
        return () => { cancelled = true; };
    }, [url]);
    return size;
}
