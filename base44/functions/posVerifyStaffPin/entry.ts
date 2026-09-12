/**
 * posVerifyStaffPin — Staff authentication for the POS
 *
 * MODEL
 *   The till authenticates to Base44 once as the restaurant account. This
 *   function authenticates the PERSON using that till, and issues a short-lived
 *   staff session token. Every privileged backend action reads the acting staff
 *   member and their role from that token, never from the client — a
 *   client-supplied staff_id can be forged, so attribution and permissions built
 *   on one would be worthless.
 *
 * WHAT CHANGED AND WHY
 *   - PINs were stored in PLAINTEXT and the entity API returned them to any
 *     authenticated browser session. Verified live: a single fetch from the POS
 *     console listed every colleague's PIN, including managers'. PINs are now
 *     stored as a salted PBKDF2 hash and the plaintext is cleared on migration.
 *   - Each staff member gets a RANDOM salt. Staff commonly all use 0000; with a
 *     shared or derived salt, identical PINs produce identical hashes, so
 *     cracking one cracks the lot.
 *   - A 4-digit PIN is 10,000 combinations. Hashing alone does not protect it —
 *     THROTTLING does. Five consecutive failures locks the account for 15
 *     minutes, tracked server-side.
 *   - Login by staff_number is supported so the till need not display a list of
 *     everyone who works there before anyone has authenticated.
 *   - Failures are deliberately vague ("Incorrect staff number or PIN") so the
 *     response never confirms which half was right.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_MINUTES = 12 * 60;   // a long shift, so staff aren't re-prompted mid-service
const PBKDF2_ITERATIONS = 100000;

// ── PIN hashing ─────────────────────────────────────────────────────────────

function toHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
    return toHex(crypto.getRandomValues(new Uint8Array(16)));
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

/** Constant-time comparison so a timing side-channel can't leak the hash. */
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// ── Staff session token ─────────────────────────────────────────────────────
//
// Signed with a server secret so the client cannot mint or alter one. Carries
// only what the backend needs: who is acting, their role, where, and until when.

