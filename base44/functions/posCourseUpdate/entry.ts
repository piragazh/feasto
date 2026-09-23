/**
 * posCourseUpdate — set a line's course/seat, or fire a course
 *
 * WHY THIS EXISTS RATHER THAN USING posUpdateOrder
 *   posUpdateOrder re-prices every line from the live menu, which is right when
 *   items change. It is wrong here: firing mains must never alter a bill. If a
 *   price changed after the table ordered, routing a fire through that path
 *   would quietly re-price their food.
 *
 *   So this can only ever write course, seat, fired and fired_at. Prices,
 *   quantities, the items themselves and every total are untouchable here - the
 *   existing lines are read from the database and written back with only those
 *   four fields changed.
 *
 * HELD vs FIRED
 *   Both are explicit. A waiter who believes mains were sent must be able to see
 *   that they weren't - see src/lib/pos-course-logic.js.
 *
 * SYNC RULE: courseOf / fireCourse mirror src/lib/pos-course-logic.js.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const COURSES = ['drinks', 'starters', 'mains', 'desserts'];
const DEFAULT_COURSE = 'mains';

// ── Mirrors of the tested logic ────────────────────────────────────────────
function courseOf(item) {
    const c = String(item?.course || '').trim().toLowerCase();
    return COURSES.includes(c) ? c : DEFAULT_COURSE;
}

function fireCourse(items = [], course, at = new Date()) {
    const target = COURSES.includes(course) ? course : DEFAULT_COURSE;
    const stamp = at instanceof Date ? at.toISOString() : String(at);
    return (items || []).map(item => (
        courseOf(item) === target && item?.fired !== true
            ? { ...item, fired: true, fired_at: stamp }
            : item
    ));
}
// ────────────────────────────────────────────────────────────────────────────

async function verifyStaffSession(token, restaurantId) {
    try {
        if (!token || typeof token !== 'string') return null;
        const secret = Deno.env.get('STAFF_SESSION_SECRET');
        if (!secret) return null;
        const [body, sig] = token.split('.');
        if (!body || !sig) return null;
        const key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        );
        const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
        const hex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (hex.length !== sig.length) return null;
        let diff = 0;
        for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
        if (diff !== 0) return null;
        const payload = JSON.parse(atob(body));
        if (payload.exp && new Date(payload.exp) < new Date()) return null;
        if (restaurantId && payload.restaurant_id !== restaurantId) return null;
        return payload;
    } catch { return null; }
}

/**
 * Rebuild the items list from what is IN THE DATABASE, changing only the four
 * allowed fields. Anything else the caller sent is ignored, so a crafted request
 * cannot reprice a line through this endpoint.
 */
function applyAssignments(dbItems, assignments) {
    const byIndex = new Map(
        (Array.isArray(assignments) ? assignments : [])
            .filter(a => Number.isInteger(Number(a?.index)))
            .map(a => [Number(a.index), a]),
    );
    return (dbItems || []).map((item, i) => {
        const a = byIndex.get(i);
        if (!a) return item;
        const next = { ...item };
        if (a.course !== undefined) {
            next.course = COURSES.includes(String(a.course).toLowerCase())
                ? String(a.course).toLowerCase() : undefined;
        }
        if (a.seat !== undefined) {
            const seat = Math.floor(Number(a.seat));
            next.seat = Number.isFinite(seat) && seat > 0 && seat <= 99 ? seat : undefined;
        }
        return next;
    });
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { action, order_id, course, assignments, covers, staff_session } = await req.json();
        if (!order_id || !action) {
            return Response.json({ error: 'order_id and action are required' }, { status: 400 });
        }

        const rows = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        const order = rows?.[0];
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

        // ── Tenant check ─────────────────────────────────────────────────────
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email, is_active: true,
            });
            if (!managers.some(m => m.restaurant_ids?.includes(order.restaurant_id))) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Courses only make sense before an order is finished.
        if (['cancelled', 'refunded', 'collected', 'delivered'].includes(order.status)) {
            return Response.json({ error: 'This order is already finished.' }, { status: 409 });
        }

        const staff = await verifyStaffSession(staff_session, order.restaurant_id);
        const patch = {};

        if (action === 'assign') {
            patch.items = applyAssignments(order.items, assignments);
            if (covers !== undefined) {
                const c = Math.floor(Number(covers));
                if (Number.isFinite(c) && c >= 0 && c <= 99) patch.covers = c;
            }
        } else if (action === 'fire') {
            if (!COURSES.includes(String(course || '').toLowerCase())) {
                return Response.json({ error: `Unknown course: ${course}` }, { status: 400 });
            }
            patch.items = fireCourse(order.items, String(course).toLowerCase());
        } else {
            return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }

        const updated = await base44.asServiceRole.entities.Order.update(order.id, patch);

        if (action === 'fire') {
            try {
                await base44.asServiceRole.entities.PosAuditLog.create({
                    restaurant_id: order.restaurant_id,
                    action: 'course.fire',
                    outcome: 'allowed',
                    staff_id: staff?.staff_id,
                    staff_name: staff?.staff_name,
                    staff_role: staff?.role,
                    order_id: order.id,
                    detail: `Fired ${course} on ${order.table_number || 'order ' + String(order.id).slice(-6)}`,
                });
            } catch { /* never fail a fire because the audit write failed */ }
        }

        return Response.json({ order: updated });
    } catch (error) {
        console.error('[COURSE] error:', error?.message || error);
        return Response.json({ error: 'Could not update the course' }, { status: 500 });
    }
});
