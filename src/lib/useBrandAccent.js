import { useEffect } from 'react';
import { brandAccentVars, ensureBrandFont } from '@/lib/branding';

/**
 * Carry a restaurant's brand onto a customer page (cart, checkout, order
 * tracking, kiosk, table ordering) for as long as the page is mounted.
 *
 * The variables go on <html>, not the page root, because the cart drawer,
 * dialogs and toasts render through portals outside it (same reason as
 * applyPaletteToDocument in posThemes.js). They are removed on unmount, so
 * dashboards and the POS are unaffected. Matching CSS lives in src/index.css
 * under "Brand colours on customer pages".
 */
export function useBrandAccent(restaurant) {
    const key = restaurant
        ? JSON.stringify([restaurant.id, restaurant.theme_primary_color, restaurant.branding_config])
        : null;

    useEffect(() => {
        if (!restaurant || typeof document === 'undefined') return undefined;
        const root = document.documentElement;
        const { vars, fontStyle, fontFamily } = brandAccentVars(restaurant);

        for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
        root.classList.add('brand-accent');
        if (fontStyle) {
            ensureBrandFont(fontStyle);
            root.style.setProperty('--brand-font', fontFamily);
            root.classList.add('brand-font');
        }

        return () => {
            for (const name of Object.keys(vars)) root.style.removeProperty(name);
            root.style.removeProperty('--brand-font');
            root.classList.remove('brand-accent', 'brand-font');
        };
        // key captures every field that affects the result
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
}
