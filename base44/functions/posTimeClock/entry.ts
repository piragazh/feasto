/**
 * posTimeClock — clock in / out / breaks, and manager corrections
 *
 * IDENTITY COMES FROM THE PIN SESSION, NEVER THE REQUEST
 *   Every action acts on the staff member named in the verified session token,
 *   not on a staff_id in the body. That is what prevents "buddy punching" -
 *   clocking in a colleague who is still on the bus. To clock someone in, they
 *   have to sign in with their own PIN.
 *
 *   The one exception is a manager correcting an entry, which is gated on the
 *   staff.manage permission and preserves the original times.
 *
 * NO PAY LOGIC HERE
 *   This function records instants. Hours and cost are computed by the labour
 *   report from src/lib/pos-labour-logic.js, which is tested and imported
 *   directly - so there is no server copy of the pay rules to drift out of step.
 *
 * ACTIONS
 *   status       → the caller's open shift, if any
 *   clock_in     → start a shift
 *   break_start  → begin an unpaid break
 *   break_end    → end it; its length is added to break_minutes
 *   clock_out    → end the shift (ends any running break first)
 *   correct      → manager edits an entry's times, with a reason
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

// Mirrors DEFAULT_ROLE_PERMISSIONS in src/lib/posPermissions.js
const DEFAULT_ROLE_PERMISSIONS = {
    waiter: ['order.create', 'table.move'],
    cashier: ['order.create', 'payment.take', 'order.edit', 'discount.apply', 'coupon.apply', 'drawer.no_sale', 'table.move'],
    kitchen_staff: [],
    manager: ['order.create', 'order.edit', 'order.void', 'payment.take', 'payment.refund', 'discount.apply',
        'discount.over_limit', 'coupon.apply', 'drawer.no_sale', 'table.move', 'table.merge', 'reports.view',
        'eod.run', 'staff.manage', 'settings.manage'],
};
const roleHas = (perms, role, p) => {
    const map = perms && Object.keys(perms).length ? perms : DEFAULT_ROLE_PERMISSIONS;
    return Array.isArray(map[role]) && map[role].includes(p);
};

const minutesBetween = (a, b) => Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 60000));

async function audit(base44, entry) {
    try { await base44.asServiceRole.entities.PosAuditLog.create(entry); }
    catch (e) { console.warn('[CLOCK] audit write failed:', e?.message); }
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { action, restaurant_id, staff_session } = body;
        if (!restaurant_id || !action) {
            return Response.json({ error: 'restaurant_id and action are required' }, { status: 400 });
        }

        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email, is_active: true,
            });
            if (!managers.some(m => m.restaurant_ids?.includes(restaurant_id))) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Clocking is meaningless without knowing WHO - there is no anonymous
        // clock-in. A missing or expired session is a hard stop here, unlike a
        // sale, which can still go through unattributed.
        const staff = await verifyStaffSession(staff_session, restaurant_id);
        if (!staff) {
            return Response.json({ error: 'Sign in with your staff number and PIN to clock in or out.' }, { status: 401 });
        }

        const now = new Date().toISOString();
        const openShift = async (staffId) => {
            const rows = await base44.asServiceRole.entities.TimeEntry.filter({
                restaurant_id, staff_id: staffId, status: 'open',
            });
            return rows?.[0] || null;
        };

        if (action === 'status') {
            return Response.json({ entry: await openShift(staff.staff_id) });
        }

        if (action === 'clock_in') {
            if (await openShift(staff.staff_id)) {
                return Response.json({ error: 'You are already clocked in.' }, { status: 409 });
            }
            const entry = await base44.asServiceRole.entities.TimeEntry.create({
                restaurant_id, staff_id: staff.staff_id, staff_name: staff.staff_name, staff_role: staff.role,
                clock_in: now, break_minutes: 0, status: 'open',
            });
            await audit(base44, {
                restaurant_id, action: 'clock.in', outcome: 'allowed',
                staff_id: staff.staff_id, staff_name: staff.staff_name, staff_role: staff.role,
            });
            return Response.json({ entry });
        }

        if (action === 'break_start' || action === 'break_end' || action === 'clock_out') {
            const entry = await openShift(staff.staff_id);
            if (!entry) return Response.json({ error: 'You are not clocked in.' }, { status: 409 });

            if (action === 'break_start') {
                if (entry.on_break_since) return Response.json({ error: 'You are already on a break.' }, { status: 409 });
                const updated = await base44.asServiceRole.entities.TimeEntry.update(entry.id, { on_break_since: now });
                return Response.json({ entry: updated });
            }

            if (action === 'break_end') {
                if (!entry.on_break_since) return Response.json({ error: 'You are not on a break.' }, { status: 409 });
                const updated = await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
                    break_minutes: Number(entry.break_minutes || 0) + minutesBetween(entry.on_break_since, now),
                    on_break_since: null,
                });
                return Response.json({ entry: updated });
            }

            // clock_out - a break still running is closed off first, so the
            // worker is not paid for time they spent on it.
            const breakMinutes = Number(entry.break_minutes || 0)
                + (entry.on_break_since ? minutesBetween(entry.on_break_since, now) : 0);
            const updated = await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
                clock_out: now, break_minutes: breakMinutes, on_break_since: null, status: 'closed',
            });
            await audit(base44, {
                restaurant_id, action: 'clock.out', outcome: 'allowed',
                staff_id: staff.staff_id, staff_name: staff.staff_name, staff_role: staff.role,
                detail: `Shift ${minutesBetween(entry.clock_in, now)} min, break ${breakMinutes} min`,
            });
            return Response.json({ entry: updated });
        }

        if (action === 'correct') {
            const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id });
            if (!roleHas(restaurants?.[0]?.role_permissions, staff.role, 'staff.manage')) {
                return Response.json({
                    error: 'Only a manager can correct a timesheet.',
                    requires_override: true, permission: 'staff.manage',
                }, { status: 403 });
            }
            const { entry_id, clock_in, clock_out, break_minutes, reason } = body;
            if (!reason || !String(reason).trim()) {
                return Response.json({ error: 'A reason is required to correct a timesheet.' }, { status: 400 });
            }
            const rows = await base44.asServiceRole.entities.TimeEntry.filter({ id: entry_id, restaurant_id });
            const entry = rows?.[0];
            if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });

            // Nobody corrects their own hours. Changing your own pay record is
            // exactly the case a correction trail exists to prevent.
            if (entry.staff_id === staff.staff_id) {
                return Response.json({ error: 'Another manager must correct your own timesheet.' }, { status: 403 });
            }

            const ci = clock_in ? new Date(clock_in) : new Date(entry.clock_in);
            const co = clock_out ? new Date(clock_out) : (entry.clock_out ? new Date(entry.clock_out) : null);
            if (!Number.isFinite(ci.getTime()) || (co && (!Number.isFinite(co.getTime()) || co <= ci))) {
                return Response.json({ error: 'Clock-out must be after clock-in.' }, { status: 400 });
            }
            const brk = break_minutes === undefined ? Number(entry.break_minutes || 0) : Math.max(0, Math.floor(Number(break_minutes)));

            const updated = await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
                clock_in: ci.toISOString(),
                clock_out: co ? co.toISOString() : null,
                break_minutes: brk,
                status: co ? 'closed' : 'open',
                on_break_since: co ? null : entry.on_break_since,
                // Preserve what was ORIGINALLY recorded - only set once, so a
                // second correction can't overwrite the true original.
                original_clock_in: entry.original_clock_in || entry.clock_in,
                original_clock_out: entry.original_clock_out || entry.clock_out || null,
                edited_by_staff_id: staff.staff_id,
                edited_by_name: staff.staff_name,
                edit_reason: String(reason).trim().slice(0, 300),
            });
            await audit(base44, {
                restaurant_id, action: 'clock.correct', outcome: 'allowed',
                staff_id: staff.staff_id, staff_name: staff.staff_name, staff_role: staff.role,
                detail: `Corrected ${entry.staff_name}'s shift: ${String(reason).trim().slice(0, 150)}`,
            });
            return Response.json({ entry: updated });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (error) {
        console.error('[CLOCK] error:', error?.message || error);
        return Response.json({ error: 'Time clock operation failed' }, { status: 500 });
    }
});
