/**
 * Manual loyalty points adjustment — admin-only.
 *
 * Replaces any path where an admin could do a direct LoyaltyPoints entity write.
 * All adjustments are typed (correction, goodwill, penalty, expiry_reversal) and
 * require a mandatory reason. Before/after balance is captured in the audit log.
 *
 * This function ONLY handles manual adjustments. Order-earned points still flow
 * through awardLoyaltyPoints exclusively.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ALLOWED_ADJUSTMENT_TYPES = new Set([
    'correction',         // Fix a data error
    'goodwill',           // Customer service gesture
    'penalty',            // Points removal (e.g. fraud/abuse)
    'expiry_reversal',    // Reinstate expired points
    'bulk_promotion',     // One-time campaign bonus
]);

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

        // Admin-only — manual balance adjustments are a high-risk operation
        if (user.role !== 'admin') {
            console.error(`[SECURITY] Non-admin ${user.email} attempted loyalty points adjustment`);
            return Response.json({ error: 'Admin access required for loyalty adjustments' }, { status: 403 });
        }

        const { user_email, points_delta, adjustment_type, reason, note } = await req.json();

        // Validate inputs
        if (!user_email || typeof user_email !== 'string') {
            return Response.json({ error: 'user_email required' }, { status: 400 });
        }

        const delta = parseInt(points_delta, 10);
        if (isNaN(delta) || delta === 0) {
            return Response.json({ error: 'points_delta must be a non-zero integer' }, { status: 400 });
        }

        if (!adjustment_type || !ALLOWED_ADJUSTMENT_TYPES.has(adjustment_type)) {
            return Response.json({
                error: `adjustment_type must be one of: ${[...ALLOWED_ADJUSTMENT_TYPES].join(', ')}`,
            }, { status: 400 });
        }

        if (!reason || !reason.trim()) {
            return Response.json({ error: 'reason is required for loyalty adjustments' }, { status: 400 });
        }

        // Fetch current balance record
        const existing = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email });

        let record = null;
        let balanceBefore = 0;

        if (existing?.length) {
            record = existing[0];
            balanceBefore = record.total_points || 0;
        }

        const balanceAfter = Math.max(0, balanceBefore + delta); // Never go below 0
        const actualDelta = balanceAfter - balanceBefore; // May differ if delta would go negative

        if (actualDelta === 0 && delta < 0) {
            return Response.json({
                error: 'User already has 0 points — cannot reduce further',
            }, { status: 400 });
        }

        // Apply update or create record
        if (record) {
            const newEarned = delta > 0 ? (record.points_earned || 0) + actualDelta : record.points_earned || 0;
            const newRedeemed = delta < 0 ? (record.points_redeemed || 0) + Math.abs(actualDelta) : record.points_redeemed || 0;
            await base44.asServiceRole.entities.LoyaltyPoints.update(record.id, {
                total_points: balanceAfter,
                points_earned: newEarned,
                points_redeemed: newRedeemed,
            });
        } else {
            if (delta < 0) {
                return Response.json({ error: 'No loyalty record exists for this user' }, { status: 404 });
            }
            await base44.asServiceRole.entities.LoyaltyPoints.create({
                user_email,
                total_points: actualDelta,
                points_earned: actualDelta,
                points_redeemed: 0,
                orders_count: 0,
                tier: 'bronze',
            });
        }

        // Write LoyaltyTransaction so it appears in the customer's history
        const transactionType = actualDelta >= 0 ? 'earned' : 'redeemed';
        await base44.asServiceRole.entities.LoyaltyTransaction.create({
            user_email,
            transaction_type: transactionType,
            points: Math.abs(actualDelta),
            description: `Manual ${adjustment_type.replace(/_/g, ' ')}: ${reason.trim()}${note ? ` (${note.trim()})` : ''}`,
        });

        const auditDetails = {
            target_user: user_email,
            adjustment_type,
            reason: reason.trim(),
            note: note?.trim() || null,
            points_delta: actualDelta,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
        };

        console.log(`[AUDIT] LOYALTY_MANUAL_ADJUSTMENT: actor=${user.email} target=${user_email} type=${adjustment_type} delta=${actualDelta} before=${balanceBefore} after=${balanceAfter} reason="${reason.trim()}"`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action: 'LOYALTY_MANUAL_ADJUSTMENT',
                resource_type: 'LoyaltyPoints',
                resource_id: user_email,
                details: JSON.stringify(auditDetails),
                severity: 'high',
            });
        } catch (dbErr) {
            console.error('[AUDIT] Could not persist loyalty adjustment audit log:', dbErr.message);
        }

        return Response.json({
            success: true,
            user_email,
            adjustment_type,
            points_delta: actualDelta,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
        });

    } catch (error) {
        console.error('[LOYALTY] adjustLoyaltyPoints error:', error);
        return Response.json({ error: 'Loyalty adjustment failed. Please try again.' }, { status: 500 });
    }
});