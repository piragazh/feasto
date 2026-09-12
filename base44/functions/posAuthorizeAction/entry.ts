/**
 * posAuthorizeAction — manager override for a permission the actor lacks
 *
 * WHY THIS SHAPE
 *   Blocking a waiter outright during a rush is worse than useless — staff work
 *   around it by sharing a manager's PIN, which destroys attribution entirely.
 *   So nothing is hard-blocked: the POS asks someone with the permission to
 *   authorise, the action proceeds, and BOTH identities are recorded.
 *
 *   That is the whole point of the audit trail. "Order voided by Anvika,
 *   authorised by Ithalika" is useful; "order voided" is not.
 *
 * RETURNS
 *   An override token the caller passes to the real action (void, discount,
 *   etc). Single action, short lived, bound to the permission it was granted
 *   for — so an override obtained for a discount cannot be replayed to void an
 *   order.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const OVERRIDE_TTL_SECONDS = 120;   // long enough to complete the action, short enough not to be reusable later
const PBKDF2_ITERATIONS = 100000;

// Mirrors src/lib/posPermissions.js — functions are self-contained on this
// platform, so the defaults are duplicated rather than imported. Keep in step.
const DEFAULT_ROLE_PERMISSIONS = {
    waiter: ['order.create', 'table.move'],
    cashier: ['order.create', 'payment.take', 'order.edit', 'discount.apply', 'coupon.apply', 'drawer.no_sale', 'table.move'],
    kitchen_staff: [],
    manager: [
        'order.create', 'order.edit', 'order.void', 'payment.take', 'payment.refund',
        'discount.apply', 'discount.over_limit', 'coupon.apply', 'drawer.no_sale',
        'table.move', 'table.merge', 'reports.view', 'eod.run', 'staff.manage', 'settings.manage',
    ],
};

function toHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin, salt) {
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(String(pin)), { name: 'PBKDF2' }, false, ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        key, 256,
    );
    return toHex(bits);
}

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function sign(payload, secret) {
    const body = btoa(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    return `${body}.${toHex(sig)}`;
}

function roleHasPermission(rolePermissions, role, permission) {
    const map = (rolePermissions && Object.keys(rolePermissions).length > 0)
        ? rolePermissions
        : DEFAULT_ROLE_PERMISSIONS;
    const granted = map[role];
    return Array.isArray(granted) && granted.includes(permission);
}

async function audit(base44, entry) {
    try {
        await base44.asServiceRole.entities.PosAuditLog.create(entry);
    } catch (e) {
        console.error('[OVERRIDE] audit write failed:', e?.message || e);
    }
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const {
            restaurant_id,
            permission,
            staff_number,
            pin,
            acting_staff_id,
            acting_staff_name,
            acting_staff_role,
            context,          // free text shown in the audit trail, e.g. "Void order #1043 — £46.99"
            order_id,
            amount,
            terminal,
        } = await req.json();

        if (!restaurant_id || !permission || !staff_number) {
            return Response.json({ error: 'restaurant_id, permission and staff_number are required' }, { status: 400 });
        }

        // ── Tenant check ─────────────────────────────────────────────────────
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email, is_active: true,
            });
            if (!managers.some(m => m.restaurant_ids?.includes(restaurant_id))) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // ── Find the authoriser ──────────────────────────────────────────────
        const rows = await base44.asServiceRole.entities.StaffMember.filter({
            restaurant_id,
            staff_number: String(staff_number).trim(),
        });
        const approver = rows?.[0];

        const GENERIC = { authorized: false, error: 'Incorrect staff number or PIN' };

        if (!approver || approver.is_active === false) {
            return Response.json(GENERIC, { status: 401 });
        }

        if (approver.pin_locked_until && new Date(approver.pin_locked_until) > new Date()) {
            return Response.json({
                authorized: false,
                error: 'That staff member is locked out from too many incorrect attempts.',
            }, { status: 429 });
        }

        // ── Verify their PIN ─────────────────────────────────────────────────
        let pinOk = false;
        if (approver.pin_hash && approver.pin_salt) {
            pinOk = safeEqual(await hashPin(pin, approver.pin_salt), approver.pin_hash);
        } else if (approver.pin) {
            pinOk = safeEqual(String(pin), String(approver.pin));
        } else {
            // No credential set - cannot be used to authorise anything, because an
            // approval that anyone could give is not an approval.
            return Response.json({
                authorized: false,
                error: 'That staff member has no PIN set and cannot authorise actions.',
            }, { status: 403 });
        }

        if (!pinOk) {
            const attempts = (approver.pin_failed_attempts || 0) + 1;
            const patch = { pin_failed_attempts: attempts };
            if (attempts >= 5) {
                patch.pin_locked_until = new Date(Date.now() + 15 * 60000).toISOString();
                patch.pin_failed_attempts = 0;
            }
            await base44.asServiceRole.entities.StaffMember.update(approver.id, patch);

            await audit(base44, {
                restaurant_id,
                action: permission,
                outcome: 'denied',
                staff_id: acting_staff_id,
                staff_name: acting_staff_name,
                staff_role: acting_staff_role,
                authorised_by_staff_id: approver.id,
                authorised_by_name: approver.full_name,
                order_id,
                amount,
                terminal,
                detail: `Override refused - incorrect PIN for ${approver.full_name}`,
            });
            return Response.json(GENERIC, { status: 401 });
        }

        // ── Do they actually hold the permission? ────────────────────────────
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id });
        const rolePermissions = restaurants?.[0]?.role_permissions;

        if (!roleHasPermission(rolePermissions, approver.role, permission)) {
            await audit(base44, {
                restaurant_id,
                action: permission,
                outcome: 'denied',
                staff_id: acting_staff_id,
                staff_name: acting_staff_name,
                staff_role: acting_staff_role,
                authorised_by_staff_id: approver.id,
                authorised_by_name: approver.full_name,
                order_id,
                amount,
                terminal,
                detail: `${approver.full_name} (${approver.role}) does not hold ${permission}`,
            });
            return Response.json({
                authorized: false,
                error: `${approver.full_name} is not permitted to authorise this either.`,
            }, { status: 403 });
        }

        await base44.asServiceRole.entities.StaffMember.update(approver.id, {
            pin_failed_attempts: 0,
            pin_locked_until: null,
        });

        // ── Issue a narrow, short-lived override token ───────────────────────
        const secret = Deno.env.get('STAFF_SESSION_SECRET');
        let token = null;
        if (secret) {
            token = await sign({
                kind: 'override',
                permission,                      // bound to this permission only
                restaurant_id,
                order_id: order_id || null,
                approver_id: approver.id,
                approver_name: approver.full_name,
                exp: new Date(Date.now() + OVERRIDE_TTL_SECONDS * 1000).toISOString(),
            }, secret);
        } else {
            console.error('[OVERRIDE] STAFF_SESSION_SECRET not set — no override token issued.');
        }

        await audit(base44, {
            restaurant_id,
            action: permission,
            outcome: 'overridden',
            staff_id: acting_staff_id,
            staff_name: acting_staff_name,
            staff_role: acting_staff_role,
            authorised_by_staff_id: approver.id,
            authorised_by_name: approver.full_name,
            order_id,
            amount,
            terminal,
            detail: context || `Authorised ${permission}`,
        });

        return Response.json({
            authorized: true,
            override: token,
            approver: { id: approver.id, name: approver.full_name, role: approver.role },
        });
    } catch (error) {
        console.error('[OVERRIDE] error:', error?.message || error);
        return Response.json({ error: 'Could not authorise this action' }, { status: 500 });
    }
});
