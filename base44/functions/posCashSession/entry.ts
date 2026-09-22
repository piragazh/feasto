/**
 * posCashSession — cash drawer shifts: open, move cash, blind count, sign off
 *
 * WHY SERVER-SIDE
 *   The expected figure is computed here and NEVER returned before the count is
 *   submitted. A blind count only works if the person counting cannot see the
 *   target - otherwise a short drawer gets "counted" up to match, and a variance
 *   report becomes a report of how well staff can hide shortfalls.
 *
 *   The till also cannot supply its own expected figure or cash-sales total:
 *   both are derived from the order records, so neither can be massaged.
 *
 * ACTIONS
 *   status    → the open session for a till, WITHOUT any expected figure
 *   open      → start a shift with a counted float
 *   movement  → paid in / paid out, with a mandatory reason
 *   close     → submit the blind count; returns expected + variance
 *   sign_off  → a manager accepts an out-of-tolerance variance, with a note
 *
 * SYNC RULE: cashTakenForOrder / expectedCash / countsAsRevenue mirror
 * src/lib/pos-cash-logic.js and pos-money-logic.js. Keep them in step.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SIGN_OFF_TOLERANCE = 5;           // £ - matches needsSignOff() default
const MAX_FLOAT = 5000;                 // sanity bound on a float or movement
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// ── Mirrors of the tested logic ────────────────────────────────────────────
const REVENUE_STATUSES = ['confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery', 'delivered', 'collected'];
const countsAsRevenue = (o) => REVENUE_STATUSES.includes(o?.status);

function cashTakenForOrder(order) {
    if (!order || !countsAsRevenue(order)) return { cash: 0, legacy_split: false };
    if (order.cash_amount !== undefined && order.cash_amount !== null) {
        return { cash: r2(order.cash_amount), legacy_split: false };
    }
    if (order.payment_method !== 'cash') return { cash: 0, legacy_split: false };
    const looksSplit = /\bcard\s*:\s*£/i.test(String(order.notes || ''));
    if (looksSplit) return { cash: 0, legacy_split: true };
    return { cash: r2(Number(order.total || 0) + Number(order.tip_amount || 0)), legacy_split: false };
}

function expectedCash({ openingFloat = 0, orders = [], movements = [] }) {
    let sales = 0, legacySplitCount = 0;
    for (const o of orders) {
        const { cash, legacy_split } = cashTakenForOrder(o);
        sales += cash;
        if (legacy_split) legacySplitCount += 1;
    }
    let paidIn = 0, paidOut = 0;
    for (const m of movements) {
        const a = Math.abs(Number(m?.amount || 0));
        if (m?.type === 'paid_in') paidIn += a;
        else if (m?.type === 'paid_out') paidOut += a;
    }
    return {
        expected: r2(Number(openingFloat || 0) + sales + paidIn - paidOut),
        cashSales: r2(sales), paidIn: r2(paidIn), paidOut: r2(paidOut), legacySplitCount,
    };
}

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
function roleHas(rolePermissions, role, permission) {
    const map = rolePermissions && Object.keys(rolePermissions).length ? rolePermissions : DEFAULT_ROLE_PERMISSIONS;
    return Array.isArray(map[role]) && map[role].includes(permission);
}

/** A session as the till may see it WHILE OPEN - with no expected figure. */
function blindView(s) {
    const { expected_cash, cash_sales, variance, paid_in, paid_out, ...rest } = s;
    return rest;
}

