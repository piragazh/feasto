import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { restaurantId, restaurantName, inactivityDays, customers, coupon, message } = await req.json();

        if (!restaurantId || !customers?.length || !coupon || !message) {
            return Response.json(
                { error: 'Missing required fields: restaurantId, customers, coupon, message' },
                { status: 400 }
            );
        }

        // Validate coupon config
        if (coupon.discount_type === 'percentage' && coupon.discount_value < 1) {
            return Response.json({ error: 'Invalid discount percentage' }, { status: 400 });
        }

        // Generate unique coupon code
        const generateCouponCode = () => {
            const timestamp = Date.now().toString(36).toUpperCase();
            const random = Math.random().toString(36).substring(2, 6).toUpperCase();
            return `WINBACK-${timestamp}-${random}`;
        };

        // Create coupons for each customer
        const couponCodeMap = {}; // customer key -> coupon code
        const createdCoupons = [];

        for (const customer of customers) {
            const couponCode = generateCouponCode();
            couponCodeMap[customer.phone || customer.email] = couponCode;

            try {
                const newCoupon = await base44.asServiceRole.entities.Coupon.create({
                    code: couponCode,
                    description: `Win-back offer for ${customer.name || 'customer'}`,
                    discount_type: coupon.discount_type,
                    discount_value: coupon.discount_value || 0,
                    restaurant_id: restaurantId,
                    is_active: true,
                    valid_from: new Date().toISOString().split('T')[0],
                    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    usage_limit: 1,
                    usage_count: 0,
                    minimum_order: 0
                });
                createdCoupons.push(newCoupon);
            } catch (error) {
                console.error(`Failed to create coupon for ${customer.phone || customer.email}:`, error);
            }
        }

        // Prepare WhatsApp messages for customers with phone numbers
        const messagesQueued = [];
        const phoneCustomers = customers.filter(c => c.phone);

        for (const customer of phoneCustomers) {
            const couponCode = couponCodeMap[customer.phone || customer.email];
            if (!couponCode) continue;

            const daysSinceLast = Math.ceil((new Date() - new Date(customer.lastOrderDate)) / (1000 * 60 * 60 * 24));
            
            // Build offer text
            let offerText = '';
            if (coupon.discount_type === 'percentage') {
                offerText = `${coupon.discount_value}% off`;
            } else if (coupon.discount_type === 'fixed') {
                offerText = `£${coupon.discount_value} off`;
            } else if (coupon.discount_type === 'free_delivery') {
                offerText = 'free delivery';
            }

            // Replace placeholders in message
            const personalizedMessage = message
                .replace(/\[NAME\]/g, customer.name || 'Customer')
                .replace(/\[DAYS\]/g, daysSinceLast)
                .replace(/\[DISCOUNT\]/g, coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `£${coupon.discount_value}`)
                .replace(/\[COUPON_CODE\]/g, couponCode)
                .replace(/\[OFFER\]/g, offerText)
                .replace(/\[RESTAURANT_LINK\]/g, restaurantName);

            try {
                // Send WhatsApp message via existing function
                const messageResult = await base44.asServiceRole.functions.invoke('sendWhatsAppWinBack', {
                    phone: customer.phone,
                    message: personalizedMessage,
                    couponCode,
                    restaurantId,
                    restaurantName,
                    customerId: customer.phone || customer.email
                });

                messagesQueued.push({
                    customer: customer.phone,
                    coupon: couponCode,
                    status: 'queued'
                });
            } catch (error) {
                console.error(`Failed to queue WhatsApp for ${customer.phone}:`, error);
            }
        }

        return Response.json({
            success: true,
            couponCount: createdCoupons.length,
            customerCount: messagesQueued.length,
            couponsCreated: createdCoupons.map(c => c.code),
            messagesQueued: messagesQueued.length,
            summary: `Created ${createdCoupons.length} coupons and queued ${messagesQueued.length} WhatsApp messages`
        });
    } catch (error) {
        console.error('Win-back campaign error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});