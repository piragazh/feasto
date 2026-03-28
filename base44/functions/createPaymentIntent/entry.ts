/**
 * createPaymentIntent — Create Stripe PaymentIntent with versioning + fingerprint
 * 
 * Request Versioning:
 *   - Frontend sends request_nonce = `${sessionKey}_${Date.now()}`
 *   - Backend stores nonce in PI metadata
 *   - Frontend validates response nonce before accepting clientSecret
 *   - If session key rotates before response arrives, response is rejected (stale)
 * 
 * Payment Fingerprint:
 *   - Server-authoritative fingerprint of order state (items, address, fees, etc.)
 *   - Stored in PI metadata as dedup key
 *   - Used in verifyAndCreateOrder to detect stale PI
 *   - If address/items change after PI creation, fingerprints won't match
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const LOG = '[createPaymentIntent]';

function generatePaymentFingerprint(payload) {
    const items = (payload.items || [])
        .map(i => `${i.menu_item_id}:${i.quantity}:${Number(i.price || 0).toFixed(2)}`)
        .sort()
        .join('|');
    
    const address = payload.order_type === 'delivery'
        ? `${payload.delivery_address}:${payload.delivery_coordinates?.lat}:${payload.delivery_coordinates?.lng}`
        : 'collection';
    
    return [
        `items:${items}`,
        `addr:${address}`,
        `type:${payload.order_type}`,
        `restaurant:${payload.restaurant_id}`,
        `subtotal:${Number(payload.subtotal || 0).toFixed(2)}`,
        `fee:${Number(payload.delivery_fee || 0).toFixed(2)}`,
        `sched:${payload.is_scheduled ? payload.scheduled_for : 'no'}`,
    ].join('__');
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);

    // Safely get user without triggering 401 errors for guests
    let user = null;
    try {
        const isAuthenticated = await base44.auth.isAuthenticated();
        if (isAuthenticated) {
            user = await base44.auth.me();
        }
    } catch (_) { /* guest checkout — continue without user */ }

    let payload;
    try {
        payload = await req.json();
    } catch (e) {
        console.error(`${LOG} parse error:`, e.message);
        return Response.json({ error: 'Invalid request body', code: 'PARSE_ERROR' }, { status: 400 });
    }

    const { amount, idempotency_key, request_nonce, restaurant_id, order_type, delivery_address, delivery_coordinates, is_scheduled, scheduled_for } = payload;
    
    // Validate inputs
    if (!amount || !Number.isFinite(amount) || amount <= 0) {
        return Response.json({ error: 'Invalid amount', code: 'INVALID_AMOUNT' }, { status: 400 });
    }
    if (!restaurant_id) {
        return Response.json({ error: 'Missing restaurant_id', code: 'INVALID_RESTAURANT' }, { status: 400 });
    }
    if (!request_nonce) {
        return Response.json({ error: 'Missing request_nonce', code: 'INVALID_REQUEST_NONCE' }, { status: 400 });
    }

    // Math integrity check (prevent client from sending amount that doesn't match breakdown)
    const calculatedTotal = (payload.subtotal || 0) + (payload.delivery_fee || 0) + (payload.small_order_surcharge || 0) - (payload.discount || 0);
    const diff = Math.abs(amount - calculatedTotal);
    if (diff > 0.02) {
        console.error(`${LOG} math integrity fail: amount=${amount} calculated=${calculatedTotal} diff=${diff}`);
        return Response.json({
            error: 'Order calculation mismatch',
            code: 'MATH_INTEGRITY_FAIL'
        }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    
    // Generate server-authoritative fingerprint
    const fingerprint = generatePaymentFingerprint(payload);
    
    // Create PI with metadata for recovery + verification
    const piData = {
        amount: Math.round(amount * 100),  // Convert to pence
        currency: 'gbp',
        payment_method_types: ['card'],
        idempotency_key,  // Stripe-level dedup
        metadata: {
            restaurant_id,
            order_type,
            address: delivery_address || 'collection',
            fingerprint,  // Server-authoritative state
            request_nonce,  // Version for frontend validation
            total_pence: Math.round(amount * 100),
            is_scheduled: is_scheduled ? 'true' : 'false',
            scheduled_for: is_scheduled ? scheduled_for : null,
            created_by: user?.email || 'guest',
        },
    };

    try {
        console.log(`${LOG} creating PI amount=${amount}gbp restaurant=${restaurant_id} nonce=${request_nonce}`);
        const pi = await stripe.paymentIntents.create(piData);
        
        console.log(`${LOG} PI created id=${pi.id} status=${pi.status} amount=${pi.amount}p`);
        
        return Response.json({
            success: true,
            clientSecret: pi.client_secret,
            paymentIntentId: pi.id,
            request_nonce,  // Echo back for frontend validation
            fingerprint,
        }, { status: 200 });
    } catch (stripeErr) {
        console.error(`${LOG} Stripe API error:`, stripeErr.message);
        
        // Handle specific Stripe errors
        if (stripeErr.code === 'idempotency_error') {
            // Idempotency key collision — PI already exists
            console.log(`${LOG} idempotency collision detected for key=${idempotency_key}`);
            return Response.json({
                error: 'This payment initialization was already processed. Please use the existing payment session.',
                code: 'STRIPE_IDEMPOTENCY_CONFLICT'
            }, { status: 409 });
        }

        return Response.json({
            error: `Stripe API error: ${stripeErr.message}`,
            code: 'STRIPE_API_ERROR'
        }, { status: 502 });
    }
});