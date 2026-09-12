/**
 * posMigrateStaffPins — hash every remaining plaintext PIN in one pass
 *
 * WHY THIS IS NEEDED SEPARATELY
 *   posVerifyStaffPin migrates a PIN to a salted hash the first time that person
 *   logs in. That is lazy by nature: a staff member who is on holiday, works
 *   rarely, or has left without being deactivated keeps a PLAINTEXT PIN
 *   indefinitely — and the entity API returns every field to any authenticated
 *   browser session, so that PIN stays readable from the POS console.
 *
 *   Verified before this work: a single fetch from the till listed every
 *   colleague's PIN, managers included. Waiting for each person to log in leaves
 *   that window open for as long as the least active member stays away.
 *
 *   This closes it in one go, so the plaintext column is empty from the moment
 *   an admin runs it.
 *
 * BEHAVIOUR
 *   - Staff already holding pin_hash are left alone.
 *   - Staff with a plaintext pin get a random salt + PBKDF2 hash, then the
 *     plaintext is cleared.
 *   - Staff with no PIN at all are reported, because a staff member with no
 *     credential cannot meaningfully authorise anything and an owner should know.
 *   - Nobody's PIN changes. Staff carry on using the same digits.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const PBKDF2_ITERATIONS = 100000;

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

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { restaurant_id, dry_run = false } = await req.json();
        if (!restaurant_id) {
            return Response.json({ error: 'restaurant_id required' }, { status: 400 });
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

        const staff = await base44.asServiceRole.entities.StaffMember.filter({ restaurant_id });

        const result = { migrated: [], already_hashed: [], no_pin: [], failed: [] };

        for (const s of staff) {
            const name = s.full_name || s.id;

            if (s.pin_hash && s.pin_salt) {
                result.already_hashed.push(name);
                // Belt and braces: if a hash exists but a stale plaintext is still
                // sitting alongside it, clear the plaintext.
                if (s.pin && !dry_run) {
                    try {
                        await base44.asServiceRole.entities.StaffMember.update(s.id, { pin: '' });
                    } catch (e) {
                        console.error(`[PIN-MIGRATE] could not clear stale plaintext for ${name}:`, e?.message);
                    }
                }
                continue;
            }

            if (!s.pin) {
                result.no_pin.push(name);
                continue;
            }

            if (dry_run) {
                result.migrated.push(name);
                continue;
            }

            try {
                const salt = randomSalt();
                const hash = await hashPin(s.pin, salt);
                await base44.asServiceRole.entities.StaffMember.update(s.id, {
                    pin_hash: hash,
                    pin_salt: salt,
                    pin: '',
                });
                result.migrated.push(name);
            } catch (e) {
                console.error(`[PIN-MIGRATE] failed for ${name}:`, e?.message);
                result.failed.push(name);
            }
        }

        if (!dry_run) {
            try {
                await base44.asServiceRole.entities.PosAuditLog.create({
                    restaurant_id,
                    action: 'staff.pins_migrated',
                    outcome: 'allowed',
                    detail: `Hashed ${result.migrated.length} PIN(s). ${result.already_hashed.length} already hashed, ${result.no_pin.length} without a PIN, ${result.failed.length} failed. Run by ${user.email}.`,
                });
            } catch { /* audit failure must not fail the migration */ }
        }

        console.log(`[PIN-MIGRATE] restaurant=${restaurant_id} migrated=${result.migrated.length} failed=${result.failed.length} actor=${user.email} dry_run=${dry_run}`);

        return Response.json({
            success: true,
            dry_run,
            counts: {
                migrated: result.migrated.length,
                already_hashed: result.already_hashed.length,
                no_pin: result.no_pin.length,
                failed: result.failed.length,
            },
            ...result,
        });
    } catch (error) {
        console.error('[PIN-MIGRATE] error:', error?.message || error);
        return Response.json({ error: 'Could not migrate staff PINs' }, { status: 500 });
    }
});
