import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (e) {
            // Guest user - continue without authentication
        }

        const { amount, currency = 'gbp', metadata = {}, orderId, idempotency_key } = await req.json();

        if (!amount || typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return Response.json({ error: 'Invalid amount' }, { status: 400 });
        }

        // CRITICAL: Convert to pence for Stripe
        const amountInPence = Math.round(amount * 100);
        if (amountInPence <= 0 || amountInPence > 50000) { // Max £500
            return Response.json({ error: 'Amount exceeds maximum allowed (£500) or is invalid' }, { status: 400 });
        }

        // SECURITY: Enforce maximum payment amount (£500) to prevent abuse
        if (amount > 500) {
            return Response.json({ error: 'Amount exceeds maximum allowed (£500)' }, { status: 400 });
        }

        // Validate amount against actual order if orderId provided
        if (orderId) {
            try {
                const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
                if (orders.length === 0) {
                    return Response.json({ error: 'Order not found' }, { status: 404 });
                }
                
                const order = orders[0];
                
                if (Math.abs(order.total - amount) > 0.01) {
                    return Response.json({ 
                        error: 'Amount mismatch - payment amount does not match order total',
                        expected: order.total,
                        received: amount
                    }, { status: 400 });
                }
                
                if (user && order.created_by !== user.email) {
                    return Response.json({ error: 'Unauthorized - order does not belong to you' }, { status: 403 });
                }
            } catch (error) {
                console.error('Order validation error:', error);
                return Response.json({ error: 'Failed to validate order' }, { status: 500 });
            }
        }

        // Use idempotency key on Stripe to prevent double-charging on retries/double-clicks
        // Falls back to a key derived from user+amount+orderId when not explicitly provided
        const stripeIdempotencyKey = idempotency_key 
            || `pi_${user?.email || 'guest'}_${orderId || 'noid'}_${Math.round(amount * 100)}`;

        const paymentIntent = await stripe.paymentIntents.create(
            {
                amount: amountInPence,
                currency: currency,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: 'never'
                },
                metadata: {
                    user_email: user?.email || 'guest',
                    order_id: orderId || 'none',
                    amount_gbp: String(amount),
                    ...metadata
                }
            },
            { idempotencyKey: stripeIdempotencyKey }
        );

        console.log(`[PAYMENT] PaymentIntent created: ${paymentIntent.id} amount=${amountInPence}p (£${amount}) user=${user?.email || 'guest'} order=${orderId || 'none'}`);
        return Response.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        console.error('[PAYMENT] createPaymentIntent failed:', error.message);
        return Response.json({ error: 'Payment initialisation failed. Please try again.' }, { status: 500 });
    }
});