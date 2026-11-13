/**
 * Shop price-offer ads ("HAYATI 6000 each £12.99 / 2 for £20").
 * Pure rules, no React, so they can be tested.
 *
 * Principle (same as the menu ads): words and prices are typed by the owner
 * and drawn live by the screen, never painted by AI — so they are always
 * exact, sharp on 4K, and fit wide or tall screens.
 */

export const MAX_PRODUCTS = 6;

/** Colour themes. "ACCENT" is replaced with the shop's brand colour. */
export const OFFER_TEMPLATES = [
    { value: 'deal', label: 'Big Deal', desc: 'Red & yellow shop classic',
        bg: '#c8102e', bg2: '#8f0a20', card: '#ffffff', text: '#111827', muted: '#4b5563', title: '#ffffff',
        price: '#111827', priceBg: '#ffd60a', offerBg: '#c8102e', offerText: '#ffffff', footer: '#ffffff' },
    { value: 'sunny', label: 'Sunshine', desc: 'Bright yellow, bold black',
        bg: '#ffd60a', bg2: '#ffb703', card: '#ffffff', text: '#111827', muted: '#374151', title: '#111827',
        price: '#ffffff', priceBg: '#111827', offerBg: '#c8102e', offerText: '#ffffff', footer: '#111827' },
    { value: 'fresh', label: 'Fresh', desc: 'Green & white, for groceries',
        bg: '#15803d', bg2: '#14532d', card: '#ffffff', text: '#14532d', muted: '#3f6212', title: '#ffffff',
        price: '#ffffff', priceBg: '#dc2626', offerBg: '#15803d', offerText: '#ffffff', footer: '#ffffff' },
    { value: 'night', label: 'Night', desc: 'Dark and premium',
        bg: '#0b0f1a', bg2: '#1f2937', card: '#161d2e', text: '#f9fafb', muted: '#9ca3af', title: '#f9fafb',
        price: 'ON_ACCENT', priceBg: 'ACCENT', offerBg: '#f9fafb', offerText: '#0b0f1a', footer: '#d1d5db' },
    { value: 'clean', label: 'Clean', desc: 'Light, in your brand colour',
        bg: '#f3f4f6', bg2: '#e5e7eb', card: '#ffffff', text: '#111827', muted: '#6b7280', title: '#111827',
        price: 'ON_ACCENT', priceBg: 'ACCENT', offerBg: '#111827', offerText: '#ffffff', footer: '#374151' },
];

const HEX = /^#[0-9a-f]{6}$/i;
/** Black or white, whichever reads better on the given colour. */
export function onColor(hex) {
    if (!HEX.test(String(hex))) return '#ffffff';
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#111827' : '#ffffff';
}

export function themeFor(template, accent) {
    const t = OFFER_TEMPLATES.find(x => x.value === template) || OFFER_TEMPLATES[0];
    const a = HEX.test(String(accent)) ? accent : '#f97316';
    const out = {};
    for (const [k, v] of Object.entries(t)) out[k] = v === 'ACCENT' ? a : v === 'ON_ACCENT' ? onColor(a) : v;
    return out;
}

const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => tidy(s).slice(0, n);

// £12.99, £ 5, 99p, or a bare 12.99 (two decimals, so "6000" is never a price)
const PRICE_RE = /£\s?\d+(?:[.,]\d{1,2})?|\b\d{1,3}p\b|\b\d+\.\d{2}\b/i;
const UNIT_RE = /\b(each|ea|per\s?kg|a\s?kg|\/\s?kg|per\s?pack|a\s?pack|per\s?litre|only|just|now)\b\.?/i;
const OFFER_START_RE = /^(\d+\s*(for|x)\b|any\s+\d+|buy\b|bogof\b|b1g1\b|mix\b|save\b|half\s+price|\d+\s?%|was\b|only\s+\d+\s+for)/i;
const DETAIL_RE = /\b(all|any|assorted|mixed|selected)\s+(flavou?rs?|varieties|variety|types?|sizes?|colou?rs?)\b/i;

/** "12.99" → "£12.99", "£ 20.00" → "£20.00", "99P" → "99p". Text is kept as typed otherwise. */
export function tidyPrice(raw) {
    let s = tidy(raw).replace(/£\s+/g, '£').replace(/,(\d{2})\b/, '.$1');
    if (!s) return '';
    if (/^\d+(\.\d{1,2})?$/.test(s)) s = `£${s}`;
    return s.replace(/(\d)P\b/, '$1p');
}

