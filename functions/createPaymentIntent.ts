import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Allow both authenticated and guest users to create payment intents
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (e) {
            // Guest user - continue without authentication
        }

        const { amount, currency = 'gbp', metadata = {}, orderId } = await req.json();

        if (!amount || amount <= 0) {
            return Response.json({ error: 'Invalid amount' }, { status: 400 });
        }

        // SECURITY: Validate amount against actual order if orderId provided
        if (orderId) {
            try {
                const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
                if (orders.length === 0) {
                    return Response.json({ error: 'Order not found' }, { status: 404 });
                }
                
                const order = orders[0];
                
                // Verify amount matches order total (allow 0.01 difference for rounding)
                if (Math.abs(order.total - amount) > 0.01) {
                    return Response.json({ 
                        error: 'Amount mismatch - payment amount does not match order total',
                        expected: order.total,
                        received: amount
                    }, { status: 400 });
                }
                
                // Verify order belongs to current user (if authenticated)
                if (user && order.created_by !== user.email) {
                    return Response.json({ error: 'Unauthorized - order does not belong to you' }, { status: 403 });
                }
            } catch (error) {
                return Response.json({ error: 'Failed to validate order' }, { status: 500 });
            }
        }

        // SECURITY: Enforce maximum payment amount (£500)
        if (amount > 500) {
            return Response.json({ error: 'Amount exceeds maximum allowed (£500)' }, { status: 400 });
        }

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to pence
            currency: currency,
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: 'never'
            },
            metadata: {
                user_email: user?.email || 'guest',
                order_id: orderId || 'none',
                ...metadata
            }
        });

        return Response.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});