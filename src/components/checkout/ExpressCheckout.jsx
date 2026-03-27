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

    const handleChange = (e) => {
        if (e.error) {
            console.warn('[ExpressCheckout] Wallet error:', e.error);
            if (onError && typeof onError === 'function') {
                onError(String(e.error.message || 'Wallet payment failed'));
            }
            setIsProcessing(false);
        }
    };

    const handleClick = (e) => {
        if (!stripe || !elements || !clientSecret || disabled || isProcessing) {
            console.log('[ExpressCheckout] Click blocked - not ready');
            return;
        }
        console.log('[ExpressCheckout] Wallet checkout initiated');
        setIsProcessing(true);
    };

    if (!stripe || !elements || !clientSecret) {
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
                        console.log('[ExpressCheckout] Payment confirmed by wallet');
                        
                        try {
                            // Confirm payment using the PaymentIntent
                            // Express Checkout Element already collected payment method
                            // Just need to confirm the intent
                            console.log('[ExpressCheckout] Confirming payment with clientSecret:', clientSecret?.slice(0, 20) + '...');
                            const { error, paymentIntent } = await stripe.confirmPayment({
                                elements,
                                clientSecret,
                                redirect: 'if_required',
                                confirmParams: {
                                    return_url: window.location.href,
                                    payment_method_data: {
                                        billing_details: {
                                            name: data.billingDetails?.name || undefined,
                                            email: data.billingDetails?.email || undefined,
                                            phone: data.billingDetails?.phone || undefined,
                                            address: data.billingDetails?.address || undefined,
                                        },
                                    },
                                },
                            });
                            console.log('[ExpressCheckout] confirmPayment result:', { error: !!error, status: paymentIntent?.status });

                            if (error) {
                                console.error('[ExpressCheckout] Payment error:', error);
                                if (onError && typeof onError === 'function') {
                                    onError(String(error.message || 'Payment failed'));
                                }
                                setIsProcessing(false);
                                return;
                            }

                            // Success path: payment intent confirmed
                            if (paymentIntent && paymentIntent.status === 'succeeded') {
                                console.log('[ExpressCheckout] ✅ Payment succeeded:', paymentIntent.id);
                                // CRITICAL: Call onSuccess() to trigger order creation
                                // This ensures wallet path uses same flow as card entry
                                if (onSuccess && typeof onSuccess === 'function') {
                                    onSuccess(String(paymentIntent.id));
                                }
                            } else if (paymentIntent) {
                                console.warn('[ExpressCheckout] Unexpected status:', paymentIntent.status);
                                if (onError && typeof onError === 'function') {
                                    onError(`Payment ${paymentIntent.status}. Please try again.`);
                                }
                                setIsProcessing(false);
                            } else {
                                console.error('[ExpressCheckout] No payment intent returned');
                                if (onError && typeof onError === 'function') {
                                    onError('Payment processing failed. Please try again.');
                                }
                                setIsProcessing(false);
                            }
                        } catch (err) {
                            console.error('[ExpressCheckout] Exception:', err);
                            if (onError && typeof onError === 'function') {
                                onError(String(err?.message || 'An error occurred. Please try again.'));
                            }
                            setIsProcessing(false);
                        }
                    }}
                    onChange={handleChange}
                    onClick={handleClick}
                    onLoadingChange={(isLoading) => {
                        if (isLoading) {
                            console.log('[ExpressCheckout] Express element loading');
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