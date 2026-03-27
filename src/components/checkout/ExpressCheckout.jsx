import React, { useState, useEffect } from 'react';
import { PaymentRequestButtonElement, useStripe } from '@stripe/react-stripe-js';
import { Card } from "@/components/ui/card";
import { Loader2, Smartphone } from 'lucide-react';

export default function ExpressCheckout({ amount, onSuccess, onError, disabled, clientSecret, isFormValid }) {
    const stripe = useStripe();
    const [paymentRequest, setPaymentRequest] = useState(null);
    const [canMakePayment, setCanMakePayment] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [debugInfo, setDebugInfo] = useState('');

    useEffect(() => {
        // CRITICAL: Block express checkout if form is not valid (address/phone/restaurant check)
        if (!stripe || !amount || disabled || !clientSecret || !isFormValid) {
            setCanMakePayment(false);
            setPaymentRequest(null);
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
            requestPayerPhone: true,
        });

        pr.canMakePayment().then(result => {
            if (result) {
                console.log('✅ Express checkout available:', result);
                setDebugInfo(`Available: Apple Pay=${!!result.applePay}, Google Pay=${!!result.googlePay}`);
                setPaymentRequest(pr);
                setCanMakePayment(true);
            } else {
                console.log('❌ Express checkout not available on this device/browser');
                setDebugInfo('Not available on this device (try Safari/Chrome on iOS/Android)');
                setCanMakePayment(false);
                setPaymentRequest(null);
            }
        }).catch((err) => {
            console.error('❌ Express checkout error:', err);
            setDebugInfo(`Error: ${err?.message || 'Unknown'}`);
            setCanMakePayment(false);
            setPaymentRequest(null);
        });

        pr.on('paymentmethod', async (ev) => {
            setIsProcessing(true);
            try {
                console.log('🔵 Express checkout payment method received');
                
                const { error, paymentIntent } = await stripe.confirmPayment({
                    clientSecret,
                    payment_method: ev.paymentMethod.id,
                    redirect: 'if_required',
                    confirmParams: {
                        return_url: window.location.href,
                        payment_method_data: {
                            billing_details: {
                                name: ev.payerName || undefined,
                                email: ev.payerEmail || undefined,
                            },
                        },
                    },
                });

                if (error) {
                    console.error('❌ Express payment error:', error);
                    ev.complete('fail');
                    if (onError && typeof onError === 'function') {
                        onError(String(error.message || 'Payment failed'));
                    }
                    setIsProcessing(false);
                    return;
                }

                // CRITICAL: Only mark success AFTER payment is confirmed
                // Handle 'succeeded' and 'processing' (express methods may return before final settlement)
                if (paymentIntent && paymentIntent.id && ['succeeded', 'processing'].includes(paymentIntent.status)) {
                    console.log(`✅ Express payment ${paymentIntent.status}: ${paymentIntent.id}`);
                    ev.complete('success');
                    if (onSuccess && typeof onSuccess === 'function') {
                        onSuccess(String(paymentIntent.id));
                    }
                    setIsProcessing(false);
                } else if (paymentIntent?.status === 'requires_action') {
                    console.log('⚠️ Express payment requires additional action (3D Secure)');
                    ev.complete('fail');
                    setIsProcessing(false);
                    if (onError && typeof onError === 'function') {
                        onError('Payment requires verification. Please use the card form instead.');
                    }
                } else if (paymentIntent) {
                    console.error(`❌ Unexpected express payment status: ${paymentIntent.status}`);
                    ev.complete('fail');
                    setIsProcessing(false);
                    if (onError && typeof onError === 'function') {
                        onError(`Payment status: ${paymentIntent.status}`);
                    }
                } else {
                    console.error('❌ No payment intent returned from confirmPayment');
                    ev.complete('fail');
                    setIsProcessing(false);
                    if (onError && typeof onError === 'function') {
                        onError('Payment processing failed. Please try again.');
                    }
                }
            } catch (error) {
                console.error('❌ Express checkout exception:', error);
                ev.complete('fail');
                if (onError && typeof onError === 'function') {
                    onError(String(error?.message || 'Payment failed'));
                }
            } finally {
                setIsProcessing(false);
            }
        });

        return () => {
            pr.off('paymentmethod');
        };
    }, [stripe, amount, clientSecret, disabled, onSuccess, onError, isFormValid]);

    // Show debugging info in dev mode
    if (import.meta.env.DEV && debugInfo) {
        console.log('[ExpressCheckout]', debugInfo);
    }

    // Only render if payment request is available
    if (!canMakePayment || !paymentRequest) {
        // Return empty in production, but show hint in dev
        if (import.meta.env.DEV) {
            return (
                <Card className="p-3 mb-4 bg-gray-100 border border-gray-300">
                    <p className="text-xs text-gray-600">
                        💳 Express Payment: {debugInfo || 'Loading...'}
                    </p>
                </Card>
            );
        }
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
                <p className="text-xs text-gray-600">Pay with Apple Pay or Google Pay</p>
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
                    <div className="flex-1 border-t border-gray-300"></div>
                    <span className="text-xs text-gray-500 font-medium">OR</span>
                    <div className="flex-1 border-t border-gray-300"></div>
                </div>
            </div>
        </Card>
    );
}