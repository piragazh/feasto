/**
 * CREATE PAYMENT INTENT — Enhanced with metadata for webhook recovery
 * 
 * Includes all critical order data as metadata so webhook can reconstruct order
 * if frontend fails after successful Stripe charge.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let user = null;
        let isGuest = false;
        try {
            user = await base44.auth.me();
        } catch (_) {
            isGuest = true;
            /* guest user */
        }

        const {
            amount,
            currency = 'gbp',
            metadata = {},
            idempotency_key,
            // New: order reconstruction data
            restaurant_id,
            items,
            subtotal,
            delivery_fee,
            discount,
            order_type,
            delivery_address,
            delivery_coordinates,
            phone,
            guest_name,
            guest_email,
            notes,
            is_scheduled,
            scheduled_for
        } = await req.json();

        if (!amount || typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return Response.json({ error: 'Invalid amount' }, { status: 400 });
        }

        // CRITICAL: Convert to pence for Stripe
        const amountInPence = Math.round(amount * 100);
        if (amountInPence <= 0 || amountInPence > 5000000) { // Max £50,000
            return Response.json({ error: 'Amount exceeds maximum allowed (£50,000)' }, { status: 400 });
        }

        if (!idempotency_key) {
            return Response.json({
                error: 'Missing idempotency_key - ensure frontend regenerates on payment method change'
            }, { status: 400 });
        }

        // ─────────────────────────────────────────────────────────────────────
        // CRITICAL: Build comprehensive metadata for webhook recovery
        // No auth calls needed — all data from request body
        // ─────────────────────────────────────────────────────────────────────
        const enrichedMetadata = {
            ...metadata,
            user_email: !isGuest ? user?.email : (guest_email || 'guest'),
            user_id: !isGuest ? user?.id : 'guest',
            idempotency_key,
            restaurant_id,
            items_json: JSON.stringify(items),
            subtotal: String(subtotal),
            delivery_fee: String(delivery_fee),
            discount: String(discount),
            total: String(amount),
            order_type: order_type || 'delivery',
            delivery_address: delivery_address || '',
            delivery_coordinates: delivery_coordinates ? JSON.stringify(delivery_coordinates) : '',
            phone: phone || '',
            guest_name: guest_name || '',
            guest_email: guest_email || '',
            notes: notes || '',
            is_scheduled: String(is_scheduled || false),
            scheduled_for: scheduled_for || ''
        };

        const paymentIntent = await stripe.paymentIntents.create(
            {
                amount: amountInPence,
                currency: currency,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: 'never'
                },
                metadata: enrichedMetadata
            },
            { idempotencyKey: idempotency_key }
        );

        console.log(`[PAYMENT] PaymentIntent created: ${paymentIntent.id} amount=${amountInPence}p metadata enriched`);

        // NOTE: PaymentTransaction is created in verifyAndCreateOrder AFTER Stripe confirms payment.
        // Creating it here (before confirmation) caused duplicate PT records and broke dedup checks.
        // The intent metadata is sufficient for webhook recovery without an early PT record.
        console.log(`[PAYMENT] PI created: ${paymentIntent.id} — PT record deferred to verifyAndCreateOrder`);

        return Response.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        console.error('[PAYMENT] createPaymentIntent failed:', error.message, error.type);
        const errorMsg = error?.raw?.message || error.message || 'Payment initialisation failed. Please try again.';
        return Response.json({ error: errorMsg }, { status: 500 });
    }
});