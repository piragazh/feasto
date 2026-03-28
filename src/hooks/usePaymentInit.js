/**
 * usePaymentInit — Encapsulates all PaymentIntent initialization logic for Checkout.
 *
 * Responsibilities:
 *   - Guards: validates all required fields before attempting PI creation
 *   - Atomic in-flight ref prevents concurrent calls
 *   - Detects total-change (coupon/address) and resets stale PI
 *   - Consumes structured error codes from createPaymentIntent backend
 *   - Returns stable state for Checkout to render loading/form/error UI
 *
 * Error codes consumed from backend (functions/createPaymentIntent):
 *   MATH_INTEGRITY_FAIL, STRIPE_IDEMPOTENCY_CONFLICT, STRIPE_NULL_SECRET,
 *   STRIPE_API_ERROR, INVALID_AMOUNT, INVALID_ITEMS, INVALID_RESTAURANT, etc.
 */

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';
import { base44 } from '@/api/base44Client';
import { checkoutTrace } from '@/lib/checkoutTrace';
import { getPaymentErrorMessage } from '@/lib/paymentErrorMessages';

// ── Module-level Stripe singleton ─────────────────────────────────────────────
let _stripeInitState = { instance: null, promise: null, initialized: false };

async function initializeStripe() {
    if (_stripeInitState.initialized && _stripeInitState.instance) return _stripeInitState.instance;
    if (_stripeInitState.promise) return _stripeInitState.promise;

    _stripeInitState.promise = (async () => {
        try {
            const response = await base44.functions.invoke('getStripePublicKey');
            if (response?.data?.publicKey) {
                const instance = await loadStripe(response.data.publicKey);
                _stripeInitState.instance = instance;
                _stripeInitState.initialized = true;
                return instance;
            }
            console.error('[usePaymentInit] No publicKey in getStripePublicKey response');
            _stripeInitState.promise = null;
            return null;
        } catch (error) {
            console.error('[usePaymentInit] Failed to load Stripe key:', error.message);
            _stripeInitState.promise = null;
            return null;
        }
    })();

    return _stripeInitState.promise;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePaymentInit({
    paymentMethod,
    total,
    cart,
    restaurantId,
    restaurant,
    orderType,
    formData,
    isGuest,
    isExistingAddress,
    deliveryCoordinates,
    deliveryZoneInfo,
    zoneCheckComplete,
    isScheduled,
    scheduledFor,
    subtotal,
    deliveryFee,
    discount,
    smallOrderSurcharge,
    idempotencyKey,
}) {
    const [clientSecret, setClientSecret] = useState('');
    const [showStripeForm, setShowStripeForm] = useState(false);
    const [initializingPayment, setInitializingPayment] = useState(false);
    const [stripeLoadedPromise, setStripeLoadedPromise] = useState(null);

    // Atomic guards
    const paymentInitInFlightRef = useRef(false);
    const piTotalRef = useRef(null);

    // Reset all payment state (called externally when switching methods or resetting)
    const resetPaymentState = () => {
        setClientSecret('');
        setShowStripeForm(false);
        setInitializingPayment(false);
        paymentInitInFlightRef.current = false;
        piTotalRef.current = null;
    };

    useEffect(() => {
        const initPayment = async () => {
            if (paymentMethod !== 'card') {
                resetPaymentState();
                return;
            }

            // If total changed since PI was created, reset so we get a fresh one
            // NOTE: must call resetPaymentState() and then return — React state update is async,
            // so `clientSecret` won't be '' yet in this same tick. The next effect run (triggered
            // by the state change) will see clientSecret='' and proceed to re-init.
            if (clientSecret && piTotalRef.current !== null && Math.abs(piTotalRef.current - total) > 0.01) {
                console.log('[usePaymentInit] Total changed from', piTotalRef.current, 'to', total, '— resetting PI');
                resetPaymentState();
                return; // let state settle; next effect run will re-init
            }

            // Already have a valid PI for this total
            if (clientSecret) return;

            // Atomic guard
            if (paymentInitInFlightRef.current) return;

            // ── Pre-flight validation — must all pass before hitting backend ──
            if (isGuest && (!formData.guest_name || !formData.guest_email)) {
                checkoutTrace.log('stripe_init_blocked', { reason: 'missing_guest_details' });
                return;
            }
            if (!formData.phone) {
                checkoutTrace.log('stripe_init_blocked', { reason: 'missing_phone' });
                return;
            }
            if (orderType === 'delivery') {
                if (!formData.delivery_address?.trim()) { checkoutTrace.log('stripe_init_blocked', { reason: 'missing_address' }); return; }
                if (!isExistingAddress && !formData.door_number?.trim()) { checkoutTrace.log('stripe_init_blocked', { reason: 'missing_door_number' }); return; }
                if (!deliveryCoordinates?.lat || !deliveryCoordinates?.lng) { checkoutTrace.log('stripe_init_blocked', { reason: 'missing_coordinates' }); return; }
                if (!zoneCheckComplete) { checkoutTrace.log('stripe_init_blocked', { reason: 'zone_check_pending' }); return; }
                if (deliveryZoneInfo?.available === false) { checkoutTrace.log('stripe_init_blocked', { reason: 'zone_unavailable' }); return; }
            }
            if (isScheduled && !scheduledFor) { checkoutTrace.log('stripe_init_blocked', { reason: 'missing_schedule_time' }); return; }
            if (!cart?.length || total <= 0 || isNaN(total)) {
                checkoutTrace.log('stripe_init_blocked', { reason: 'invalid_cart_or_total', total, cartLen: cart?.length });
                return;
            }

            // ── Start init ─────────────────────────────────────────────────────
            paymentInitInFlightRef.current = true;
            setInitializingPayment(true);

            try {
                checkoutTrace.log('stripe_init_started', { total, orderType, isGuest });

                const stripeObj = await initializeStripe();
                if (!stripeObj) {
                    checkoutTrace.error('stripe_init_failed', { reason: 'stripe_object_null' });
                    toast.error('Payment system unavailable. Please refresh and try again.');
                    return;
                }
                checkoutTrace.log('stripe_init_succeeded');

                if (!stripeLoadedPromise) {
                    setStripeLoadedPromise(Promise.resolve(stripeObj));
                }

                const fullAddress = orderType === 'delivery'
                    ? (isExistingAddress
                        ? formData.delivery_address
                        : `${formData.door_number ? formData.door_number + ', ' : ''}${formData.delivery_address}`)
                    : (restaurant?.address || 'Collection');

                checkoutTrace.log('create_payment_intent_started', { total, idempotencyKey });
                console.log('[usePaymentInit] Creating PaymentIntent for amount:', total);

                const response = await base44.functions.invoke('createPaymentIntent', {
                    amount: total,
                    currency: 'gbp',
                    idempotency_key: idempotencyKey,
                    restaurant_id: restaurantId,
                    items: cart,
                    subtotal,
                    delivery_fee: deliveryFee,
                    discount,
                    small_order_surcharge: smallOrderSurcharge || 0,
                    order_type: orderType,
                    delivery_address: fullAddress,
                    delivery_coordinates: deliveryCoordinates,
                    phone: formData.phone,
                    guest_name: formData.guest_name,
                    guest_email: formData.guest_email,
                    notes: formData.notes,
                    is_scheduled: isScheduled,
                    scheduled_for: scheduledFor || null,
                });

                if (response?.data?.clientSecret) {
                    checkoutTrace.log('create_payment_intent_succeeded', { piId: response.data.paymentIntentId });
                    console.log('[usePaymentInit] ✅ Got clientSecret');
                    setClientSecret(response.data.clientSecret);
                    setShowStripeForm(true);
                    piTotalRef.current = total;
                } else {
                    // ── Structured error from hardened backend ─────────────────
                    const errorCode = response?.data?.code || 'UNKNOWN';
                    const rawMsg = response?.data?.error || 'Failed to initialize payment.';
                    const userMsg = getPaymentErrorMessage(errorCode, rawMsg);

                    checkoutTrace.error('create_payment_intent_failed', { code: errorCode, error: rawMsg });
                    console.error('[usePaymentInit] ❌ PI failed:', errorCode, rawMsg);
                    toast.error(userMsg);
                    setClientSecret('');
                    setShowStripeForm(false);
                }
            } catch (error) {
                checkoutTrace.error('create_payment_intent_exception', { error: error.message });
                console.error('[usePaymentInit] Exception:', error.message);
                toast.error('Failed to initialize payment. Please refresh and try again.');
                setClientSecret('');
                setShowStripeForm(false);
            } finally {
                paymentInitInFlightRef.current = false;
                setInitializingPayment(false);
            }
        };

        initPayment();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paymentMethod, total, zoneCheckComplete]);
    // NOTE: 'total' dep is intentional — coupon/address changes must trigger a fresh PI.
    // The `if (clientSecret) return` guard prevents unnecessary re-init.

    return {
        clientSecret,
        showStripeForm,
        initializingPayment,
        stripeLoadedPromise,
        resetPaymentState,
    };
}