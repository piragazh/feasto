import React, { useState } from 'react';
import { ExpressCheckoutElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card } from "@/components/ui/card";
import { Loader2, Smartphone } from 'lucide-react';

/**
 * ExpressCheckout — Stripe Express Checkout Element
 * 
 * Modern wallet integration (Apple Pay, Google Pay, Link)
 * Replaces deprecated PaymentRequestButtonElement
 * 
 * Safety guarantees:
 * - Uses Stripe's built-in PaymentIntent confirmation
 * - onSuccess() only fires when payment actually succeeded
 * - Converges into same order-creation path as card entry
 * - No silent payment-success-but-order-failure scenarios
 */
export default function ExpressCheckout({ amount, onSuccess, onError, disabled, clientSecret }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadError, setLoadError] = useState(null);

    const handleChange = (e) => {
        if (e.error) {
            console.warn('[ExpressCheckout] Wallet error:', e.error);
            setLoadError(e.error.message);
            if (onError && typeof onError === 'function') {
                onError(String(e.error.message || 'Wallet payment failed'));
            }
            setIsProcessing(false);
        } else {
            setLoadError(null);
        }
    };

    const handleClick = (e) => {
        if (!stripe || !elements || !clientSecret || disabled || isProcessing) {
            console.log('[ExpressCheckout] Click blocked - not ready', { stripe: !!stripe, elements: !!elements, clientSecret: !!clientSecret, disabled, isProcessing });
            return;
        }
        console.log('[ExpressCheckout] Wallet checkout initiated');
        setIsProcessing(true);
    };

    // CRITICAL: If no clientSecret or Stripe not ready, show nothing (but don't null out completely)
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
                        console.log('[ExpressCheckout] onConfirm fired by wallet element');
                        
                        // CRITICAL: ExpressCheckoutElement automatically confirms the PaymentIntent
                        // We receive confirmation via onConfirm callback with stripe attached
                        // The wallet button's onConfirm is ONLY called when payment succeeds
                        if (!data || !stripe) {
                            console.error('[ExpressCheckout] Missing data or stripe in onConfirm');
                            if (onError) onError('Payment verification failed');
                            setIsProcessing(false);
                            return;
                        }

                        try {
                            // CRITICAL FIX: The ExpressCheckoutElement button auto-confirms
                            // and passes the result via data.paymentIntent
                            // Retrieve the confirmed intent from Stripe to get final status
                            console.log('[ExpressCheckout] Retrieving payment intent status after wallet confirmation');
                            
                            let paymentIntent;
                            if (data.paymentIntent) {
                                // Primary path: ExpressCheckoutElement provides paymentIntent in callback
                                paymentIntent = data.paymentIntent;
                            } else {
                                // Fallback: retrieve from Stripe using clientSecret
                                console.log('[ExpressCheckout] No paymentIntent in callback data, retrieving via clientSecret');
                                if (!clientSecret) {
                                    throw new Error('No clientSecret available for verification');
                                }
                                const retrieveResult = await stripe.retrievePaymentIntent(clientSecret);
                                if (retrieveResult.error) {
                                    throw new Error(retrieveResult.error.message || 'Could not retrieve payment intent');
                                }
                                paymentIntent = retrieveResult.paymentIntent;
                                if (!paymentIntent) {
                                    throw new Error('PaymentIntent not found after retrieval');
                                }
                            }

                            console.log('[ExpressCheckout] Payment intent retrieved:', {
                                id: paymentIntent?.id?.slice(0, 20),
                                status: paymentIntent?.status
                            });

                            // SUCCESS: Payment intent confirmed
                            if (paymentIntent && paymentIntent.status === 'succeeded') {
                                console.log('✅ [ExpressCheckout] Payment SUCCEEDED:', paymentIntent.id);
                                // CRITICAL: Extract and pass the paymentIntentId to onSuccess
                                if (onSuccess && typeof onSuccess === 'function') {
                                    onSuccess(String(paymentIntent.id));
                                }
                            } else {
                                // FAILURE: Unexpected status
                                const status = paymentIntent?.status || 'unknown';
                                console.error('[ExpressCheckout] Payment not succeeded. Status:', status);
                                if (onError && typeof onError === 'function') {
                                    onError(`Payment ${status}. Please try again.`);
                                }
                                setIsProcessing(false);
                            }
                        } catch (err) {
                            console.error('[ExpressCheckout] Exception in onConfirm:', err.message || err);
                            if (onError && typeof onError === 'function') {
                                onError(String(err?.message || 'Payment processing failed'));
                            }
                            setIsProcessing(false);
                        }
                    }}
                    onChange={handleChange}
                    onClick={handleClick}
                    onLoadingChange={(isLoading) => {
                        console.log('[ExpressCheckout] Loading state:', isLoading);
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