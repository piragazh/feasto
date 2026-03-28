import React, { useState, useRef, useEffect } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from 'lucide-react';
import ExpressCheckout from './ExpressCheckout';
import { checkoutTrace } from '@/lib/checkoutTrace';
import { useExpressCheckoutFlag } from '@/hooks/useExpressCheckoutFlag';

export default function StripePaymentForm({ onSuccess, amount, clientSecret, expressConfirmFiredRef, sessionKeyAtFormRender, getSessionKey }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isFormComplete, setIsFormComplete] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    // Local ref for manual card submit dedup
    const submitFiredRef = useRef(false);
    // FIX #6: Capture the clientSecret at render time (component is re-keyed on rotation)
    const clientSecretAtMountRef = useRef(clientSecret);
    // FIX #12: Track if component is still mounted to prevent setState on unmounted component
    const isMountedRef = useRef(true);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    const expressCheckoutEnabled = useExpressCheckoutFlag();
    // ISSUE #3 FIX: Track PI creation time to warn if expired (>10 min)
    const [piCreatedAtMs] = useState(() => {
        checkoutTrace.log('stripe_payment_form_mounted', { hasStripe: !!stripe, hasElements: !!elements, hasClientSecret: !!clientSecret, expressCheckoutEnabled });
        return Date.now();
    });
    
    // ISSUE #3: Warn if PI older than 10 minutes
    const piAgeMs = Date.now() - piCreatedAtMs;
    const piExpired = piAgeMs > 600_000; // 10 minutes

    const handleSubmit = async (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // FIX #12: Guard against back-button unmounting component mid-flight
        if (!isMountedRef.current) {
            console.warn('[StripePaymentForm] Component unmounted — ignoring submit');
            return false;
        }

        // ATOMIC GUARD: prevent double-click / double-submit
        if (submitFiredRef.current) {
            console.warn('🟡 Submit already in progress — ignoring duplicate');
            return false;
        }
        submitFiredRef.current = true;

        checkoutTrace.log('confirm_payment_started', { hasStripe: !!stripe, hasElements: !!elements });
        console.log('🔵 Payment form submitted');
        if (isMountedRef.current) setErrorMessage('');

        if (!stripe || !elements) {
            console.log('🔴 Stripe not ready');
            setErrorMessage('Payment system not ready. Please wait a moment.');
            setIsProcessing(false);
            submitFiredRef.current = false;
            return false;
        }

        // FIX #6: Reject if session key has rotated since this form was rendered
        if (getSessionKey && sessionKeyAtFormRender) {
            const currentKey = getSessionKey();
            if (currentKey !== sessionKeyAtFormRender) {
                console.warn('[StripePaymentForm] Session key rotated since render — rejecting stale confirmation');
                setErrorMessage('Your payment session changed. Please wait a moment and try again.');
                setIsProcessing(false);
                submitFiredRef.current = false;
                return false;
            }
        }

        setIsProcessing(true);

        try {
            console.log('🔵 Submitting payment elements...');
            const { error: submitError } = await elements.submit();
            if (submitError) {
                console.log('🔴 Submit error:', submitError);
                if (isMountedRef.current) {
                    setErrorMessage(submitError.message || 'Please complete all payment fields correctly');
                    setIsProcessing(false);
                }
                submitFiredRef.current = false; // BUG FIX: unlock so user can retry after form error
                return false;
            }
            
            if (!clientSecret) {
                console.log('🔴 No clientSecret available');
                if (isMountedRef.current) setErrorMessage('Payment session expired. Please refresh and try again.');
                setIsProcessing(false);
                return false;
            }

            // FIX #12: Guard against back-button before confirmPayment
            if (!isMountedRef.current) {
                console.warn('[StripePaymentForm] Component unmounted before confirmPayment');
                return false;
            }

            console.log('🔵 Confirming payment with clientSecret:', clientSecret?.slice(0, 20) + '...');
            // FIX #6: Use the clientSecret captured at mount time (not the closure value which may be stale)
            const secretToUse = clientSecretAtMountRef.current || clientSecret;
            const result = await stripe.confirmPayment({
                elements,
                clientSecret: secretToUse,
                redirect: 'if_required',
                confirmParams: {
                    return_url: `${window.location.protocol}//${window.location.host}/checkout`
                }
            });

            // FIX #12: Guard after async operation completes
            if (!isMountedRef.current) {
                console.warn('[StripePaymentForm] Component unmounted after confirmPayment');
                return false;
            }

            console.log('🔵 Payment result:', result);
            
            // ISSUE #8 FIX: Validate amount matches to catch stale secrets
            if (result.paymentIntent && result.paymentIntent.amount !== Math.round(amount * 100)) {
                console.error('[StripePaymentForm] CRITICAL: Amount mismatch after confirm!', {
                    expected: Math.round(amount * 100),
                    actual: result.paymentIntent.amount
                });
                checkoutTrace.error('confirm_payment_amount_mismatch', { 
                    expectedAmount: Math.round(amount * 100),
                    actualAmount: result.paymentIntent.amount,
                    piId: result.paymentIntent?.id
                });
                if (isMountedRef.current) setErrorMessage('Payment amount mismatch. Please refresh and try again.');
                setIsProcessing(false);
                submitFiredRef.current = false;
                return false;
            }

            if (result.error) {
                console.log('🔴 Payment error:', result.error);
                let msg = result.error.message || 'Payment failed. Please check your card details and try again.';
                
                if (result.error.type === 'card_error') {
                    if (result.error.code === 'card_declined') {
                        msg = 'Your card was declined. Please try a different card or contact your bank.';
                    } else if (result.error.code === 'insufficient_funds') {
                        msg = 'Insufficient funds. Please use a different payment method.';
                    } else if (result.error.code === 'expired_card') {
                        msg = 'Your card has expired. Please use a different card.';
                    } else if (result.error.code === 'incorrect_cvc') {
                        msg = 'Incorrect security code (CVC). Please check and try again.';
                    } else if (result.error.code === 'incorrect_number') {
                        msg = 'Invalid card number. Please check and try again.';
                    }
                }
                
                if (isMountedRef.current) setErrorMessage(msg);
                setIsProcessing(false);
                submitFiredRef.current = false; // Unlock on failure
                return false;
            }
            
            if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
                checkoutTrace.log('confirm_payment_succeeded', { piId: result.paymentIntent.id });
                console.log('✅ Payment succeeded:', result.paymentIntent.id);
                if (isMountedRef.current) setErrorMessage('');
                // Do NOT reset submitFiredRef — keeps guard active to prevent double-calls
                if (isMountedRef.current && onSuccess) onSuccess(result.paymentIntent.id);
                return true;
            }
            
            if (result.paymentIntent) {
                checkoutTrace.error('confirm_payment_unexpected_status', { status: result.paymentIntent.status, piId: result.paymentIntent.id });
                console.log('🔴 Unexpected payment status:', result.paymentIntent.status);
                if (isMountedRef.current) setErrorMessage(`Payment ${result.paymentIntent.status}. Please try again.`);
                setIsProcessing(false);
                submitFiredRef.current = false; // BUG FIX: unlock so user can retry
                return false;
            }
            
            console.log('🔴 No payment intent returned');
            if (isMountedRef.current) setErrorMessage('Payment processing failed. Please try again.');
            setIsProcessing(false);
            submitFiredRef.current = false; // BUG FIX: unlock so user can retry
            return false;
        } catch (err) {
            console.log('🔴 Exception:', err);
            if (isMountedRef.current) setErrorMessage(String(err?.message || 'An error occurred. Please try again.'));
            setIsProcessing(false);
            submitFiredRef.current = false; // Unlock on failure
            return false;
        }
    };

    return (
        <div className="space-y-4">
            {piExpired && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800 font-medium">
                        Payment session may have expired (created {Math.round(piAgeMs / 60_000)} minutes ago). Please refresh if you encounter issues.
                    </p>
                </div>
            )}
            {expressCheckoutEnabled && amount && clientSecret && (
                <ExpressCheckout
                    key={clientSecret}
                    amount={amount}
                    clientSecret={clientSecret}
                    expressConfirmFiredRef={expressConfirmFiredRef}
                    onSuccess={(paymentIntentId) => {
                        console.log('[StripePaymentForm] Express Checkout success, calling onSuccess()');
                        onSuccess(paymentIntentId);
                    }}
                    onError={(error) => {
                        console.log('[StripePaymentForm] Express Checkout error:', error);
                        setErrorMessage(String(error || 'Payment failed'));
                        setIsProcessing(false);
                    }}
                    disabled={isProcessing}
                />
            )}
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                    🔒 Enter your card details below to complete payment
                </p>
            </div>
            
            {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800 font-medium">
                        ❌ {String(errorMessage)}
                    </p>
                </div>
            )}
            
            <PaymentElement 
                options={{
                    layout: 'accordion',
                    wallets: {
                        applePay: 'auto',
                        googlePay: 'auto'
                    },
                    terms: {
                        card: 'never'
                    }
                }}
                onChange={(e) => {
                    setIsFormComplete(e.complete);
                    if (e.complete) setErrorMessage('');
                }}
                onReady={() => {
                    console.log('✅ Payment Element ready');
                }}
            />
            <Button
                type="button"
                onClick={handleSubmit}
                disabled={!stripe || !elements || isProcessing}
                className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isProcessing ? (
                    <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Processing Payment...
                    </>
                ) : (
                    <>
                        <CreditCard className="h-5 w-5 mr-2" />
                        Pay £{amount ? amount.toFixed(2) : '0.00'}
                    </>
                )}
            </Button>
            <p className="text-xs text-gray-500 text-center">
                Your payment is secured by Stripe
            </p>
        </div>
    );
}