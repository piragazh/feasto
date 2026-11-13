import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * AI pictures for the Ad Creator, with a weekly allowance per store.
 *
 *   { action: 'status', restaurant_id }
 *       → { limit, used, remaining, resets_at, exempt }
 *   { action: 'image', restaurant_id, prompts: [..1-3], existing_image_urls?, kind }
 *       → { urls, requested, note?, status }
 *
 * Rules
 *  - The allowance is Restaurant.ai_pictures_per_week (admin-only field).
 *    Not set → DEFAULT_PER_WEEK. 0 → AI pictures switched off for that store.
 *  - A week runs Monday 00:00 to Sunday 23:59, UK time.
 *  - One picture = one from the allowance. Pictures that fail are not charged.
 *  - MealDrop admins are never blocked; their pictures are logged but not
 *    taken from the store's allowance.
 */

export const DEFAULT_PER_WEEK = 5;
const MAX_PER_REQUEST = 3;

const json = (body, status = 200) => Response.json(body, { status });

async function canManage(base44, user, restaurantId) {
    if (!user || !restaurantId) return false;
    if (user.role === 'admin') return true;
    const managers = await base44.asServiceRole.entities.RestaurantManager.filter({ user_email: user.email });
    return managers.some(m => m.is_active !== false && Array.isArray(m.restaurant_ids) && m.restaurant_ids.includes(restaurantId));
}

const UK = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function ukParts(date) {
    const p = Object.fromEntries(UK.formatToParts(date).map(x => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, dow: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) };
}
/** The instant at which UK clocks show the given wall time. */
function ukWallToInstant(y, m, d) {
    const wall = Date.UTC(y, m - 1, d, 0, 0, 0);
    let guess = wall;
    for (let i = 0; i < 2; i++) {                                    // settle the GMT/BST offset at that moment
        const p = ukParts(new Date(guess));
        const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
        guess -= shown - wall;
    }
    return new Date(guess);
}
/** The allowance week containing `now`: Monday 00:00 UK → next Monday 00:00 UK. */
export function ukWeek(now = new Date()) {
    const p = ukParts(now);
    return { start: ukWallToInstant(p.y, p.m, p.d - p.dow), end: ukWallToInstant(p.y, p.m, p.d - p.dow + 7) };
}

/** null/undefined/blank → default; otherwise a whole number from 0 to 500. */
export function weeklyLimit(restaurant) {
    const raw = restaurant?.ai_pictures_per_week;
    if (raw === null || raw === undefined || raw === '') return DEFAULT_PER_WEEK;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? Math.min(500, Math.max(0, n)) : DEFAULT_PER_WEEK;
}

async function usage(sr, restaurantId, weekStartIso) {
    const rows = await sr.entities.AiGenerationLog.filter({ restaurant_id: restaurantId, week_start: weekStartIso });
    return rows.filter(r => r.counted !== false).reduce((sum, r) => sum + (Number(r.count) || 0), 0);
}

