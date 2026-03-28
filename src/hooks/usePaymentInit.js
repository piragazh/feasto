/**
 * usePaymentInit — Encapsulates all PaymentIntent initialization logic for Checkout.
 *
 * Responsibilities:
 *   - Guards: validates all required fields before attempting PI creation
 *   - Atomic in-flight ref prevents concurrent calls
 *   - Computes a deterministic fingerprint of all payment-shaping inputs
 *   - Rotates the payment-session idempotency key whenever the fingerprint changes
 *   - Resets all payment state (clientSecret, expressConfirmFired, paymentCompleted)
 *     when the fingerprint changes so a fresh PI is always created with a fresh key
 *   - Consumes structured error codes from createPaymentIntent backend
 *   - Returns stable state for Checkout to render loading/form/error UI
 *
 * Error codes consumed from backend (functions/createPaymentIntent):
 *   MATH_INTEGRITY_FAIL, STRIPE_IDEMPOTENCY_CONFLICT, STRIPE_NULL_SECRET,
 *   STRIPE_API_ERROR, INVALID_AMOUNT, INVALID_ITEMS, INVALID_RESTAURANT, etc.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
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

// ── Deterministic payment fingerprint ─────────────────────────────────────────
// Encodes every input that shapes the PaymentIntent payload.
// If ANY of these change, the fingerprint changes → key rotates → fresh PI.
function buildPaymentFingerprint({
    total,
    cart,
    orderType,
    deliveryCoordinates,
    deliveryFee,
    discount,
    smallOrderSurcharge,
    scheduledFor,
}) {
    const cartKey = (cart || [])
        .map(i => `${i.menu_item_id || i.id}:${i.quantity}:${i.price}`)
        .sort()
        .join('|');
    const coordKey = deliveryCoordinates
        ? `${Number(deliveryCoordinates.lat).toFixed(5)},${Number(deliveryCoordinates.lng).toFixed(5)}`
        : 'none';
    return [
        `t:${Number(total).toFixed(2)}`,
        `c:${cartKey}`,
        `ot:${orderType}`,
        `xy:${coordKey}`,
        `df:${Number(deliveryFee).toFixed(2)}`,
        `d:${Number(discount).toFixed(2)}`,
        `s:${Number(smallOrderSurcharge || 0).toFixed(2)}`,
        `sf:${scheduledFor || 'none'}`,
    ].join('__');
}

// ── Generate a fresh payment-session idempotency key ──────────────────────────
function generateSessionKey() {
    return `ps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    // idempotencyKey is NO LONGER accepted from Checkout — managed internally
    onPaymentSessionKeyRotated, // optional callback so Checkout can sync its idempotencyKey state
}) {
    const [clientSecret, setClientSecret] = useState('');
    const [showStripeForm, setShowStripeForm] = useState(false);
    const [initializingPayment, setInitializingPayment] = useState(false);
    const [stripeLoadedPromise, setStripeLoadedPromise] = useState(null);

    // Internal rotating session key — one key per unique fingerprint
    const sessionKeyRef = useRef(generateSessionKey());
    const lastFingerprintRef = useRef(null);

    // Atomic guards
    const paymentInitInFlightRef = useRef(false);

    // Reset all payment state (called on fingerprint change or method switch)
    const resetPaymentState = useCallback(() => {
        setClientSecret('');
        setShowStripeForm(false);
        setInitializingPayment(false);
        paymentInitInFlightRef.current = false;
    }, []);

    // Expose the current session key so Checkout can pass it to verifyAndCreateOrder / pendingPayment
    const getSessionKey = useCallback(() => sessionKeyRef.current, []);

    useEffect(() => {
        const initPayment = async () => {
            if (paymentMethod !== 'card') {
                resetPaymentState();
                return;
            }

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

            // ── Fingerprint check: rotate key if any payment-shaping input changed ──
            const currentFingerprint = buildPaymentFingerprint({
                total, cart, orderType, deliveryCoordinates,
                deliveryFee, discount, smallOrderSurcharge, scheduledFor,
            });

            if (lastFingerprintRef.current !== null && lastFingerprintRef.current !== currentFingerprint) {
                const oldKey = sessionKeyRef.current;
                const newKey = generateSessionKey();
                sessionKeyRef.current = newKey;
                console.log('[usePaymentInit] payment_fingerprint_changed — old:', lastFingerprintRef.current);
                console.log('[usePaymentInit] payment_fingerprint_changed — new:', currentFingerprint);
                console.log('[usePaymentInit] payment_session_key_rotated:', oldKey, '→', newKey);
                checkoutTrace.log('payment_fingerprint_changed', { old: lastFingerprintRef.current, current: currentFingerprint });
                checkoutTrace.log('payment_session_key_rotated', { oldKey, newKey });
                onPaymentSessionKeyRotated?.(newKey);
                // Reset payment state — clientSecret is for the old fingerprint, must not reuse
                resetPaymentState();
                lastFingerprintRef.current = currentFingerprint;
                return; // let state settle; next effect run will re-init with new key
            }

            // Already have a valid PI for this exact fingerprint
            if (clientSecret) return;

            // Atomic guard
            if (paymentInitInFlightRef.current) return;

            // Record fingerprint before starting
            lastFingerprintRef.current = currentFingerprint;

            // ── Start init ─────────────────────────────────────────────────────
            paymentInitInFlightRef.current = true;
            setInitializingPayment(true);

            const activeSessionKey = sessionKeyRef.current;

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

                const payload = {
                    amount: total,
                    currency: 'gbp',
                    idempotency_key: activeSessionKey,
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
                };

                checkoutTrace.log('create_payment_intent_payload', { total, sessionKey: activeSessionKey, fingerprint: currentFingerprint });
                console.log('[usePaymentInit] create_payment_intent_payload amount:', total, 'session_key:', activeSessionKey);

                const response = await base44.functions.invoke('createPaymentIntent', payload);

                // Guard: if key was rotated while in-flight, discard stale result
                if (sessionKeyRef.current !== activeSessionKey) {
                    console.warn('[usePaymentInit] Session key rotated during PI creation — discarding stale response');
                    return;
                }

                if (response?.data?.clientSecret) {
                    checkoutTrace.log('create_payment_intent_succeeded', { piId: response.data.paymentIntentId });
                    console.log('[usePaymentInit] ✅ Got clientSecret for session_key:', activeSessionKey);
                    setClientSecret(response.data.clientSecret);
                    setShowStripeForm(true);
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
    }, [paymentMethod, total, deliveryFee, discount, smallOrderSurcharge, scheduledFor, orderType, zoneCheckComplete,
        JSON.stringify(deliveryCoordinates), JSON.stringify((cart || []).map(i => `${i.menu_item_id||i.id}:${i.quantity}:${i.price}`).sort())
    ]);

    return {
        clientSecret,
        showStripeForm,
        initializingPayment,
        stripeLoadedPromise,
        resetPaymentState,
        getSessionKey,
    };
}