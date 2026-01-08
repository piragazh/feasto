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

        const { amount, currency = 'gbp', metadata = {} } = await req.json();

        if (!amount || amount <= 0) {
            return Response.json({ error: 'Invalid amount' }, { status: 400 });
        }

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to pence
            currency: currency,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                user_email: user?.email || 'guest',
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