/** Tidy an offer line: "2 for £ 20.00" → "2 for £20.00". */
export function tidyOffer(raw) {
    return tidy(raw).replace(/£\s+/g, '£').replace(/\b(\d+\.\d{2})\b(?!\s*%)/g, (m, p, i, all) => (all[i - 1] === '£' ? m : `£${p}`));
}

/** Split "£12.99" for display: big pounds, small pence. */
export function splitPrice(price) {
    const s = tidy(price);
    let m = s.match(/^£(\d+)(?:\.(\d{1,2}))?$/);
    if (m) return { cur: '£', whole: m[1], frac: m[2] ? m[2].padEnd(2, '0') : '' };
    m = s.match(/^(\d+)p$/i);
    if (m) return { cur: '', whole: m[1], frac: '', suffix: 'p' };
    return { cur: '', whole: s, frac: '' };
}

/**
 * Turn typed lines into products. Written for how shop owners actually type:
 *   HAYATI 6000 each £12.99
 *   2 for £20.00
 *   Pablo all flavours each £5.99
 *   2 for £10.00
 * A line with a name starts a product; a line that is only an offer
 * ("2 for…", "buy…", "was…") or only a price belongs to the product above.
 */
export function parseOffers(text) {
    const out = [];
    const lines = String(text || '').split(/\r?\n/).map(tidy).filter(Boolean);
    for (let line of lines) {
        line = line.replace(/^(?:[-•*·]\s+|\d+[.)]\s+)/, '');          // "1) Milk £1" / "- Milk £1"
        const last = out[out.length - 1];

        if (OFFER_START_RE.test(line)) {
            if (!last) continue;
            const was = line.match(/^was\s+(.+)$/i);
            if (was) last.was = tidyPrice(was[1].replace(/\bnow\b.*$/i, ''));
            else last.offer = last.offer ? `${last.offer} · ${tidyOffer(line)}` : tidyOffer(line);
            continue;
        }

        const pm = line.match(PRICE_RE);
        if (!pm) { out.push(blank({ name: line })); continue; }

        const before = tidy(line.slice(0, pm.index));
        const after = tidy(line.slice(pm.index + pm[0].length));
        const price = tidyPrice(pm[0]);

        if (!before.replace(UNIT_RE, '').trim()) {                    // only a price (maybe "each £1.99")
            if (last && !last.price) {
                last.price = price;
                const u = (before + ' ' + after).match(UNIT_RE);
                if (u && !last.unit) last.unit = unitWord(u[0]);
            } else if (last) {
                last.offer = last.offer ? `${last.offer} · ${tidyOffer(line)}` : tidyOffer(line);
            }
            continue;
        }

        const p = blank({ price });
        let name = before;
        const u = name.match(new RegExp(UNIT_RE.source + '\\s*$', 'i')) || after.match(new RegExp('^' + UNIT_RE.source, 'i'));
        if (u) { p.unit = unitWord(u[0]); name = tidy(name.replace(new RegExp(UNIT_RE.source + '\\s*$', 'i'), '')); }
        let rest = tidy(after.replace(new RegExp('^' + UNIT_RE.source, 'i'), '')).replace(/^(or|and|,|-|–|\/|\|)\s*/i, '');
        if (rest) p.offer = tidyOffer(rest);
        const d = name.match(DETAIL_RE);
        if (d) { p.detail = d[0]; name = tidy(name.replace(DETAIL_RE, '')); }
        p.name = tidy(name.replace(/[-–:,]+$/, ''));
        out.push(p);
    }
    return cleanProducts(out);
}

function unitWord(u) {
    const s = tidy(u).toLowerCase().replace(/\.$/, '');
    if (s === 'ea') return 'each';
    if (/kg/.test(s)) return 'per kg';
    if (/pack/.test(s)) return 'per pack';
    if (/litre/.test(s)) return 'per litre';
    return s === 'only' || s === 'just' || s === 'now' ? '' : 'each';
}

const blank = (o = {}) => ({ name: '', detail: '', price: '', unit: '', offer: '', was: '', image_url: '', ...o });

