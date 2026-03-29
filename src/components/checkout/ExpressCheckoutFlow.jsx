import React, { useState, useRef, useEffect } from 'react';
import { ExpressCheckoutElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card } from "@/components/ui/card";
import { Loader2, Smartphone } from 'lucide-react';

/**
 * SEPARATE EXPRESS CHECKOUT FLOW
 * 
 * This is a completely independent payment flow that handles wallet payments
 * (Apple Pay, Google Pay, Link) WITHOUT sharing Elements with card payment form.
 * 
 * Critical isolation: This component manages its own Stripe interaction without
 * interfering with manual card entry in StripePaymentForm.
 */
export default function ExpressCheckoutFlow({ amount, onSuccess, onError, clientSecret }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const loadingTimeoutRef = useRef(null);
    const confirmFiredRef = useRef(false);
    const clientSecretRef = useRef(clientSecret);

    // Sync clientSecret ref on prop change (handles price/coupon updates)
    useEffect(() => {
        clientSecretRef.current = clientSecret;
    }, [clientSecret]);

    // Guard: must have all Stripe context and props before rendering
    if (!stripe || !elements) {
        console.warn('[ExpressCheckoutFlow] Missing Stripe context — stripe=' + !!stripe + ' elements=' + !!elements);
        return null;
    }
    
    if (!clientSecret) {
        console.warn('[ExpressCheckoutFlow] Missing clientSecret');
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
                        if (confirmFiredRef.current) {
                            console.warn('[ExpressCheckoutFlow] Double-fire blocked');
                            return;
                        }
                        confirmFiredRef.current = true;
                        setIsProcessing(true);

                        try {
                            const result = await stripe.confirmPayment({
                                elements,
                                clientSecret: clientSecretRef.current,
                                redirect: 'if_required',
                                confirmParams: {
                                    return_url: window.location.href,
                                },
                            });

                            if (result.error) {
                                onError?.(result.error.message);
                                confirmFiredRef.current = false;
                            } else if (result.paymentIntent?.status === 'succeeded') {
                                onSuccess?.(result.paymentIntent.id);
                            } else if (result.paymentIntent?.status === 'processing') {
                                onSuccess?.(result.paymentIntent.id);
                            }
                        } catch (err) {
                            onError?.(err.message);
                            confirmFiredRef.current = false;
                        } finally {
                            setIsProcessing(false);
                        }
                    }}
                    onChange={(e) => {
                        if (e.error) setLoadError(e.error.message);
                        else setLoadError(null);
                    }}
                    onLoadingChange={(isLoading) => {
                        setIsProcessing(isLoading);
                        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
                        if (isLoading) {
                            loadingTimeoutRef.current = setTimeout(() => {
                                setIsProcessing(false);
                                confirmFiredRef.current = false;
                                onError?.('Wallet payment timeout');
                            }, 30000);
                        }
                    }}
                    options={{
                        buttonAppearance: {
                            type: 'default',
                            theme: 'dark',
                            height: '48px',
                        },
                        layout: { overflow: 'auto' },
                        clientSecret: clientSecret,
                    }}
                />
                
                {loadError && (
                    <p className="text-xs text-red-600 text-center">{loadError}</p>
                )}
            </div>
        </Card>
    );
}