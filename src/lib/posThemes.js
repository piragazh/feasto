/**
 * POS accent palettes.
 *
 * How this works: the Tailwind config redefines the `orange-*` colour scale to
 * read from `--pos-accent-*` CSS variables, with Tailwind's original orange as
 * the fallback. That means the ~400 existing `orange-*` utility classes across
 * the POS follow whichever palette is active, with no component changes, and
 * anything outside the POS (customer site, kiosk, dashboards) is untouched
 * because those variables are only set on the POS root element.
 *
 * Values are space-separated RGB channels ("249 115 22") rather than hex,
 * because Tailwind composes them as `rgb(<channels> / <alpha-value>)` so that
 * opacity modifiers like `bg-orange-500/20` keep working.
 *
 * To add a palette: copy an entry and supply the 50-900 ramp. Keep 500 as the
 * primary action colour and 400 as the "readable on dark" tint - the POS uses
 * 400 for text/icons on dark surfaces and 500 for solid buttons.
 */

export const POS_PALETTES = {
    orange: {
        label: 'Classic Orange',
        swatch: '#f97316',
        description: 'The MealDrop default. Warm and high-energy.',
        ramp: {
            50: '255 247 237', 100: '255 237 213', 200: '254 215 170', 300: '253 186 116',
            400: '251 146 60', 500: '249 115 22', 600: '234 88 12', 700: '194 65 12',
            800: '154 52 18', 900: '124 45 18',
        },
    },
    teal: {
        label: 'Mint Teal',
        swatch: '#14b8a6',
        description: 'Cool and modern. Strong contrast on dark screens.',
        ramp: {
            50: '240 253 250', 100: '204 251 241', 200: '153 246 228', 300: '94 234 212',
            400: '45 212 191', 500: '20 184 166', 600: '13 148 136', 700: '15 118 110',
            800: '17 94 89', 900: '19 78 74',
        },
    },
    blue: {
        label: 'Ocean Blue',
        swatch: '#3b82f6',
        description: 'Calm and corporate. Easy on the eyes over long shifts.',
        ramp: {
            50: '239 246 255', 100: '219 234 254', 200: '191 219 254', 300: '147 197 253',
            400: '96 165 250', 500: '59 130 246', 600: '37 99 235', 700: '29 78 216',
            800: '30 64 175', 900: '30 58 138',
        },
    },
    purple: {
        label: 'Royal Purple',
        swatch: '#a855f7',
        description: 'Distinctive and premium.',
        ramp: {
            50: '250 245 255', 100: '243 232 255', 200: '233 213 255', 300: '216 180 254',
            400: '192 132 252', 500: '168 85 247', 600: '147 51 234', 700: '126 34 206',
            800: '107 33 168', 900: '88 28 135',
        },
    },
    rose: {
        label: 'Berry Rose',
        swatch: '#f43f5e',
        description: 'Bold and appetising. Works well for dessert and bakery.',
        ramp: {
            50: '255 241 242', 100: '255 228 230', 200: '254 205 211', 300: '253 164 175',
            400: '251 113 133', 500: '244 63 94', 600: '225 29 72', 700: '190 18 60',
            800: '159 18 57', 900: '136 19 55',
        },
    },
    green: {
        label: 'Fresh Green',
        swatch: '#22c55e',
        description: 'Natural and healthy. Suits salad, vegan and juice bars.',
        ramp: {
            50: '240 253 244', 100: '220 252 231', 200: '187 247 208', 300: '134 239 172',
            400: '74 222 128', 500: '34 197 94', 600: '22 163 74', 700: '21 128 61',
            800: '22 101 52', 900: '20 83 45',
        },
    },
    amber: {
        label: 'Golden Amber',
        swatch: '#f59e0b',
        description: 'Warm and traditional. Good for pubs and grills.',
        ramp: {
            50: '255 251 235', 100: '254 243 199', 200: '253 230 138', 300: '252 211 77',
            400: '251 191 36', 500: '245 158 11', 600: '217 119 6', 700: '180 83 9',
            800: '146 64 14', 900: '120 53 15',
        },
    },
    slate: {
        label: 'Graphite',
        swatch: '#64748b',
        description: 'Understated monochrome. Lets food photography lead.',
        ramp: {
            50: '248 250 252', 100: '241 245 249', 200: '226 232 240', 300: '203 213 225',
            400: '148 163 184', 500: '100 116 139', 600: '71 85 105', 700: '51 65 85',
            800: '30 41 59', 900: '15 23 42',
        },
    },
};

export const DEFAULT_PALETTE = 'orange';

export function getPalette(key) {
    return POS_PALETTES[key] || POS_PALETTES[DEFAULT_PALETTE];
}

/**
 * Inline style object setting the --pos-accent-* variables for a palette.
 * Apply to the POS root so the scope is limited to the POS.
 */
export function paletteStyle(key) {
    const { ramp } = getPalette(key);
    const style = {};
    for (const [step, channels] of Object.entries(ramp)) {
        style[`--pos-accent-${step}`] = channels;
    }
    return style;
}

/**
 * localStorage key for a restaurant's cached palette.
 *
 * MUST be scoped per restaurant: an operator may run several restaurants from
 * the same device (or the same back-office browser), and a single shared key
 * would paint one restaurant's brand colour onto another's till until the
 * record loaded - and would persist the wrong value if the record failed to load.
 */
export function paletteStorageKey(restaurantId) {
    return restaurantId ? `pos_palette:${restaurantId}` : 'pos_palette';
}

/** Cached palette for a restaurant, or the default. */
export function readCachedPalette(restaurantId) {
    try {
        return localStorage.getItem(paletteStorageKey(restaurantId)) || DEFAULT_PALETTE;
    } catch {
        return DEFAULT_PALETTE;
    }
}

export function writeCachedPalette(restaurantId, key) {
    try { localStorage.setItem(paletteStorageKey(restaurantId), key); } catch { /* storage unavailable */ }
}

/**
 * Apply a palette to <html> for as long as the POS is mounted, and remove it on
 * unmount.
 *
 * Setting the variables only on the POS root element is NOT enough: Radix
 * dialogs, popovers, dropdowns and toasts render through React portals attached
 * to document.body, which sits OUTSIDE the POS root. Those portals therefore
 * never inherit the accent variables and fall back to the default orange - so
 * the item-customization dialog kept its original colours while the rest of the
 * POS followed the restaurant's palette.
 *
 * Scoping to documentElement covers portals while still being torn down when
 * the operator leaves the POS, so the customer site and dashboards are unaffected.
 *
 * @returns {() => void} cleanup that removes the variables
 */
export function applyPaletteToDocument(key) {
    if (typeof document === 'undefined') return () => {};
    const root = document.documentElement;
    const { ramp } = getPalette(key);
    for (const [step, channels] of Object.entries(ramp)) {
        root.style.setProperty(`--pos-accent-${step}`, channels);
    }
    return () => {
        for (const step of Object.keys(ramp)) {
            root.style.removeProperty(`--pos-accent-${step}`);
        }
    };
}
