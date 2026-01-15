import React, { useState, useEffect } from 'react';
import { PaymentRequestButtonElement, useStripe } from '@stripe/react-stripe-js';
import { Card } from "@/components/ui/card";
import { Loader2 } from 'lucide-react';

export default function ExpressCheckout({ amount, onSuccess, onError, disabled, clientSecret }) {
    const stripe = useStripe();
    const [paymentRequest, setPaymentRequest] = useState(null);
    const [canMakePayment, setCanMakePayment] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (!stripe || !amount || disabled || !clientSecret) {
            return;
        }

        const pr = stripe.paymentRequest({
            country: 'GB',
            currency: 'gbp',
            total: {
                label: 'Total',
                amount: Math.round(amount * 100),
            },
            requestPayerName: true,
            requestPayerEmail: true,
        });

        pr.canMakePayment().then(result => {
            if (result) {
                setPaymentRequest(pr);
                setCanMakePayment(true);
            }
        });

        pr.on('paymentmethod', async (ev) => {
            setIsProcessing(true);
            try {
                const { error, paymentIntent } = await stripe.confirmCardPayment(
                    clientSecret,
                    { payment_method: ev.paymentMethod.id },
                    { handleActions: false }
                );

                if (error) {
                    ev.complete('fail');
                    if (onError) onError(error.message || 'Payment failed');
                    setIsProcessing(false);
                    return;
                }

                ev.complete('success');
                
                if (paymentIntent && paymentIntent.status === 'succeeded' && paymentIntent.id) {
                    if (onSuccess) onSuccess(String(paymentIntent.id));
                }
            } catch (error) {
                ev.complete('fail');
                if (onError) onError(error?.message || 'Payment failed');
            } finally {
                setIsProcessing(false);
            }
        });

        return () => {
            pr.off('paymentmethod');
        };
    }, [stripe, amount, clientSecret, disabled]);

    if (!canMakePayment || !paymentRequest) {
        return null;
    }

    return (
        <Card className="p-4 mb-6">
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Express Checkout</h3>
                    {isProcessing && (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    )}
                </div>
                {paymentRequest && (
                    <PaymentRequestButtonElement
                        options={{
                            paymentRequest,
                            style: {
                                paymentRequestButton: {
                                    type: 'default',
                                    theme: 'dark',
                                    height: '48px',
                                },
                            },
                        }}
                    />
                )}
                <div className="flex items-center gap-2">
                    <div className="flex-1 border-t"></div>
                    <span className="text-xs text-gray-500">OR</span>
                    <div className="flex-1 border-t"></div>
                </div>
            </div>
        </Card>
    );
}