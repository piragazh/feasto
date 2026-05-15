import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Manual one-off win-back campaign launcher (used by the One-Off Campaign tab in the UI).
// Routes through sendCRMCampaignWithOptOut so GDPR opt-out is always enforced.

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // Parse body before auth (body stream can only be read once)
    const { restaurantId, restaurantName, inactivityDays, customers, coupon, message } = await req.json();

    // Auth: must be admin or a manager for this restaurant
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (user.role !== 'admin') {
        const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
            user_email: user.email,
            is_active: true
        });
        const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurantId));
        if (!hasAccess) {
            return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
        }
    }

    if (!restaurantId || !customers?.length || !coupon || !message) {
        return Response.json(
            { error: 'Missing required fields: restaurantId, customers, coupon, message' },
            { status: 400 }
        );
    }

    if (coupon.discount_type === 'percentage' && coupon.discount_value < 1) {
        return Response.json({ error: 'Invalid discount percentage' }, { status: 400 });
    }

    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let offerText = '';
    if (coupon.discount_type === 'percentage') offerText = `${coupon.discount_value}% off`;
    else if (coupon.discount_type === 'fixed') offerText = `£${coupon.discount_value} off`;
    else if (coupon.discount_type === 'free_delivery') offerText = 'free delivery';

    let couponCount = 0;
    let messageCount = 0;

    for (const customer of customers) {
        // Generate collision-safe coupon code
        const rand = crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
        const couponCode = `WB-${rand}`;

        // Create 1-use coupon
        await base44.asServiceRole.entities.Coupon.create({
            code: couponCode,
            description: `Win-back offer for ${customer.name || 'customer'}`,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value || 0,
            restaurant_id: restaurantId,
            is_active: true,
            valid_from: new Date().toISOString().split('T')[0],
            valid_until: validUntil,
            usage_limit: 1,
            usage_count: 0,
            per_customer_limit: 1,
            minimum_order: 0,
            stackable: false
        });
        couponCount++;

        const daysSinceLast = Math.ceil(
            (Date.now() - new Date(customer.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        const personalised = message
            .replace(/\[NAME\]/g, customer.name || 'Customer')
            .replace(/\[DAYS\]/g, daysSinceLast)
            .replace(/\[DISCOUNT\]/g, coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `£${coupon.discount_value}`)
            .replace(/\[COUPON_CODE\]/g, couponCode)
            .replace(/\[OFFER\]/g, offerText)
            .replace(/\[RESTAURANT_LINK\]/g, restaurantName);

        // Route through sendCRMCampaignWithOptOut to enforce GDPR opt-out
        const resp = await base44.asServiceRole.functions.invoke('sendCRMCampaignWithOptOut', {
            channel: 'whatsapp',
            recipients: [{ phone: customer.phone, email: customer.email, coupon_code: couponCode }],
            subject: `We Miss You — Special Offer from ${restaurantName}`,
            textBody: personalised,
            restaurant_id: restaurantId
        }).catch(e => ({ data: { sent: 0 } }));

        if ((resp?.data?.sent || 0) > 0) messageCount++;
    }

    return Response.json({
        success: true,
        couponCount,
        customerCount: messageCount,
        couponsCreated: couponCount,
        messagesQueued: messageCount,
        summary: `Created ${couponCount} coupons and sent ${messageCount} WhatsApp messages`
    });
});