/** Safe, trimmed product list for saving and drawing. */
export function cleanProducts(list = []) {
    return (Array.isArray(list) ? list : [])
        .map(p => ({
            name: clip(p?.name, 48),
            detail: clip(p?.detail, 40),
            price: clip(tidyPrice(p?.price), 14),
            unit: clip(p?.unit, 12),
            offer: clip(p?.offer, 44),
            was: clip(tidyPrice(p?.was), 14),
            image_url: /^https?:\/\//.test(String(p?.image_url || '')) ? String(p.image_url) : '',
        }))
        .filter(p => p.name || p.price)
        .slice(0, MAX_PRODUCTS);
}

export const newProduct = () => blank();

/** Words that suggest the ad needs an 18+ mark. A hint only — the owner has the switch. */
const AGE_RE = /\b(vapes?|vaping|e-?liquids?|nic(otine)?|pouch(es)?|snus|cigars?|cigarettes?|tobacco|beers?|lager|cider|wines?|vodka|whisk(e)?y|gin|rum|brandy|spirits?|alcohol|lottery|scratch\s?cards?|hayati|elf\s?bar|lost\s?mary|pablo|velo|zyn|nordic\s?spirit)\b/i;
export const looksAgeRestricted = (products = []) => products.some(p => AGE_RE.test(`${p?.name} ${p?.detail}`));

/** How many columns and rows for n products on a wide or tall screen. */
export function gridFor(n, portrait) {
    const c = Math.max(1, Math.min(MAX_PRODUCTS, n));
    if (portrait) return c <= 3 ? { cols: 1, rows: c } : { cols: 2, rows: Math.ceil(c / 2) };
    if (c <= 3) return { cols: c, rows: 1 };
    return c === 4 ? { cols: 2, rows: 2 } : { cols: 3, rows: 2 };
}

/** AI picture request for one product: a clean pack shot, never any text. */
export function aiProductPrompt(p) {
    const what = [p?.name, p?.detail].map(tidy).filter(Boolean).join(', ').slice(0, 120);
    return `Professional e-commerce product photograph of a single retail product: ${what}. ` +
        'Centred on a pure white seamless background, soft natural shadow, sharp focus, fills most of the frame, square composition. ' +
        'If the exact packaging is not known, show a plain, believable generic version of this kind of product. ' +
        'No added text, no price tags, no stickers, no badges, no hands, no people, no props.';
}

export function offerTitle(products = [], title = '') {
    const names = products.map(p => p.name).filter(Boolean);
    return clip(title || names.slice(0, 2).join(' + ') || 'Shop offer', 80);
}

export const newOfferId = () => `of_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The live layer saved on the playlist item and drawn by OfferSlide. */
export function buildOfferOverlay({ offerId, template, accent, title, footer, products, logoUrl, endsAt, ageBadge }) {
    const ends = endsAt ? new Date(endsAt) : null;
    return {
        kind: 'price_offer',
        ad_type: 'price_offer',
        offer_id: offerId || newOfferId(),
        template: (OFFER_TEMPLATES.find(t => t.value === template) || OFFER_TEMPLATES[0]).value,
        accent: HEX.test(String(accent)) ? accent : '#f97316',
        headline: clip(title, 40),
        cta: clip(footer, 60),
        products: cleanProducts(products),
        logo_url: logoUrl || '',
        age_badge: !!ageBadge,
        ...(ends && !Number.isNaN(ends.getTime()) ? { promo_expires_at: ends.toISOString() } : {}),
    };
}

export const isPriceOffer = (item) => item?.ad_overlay?.kind === 'price_offer';

/** Every picture a price-offer needs offline (for the screen's cache). */
export const offerImageUrls = (item) =>
    isPriceOffer(item) ? (item.ad_overlay.products || []).map(p => p?.image_url).filter(Boolean) : [];

/** End of the chosen day, UK time, from a yyyy-mm-dd date box. */
export function endOfDayUK(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
    // 23:59:59 London: try both possible offsets and keep the one that lands on that date.
    for (const off of ['+00:00', '+01:00']) {
        const d = new Date(`${dateStr}T23:59:59${off}`);
        const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d);
        const get = (t) => local.find(x => x.type === t)?.value;
        if (`${get('year')}-${get('month')}-${get('day')}` === dateStr && get('hour') === '23') return d;
    }
    return new Date(`${dateStr}T23:59:59Z`);
}

export function endsLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `Ends ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).format(d)}`;
}
