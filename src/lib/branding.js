// Brand Studio helpers shared by the editor and the public storefront.
//
// Branding values are written into a <style> block on the storefront, so they
// are always passed through sanitizeBranding() before use. The server function
// updateRestaurantSettings applies the same rules on save; this is the second
// line of defence for anything already stored.

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const BRANDING_COLOR_FIELDS = [
    'primary_color',
    'secondary_color',
    'background_color',
    'nav_background',
    'card_background',
    'button_text_color',
    'add_to_cart_color',
    'heading_color',
];

const BUTTON_STYLES = ['rounded', 'pill', 'sharp'];
const FONT_STYLES = ['modern', 'classic', 'playful', 'elegant'];
const HERO_IMAGE_HOSTS = ['base44.app', 'media.base44.com'];

export const isValidHex = (v) => typeof v === 'string' && HEX_COLOR.test(v);

export function isAllowedHeroUrl(v) {
    if (typeof v !== 'string' || !v) return false;
    try {
        const u = new URL(v);
        return u.protocol === 'https:' && HERO_IMAGE_HOSTS.includes(u.hostname);
    } catch {
        return false;
    }
}

/**
 * Returns a copy of a stored branding_config containing only values that are
 * safe to put in CSS or an <img src>. Invalid or missing values are dropped so
 * callers fall back to their own defaults.
 */
export function sanitizeBranding(bc) {
    if (!bc || typeof bc !== 'object' || Array.isArray(bc)) return { enabled: false };
    const out = { enabled: bc.enabled === true };
    for (const field of BRANDING_COLOR_FIELDS) {
        if (isValidHex(bc[field])) out[field] = bc[field];
    }
    if (BUTTON_STYLES.includes(bc.button_style)) out.button_style = bc.button_style;
    if (FONT_STYLES.includes(bc.font_style)) out.font_style = bc.font_style;
    const opacity = Number(bc.hero_overlay_opacity);
    if (bc.hero_overlay_opacity != null && Number.isFinite(opacity)) {
        out.hero_overlay_opacity = Math.min(1, Math.max(0, opacity));
    }
    if (isAllowedHeroUrl(bc.hero_image_url)) out.hero_image_url = bc.hero_image_url;
    return out;
}

/** Names of colour fields in an editor config that aren't valid hex. */
export function invalidColorFields(config) {
    return BRANDING_COLOR_FIELDS.filter((f) => config?.[f] && !isValidHex(config[f]));
}
