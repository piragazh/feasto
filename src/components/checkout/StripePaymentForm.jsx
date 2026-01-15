import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from 'lucide-react';
import ExpressCheckout from './ExpressCheckout';

export default function StripePaymentForm({ onSuccess, amount, clientSecret }) {
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
            console.log('🔴 Stripe not ready');
            setErrorMessage('Payment system not ready. Please wait a moment.');
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
                }
                
                setErrorMessage(msg);
                setIsProcessing(false);
                return false;
            }
            
            if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
                console.log('✅ Payment succeeded:', result.paymentIntent.id);
                setErrorMessage('');
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
            setErrorMessage(err.message || 'An error occurred. Please try again.');
            setIsProcessing(false);
            return false;
        }
    };

    return (
        <div className="space-y-4">
            <ExpressCheckout
                amount={amount}
                clientSecret={clientSecret}
                onSuccess={(paymentIntentId) => {
                    onSuccess(paymentIntentId);
                }}
                onError={(error) => {
                    setErrorMessage(error);
                }}
                disabled={isProcessing}
            />
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                    🔒 Enter your card details below to complete payment
                </p>
            </div>
            
            {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800 font-medium">
                        ❌ {errorMessage}
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
                        Pay £{amount.toFixed(2)}
                    </>
                )}
            </Button>
            <p className="text-xs text-gray-500 text-center">
                Your payment is secured by Stripe
            </p>
        </div>
    );
}