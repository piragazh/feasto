/**
 * posVerifyStaffPin — Server-side staff PIN verification for POS login
 *
 * Security: Moves the PIN comparison from client-side (where plaintext PINs
 * were fetched to the browser and compared with ===) to server-side, so
 * the PIN value is never used in client-side logic.
 *
 * Policy:
 *   - Caller must be authenticated (admin or restaurant manager for this restaurant)
 *   - Staff member must be active
 *   - If no PIN is set on the staff record, returns valid=true (no-PIN login)
 *   - Returns the staff record WITHOUT the pin field
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function computePinHash(staffId, pin, restaurantId) {
    const data = new TextEncoder().encode(`${staffId}:${pin}:${restaurantId}`);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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

        const { staff_id, pin } = await req.json();

        if (!staff_id) {
            return Response.json({ error: 'staff_id required' }, { status: 400 });
        }

        // Fetch the staff member server-side
        const staffList = await base44.asServiceRole.entities.StaffMember.filter({ id: staff_id });
        const staff = staffList?.[0];

        if (!staff) {
            return Response.json({ valid: false, error: 'Staff member not found' });
        }

        // Tenant check: admin or manager of this restaurant
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(staff.restaurant_id));
            if (!hasAccess) {
                return Response.json({ valid: false, error: 'Access denied' }, { status: 403 });
            }
        }

        if (!staff.is_active) {
            return Response.json({ valid: false, error: 'This staff member is inactive' });
        }

        // No PIN set — allow login
        if (!staff.pin) {
            return Response.json({
                valid: true,
                staff: {
                    id: staff.id,
                    full_name: staff.full_name,
                    role: staff.role,
                    restaurant_id: staff.restaurant_id,
                    staff_number: staff.staff_number || null,
                },
            });
        }

        // Verify PIN server-side
        if (pin !== staff.pin) {
            return Response.json({ valid: false, error: 'Incorrect PIN' });
        }

        console.log(`[POS-STAFF] PIN verified: staff=${staff.full_name} restaurant=${staff.restaurant_id} by=${user.email}`);

        return Response.json({
            valid: true,
            staff: {
                id: staff.id,
                full_name: staff.full_name,
                role: staff.role,
                restaurant_id: staff.restaurant_id,
                staff_number: staff.staff_number || null,
            },
            // SHA-256 hash cached on the terminal for offline PIN verification.
            // Only the hash is stored — the plaintext PIN never persists in the browser.
            pin_hash: await computePinHash(staff.id, staff.pin, staff.restaurant_id),
        });

    } catch (error) {
        console.error('[POS-STAFF] posVerifyStaffPin error:', error);
        return Response.json({ valid: false, error: 'PIN verification failed. Please try again.' }, { status: 500 });
    }
});