const cleanUrls = (list) => (Array.isArray(list) ? list : [])
    .filter(u => typeof u === 'string' && /^https:\/\//.test(u) && u.length < 1000).slice(0, 3);

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const sr = base44.asServiceRole;
        const user = await base44.auth.me().catch(() => null);
        if (!user) return json({ error: 'Please sign in' }, 401);

        const body = await req.json().catch(() => ({}));
        const restaurantId = typeof body.restaurant_id === 'string' ? body.restaurant_id : '';
        if (!(await canManage(base44, user, restaurantId))) return json({ error: 'Not allowed' }, 403);

        const restaurant = (await sr.entities.Restaurant.filter({ id: restaurantId }))[0];
        if (!restaurant) return json({ error: 'Store not found' }, 404);

        const exempt = user.role === 'admin';
        const limit = weeklyLimit(restaurant);
        const week = ukWeek();
        const weekStart = week.start.toISOString();
        const status = async () => {
            const used = await usage(sr, restaurantId, weekStart);
            return { limit, used, remaining: Math.max(0, limit - used), resets_at: week.end.toISOString(), exempt };
        };

        if (body.action === 'status') return json(await status());

        if (body.action === 'image') {
            const prompts = (Array.isArray(body.prompts) ? body.prompts : [])
                .filter(p => typeof p === 'string' && p.trim().length >= 10)
                .map(p => p.slice(0, 4000))
                .slice(0, MAX_PER_REQUEST);
            if (!prompts.length) return json({ error: 'Nothing to draw' }, 400);
            const refs = cleanUrls(body.existing_image_urls);
            const kind = body.kind === 'product_picture' ? 'product_picture' : 'menu_ad';

            let allowed = prompts.length;
            let note = '';
            if (!exempt) {
                const before = await status();
                if (limit === 0) {
                    return json({ error: 'AI pictures are switched off for this store. You can still upload your own photos. Contact MealDrop to turn them on.', code: 'ai_off', status: before }, 403);
                }
                if (before.remaining <= 0) {
                    return json({ error: `You've used all ${limit} AI pictures for this week. More are added on Monday. You can still upload your own photos.`, code: 'allowance_used', status: before }, 429);
                }
                if (before.remaining < allowed) {
                    allowed = before.remaining;
                    note = `Only ${allowed} AI picture${allowed === 1 ? '' : 's'} left this week, so ${allowed} ${allowed === 1 ? 'was' : 'were'} made.`;
                }
            }

            // Take the pictures from the allowance BEFORE drawing, so two requests
            // sent at the same moment can't both spend the last one.
            const log = await sr.entities.AiGenerationLog.create({
                restaurant_id: restaurantId, week_start: weekStart, count: allowed, counted: !exempt,
                kind, user_email: user.email, status: 'reserved',
            });

            // Two requests sent at the same moment can both pass the check above.
            // Settle it: reservations are served oldest first, and this one only
            // keeps what is left after the ones before it.
            if (!exempt) {
                const rows = (await sr.entities.AiGenerationLog.filter({ restaurant_id: restaurantId, week_start: weekStart }))
                    .filter(r => r.counted !== false);
                if (!rows.some(r => r.id === log.id)) rows.push(log);
                rows.sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)));
                const usedBefore = rows.slice(0, rows.findIndex(r => r.id === log.id))
                    .reduce((sum, r) => sum + (Number(r.count) || 0), 0);
                const fair = Math.max(0, Math.min(allowed, limit - usedBefore));
                if (fair === 0) {
                    await sr.entities.AiGenerationLog.delete(log.id).catch(() => {});
                    return json({ error: `You've used all ${limit} AI pictures for this week. More are added on Monday. You can still upload your own photos.`, code: 'allowance_used', status: await status() }, 429);
                }
                if (fair < allowed) {
                    allowed = fair;
                    note = `Only ${allowed} AI picture${allowed === 1 ? '' : 's'} left this week, so ${allowed} ${allowed === 1 ? 'was' : 'were'} made.`;
                    await sr.entities.AiGenerationLog.update(log.id, { count: allowed }).catch(() => {});
                }
            }

            const results = await Promise.allSettled(prompts.slice(0, allowed).map(prompt =>
                sr.integrations.Core.GenerateImage({ prompt, ...(refs.length ? { existing_image_urls: refs } : {}) })));
            const urls = results.filter(r => r.status === 'fulfilled' && r.value?.url).map(r => r.value.url);
            const firstError = results.find(r => r.status === 'rejected')?.reason;

            // Only pictures that were actually made are charged.
            try {
                if (urls.length) await sr.entities.AiGenerationLog.update(log.id, { count: urls.length, status: 'done' });
                else await sr.entities.AiGenerationLog.delete(log.id);
            } catch (e) {
                console.error('aiGenerate: could not settle log', log.id, e);
            }

            return json({
                urls,
                requested: prompts.length,
                ...(note ? { note } : {}),
                ...(urls.length ? {} : { error: firstError?.message || 'The picture could not be made' }),
                status: await status(),
            });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error) {
        console.error('aiGenerate error:', error);
        return json({ error: error.message || 'Something went wrong' }, 500);
    }
});
