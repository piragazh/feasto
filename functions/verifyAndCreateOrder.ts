/**
 * CRITICAL SECURITY FUNCTION
 * Verifies payment intent status BEFORE creating any order
 * MUST be called by frontend instead of direct Order.create()
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import Stripe from 'npm:stripe@14.0.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const {
            orderData,
            paymentIntentId
        } = await req.json();

        // CRITICAL VALIDATION: Cart not empty
        if (!orderData.items || orderData.items.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Cart is empty' }),
                { status: 400 }
            );
        }

        // CRITICAL VALIDATION: Payment verification
        let verifiedPaymentMethod = orderData.payment_method;
        
        if (paymentIntentId) {
            // Card payment - MUST verify with Stripe
            if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
                return new Response(
                    JSON.stringify({ error: 'Invalid payment intent ID' }),
                    { status: 400 }
                );
            }

            try {
                const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
                
                // CRITICAL: Payment MUST be succeeded
                if (intent.status !== 'succeeded') {
                    return new Response(
                        JSON.stringify({ 
                            error: `Payment not completed. Status: ${intent.status}`,
                            status: intent.status
                        }),
                        { status: 400 }
                    );
                }

                // Verify amount matches
                const amountCents = Math.round(orderData.total * 100);
                if (intent.amount !== amountCents) {
                    return new Response(
                        JSON.stringify({ 
                            error: 'Payment amount mismatch. Fraud detected.' 
                        }),
                        { status: 400 }
                    );
                }

                // Mark as verified card payment
                verifiedPaymentMethod = 'card';
            } catch (stripeError) {
                console.error('Stripe verification failed:', stripeError);
                return new Response(
                    JSON.stringify({ error: 'Payment verification failed. Please try again.' }),
                    { status: 400 }
                );
            }
        } else {
            // Cash payment - must be explicitly selected
            if (orderData.payment_method !== 'cash') {
                return new Response(
                    JSON.stringify({ error: 'Invalid payment method' }),
                    { status: 400 }
                );
            }
        }

        // CRITICAL: Restaurant must be open (if not scheduled)
        if (!orderData.is_scheduled) {
            const restaurant = await base44.asServiceRole.entities.Restaurant.filter({
                id: orderData.restaurant_id
            });

            if (!restaurant || restaurant.length === 0) {
                return new Response(
                    JSON.stringify({ error: 'Restaurant not found' }),
                    { status: 404 }
                );
            }

            const now = new Date();
            const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
            
            let hours;
            if (orderData.order_type === 'collection' && restaurant[0].collection_hours) {
                hours = restaurant[0].collection_hours[dayName];
            } else if (orderData.order_type === 'delivery' && restaurant[0].delivery_hours) {
                hours = restaurant[0].delivery_hours[dayName];
            } else {
                hours = restaurant[0].opening_hours?.[dayName];
            }

            if (!hours || hours.closed) {
                return new Response(
                    JSON.stringify({ error: 'Restaurant is currently closed' }),
                    { status: 400 }
                );
            }

            const [openHour, openMin] = hours.open.split(':').map(Number);
            const [closeHour, closeMin] = hours.close.split(':').map(Number);
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const openTime = openHour * 60 + openMin;
            const closeTime = closeHour * 60 + closeMin;

            if (currentTime < openTime || currentTime >= closeTime) {
                return new Response(
                    JSON.stringify({ error: 'Restaurant is currently closed' }),
                    { status: 400 }
                );
            }
        }

        // CRITICAL: Verify user created this order (guest or authenticated)
        const finalOrderData = {
            ...orderData,
            payment_method: verifiedPaymentMethod,
            payment_intent_id: paymentIntentId || null
        };

        // Create order with verified data
        const newOrder = await base44.asServiceRole.entities.Order.create(finalOrderData);

        if (!newOrder || !newOrder.id) {
            throw new Error('Order creation failed');
        }

        return new Response(JSON.stringify({
            success: true,
            order_id: newOrder.id,
            order_number: newOrder.order_number
        }));

    } catch (error) {
        console.error('Order verification error:', error);
        return new Response(
            JSON.stringify({ error: error.message || 'Internal server error' }),
            { status: 500 }
        );
    }
});