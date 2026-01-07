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
            return;
        }

        setIsProcessing(true);

        try {
            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: window.location.origin,
                },
                redirect: 'if_required'
            });

            if (error) {
                onError(error.message);
                setIsProcessing(false);
            } else if (paymentIntent) {
                if (paymentIntent.status === 'succeeded') {
                    onSuccess(paymentIntent.id);
                } else {
                    onError(`Payment ${paymentIntent.status}. Please try again.`);
                    setIsProcessing(false);
                }
            } else {
                onError('Payment processing failed. Please try again.');
                setIsProcessing(false);
            }
        } catch (err) {
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