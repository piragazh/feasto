import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from 'lucide-react';
import ExpressCheckout from './ExpressCheckout';

export default function StripePaymentForm({ onSuccess, amount, clientSecret, isFormValid = true }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isFormComplete, setIsFormComplete] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        console.log('🔵 Payment form submitted');
        setErrorMessage('');

        if (!stripe || !elements) {
            console.error('❌ Stripe SDK error:', { stripe: !!stripe, elements: !!elements });
            setErrorMessage('Payment system not ready. Please refresh the page and try again.');
            return false;
        }

        setIsProcessing(true);

        try {
            console.log('🔵 Submitting payment elements...');
            const { error: submitError } = await elements.submit();
            if (submitError) {
                console.log('🔴 Submit error:', submitError);
                setErrorMessage(submitError.message || 'Please complete all payment fields correctly');
                setIsProcessing(false);
                return false;
            }
            
            console.log('🔵 Confirming payment (if_required redirect)...');
            const result = await stripe.confirmPayment({
                elements,
                redirect: 'if_required',
                confirmParams: {
                    return_url: window.location.href
                }
            });

            console.log('🔵 Payment result:', result);

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
                } else if (result.error.type === 'authentication_error') {
                    msg = 'Payment verification failed (3D Secure). Please try a different card.';
                } else if (result.error.type === 'api_error') {
                    msg = 'Payment processing error. Please contact support or try again later.';
                }
                
                setErrorMessage(msg);
                setIsProcessing(false);
                return false;
            }
            
            // Handle 'requires_action' (3D Secure) - NOT success
            if (result.paymentIntent?.status === 'requires_action') {
                console.log('⚠️ Payment requires action (3D Secure):', result.paymentIntent.id);
                setErrorMessage('Payment verification required. Please complete additional verification step.');
                setIsProcessing(false);
                return false;
            }
            
            // Only 'succeeded' and 'processing' are valid success states
            if (result.paymentIntent && result.paymentIntent.id && ['succeeded', 'processing'].includes(result.paymentIntent.status)) {
                console.log(`✅ Payment ${result.paymentIntent.status}: ${result.paymentIntent.id}`);
                setErrorMessage('');
                setIsProcessing(false);
                onSuccess(result.paymentIntent.id);
                return true;
            }
            
            if (result.paymentIntent) {
                console.log('🔴 Unexpected payment status:', result.paymentIntent.status);
                setErrorMessage(`Payment ${result.paymentIntent.status}. Please try again.`);
                setIsProcessing(false);
                return false;
            }
            
            console.log('🔴 No payment intent returned');
            setErrorMessage('Payment processing failed. Please try again.');
            setIsProcessing(false);
            return false;
        } catch (err) {
            console.log('🔴 Exception:', err);
            setErrorMessage(String(err?.message || 'An error occurred. Please try again.'));
            setIsProcessing(false);
            return false;
        }
    };

    return (
        <div className="space-y-4">
            {amount && clientSecret && (
                <ExpressCheckout
                    amount={amount}
                    clientSecret={clientSecret}
                    isFormValid={isFormValid}
                    onSuccess={(paymentIntentId) => {
                        onSuccess(paymentIntentId);
                    }}
                    onError={(error) => {
                        setErrorMessage(String(error || 'Payment failed'));
                    }}
                    disabled={isProcessing || !isFormValid}
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
                    console.log('PaymentElement onChange:', { complete: e.complete, value: !!e.value });
                    setIsFormComplete(e.complete);
                    if (e.complete) setErrorMessage('');
                }}
                onReady={() => {
                    console.log('✅ Payment Element ready');
                }}
                onLoadError={(e) => {
                    console.error('❌ Payment Element load error:', e);
                    const errorMsg = e?.message || (typeof e === 'string' ? e : 'Unknown error');
                    setErrorMessage(`Payment form failed to load: ${String(errorMsg).slice(0, 100)}. Please refresh and try again.`);
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