async function audit(base44, entry) {
    try { await base44.asServiceRole.entities.PosAuditLog.create(entry); }
    catch (e) { console.warn('[CASH] audit write failed:', e?.message); }
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { action, restaurant_id, terminal, staff_session } = body;
        if (!restaurant_id || !action) {
            return Response.json({ error: 'restaurant_id and action are required' }, { status: 400 });
        }
        const term = Number.isInteger(Number(terminal)) && Number(terminal) > 0 ? Number(terminal) : 1;

        // ── Tenant check ─────────────────────────────────────────────────────
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email, is_active: true,
            });
            if (!managers.some(m => m.restaurant_ids?.includes(restaurant_id))) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        const staff = await verifyStaffSession(staff_session, restaurant_id);
        const who = {
            staff_id: staff?.staff_id,
            staff_name: staff?.staff_name || 'Unattributed',
        };

        const findOpen = async () => {
            const rows = await base44.asServiceRole.entities.CashSession.filter({
                restaurant_id, terminal: term, status: 'open',
            });
            return rows?.[0] || null;
        };

        // ── status ───────────────────────────────────────────────────────────
        if (action === 'status') {
            const open = await findOpen();
            return Response.json({ session: open ? blindView(open) : null });
        }

        // ── open ─────────────────────────────────────────────────────────────
        if (action === 'open') {
            if (await findOpen()) {
                return Response.json({ error: `Till ${term} already has an open cash session. Close it first.` }, { status: 409 });
            }
            const float = Number(body.opening_float);
            if (!Number.isFinite(float) || float < 0 || float > MAX_FLOAT) {
                return Response.json({ error: 'Enter the float you counted into the drawer' }, { status: 400 });
            }
            const session = await base44.asServiceRole.entities.CashSession.create({
                restaurant_id, terminal: term, status: 'open',
                opened_at: new Date().toISOString(),
                opened_by_staff_id: who.staff_id, opened_by_name: who.staff_name,
                opening_float: r2(float),
                movements: [],
            });
            await audit(base44, {
                restaurant_id, action: 'cash.open', outcome: 'allowed', ...who,
                amount: r2(float), terminal: String(term), detail: `Opened till ${term} with a £${r2(float).toFixed(2)} float`,
            });
            return Response.json({ session: blindView(session) });
        }

        // ── movement ─────────────────────────────────────────────────────────
        if (action === 'movement') {
            const open = await findOpen();
            if (!open) return Response.json({ error: `No open cash session on till ${term}` }, { status: 409 });
            const { type, reason } = body;
            const amount = Number(body.amount);
            if (!['paid_in', 'paid_out'].includes(type)) {
                return Response.json({ error: 'type must be paid_in or paid_out' }, { status: 400 });
            }
            if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_FLOAT) {
                return Response.json({ error: 'Enter an amount' }, { status: 400 });
            }
            // A paid-out with no reason is precisely what a variance report
            // exists to surface - so the reason is mandatory, not optional.
            if (!reason || !String(reason).trim()) {
                return Response.json({ error: 'A reason is required for every cash movement' }, { status: 400 });
            }
            const entry = {
                type, amount: r2(amount), reason: String(reason).trim().slice(0, 200),
                staff_id: who.staff_id, staff_name: who.staff_name, at: new Date().toISOString(),
            };
            const updated = await base44.asServiceRole.entities.CashSession.update(open.id, {
                movements: [...(open.movements || []), entry],
            });
            await audit(base44, {
                restaurant_id, action: `cash.${type}`, outcome: 'allowed', ...who,
                amount: r2(amount), reason: entry.reason, terminal: String(term),
                detail: `${type === 'paid_in' ? 'Paid in' : 'Paid out'} £${r2(amount).toFixed(2)}: ${entry.reason}`,
            });
            return Response.json({ session: blindView(updated) });
        }

        // ── close ────────────────────────────────────────────────────────────
        if (action === 'close') {
            const open = await findOpen();
            if (!open) return Response.json({ error: `No open cash session on till ${term}` }, { status: 409 });
            const counted = Number(body.counted_cash);
            if (!Number.isFinite(counted) || counted < 0 || counted > MAX_FLOAT * 4) {
                return Response.json({ error: 'Enter the total you counted' }, { status: 400 });
            }

            // Orders taken on THIS till during THIS session. Date is filtered here
            // rather than in the query: server-side created_date range operators
            // silently match nothing on this platform, which would report every
            // drawer as expecting only its float - an apparent huge overage.
            const closedAt = new Date();
            const openedAt = new Date(open.opened_at);
            const recent = await base44.asServiceRole.entities.Order.filter(
                { restaurant_id }, '-created_date', 3000,
            );
            const inSession = recent.filter(o => {
                const t = o.created_date ? new Date(o.created_date) : null;
                if (!t || t < openedAt || t > closedAt) return false;
                // Single-till shops predate the terminal field; treat an
                // unstamped order as belonging to till 1.
                const orderTerm = Number.isInteger(Number(o.terminal)) && Number(o.terminal) > 0 ? Number(o.terminal) : 1;
                return orderTerm === term;
            });

            const calc = expectedCash({
                openingFloat: open.opening_float,
                orders: inSession,
                movements: open.movements || [],
            });
            const variance = r2(counted - calc.expected);
            const needsSignOff = Math.abs(variance) > SIGN_OFF_TOLERANCE;

            const closed = await base44.asServiceRole.entities.CashSession.update(open.id, {
                status: 'closed',
                closed_at: closedAt.toISOString(),
                closed_by_staff_id: who.staff_id, closed_by_name: who.staff_name,
                counted_cash: r2(counted),
                counted_denominations: body.counted_denominations || undefined,
                expected_cash: calc.expected,
                cash_sales: calc.cashSales,
                paid_in: calc.paidIn,
                paid_out: calc.paidOut,
                variance,
                legacy_split_count: calc.legacySplitCount,
                needs_sign_off: needsSignOff,
            });

            await audit(base44, {
                restaurant_id, action: 'cash.close',
                outcome: needsSignOff ? 'denied' : 'allowed',
                ...who, amount: variance, terminal: String(term),
                detail: [
                    `Counted £${r2(counted).toFixed(2)}, expected £${calc.expected.toFixed(2)}`,
                    `${variance < 0 ? 'SHORT' : variance > 0 ? 'OVER' : 'exact'} £${Math.abs(variance).toFixed(2)}`,
                    `${inSession.length} orders`,
                    calc.legacySplitCount ? `${calc.legacySplitCount} legacy split(s) not counted` : null,
                    needsSignOff ? 'needs manager sign-off' : null,
                ].filter(Boolean).join(' · '),
            });

            // Only NOW is the expected figure revealed.
            return Response.json({ session: closed, needs_sign_off: needsSignOff });
        }

        // ── sign_off ─────────────────────────────────────────────────────────
        if (action === 'sign_off') {
            const { session_id, note } = body;
            if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 });
            const rows = await base44.asServiceRole.entities.CashSession.filter({ id: session_id, restaurant_id });
            const s = rows?.[0];
            if (!s) return Response.json({ error: 'Session not found' }, { status: 404 });
            if (s.status !== 'closed') return Response.json({ error: 'Close the session before signing it off' }, { status: 409 });

            const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id });
            if (!staff || !roleHas(restaurants?.[0]?.role_permissions, staff.role, 'eod.run')) {
                return Response.json({
                    error: 'A manager must sign off this variance.',
                    requires_override: true, permission: 'eod.run',
                }, { status: 403 });
            }
            // Someone must not be able to sign off a variance on their own count.
            if (s.closed_by_staff_id && s.closed_by_staff_id === staff.staff_id) {
                return Response.json({
                    error: 'A different manager must sign off a variance on your own count.',
                }, { status: 403 });
            }
            if (!note || !String(note).trim()) {
                return Response.json({ error: 'Explain the variance before signing it off' }, { status: 400 });
            }
            const signed = await base44.asServiceRole.entities.CashSession.update(s.id, {
                needs_sign_off: false,
                signed_off_by_staff_id: staff.staff_id,
                signed_off_by_name: staff.staff_name,
                sign_off_note: String(note).trim().slice(0, 500),
                signed_off_at: new Date().toISOString(),
            });
            await audit(base44, {
                restaurant_id, action: 'cash.sign_off', outcome: 'allowed', ...who,
                amount: s.variance, terminal: String(s.terminal),
                detail: `Signed off £${Number(s.variance || 0).toFixed(2)} variance: ${String(note).trim().slice(0, 200)}`,
            });
            return Response.json({ session: signed });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (error) {
        console.error('[CASH] error:', error?.message || error);
        return Response.json({ error: 'Cash session operation failed' }, { status: 500 });
    }
});
