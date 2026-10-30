/**
 * Rules for the AI ad generator, kept free of React so they can be tested.
 *
 * Principle: the AI paints the PICTURE only. Words, prices and codes are
 * drawn live by the player (AdSlide), so they are exact and always current.
 */
import { couponValidFromInstant, couponValidUntilInstant, couponOwner, couponRestaurantScope } from '@/lib/order-logic';
import { sellsAt } from '@/lib/item-availability';

export const AD_TYPES = [
    { value: 'single_item', label: 'One dish', desc: 'Spotlight a single item with its live price' },
    { value: 'category', label: 'A few dishes', desc: 'Up to 4 items from your menu' },
    { value: 'promo_code', label: 'Promo code', desc: 'One of your real coupons — ends when the code expires' },
    { value: 'generic', label: 'Brand', desc: 'Your name and a message, no prices' },
];

// No real brand names: lookalike "trade dress" is a legal risk, and the
// image service refuses some trademarked styles anyway.
export const STYLES = [
    { value: 'cinematic', label: 'Cinematic', prompt: 'dramatic cinematic food advertising photography, dark moody background, warm rim light, glowing embers and subtle steam' },
    { value: 'bright', label: 'Bright & fresh', prompt: 'bright, fresh, high-key food photography, clean light background, vivid natural colours, soft daylight' },
    { value: 'street', label: 'Street food', prompt: 'gritty urban street-food photography, neon-lit night street bokeh, smoky grill atmosphere, bold contrast' },
    { value: 'premium', label: 'Premium', prompt: 'elegant fine-dining photography, deep charcoal background, single soft key light, minimal styling' },
    { value: 'playful', label: 'Playful', prompt: 'playful colourful pop-art food styling, bold flat colour background, flying ingredients, fun energetic composition' },
];

const NO_TEXT = 'Absolutely no text, no letters, no words, no numbers, no prices, no logos, no brand marks, no watermarks, no signs or menus anywhere in the image.';

/** Image prompt: a text-free picture with calm space where the overlay goes. */
export function buildImagePrompt({ adType, restaurantName, items = [], styleValue, accent, extra = '', useRealPhotos = false, message = '' }) {
    const style = (STYLES.find(s => s.value === styleValue) || STYLES[0]).prompt;
    const names = items.map(i => i.name).filter(Boolean);
    let subject;
    if (adType === 'single_item' && names[0]) {
        subject = `a hero shot of ${names[0]}${items[0]?.description ? ` (${String(items[0].description).slice(0, 140)})` : ''}`;
    } else if (adType === 'category' && names.length) {
        subject = `an appetising spread of ${names.slice(0, 4).join(', ')}`;
    } else if (adType === 'promo_code') {
        subject = names.length ? `an appetising spread of ${names.slice(0, 3).join(', ')}` : 'an inviting, appetising spread of the restaurant\'s food';
    } else {
        subject = `an inviting scene that captures ${restaurantName ? `the food at ${restaurantName}` : 'a busy, welcoming takeaway'}${message ? `, conveying: ${String(message).slice(0, 120)}` : ''}`;
    }
    const real = useRealPhotos
        ? 'Use the attached photo(s) of the restaurant\'s actual food as the subject. Keep the real food exactly as it is — same items, ingredients and portion size — and only improve the lighting, background and styling.'
        : '';
    return [
        `Advertising image for a digital menu screen in a restaurant. Subject: ${subject}.`,
        real,
        `Style: ${style}. Accent colour ${accent || '#f97316'} used subtly in the lighting.`,
        'Composition: place the food in the upper-right part of the frame. Keep the left side and the bottom calm, dark and uncluttered, because text will be added there later. Keep the important food well inside the frame so it survives cropping to wide (16:9) and tall (9:16) screens.',
        'Photorealistic, appetising, sharp detail.',
        extra ? `Extra direction: ${String(extra).slice(0, 300)}.` : '',
        NO_TEXT,
    ].filter(Boolean).join(' ');
}

/** Real photos to send as references (hero first), only if they exist. */
export function referencePhotos(adType, items = []) {
    const n = adType === 'single_item' ? 1 : 3;
    return items.map(i => i?.image_url).filter(u => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, n);
}

