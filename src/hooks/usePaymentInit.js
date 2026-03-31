/**
 * usePaymentInit — Simplified Payment Intent Initialization
 * 
 * Responsibilities:
 *   - Generate fresh session key per card payment attempt
 *   - Create PaymentIntent on demand with automatic retry on idempotency conflict
 *   - Expose clientSecret for Stripe form
 *
 * Key improvement: No complex fingerprint tracking or state-based retry logic.
 * Instead: Explicit attempt counter that auto-retries on conflict.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
            console.error('[usePaymentInit] No publicKey in response');
            _stripeInitState.promise = null;
            return null;
        } catch (error) {
            console.error('[usePaymentInit] Failed to load Stripe:', error.message);
            _stripeInitState.promise = null;
            return null;
        }
    })();

    return _stripeInitState.promise;
}

// ── Generate fresh session key ────────────────────────────────────────────────
function generateSessionKey() {
    return `ps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePaymentInit({
    paymentMethod,
    total,
    cart,
    restaurantId,
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
}) {
    const [clientSecret, setClientSecret] = useState('');
    const [showStripeForm, setShowStripeForm] = useState(false);
    const [initializingPayment, setInitializingPayment] = useState(false);
    const [stripeLoadedPromise, setStripeLoadedPromise] = useState(null);

    // Current session key — changes on each attempt or payment reset
    const sessionKeyRef = useRef(generateSessionKey());
    
    // Attempt counter — used to trigger retries on idempotency conflict
    const [attemptCount, setAttemptCount] = useState(0);

    // Max retries for idempotency conflicts — prevents infinite PI creation loop
    const MAX_RETRIES = 3;
    const retryCountRef = useRef(0);

    // Guard against concurrent PI creation
    const paymentInitInFlightRef = useRef(false);

    // Track previous total to detect coupon/discount changes
    const prevTotalRef = useRef(total);

    // Reset all payment state
    const resetPaymentState = useCallback(() => {
        sessionKeyRef.current = generateSessionKey();
        setClientSecret('');
        setShowStripeForm(false);
        setInitializingPayment(false);
        setAttemptCount(0);
        retryCountRef.current = 0;
        paymentInitInFlightRef.current = false;
    }, []);

    // Get current session key
    const getSessionKey = useCallback(() => {
        return sessionKeyRef.current;
    }, []);

    // Reset when payment method changes
    useEffect(() => {
        resetPaymentState();
    }, [paymentMethod, resetPaymentState]);

    // ── ATOMIC GUARD: Reset when total changes after PI created ────────────────
    // Prevents stale idempotency keys when coupon/promotion changes the total.
    // Without this, applying a coupon after PI creation causes STRIPE_IDEMPOTENCY_CONFLICT.
    useEffect(() => {
        if (prevTotalRef.current !== total && clientSecret) {
            console.log('[usePaymentInit] Total changed (coupon/promotion applied) — resetting payment state', {
                oldTotal: prevTotalRef.current,
                newTotal: total,
            });
            resetPaymentState();
        }
        prevTotalRef.current = total;
    }, [total, clientSecret, resetPaymentState]);

    // Preflight validation — must match Checkout's validatePayment rules
    const preflightValid = useMemo(() => {
        if (paymentMethod !== 'card') return false;
        
        // Guest must provide name + valid email before payment init
        if (isGuest) {
            if (!formData.guest_name?.trim() || !formData.guest_email?.trim()) return false;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.guest_email)) return false;
        }
        if (!formData.phone?.trim()) return false;
        
        if (orderType === 'delivery') {
            if (!formData.delivery_address?.trim()) return false;
            if (!isExistingAddress && !formData.door_number?.trim()) return false;
            if (!deliveryCoordinates?.lat || !deliveryCoordinates?.lng) return false;
            if (!zoneCheckComplete) return false;
            if (deliveryZoneInfo?.available === false) return false;
        }
        
        if (isScheduled && !scheduledFor) return false;
        if (!cart?.length || total <= 0 || isNaN(total)) return false;
        
        return true;
    }, [paymentMethod, isGuest, formData, orderType, isExistingAddress, deliveryCoordinates, zoneCheckComplete, deliveryZoneInfo, isScheduled, scheduledFor, cart, total]);

    // Main initialization effect — runs when preflight becomes valid or attempt count changes
    useEffect(() => {
        if (!preflightValid || clientSecret || paymentInitInFlightRef.current) {
            return;
        }

        const runInit = async () => {
            paymentInitInFlightRef.current = true;
            setInitializingPayment(true);

            try {
                checkoutTrace.log('stripe_init_started', { total, orderType, attempt: attemptCount + 1 });

                const stripeObj = await initializeStripe();
                if (!stripeObj) {
                    checkoutTrace.error('stripe_init_failed', { reason: 'stripe_object_null' });
                    toast.error('Payment system unavailable. Please refresh and try again.');
                    paymentInitInFlightRef.current = false;
                    setInitializingPayment(false);
                    return;
                }

                setStripeLoadedPromise(Promise.resolve(stripeObj));

                const fullAddress = orderType === 'delivery'
                    ? (isExistingAddress
                        ? formData.delivery_address
                        : `${formData.door_number ? formData.door_number + ', ' : ''}${formData.delivery_address}`)
                    : '';

                const currentSessionKey = sessionKeyRef.current;
                const payload = {
                    amount: total,
                    currency: 'gbp',
                    idempotency_key: currentSessionKey,
                    restaurant_id: restaurantId,
                    items: cart,
                    subtotal,
                    delivery_fee: deliveryFee,
                    discount,
                    small_order_surcharge: smallOrderSurcharge || 0,
                    order_type: orderType,
                    delivery_address: fullAddress,
                    delivery_coordinates: orderType === 'delivery' ? deliveryCoordinates : null,
                    phone: formData.phone,
                    guest_name: formData.guest_name,
                    guest_email: formData.guest_email,
                    notes: formData.notes,
                    is_scheduled: isScheduled,
                    scheduled_for: scheduledFor || null,
                };

                console.log('[usePaymentInit] PI attempt with key:', currentSessionKey);
                const response = await base44.functions.invoke('createPaymentIntent', payload);

                if (response?.data?.clientSecret) {
                    checkoutTrace.log('create_payment_intent_succeeded', { piId: response.data.paymentIntentId });
                    console.log('[usePaymentInit] ✅ Got clientSecret:', currentSessionKey);
                    setClientSecret(response.data.clientSecret);
                    setShowStripeForm(true);
                } else {
                    const errorCode = response?.data?.code || 'UNKNOWN';
                    const rawMsg = response?.data?.error || 'Failed to initialize payment.';
                    const userMsg = getPaymentErrorMessage(errorCode, rawMsg);

                    checkoutTrace.error('create_payment_intent_failed', { code: errorCode, attempt: attemptCount + 1 });
                    console.error('[usePaymentInit] ❌ PI failed:', errorCode, rawMsg);

                    if (errorCode === 'STRIPE_IDEMPOTENCY_CONFLICT') {
                        if (retryCountRef.current >= MAX_RETRIES) {
                            console.error('[usePaymentInit] Idempotency conflict — max retries reached, aborting');
                            toast.error('Payment initialisation failed after multiple attempts. Please refresh and try again.');
                        } else {
                            // Auto-retry with new key
                            retryCountRef.current += 1;
                            console.log(`[usePaymentInit] Idempotency conflict — retrying with fresh key (attempt ${retryCountRef.current}/${MAX_RETRIES})`);
                            sessionKeyRef.current = generateSessionKey();
                            setAttemptCount(prev => prev + 1); // Triggers effect re-run
                        }
                    } else {
                        toast.error(userMsg);
                    }
                }
            } catch (error) {
                checkoutTrace.error('create_payment_intent_exception', { error: error.message });
                console.error('[usePaymentInit] Exception:', error.message);
                toast.error('Failed to initialize payment. Please refresh and try again.');
            } finally {
                paymentInitInFlightRef.current = false;
                setInitializingPayment(false);
            }
        };

        runInit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preflightValid, attemptCount, clientSecret]);

    return {
        clientSecret,
        showStripeForm,
        initializingPayment,
        stripeLoadedPromise,
        resetPaymentState,
        getSessionKey,
    };
}