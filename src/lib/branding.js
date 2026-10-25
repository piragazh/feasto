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

// ── Contrast ─────────────────────────────────────────────────────────────────────────

function channel(c) {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour (0 = black, 1 = white). */
export function luminance(hex) {
    const h = hex.slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const DARK_TEXT = { text: '#111827', muted: '#4b5563' };   // gray-900 / gray-600
const LIGHT_TEXT = { text: '#ffffff', muted: '#d1d5db' };  // white / gray-300

/** Body and secondary text colours that read well on the given background. */
export function readableTextOn(bg) {
    if (!isValidHex(bg)) return DARK_TEXT;
    return contrastRatio(DARK_TEXT.text, bg) >= contrastRatio(LIGHT_TEXT.text, bg) ? DARK_TEXT : LIGHT_TEXT;
}

/** WCAG AA: 4.5:1 for normal text, 3:1 for large text and icons. */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_LARGE_CONTRAST = 3;

/**
 * Text colour for a button filled with `bg`. Keeps `preferred` when it reads
 * well; otherwise switches to white or near-black, whichever passes.
 * If neither passes, keeps `preferred` (the owner needs a different colour).
 */
export function buttonTextOn(bg, preferred = '#ffffff') {
    const pref = isValidHex(preferred) ? preferred : '#ffffff';
    if (!isValidHex(bg) || contrastRatio(pref, bg) >= MIN_TEXT_CONTRAST) return pref;
    const best = contrastRatio('#ffffff', bg) >= contrastRatio(DARK_TEXT.text, bg) ? '#ffffff' : DARK_TEXT.text;
    return contrastRatio(best, bg) >= MIN_TEXT_CONTRAST ? best : pref;
}

function toHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Blend a colour towards another by `amount` (0–1). */
export function mix(hex, target, amount) {
    const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const b = [1, 3, 5].map((i) => parseInt(target.slice(i, i + 2), 16));
    return toHex(...a.map((v, i) => v + (b[i] - v) * amount));
}

/** The nearest darker shade of `hex` on which white text passes AA, or null if already fine. */
export function shadeForWhiteText(hex) {
    if (!isValidHex(hex) || contrastRatio('#ffffff', hex) >= MIN_TEXT_CONTRAST) return null;
    for (let k = 0.05; k <= 0.9; k += 0.05) {
        const shade = mix(hex, '#000000', k);
        if (contrastRatio('#ffffff', shade) >= MIN_TEXT_CONTRAST) return shade;
    }
    return '#000000';
}

/**
 * A complete, readable set of storefront colours from a primary, secondary and
 * background colour, so applying a palette never leaves colours from a previous one.
 */
export function completePalette({ primary, secondary, background, nav }) {
    const bg = isValidHex(background) ? background.toLowerCase() : '#f9fafb';
    const p = isValidHex(primary) ? primary.toLowerCase() : '#c2410c';
    const darkBg = luminance(bg) < 0.2;
    return {
        primary_color: p,
        secondary_color: isValidHex(secondary) ? secondary.toLowerCase() : mix(p, '#ffffff', 0.75),
        background_color: bg,
        nav_background: isValidHex(nav) ? nav.toLowerCase() : (darkBg ? mix(bg, '#ffffff', 0.06) : '#ffffff'),
        card_background: darkBg ? mix(bg, '#ffffff', 0.1) : '#ffffff',
        heading_color: contrastRatio(p, bg) >= MIN_LARGE_CONTRAST ? p : readableTextOn(bg).text,
        button_text_color: buttonTextOn(p, '#ffffff'),
        add_to_cart_color: p,
    };
}

/**
 * Readability problems in an editor config, worst first. Each has a `fix`
 * object of fields to apply, or null when only the owner can choose.
 */
export function contrastIssues(config) {
    const issues = [];
    const c = config || {};
    const check = (id, label, fg, bg, min, fix, note) => {
        if (!isValidHex(fg) || !isValidHex(bg)) return;
        const ratio = contrastRatio(fg, bg);
        if (ratio < min) issues.push({ id, label, ratio, min, fix, note });
    };
    const btnText = c.button_text_color || '#ffffff';
    const autoText = buttonTextOn(c.primary_color, btnText);
    const darker = shadeForWhiteText(c.primary_color);
    check('button', 'Button text on brand colour', btnText, c.primary_color, MIN_TEXT_CONTRAST,
        autoText !== btnText ? { button_text_color: autoText } : (darker ? { primary_color: darker } : null),
        autoText !== btnText
            ? `Your storefront will use ${autoText === '#ffffff' ? 'white' : 'dark'} button text automatically.`
            : 'Neither white nor dark text reads well — try a deeper brand colour.');
    const cartColour = c.add_to_cart_color || c.primary_color;
    check('cart', 'Add-to-cart button icon', buttonTextOn(cartColour, btnText), cartColour, MIN_LARGE_CONTRAST,
        { add_to_cart_color: c.primary_color }, 'Use your brand colour for the + button.');
    check('heading', 'Category headings on page background', c.heading_color, c.background_color, MIN_LARGE_CONTRAST,
        { heading_color: readableTextOn(c.background_color).text },
        'Your storefront will use a readable heading colour automatically.');
    return issues.sort((a, b) => a.ratio / a.min - b.ratio / b.min);
}

const RADIUS = { rounded: '8px', pill: '9999px', sharp: '2px' };
const FONT_FAMILY = {
    modern: 'Inter, system-ui, sans-serif',
    classic: '"Playfair Display", Georgia, serif',
    playful: '"Nunito", sans-serif',
    elegant: '"Cormorant Garamond", serif',
};

/**
 * Every colour the storefront needs, resolved from a restaurant record.
 * With custom styling off, values match the standard MealDrop look in the
 * restaurant's brand colour. All values are validated hex, so they are safe
 * to write into CSS.
 */
export function brandTokens(restaurant) {
    const bc = sanitizeBranding(restaurant?.branding_config);
    const on = bc.enabled === true;
    const brandColour = isValidHex(restaurant?.theme_primary_color) ? restaurant.theme_primary_color : '#f97316';
    const primary = (on && bc.primary_color) || brandColour;
    const pageBg = (on && bc.background_color) || '#f9fafb';
    const surface = (on && bc.card_background) || '#ffffff';
    const nav = (on && bc.nav_background) || '#ffffff';
    const secondary = (on && bc.secondary_color) || '#f3f4f6';
    const page = readableTextOn(pageBg);
    const card = readableTextOn(surface);
    const navText = readableTextOn(nav);
    // Links and small accents on cards use the primary colour only when it is legible there.
    const accentOnSurface = contrastRatio(primary, surface) >= 3 ? primary : card.text;
    // Button text is switched to dark or white automatically when the chosen one is hard to read.
    const preferredText = (on && bc.button_text_color) || '#ffffff';
    const onPrimary = buttonTextOn(primary, preferredText);
    const addToCart = (on && bc.add_to_cart_color) || primary;
    const headingWanted = (on && bc.heading_color) || '#111827';
    return {
        on,
        primary,
        onPrimary,
        onAddToCart: buttonTextOn(addToCart, preferredText),
        secondary,
        onSecondary: readableTextOn(secondary).text,
        pageBg,
        pageText: page.text,
        pageMuted: page.muted,
        surface,
        surfaceText: card.text,
        surfaceMuted: card.muted,
        accentOnSurface,
        nav,
        navText: navText.text,
        navMuted: navText.muted,
        heading: contrastRatio(headingWanted, pageBg) >= MIN_LARGE_CONTRAST ? headingWanted : page.text,
        addToCart,
        radius: on ? (RADIUS[bc.button_style] || RADIUS.rounded) : null,
        fontFamily: on && bc.font_style ? FONT_FAMILY[bc.font_style] : 'inherit',
        heroOpacity: on && bc.hero_overlay_opacity != null ? bc.hero_overlay_opacity : 0.55,
        heroImage: on ? bc.hero_image_url || null : null,
    };
}

/** Names of colour fields in an editor config that aren't valid hex. */
export function invalidColorFields(config) {
    return BRANDING_COLOR_FIELDS.filter((f) => config?.[f] && !isValidHex(config[f]));
}