/** Copywriting request: facts in, short British-English lines out, never prices. */
export function buildCopyPrompt({ adType, restaurantName, items = [], coupon, message = '', keywords = '' }) {
    const facts = [];
    if (restaurantName) facts.push(`Restaurant: ${restaurantName}`);
    if (items.length) facts.push(`Dishes: ${items.slice(0, 4).map(i => `${i.name}${i.description ? ` — ${String(i.description).slice(0, 100)}` : ''}`).join('; ')}`);
    if (coupon) facts.push(`Offer: ${describeCoupon(coupon)} with code ${coupon.code}${coupon.minimum_order ? ` (minimum order £${Number(coupon.minimum_order).toFixed(2)})` : ''}`);
    if (message) facts.push(`Owner's message: ${String(message).slice(0, 200)}`);
    if (keywords) facts.push(`Words the owner likes: ${String(keywords).slice(0, 120)}`);
    return `You write copy for a restaurant's in-store digital screen ad (${adType.replace('_', ' ')}).
Facts (use ONLY these — do not invent anything):
${facts.join('\n')}

Write 3 different options. Each has:
- headline: max 5 words, punchy, readable from across a shop
- hook: 1-2 words shown above the headline (e.g. "NEW", "HOT & CRISPY")
- cta: max 4 words (e.g. "Order at the counter")
Rules: British English. NO prices or numbers (prices are added automatically). Do not claim anything not in the facts — no "best", "award-winning", "halal", "healthy", "fresh daily", "free", "authentic" unless stated. No other brands. No emojis.`;
}

export const COPY_SCHEMA = {
    type: 'object',
    properties: {
        options: {
            type: 'array',
            items: { type: 'object', properties: { headline: { type: 'string' }, hook: { type: 'string' }, cta: { type: 'string' } } },
        },
    },
};

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Keep AI copy short, and strip any prices it slipped in. */
export function cleanCopy(o = {}) {
    const noPrice = (s) => s.replace(/£\s?\d+([.,]\d{1,2})?/g, '').replace(/\s{2,}/g, ' ').trim();
    return {
        headline: noPrice(clip(o.headline, 48)),
        hook: noPrice(clip(o.hook, 24)).toUpperCase(),
        cta: noPrice(clip(o.cta, 32)),
    };
}

/** Coupons that may be advertised on an in-store screen right now. */
export function advertisableCoupons(coupons = [], restaurantId, now = new Date()) {
    return coupons.filter(c => {
        if (!c?.code || c.is_active === false) return false;
        if (couponOwner(c)) return false;                                  // personal reward, not public
        const scope = couponRestaurantScope(c);
        if (scope && scope !== restaurantId) return false;
        if (c.valid_from && couponValidFromInstant(c.valid_from) > now) return false;
        if (couponExpiry(c) && couponExpiry(c) <= now) return false;
        if (c.usage_limit && (Number(c.usage_count) || 0) >= Number(c.usage_limit)) return false;
        return true;
    });
}

export function couponExpiry(c) {
    if (c?.expires_at) return new Date(c.expires_at);
    if (c?.valid_until) return couponValidUntilInstant(c.valid_until);
    return null;
}

export function describeCoupon(c) {
    if (!c) return '';
    switch (c.discount_type) {
        case 'percentage': return `${Number(c.discount_value) || 0}% OFF`;
        case 'fixed': return `£${Number(c.discount_value || 0).toFixed(2).replace(/\.00$/, '')} OFF`;
        case 'free_delivery': return 'FREE DELIVERY';
        case 'free_item': return c.free_item_name ? `FREE ${String(c.free_item_name).toUpperCase()}` : 'FREE ITEM';
        case 'buy_one_get_one': return 'BUY ONE GET ONE FREE';
        default: return 'SPECIAL OFFER';
    }
}

/** Items that can appear on an in-store ad (sold at the till, switched on). */
export function adEligibleItems(menuItems = []) {
    return menuItems.filter(i => i && i.is_available !== false && sellsAt(i, 'till'));
}

/** Default picks for "a few dishes": popular first, then menu order. */
export function pickCategoryItems(menuItems, category, max = 4) {
    const list = adEligibleItems(menuItems).filter(i => !category || i.category === category);
    return [...list]
        .sort((a, b) => (b.is_popular ? 1 : 0) - (a.is_popular ? 1 : 0) || (Number(a.menu_item_no) || 0) - (Number(b.menu_item_no) || 0))
        .slice(0, max);
}

/** The content record(s) to create for each chosen screen. */
export function buildContentRecord({ restaurantId, screenName, imageUrl, overlay, title, duration, displayOrder, imagePrompt, endsAt }) {
    return {
        restaurant_id: restaurantId,
        screen_name: screenName,
        title: clip(title, 80) || 'AI ad',
        media_type: 'image',
        media_url: imageUrl,
        duration: Math.min(60, Math.max(5, Number(duration) || 10)),
        transition: 'fade',
        display_order: displayOrder,
        priority: 1,
        is_active: true,
        ai_generated: true,
        ai_prompt: clip(imagePrompt, 2000),
        ad_overlay: overlay,
        ...(endsAt ? { schedule: { enabled: true, end_date: new Date(endsAt).toISOString() } } : {}),
    };
}