async function signSession(payload, secret) {
    const body = btoa(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    return `${body}.${toHex(sig)}`;
}

async function auditLog(base44, entry) {
    try {
        await base44.asServiceRole.entities.PosAuditLog.create(entry);
    } catch (e) {
        // Never fail a login because the audit write failed.
        console.error('[STAFF-AUTH] audit write failed:', e?.message || e);
    }
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

        const { staff_id, staff_number, pin, restaurant_id, terminal } = await req.json();

        if (!staff_id && !(staff_number && restaurant_id)) {
            return Response.json({
                error: 'Provide either staff_id, or staff_number with restaurant_id',
            }, { status: 400 });
        }

        // ── Locate the staff member ──────────────────────────────────────────
        let staff;
        if (staff_id) {
            const rows = await base44.asServiceRole.entities.StaffMember.filter({ id: staff_id });
            staff = rows?.[0];
        } else {
            const rows = await base44.asServiceRole.entities.StaffMember.filter({
                restaurant_id,
                staff_number: String(staff_number).trim(),
            });
            staff = rows?.[0];
        }

        // Vague on purpose - never reveal whether the staff number exists.
        const GENERIC_FAIL = { valid: false, error: 'Incorrect staff number or PIN' };

        if (!staff || staff.is_active === false) {
            return Response.json(GENERIC_FAIL, { status: 401 });
        }

        // ── Tenant check ─────────────────────────────────────────────────────
        const isAdmin = user.role === 'admin';
        if (!isAdmin) {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(staff.restaurant_id));
            if (!hasAccess) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // ── Lockout ──────────────────────────────────────────────────────────
        if (staff.pin_locked_until && new Date(staff.pin_locked_until) > new Date()) {
            const mins = Math.ceil((new Date(staff.pin_locked_until).getTime() - Date.now()) / 60000);
            await auditLog(base44, {
                restaurant_id: staff.restaurant_id,
                action: 'staff.login_locked',
                outcome: 'denied',
                staff_id: staff.id,
                staff_name: staff.full_name,
                staff_role: staff.role,
                terminal,
                detail: `Attempt while locked, ${mins} min remaining`,
            });
            return Response.json({
                valid: false,
                locked: true,
                error: `Too many incorrect attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
            }, { status: 429 });
        }

        // ── Staff with no PIN set ────────────────────────────────────────────
        // Still allowed, because a small takeaway may not use PINs, but it is
        // recorded - an unauthenticated login cannot meaningfully attribute a
        // void or a discount to anyone.
        const hasCredential = !!(staff.pin_hash || staff.pin);
        if (!hasCredential) {
            await auditLog(base44, {
                restaurant_id: staff.restaurant_id,
                action: 'staff.login_no_pin',
                outcome: 'allowed',
                staff_id: staff.id,
                staff_name: staff.full_name,
                staff_role: staff.role,
                terminal,
                detail: 'Logged in without a PIN - no credential set on this staff member',
            });
        } else {
            if (!pin) {
                return Response.json({ valid: false, error: 'PIN required' }, { status: 400 });
            }

            let ok = false;

            if (staff.pin_hash && staff.pin_salt) {
                ok = safeEqual(await hashPin(pin, staff.pin_salt), staff.pin_hash);
            } else if (staff.pin) {
                // ── One-time migration off the legacy plaintext PIN ───────────
                ok = safeEqual(String(pin), String(staff.pin));
                if (ok) {
                    const salt = randomSalt();
                    const hash = await hashPin(pin, salt);
                    await base44.asServiceRole.entities.StaffMember.update(staff.id, {
                        pin_hash: hash,
                        pin_salt: salt,
                        pin: '',              // clear the plaintext - this is the point
                    });
                }
            }

            if (!ok) {
                const attempts = (staff.pin_failed_attempts || 0) + 1;
                const patch = { pin_failed_attempts: attempts };
                if (attempts >= MAX_FAILED_ATTEMPTS) {
                    patch.pin_locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
                    patch.pin_failed_attempts = 0;
                }
                await base44.asServiceRole.entities.StaffMember.update(staff.id, patch);

                await auditLog(base44, {
                    restaurant_id: staff.restaurant_id,
                    action: 'staff.login_failed',
                    outcome: 'denied',
                    staff_id: staff.id,
                    staff_name: staff.full_name,
                    staff_role: staff.role,
                    terminal,
                    detail: `Failed PIN attempt ${attempts}/${MAX_FAILED_ATTEMPTS}${patch.pin_locked_until ? ' - account locked' : ''}`,
                });

                return Response.json(
                    patch.pin_locked_until
                        ? { valid: false, locked: true, error: `Too many incorrect attempts. Locked for ${LOCKOUT_MINUTES} minutes.` }
                        : GENERIC_FAIL,
                    { status: 401 },
                );
            }
        }

        // ── Success ──────────────────────────────────────────────────────────
        await base44.asServiceRole.entities.StaffMember.update(staff.id, {
            pin_failed_attempts: 0,
            pin_locked_until: null,
        });

        const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60000).toISOString();
        const secret = Deno.env.get('STAFF_SESSION_SECRET');

        let session = null;
        if (secret) {
            session = await signSession({
                staff_id: staff.id,
                staff_name: staff.full_name,
                role: staff.role,
                restaurant_id: staff.restaurant_id,
                exp: expiresAt,
            }, secret);
        } else {
            // Without a secret a token would be forgeable, so none is issued and
            // callers must treat permissions as unverified rather than trusting
            // something unsigned.
            console.error('[STAFF-AUTH] STAFF_SESSION_SECRET is not set — no session token issued.');
        }

        await auditLog(base44, {
            restaurant_id: staff.restaurant_id,
            action: 'staff.login',
            outcome: 'allowed',
            staff_id: staff.id,
            staff_name: staff.full_name,
            staff_role: staff.role,
            terminal,
        });

        // The stored PIN and its PBKDF2 hash never leave the server.
        const { pin: _p, pin_hash: _h, pin_salt: _s, ...safeStaff } = staff;

        // Separate, weaker hash purely for OFFLINE login on this terminal.
        //
        // The till must still accept a PIN when the internet drops, so it caches
        // a value it can verify locally. This is deliberately NOT the stored
        // PBKDF2 hash - that must never leave the server. It is derived from the
        // submitted PIN plus ids the terminal already holds, and lives only in
        // that terminal's IndexedDB.
        //
        // Weaker by design: an attacker with the device could brute-force it.
        // That is an accepted trade for a till that keeps trading during an
        // outage; the alternative is staff unable to log in when the line drops.
        let offlinePinHash = null;
        if (pin) {
            const data = new TextEncoder().encode(`${staff.id}:${pin}:${staff.restaurant_id}`);
            offlinePinHash = toHex(await crypto.subtle.digest('SHA-256', data));
        }

        return Response.json({
            valid: true,
            staff: safeStaff,
            session,
            session_expires: expiresAt,
            pin_hash: offlinePinHash,   // offline-cache value only, see above
        });
    } catch (error) {
        console.error('[STAFF-AUTH] error:', error?.message || error);
        return Response.json({ error: 'Could not verify staff PIN' }, { status: 500 });
    }
});
