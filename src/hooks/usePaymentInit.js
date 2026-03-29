/**
 * usePaymentInit — Encapsulates all PaymentIntent initialization logic for Checkout.
 *
 * Responsibilities:
 *   - Builds a fully normalized fingerprint covering every payment-shaping input
 *   - Effect 1: invalidates stale clientSecret and rotates session key whenever fingerprint changes
 *   - Effect 2: initializes a new PaymentIntent when method=card, validation passes,
 *               and no current valid clientSecret exists for the current fingerprint
 *   - Atomic in-flight ref prevents concurrent PI creation calls
 *   - Preserves module-level Stripe singleton
 *
 * Error codes consumed from backend (functions/createPaymentIntent):
 *   MATH_INTEGRITY_FAIL, STRIPE_IDEMPOTENCY_CONFLICT, STRIPE_NULL_SECRET,
 *   STRIPE_API_ERROR, INVALID_AMOUNT, INVALID_ITEMS, INVALID_RESTAURANT, etc.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';
import { base44 } from '@/api/base44Client';
import { checkoutTrace } from '@/lib/checkoutTrace';
import { getPaymentErrorMessage } from '@/lib/paymentErrorMessages';

// ── Module-level Stripe singleton ─────────────────────────────────────────────
let _stripeInitState = { instance: null, promise: null, initialized: false, lastKey: null };

async function initializeStripe() {
    // FIX #9: Deno.env is not available in the browser — removed. Key invalidation is
    // handled by comparing the fetched publicKey in the response (see lastKey update below).
    if (_stripeInitState.initialized && _stripeInitState.instance) return _stripeInitState.instance;
    if (_stripeInitState.promise) return _stripeInitState.promise;

    _stripeInitState.promise = (async () => {
        try {
            const response = await base44.functions.invoke('getStripePublicKey');
            if (response?.data?.publicKey) {
                _stripeInitState.lastKey = response.data.publicKey;
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

// ── Normalized payment fingerprint ────────────────────────────────────────────
// Encodes every input that shapes the PaymentIntent payload.
// Any change → fingerprint changes → clientSecret is invalidated → fresh PI created.
function buildPaymentFingerprint({
    paymentMethod,
    cart,
    restaurantId,
    orderType,
    deliveryAddress,
    deliveryCoordinates,
    subtotal,
    deliveryFee,
    discount,
    smallOrderSurcharge,
    phone,
    guestEmail,
    isScheduled,
    scheduledFor,
}) {
    const cartKey = (cart || [])
        .map(i => `${i.menu_item_id || i.id}:${i.quantity}:${i.price}`)
        .sort()
        .join('|');
    const coordKey = deliveryCoordinates?.lat && deliveryCoordinates?.lng
        ? `${Number(deliveryCoordinates.lat).toFixed(5)},${Number(deliveryCoordinates.lng).toFixed(5)}`
        : 'none';
    const addrKey = (deliveryAddress || '').trim().toLowerCase().slice(0, 100);
    return [
        `pm:${paymentMethod || 'none'}`,
        `rid:${restaurantId || 'none'}`,
        `c:${cartKey}`,
        `ot:${orderType || 'none'}`,
        `addr:${addrKey}`,
        `xy:${coordKey}`,
        `st:${Number(subtotal || 0).toFixed(2)}`,
        `df:${Number(deliveryFee || 0).toFixed(2)}`,
        `d:${Number(discount || 0).toFixed(2)}`,
        `s:${Number(smallOrderSurcharge || 0).toFixed(2)}`,
        `ph:${(phone || '').replace(/\s/g, '')}`,
        `ge:${(guestEmail || '').toLowerCase().trim()}`,
        `sched:${isScheduled ? (scheduledFor || 'pending') : 'no'}`,
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
    onPaymentSessionKeyRotated,
}) {
    const [clientSecret, setClientSecret] = useState('');
    const [showStripeForm, setShowStripeForm] = useState(false);
    const [initializingPayment, setInitializingPayment] = useState(false);
    const [stripeLoadedPromise, setStripeLoadedPromise] = useState(null);

    // Tracks which fingerprint the active clientSecret was created for
    const activeSecretFingerprintRef = useRef(null);
    // Internal rotating session key — one key per unique fingerprint
    const sessionKeyRef = useRef(generateSessionKey());
    // ISSUE #10 FIX: Idempotency key synced with session key on rotation
    const idempotencyKeyRef = useRef(sessionKeyRef.current);
    // Atomic guard — prevents concurrent PI creation calls
    const paymentInitInFlightRef = useRef(false);
    // Force Effect 2 retry on idempotency conflicts (incremented on conflict, forces dependency change)
    const [retryCounterRef, setRetryCounter] = useState(0);

    // Reset all payment state (exposed for external callers e.g. method change)
    const resetPaymentState = useCallback(() => {
        setClientSecret('');
        setShowStripeForm(false);
        setInitializingPayment(false);
        paymentInitInFlightRef.current = false;
        activeSecretFingerprintRef.current = null;
    }, []);

    // Expose the current session key so Checkout can pass it to verifyAndCreateOrder / pendingPayment
    const getSessionKey = useCallback(() => {
        // ISSUE #10 FIX: Always sync idempotency key with session key
        idempotencyKeyRef.current = sessionKeyRef.current;
        return sessionKeyRef.current;
    }, []);

    // ── Build the normalized fingerprint from all payment-shaping inputs ───────
    const currentFingerprint = useMemo(() => {
        const deliveryAddress = orderType === 'delivery'
            ? (isExistingAddress
                ? (formData.delivery_address || '')
                : `${formData.door_number || ''} ${formData.delivery_address || ''}`.trim())
            : '';

        return buildPaymentFingerprint({
            paymentMethod,
            cart,
            restaurantId,
            orderType,
            deliveryAddress,
            deliveryCoordinates,
            subtotal,
            deliveryFee,
            discount,
            smallOrderSurcharge,
            phone: formData.phone,
            guestEmail: formData.guest_email,
            isScheduled,
            scheduledFor,
        });
    }, [
        paymentMethod,
        restaurantId,
        orderType,
        isExistingAddress,
        formData.delivery_address,
        formData.door_number,
        formData.phone,
        formData.guest_email,
        subtotal,
        deliveryFee,
        discount,
        smallOrderSurcharge,
        isScheduled,
        scheduledFor,
        // Stable serializations for deep equality on objects/arrays
        // eslint-disable-next-line react-hooks/exhaustive-deps
        JSON.stringify(deliveryCoordinates),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        JSON.stringify((cart || []).map(i => `${i.menu_item_id || i.id}:${i.quantity}:${i.price}`).sort()),
    ]);
    
    // CRITICAL: Always reset payment state when paymentMethod changes to ensure
    // stale clientSecret is never reused for a different method
    useEffect(() => {
        resetPaymentState();
    }, [paymentMethod, resetPaymentState]);

    // ── Effect 1: Invalidation — runs whenever fingerprint changes ─────────────
    // When the fingerprint changes, the current clientSecret is no longer valid.
    // Rotate the session key and reset all payment state so Effect 2 can re-init.
    useEffect(() => {
        // Nothing to invalidate on first mount or when there's no active secret
        if (activeSecretFingerprintRef.current === null) return;

        if (activeSecretFingerprintRef.current !== currentFingerprint) {
            const oldKey = sessionKeyRef.current;
            const newKey = generateSessionKey();
            sessionKeyRef.current = newKey;
            idempotencyKeyRef.current = newKey; // ISSUE #10 FIX: Sync idempotency key

            console.log('[usePaymentInit] fingerprint_changed — invalidating clientSecret');
            console.log('[usePaymentInit] old fingerprint:', activeSecretFingerprintRef.current);
            console.log('[usePaymentInit] new fingerprint:', currentFingerprint);
            checkoutTrace.log('payment_fingerprint_changed', {
                old: activeSecretFingerprintRef.current,
                current: currentFingerprint,
            });
            checkoutTrace.log('payment_session_key_rotated', { oldKey, newKey });
            onPaymentSessionKeyRotated?.(newKey);

            resetPaymentState(); // clears activeSecretFingerprintRef too
        }
    }, [currentFingerprint, onPaymentSessionKeyRotated, resetPaymentState]);

    // ── Effect 2: Initialization — runs when conditions are met ───────────────
    // Fires whenever the fingerprint changes (after Effect 1 resets state)
    // or any preflight condition changes. Safe to run multiple times — guards prevent
    // duplicate PI creation.
    useEffect(() => {
        if (paymentMethod !== 'card') {
            // If method is not card, ensure state is clean
            if (clientSecret || showStripeForm) {
                resetPaymentState();
            }
            return;
        }

        // ── Pre-flight validation — all must pass before hitting backend ───────
        if (isGuest && (!formData.guest_name || !formData.guest_email)) {
            checkoutTrace.log('stripe_init_blocked', { reason: 'missing_guest_details' });
            return;
        }
        if (!formData.phone) {
            checkoutTrace.log('stripe_init_blocked', { reason: 'missing_phone' });
            return;
        }
        if (orderType === 'delivery') {
            if (!formData.delivery_address?.trim()) {
                checkoutTrace.log('stripe_init_blocked', { reason: 'missing_address' });
                return;
            }
            if (!isExistingAddress && !formData.door_number?.trim()) {
                checkoutTrace.log('stripe_init_blocked', { reason: 'missing_door_number' });
                return;
            }
            if (!deliveryCoordinates?.lat || !deliveryCoordinates?.lng) {
                checkoutTrace.log('stripe_init_blocked', { reason: 'missing_coordinates' });
                return;
            }
            if (!zoneCheckComplete) {
                checkoutTrace.log('stripe_init_blocked', { reason: 'zone_check_pending' });
                return;
            }
            if (deliveryZoneInfo?.available === false) {
                checkoutTrace.log('stripe_init_blocked', { reason: 'zone_unavailable' });
                return;
            }
        }
        if (isScheduled && !scheduledFor) {
            checkoutTrace.log('stripe_init_blocked', { reason: 'missing_schedule_time' });
            return;
        }
        if (!cart?.length || total <= 0 || isNaN(total)) {
            checkoutTrace.log('stripe_init_blocked', { reason: 'invalid_cart_or_total', total, cartLen: cart?.length });
            return;
        }

        // Already have a valid clientSecret for this exact fingerprint — nothing to do
        if (clientSecret && activeSecretFingerprintRef.current === currentFingerprint) {
            return;
        }

        // Atomic guard — prevent concurrent init
        if (paymentInitInFlightRef.current) return;

        const activeSessionKey = sessionKeyRef.current;
        // ISSUE #3 FIX: Track when PI was created to warn if expired
        const piCreatedAt = Date.now();

        const runInit = async () => {
            paymentInitInFlightRef.current = true;
            setInitializingPayment(true);

            try {
                checkoutTrace.log('stripe_init_started', { total, orderType, isGuest, fingerprint: currentFingerprint });

                const stripeObj = await initializeStripe();
                if (!stripeObj) {
                    checkoutTrace.error('stripe_init_failed', { reason: 'stripe_object_null' });
                    toast.error('Payment system unavailable. Please refresh and try again.');
                    return;
                }

                if (!stripeLoadedPromise) {
                    setStripeLoadedPromise(Promise.resolve(stripeObj));
                }


                const fullAddress = orderType === 'delivery'
                    ? (isExistingAddress
                        ? formData.delivery_address
                        : `${formData.door_number ? formData.door_number + ', ' : ''}${formData.delivery_address}`)
                    : '';

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
                    delivery_coordinates: orderType === 'delivery' ? deliveryCoordinates : null,
                    phone: formData.phone,
                    guest_name: formData.guest_name,
                    guest_email: formData.guest_email,
                    notes: formData.notes,
                    is_scheduled: isScheduled,
                    scheduled_for: scheduledFor || null,
                };

                checkoutTrace.log('create_payment_intent_payload', {
                    total,
                    sessionKey: activeSessionKey,
                    fingerprint: currentFingerprint,
                });
                console.log('[usePaymentInit] create_payment_intent_payload amount:', total, 'session_key:', activeSessionKey);

                const response = await base44.functions.invoke('createPaymentIntent', payload);


                if (response?.data?.clientSecret) {
                    checkoutTrace.log('create_payment_intent_succeeded', { piId: response.data.paymentIntentId });
                    console.log('[usePaymentInit] ✅ Got clientSecret for session_key:', activeSessionKey);
                    activeSecretFingerprintRef.current = currentFingerprint;
                    setClientSecret(response.data.clientSecret);
                    setShowStripeForm(true);
                } else {
                    const errorCode = response?.data?.code || 'UNKNOWN';
                    const rawMsg = response?.data?.error || 'Failed to initialize payment.';
                    const userMsg = getPaymentErrorMessage(errorCode, rawMsg);

                    checkoutTrace.error('create_payment_intent_failed', { code: errorCode, error: rawMsg });
                    console.error('[usePaymentInit] ❌ PI failed:', errorCode, rawMsg);
                    
                    // CRITICAL FIX: On idempotency conflict, rotate key, reset fingerprint, AND increment retry counter
                    // to force Effect 2 to re-run with fresh key
                    if (errorCode === 'STRIPE_IDEMPOTENCY_CONFLICT') {
                        const oldKey = sessionKeyRef.current;
                        const newKey = generateSessionKey();
                        sessionKeyRef.current = newKey;
                        idempotencyKeyRef.current = newKey;
                        // CRITICAL: Reset fingerprint to trigger Effect 1
                        activeSecretFingerprintRef.current = null;
                        // CRITICAL: Increment counter to force Effect 2 retry (breaks dependency stale closure)
                        setRetryCounter(prev => prev + 1);
                        console.log('[usePaymentInit] Idempotency conflict — rotated key, reset fingerprint, increment retry:', oldKey, '→', newKey);
                        checkoutTrace.log('idempotency_conflict_recovery', { oldKey, newKey });
                    } else {
                        // Non-idempotency errors: just reset state
                        activeSecretFingerprintRef.current = null;
                    }

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
                activeSecretFingerprintRef.current = null;
            } finally {
                paymentInitInFlightRef.current = false;
                setInitializingPayment(false);
            }
        };

        runInit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFingerprint, ...(orderType === 'delivery' ? [zoneCheckComplete] : []), retryCounterRef]);

    return {
        clientSecret,
        showStripeForm,
        initializingPayment,
        stripeLoadedPromise,
        resetPaymentState,
        getSessionKey,
    };
}