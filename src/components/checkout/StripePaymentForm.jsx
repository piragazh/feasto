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
            console.log('Stripe or Elements not ready');
            return;
        }

        setIsProcessing(true);
        console.log('Starting payment confirmation...');

        try {
            // First, validate the form
            const { error: submitError } = await elements.submit();
            if (submitError) {
                console.error('Form validation error:', submitError);
                onError(submitError.message);
                setIsProcessing(false);
                return;
            }

            console.log('Form validated, confirming payment...');
            
            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                redirect: 'if_required'
            });

            console.log('Payment confirmation result:', { error, paymentIntent });

            if (error) {
                console.error('Payment error:', error);
                onError(error.message);
                setIsProcessing(false);
            } else if (paymentIntent) {
                console.log('Payment intent status:', paymentIntent.status);
                if (paymentIntent.status === 'succeeded') {
                    console.log('✅ Payment succeeded!');
                    onSuccess(paymentIntent.id);
                } else {
                    onError(`Payment ${paymentIntent.status}. Please try again.`);
                    setIsProcessing(false);
                }
            } else {
                console.error('No error and no payment intent');
                onError('Payment processing failed. Please try again.');
                setIsProcessing(false);
            }
        } catch (err) {
            console.error('Payment exception:', err);
            onError(err.message || 'Payment failed. Please try again.');
            setIsProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement />
            <Button
                type="submit"
                disabled={!stripe || isProcessing}
                className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg"
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
        </form>
    );
}