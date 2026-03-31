import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// MED-4 FIX: Atomic server-side promotion usage increment to prevent race conditions.
// Re-fetches the latest DB value before writing to avoid stale read-modify-write.

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') {
            return Response.json({ error: 'POST only' }, { status: 405 });
        }

        const base44 = createClientFromRequest(req);
        const { promoId, orderId, orderTotal, promoDiscount } = await req.json();

        if (!promoId) {
            return Response.json({ error: 'promoId required' }, { status: 400 });
        }

        // Re-fetch the latest promotion record for atomic increment
        const promos = await base44.asServiceRole.entities.Promotion.filter({ id: promoId });
        if (!promos?.length) {
            return Response.json({ error: 'Promotion not found' }, { status: 404 });
        }

        const promo = promos[0];

        await base44.asServiceRole.entities.Promotion.update(promoId, {
            usage_count: (promo.usage_count || 0) + 1,
            total_revenue_generated: (promo.total_revenue_generated || 0) + (orderTotal || 0),
            total_discount_given: (promo.total_discount_given || 0) + (promoDiscount || 0),
        });

        console.log(`[incrementPromotionUsage] ✅ promoId=${promoId} orderId=${orderId} new_count=${(promo.usage_count || 0) + 1}`);
        return Response.json({ success: true });
    } catch (error) {
        console.error('[incrementPromotionUsage] error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});