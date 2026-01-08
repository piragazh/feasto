import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from 'lucide-react';

export default function StripePaymentForm({ onSuccess, onError, amount }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!stripe || !elements) {
            onError('Payment system not ready. Please wait a moment.');
            return;
        }

        setIsProcessing(true);

        try {
            // First, validate the form is complete
            const { error: submitError } = await elements.submit();
            if (submitError) {
                onError(submitError.message || 'Please complete all payment fields');
                setIsProcessing(false);
                return;
            }
            
            // Confirm the payment
            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                redirect: 'if_required',
                confirmParams: {
                    // Ensure no redirect happens
                }
            });

            if (error) {
                // Payment failed or was incomplete
                onError(error.message || 'Payment failed. Please check your card details and try again.');
                setIsProcessing(false);
            } else if (paymentIntent && paymentIntent.status === 'succeeded') {
                // Payment successful - pass the payment intent ID to create order
                onSuccess(paymentIntent.id);
            } else if (paymentIntent) {
                // Payment in unexpected state
                onError(`Payment ${paymentIntent.status}. Please try again.`);
                setIsProcessing(false);
            } else {
                onError('Payment processing failed. Please try again.');
                setIsProcessing(false);
            }
        } catch (err) {
            onError(err.message || 'An error occurred. Please try again.');
            setIsProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                    🔒 Enter your card details below to complete payment
                </p>
            </div>
            <PaymentElement />
            <Button
                type="submit"
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
        </form>
    );
}