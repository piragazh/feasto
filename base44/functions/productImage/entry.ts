import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Product pictures for shop price-offer ads (Screen Studio).
 *
 *   { action: 'search', restaurant_id, query }       → candidate pack shots
 *   { action: 'import', restaurant_id, url, name }   → copies one picture into
 *                                                      MealDrop storage and returns its address
 *
 * Search uses the Open Food Facts family of open product databases (food,
 * household, beauty): real photos of real packs, under an open licence.
 * Pictures are always copied into our own storage before use, so screens can
 * cache them offline and never depend on someone else's website.
 */

const UA = 'MealDrop-ScreenStudio/1.0 (https://mealdrop.base44.app)';
const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const json = (body, status = 200) => Response.json(body, { status });

async function canManage(base44, user, restaurantId) {
    if (!user || !restaurantId) return false;
    if (user.role === 'admin') return true;
    const managers = await base44.asServiceRole.entities.RestaurantManager.filter({ user_email: user.email });
    return managers.some(m => m.is_active !== false && Array.isArray(m.restaurant_ids) && m.restaurant_ids.includes(restaurantId));
}

async function getJson(url, ms = 9000) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(ms) });
        if (!res.ok) return null;
        const type = res.headers.get('content-type') || '';
        if (!type.includes('json')) return null;                 // their "temporarily unavailable" page is HTML
        return await res.json();
    } catch {
        return null;
    }
}

const asText = (v) => Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v || '');

export function toCandidates(rows, source) {
    return (Array.isArray(rows) ? rows : [])
        .map(r => ({
            url: r?.image_front_url || r?.image_url || '',
            thumb: r?.image_front_small_url || r?.image_front_url || r?.image_url || '',
            name: asText(r?.product_name).slice(0, 80),
            brand: asText(r?.brands).slice(0, 60),
            size: asText(r?.quantity).slice(0, 30),
            uk: Array.isArray(r?.countries_tags) ? r.countries_tags.includes('en:united-kingdom') : false,
            source,
        }))
        .filter(c => /^https:\/\//.test(c.url));
}

const FIELDS = 'code,product_name,brands,quantity,image_front_url,image_front_small_url,countries_tags';

async function searchAll(query) {
    const q = encodeURIComponent(query);
    const legacy = (host) => `https://${host}/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=12&fields=${FIELDS}`;
    const [fast, household, beauty] = await Promise.all([
        getJson(`https://search.openfoodfacts.org/search?q=${q}&page_size=16&fields=${FIELDS}`),
        getJson(legacy('world.openproductsfacts.org')),
        getJson(legacy('world.openbeautyfacts.org')),
    ]);
    let food = toCandidates(fast?.hits, 'Open Food Facts');
    if (!food.length) food = toCandidates((await getJson(legacy('world.openfoodfacts.org')))?.products, 'Open Food Facts');
    const all = [
        ...food,
        ...toCandidates(household?.products, 'Open Products Facts'),
        ...toCandidates(beauty?.products, 'Open Beauty Facts'),
    ];
    // Best name match first, then UK packs (the packaging local customers know). No duplicates.
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
    const score = (c) => {
        const hay = `${c.brand} ${c.name} ${c.size}`.toLowerCase();
        return words.filter(w => hay.includes(w)).length + (c.uk ? 0.5 : 0);
    };
    const seen = new Set();
    return all
        .filter(c => !seen.has(c.url) && seen.add(c.url))
        .map(c => ({ ...c, match: score(c) }))
        .sort((a, b) => b.match - a.match)
        .slice(0, 18);
}

/** Only public https web addresses — never this server's own network. */
export function safePublicUrl(raw) {
    let u;
    try { u = new URL(String(raw)); } catch { return null; }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (u.port && u.port !== '443') return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return null;
    if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;   // no raw IP addresses
    return u;
}

async function fetchImage(rawUrl) {
    let url = safePublicUrl(rawUrl);
    for (let hop = 0; url && hop < 4; hop++) {
        const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept': 'image/*' }, signal: AbortSignal.timeout(15000) });
        if (res.status >= 300 && res.status < 400) {
            const next = res.headers.get('location');
            await res.body?.cancel();
            url = next ? safePublicUrl(new URL(next, url).toString()) : null;
            continue;
        }
        if (!res.ok) throw new Error("That picture couldn't be downloaded");
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!IMAGE_TYPES[type]) throw new Error('That link is not a JPG, PNG or WebP picture');
        if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('That picture is too large (over 8 MB)');
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length > MAX_BYTES) throw new Error('That picture is too large (over 8 MB)');
        if (bytes.length < 200) throw new Error('That picture is empty');
        return { bytes, type };
    }
    throw new Error("That link can't be used. Use the picture's own https address.");
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return json({ error: 'Please sign in' }, 401);

        const body = await req.json().catch(() => ({}));
        const restaurantId = typeof body.restaurant_id === 'string' ? body.restaurant_id : '';
        if (!(await canManage(base44, user, restaurantId))) return json({ error: 'Not allowed' }, 403);

        if (body.action === 'search') {
            const query = String(body.query || '').replace(/\s+/g, ' ').trim().slice(0, 80);
            if (query.length < 2) return json({ error: 'Type a product name' }, 400);
            return json({ results: await searchAll(query) });
        }

        if (body.action === 'import') {
            let img;
            try { img = await fetchImage(body.url); } catch (e) { return json({ error: e.message }, 400); }
            const safeName = String(body.name || 'product').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'product';
            const file = new File([img.bytes], `${safeName}.${IMAGE_TYPES[img.type]}`, { type: img.type });
            const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
            if (!up?.file_url) return json({ error: 'The picture could not be saved' }, 500);
            return json({ file_url: up.file_url });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error) {
        console.error('productImage error:', error);
        return json({ error: error.message || 'Something went wrong' }, 500);
    }
});
