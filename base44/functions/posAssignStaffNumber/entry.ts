/**
 * posAssignStaffNumber — allocate a unique staff number within a restaurant
 *
 * WHY THIS EXISTS
 *   Staff numbers were typed by hand with no uniqueness check, so two people
 *   could hold the same number. That is harmless while the number is only a
 *   label, but it becomes a real problem once it is a LOGIN CREDENTIAL: a
 *   duplicate means the wrong person can be authenticated, and every sale,
 *   void and discount is then attributed to whichever record happened to be
 *   found first.
 *
 *   Uniqueness has to be decided server-side. Two managers adding staff at the
 *   same time on different devices would otherwise both read "next is 1004" and
 *   both write it.
 *
 * SCOPE
 *   Unique per restaurant, not globally. Restaurant A and Restaurant B may both
 *   have a 1001 — they are separate tills with separate staff.
 *
 * FORMAT
 *   Numeric, starting at 1001. Numeric because staff type it on a PIN pad;
 *   letters like "S001" are painful on a numeric keypad and invite typos.
 *
 * ACTIONS
 *   suggest  → the next free number, without reserving it (for a create form)
 *   validate → is this number free? (for manual entry)
 *   backfill → assign numbers to staff who have none or share a duplicate
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const START_AT = 1001;

function normalise(n) {
    return String(n ?? '').trim();
}

/** Lowest free number at or above START_AT. */
function nextFree(taken) {
    let n = START_AT;
    while (taken.has(String(n))) n++;
    return String(n);
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurant_id, action = 'suggest', staff_number, staff_id } = await req.json();
        if (!restaurant_id) {
            return Response.json({ error: 'restaurant_id required' }, { status: 400 });
        }

        // ── Tenant check ─────────────────────────────────────────────────────
        const isAdmin = user.role === 'admin';
        if (!isAdmin) {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            if (!managers.some(m => m.restaurant_ids?.includes(restaurant_id))) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        const staff = await base44.asServiceRole.entities.StaffMember.filter({ restaurant_id });

        // Numbers in use, excluding the record being edited so a staff member
        // can keep their own number when saving other changes.
        const taken = new Set(
            staff
                .filter(s => s.id !== staff_id)
                .map(s => normalise(s.staff_number))
                .filter(Boolean),
        );

        if (action === 'suggest') {
            return Response.json({ staff_number: nextFree(taken) });
        }

        if (action === 'validate') {
            const candidate = normalise(staff_number);
            if (!candidate) {
                return Response.json({ valid: false, error: 'Staff number is required' });
            }
            if (!/^\d{3,6}$/.test(candidate)) {
                return Response.json({
                    valid: false,
                    error: 'Use 3 to 6 digits — staff type this on a number pad',
                });
            }
            if (taken.has(candidate)) {
                return Response.json({
                    valid: false,
                    error: `${candidate} is already used by another staff member`,
                    suggestion: nextFree(taken),
                });
            }
            return Response.json({ valid: true, staff_number: candidate });
        }

        if (action === 'backfill') {
            // Assign to anyone missing a number, and to duplicates - keeping the
            // earliest-created holder of each number and renumbering the rest, so
            // existing staff keep the number they already know where possible.
            const seen = new Set();
            const ordered = [...staff].sort(
                (a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0),
            );

            const assigned = [];
            for (const s of ordered) {
                const current = normalise(s.staff_number);
                const needsNumber = !current || seen.has(current) || !/^\d{3,6}$/.test(current);
                if (!needsNumber) {
                    seen.add(current);
                    continue;
                }
                const next = nextFree(seen);
                seen.add(next);
                await base44.asServiceRole.entities.StaffMember.update(s.id, { staff_number: next });
                assigned.push({ staff_id: s.id, full_name: s.full_name, was: current || null, now: next });
            }

            console.log(`[STAFF-NUMBER] backfill restaurant=${restaurant_id} assigned=${assigned.length} actor=${user.email}`);
            return Response.json({ assigned, count: assigned.length });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (error) {
        console.error('[STAFF-NUMBER] error:', error?.message || error);
        return Response.json({ error: 'Could not allocate a staff number' }, { status: 500 });
    }
});
