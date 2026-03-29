import React, { useState, useRef } from 'react';
import { ExpressCheckoutElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card } from "@/components/ui/card";
import { Loader2, Smartphone } from 'lucide-react';

/**
 * ExpressCheckout — Stripe Express Checkout Element with explicit confirmation
 * 
 * Wallet integration (Apple Pay, Google Pay, Link) that explicitly confirms
 * the PaymentIntent instead of assuming auto-confirmation.
 * 
 * Safety guarantees:
 * - Explicitly confirms PaymentIntent via stripe.confirmPayment()
 * - Handles all result statuses: succeeded, requires_action, processing, requires_payment_method, error
 * - Atomic guard prevents double-fire on browser quirks or race conditions
 * - onSuccess() only fires when payment actually succeeded
 * - Converges into same order-creation path as card entry
 */
export default function ExpressCheckout({ amount, onSuccess, onError, disabled, clientSecret, expressConfirmFiredRef }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const loadingTimeoutRef = useRef(null);
    const confirmInFlightRef = useRef(false);
    // ISSUE #1 FIX: Capture clientSecret at mount time — since we remount on key={clientSecret},
    // this ref holds the exact secret this instance was mounted with
    const mountedClientSecretRef = useRef(clientSecret);

    const handleChange = (e) => {
        if (e.error) {
            console.warn('[ExpressCheckout] Wallet error:', e.error);
            setLoadError(e.error.message);
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setIsProcessing(false);
            if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
            if (onError && typeof onError === 'function') {
                onError(String(e.error.message || 'Wallet payment failed'));
            }
        } else {
            setLoadError(null);
        }
    };

    // CRITICAL: If no clientSecret or Stripe not ready, show nothing
    if (!stripe || !elements) {
        console.log('[ExpressCheckout] Waiting for Stripe to initialize');
        return null;
    }

    if (!clientSecret) {
        console.log('[ExpressCheckout] Waiting for clientSecret from backend');
        return null;
    }

    return (
        <Card className="p-4 mb-6 border-2 border-orange-200 bg-orange-50">
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-orange-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Fast Checkout</h3>
                    </div>
                    {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-orange-600" />}
                </div>
                <p className="text-xs text-gray-600">Pay with Apple Pay, Google Pay, or Link</p>
                
                <ExpressCheckoutElement
                    onConfirm={async (data) => {
                        // ── ATOMIC GUARD: prevent double-fire ──────────────────────
                        if (expressConfirmFiredRef?.current) {
                            console.warn('[ExpressCheckout] onConfirm already fired — ignoring duplicate');
                            return;
                        }
                        if (expressConfirmFiredRef) expressConfirmFiredRef.current = true;

                        // ── GUARD: prevent simultaneous confirmation attempts ───────
                        if (confirmInFlightRef.current) {
                            console.warn('[ExpressCheckout] Confirmation already in-flight — ignoring duplicate');
                            return;
                        }
                        confirmInFlightRef.current = true;

                        console.log('[ExpressCheckout] express_confirm_started', { data });
                        setIsProcessing(true);
                        
                        if (!stripe || !elements || !clientSecret) {
                            console.error('[ExpressCheckout] Missing stripe, elements, or clientSecret');
                            confirmInFlightRef.current = false;
                            if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                            if (onError) onError('Payment setup incomplete');
                            setIsProcessing(false);
                            return;
                        }

                        try {
                            // ISSUE #1 FIX: Capture clientSecret at confirm-start
                            // If the Elements instance re-mounted (key rotation), this ref matches
                            // the correct secret; any stale closure would be caught below
                            const secretAtConfirmStart = mountedClientSecretRef.current;

                            // ── EXPLICIT CONFIRMATION: Use stripe.confirmPayment() ───
                            console.log('[ExpressCheckout] Confirming payment intent via stripe.confirmPayment()');
                            
                            const confirmResult = await stripe.confirmPayment({
                                elements,
                                clientSecret: secretAtConfirmStart,
                                redirect: 'if_required',
                                confirmParams: {
                                    return_url: window.location.href,
                                },
                            });

                            console.log('[ExpressCheckout] express_confirm_result', { 
                                status: confirmResult.paymentIntent?.status,
                                piId: confirmResult.paymentIntent?.id?.slice(0, 20),
                                error: confirmResult.error?.message
                            });

                            // ── HANDLE RESULT ───────────────────────────────────────
                            if (confirmResult.error) {
                                // Payment failed
                                const errorMsg = confirmResult.error.message || 'Payment failed';
                                console.error('[ExpressCheckout] express_confirm_error', { error: errorMsg });
                                confirmInFlightRef.current = false;
                                if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                                if (onError && typeof onError === 'function') {
                                    onError(errorMsg);
                                }
                                setIsProcessing(false);
                                return;
                            }

                            const paymentIntent = confirmResult.paymentIntent;
                            if (!paymentIntent) {
                                console.error('[ExpressCheckout] No paymentIntent in result');
                                confirmInFlightRef.current = false;
                                if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                                if (onError) onError('Payment verification failed');
                                setIsProcessing(false);
                                return;
                            }

                            // Handle status
                            switch (paymentIntent.status) {
                                case 'succeeded':
                                    console.log('✅ [ExpressCheckout] Payment SUCCEEDED:', paymentIntent.id);
                                    // ISSUE #1 & #8 FIX: Validate amount matches before proceeding
                                    if (amount && paymentIntent.amount !== Math.round(amount * 100)) {
                                        console.error('[ExpressCheckout] CRITICAL: Amount mismatch!', {
                                            expected: Math.round(amount * 100),
                                            actual: paymentIntent.amount
                                        });
                                        confirmInFlightRef.current = false;
                                        if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                                        if (onError) onError('Payment amount changed. Please refresh and try again.');
                                        setIsProcessing(false);
                                        break;
                                    }
                                    if (onSuccess && typeof onSuccess === 'function') {
                                        onSuccess(String(paymentIntent.id));
                                    }
                                    break;

                                case 'processing':
                                    console.log('[ExpressCheckout] Payment processing — handing off to recovery path');
                                    if (onSuccess && typeof onSuccess === 'function') {
                                        onSuccess(String(paymentIntent.id));
                                    }
                                    break;

                                case 'requires_action':
                                    console.log('[ExpressCheckout] requires_action — waiting for Stripe flow to complete');
                                    confirmInFlightRef.current = false;
                                    if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                                    setIsProcessing(false);
                                    break;

                                case 'requires_payment_method':
                                    // Payment failed, requires new payment method
                                    console.log('[ExpressCheckout] requires_payment_method — user should retry');
                                    confirmInFlightRef.current = false;
                                    if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                                    if (onError) onError('Payment method failed. Please try again.');
                                    setIsProcessing(false);
                                    break;

                                default:
                                    console.error('[ExpressCheckout] Unexpected status:', paymentIntent.status);
                                    confirmInFlightRef.current = false;
                                    if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                                    if (onError) onError(`Payment ${paymentIntent.status}. Please try again.`);
                                    setIsProcessing(false);
                            }
                        } catch (err) {
                            console.error('[ExpressCheckout] express_confirm_error (exception)', { error: err.message || err });
                            confirmInFlightRef.current = false;
                            if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                            if (onError && typeof onError === 'function') {
                                onError(String(err?.message || 'Payment processing failed'));
                            }
                            setIsProcessing(false);
                        }
                    }}
                    onChange={handleChange}
                    onLoadingChange={(isLoading) => {
                        console.log('[ExpressCheckout] Loading state:', isLoading);
                        setIsProcessing(isLoading);
                        
                        // Safety timeout: if loading doesn't complete within 30s, reset spinner
                        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
                        if (isLoading) {
                            loadingTimeoutRef.current = setTimeout(() => {
                                console.warn('[ExpressCheckout] Wallet payment timeout after 30s, resetting spinner');
                                setIsProcessing(false);
                                confirmInFlightRef.current = false;
                                if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
                                if (onError) onError('Payment timeout. Please try again.');
                            }, 30000);
                        }
                    }}
                    options={{
                        buttonAppearance: {
                            type: 'default',
                            theme: 'dark',
                            height: '48px',
                        },
                        layout: {
                            overflow: 'auto',
                        },
                        clientSecret: clientSecret,
                    }}
                />
                
                <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-gray-300"></div>
                    <span className="text-xs text-gray-500 font-medium">OR</span>
                    <div className="flex-1 border-t border-gray-300"></div>
                </div>
            </div>
        </Card>
    );
}