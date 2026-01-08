import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from 'lucide-react';

export default function StripePaymentForm({ onSuccess, amount }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isFormComplete, setIsFormComplete] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage(''); // Clear previous errors

        if (!stripe || !elements) {
            const msg = 'Payment system not ready. Please wait a moment.';
            setErrorMessage(msg);
            return;
        }

        if (!isFormComplete) {
            const msg = 'Please complete all card details before submitting.';
            setErrorMessage(msg);
            return;
        }

        setIsProcessing(true);

        try {
            // First, validate the form is complete
            const { error: submitError } = await elements.submit();
            if (submitError) {
                const msg = submitError.message || 'Please complete all payment fields correctly';
                setErrorMessage(msg);
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
                // Payment failed - show specific error
                let msg = error.message || 'Payment failed. Please check your card details and try again.';
                
                // Provide more user-friendly messages for common errors
                if (error.type === 'card_error') {
                    if (error.code === 'card_declined') {
                        msg = 'Your card was declined. Please try a different card or contact your bank.';
                    } else if (error.code === 'insufficient_funds') {
                        msg = 'Insufficient funds. Please use a different payment method.';
                    } else if (error.code === 'expired_card') {
                        msg = 'Your card has expired. Please use a different card.';
                    } else if (error.code === 'incorrect_cvc') {
                        msg = 'Incorrect security code (CVC). Please check and try again.';
                    } else if (error.code === 'incorrect_number') {
                        msg = 'Invalid card number. Please check and try again.';
                    }
                }
                
                setErrorMessage(msg);
                setIsProcessing(false);
            } else if (paymentIntent && paymentIntent.status === 'succeeded') {
                // Payment successful
                setErrorMessage('');
                onSuccess(paymentIntent.id);
            } else if (paymentIntent) {
                // Payment in unexpected state
                const msg = `Payment ${paymentIntent.status}. Please try again.`;
                setErrorMessage(msg);
                setIsProcessing(false);
            } else {
                const msg = 'Payment processing failed. Please try again.';
                setErrorMessage(msg);
                setIsProcessing(false);
            }
        } catch (err) {
            const msg = err.message || 'An error occurred. Please try again.';
            setErrorMessage(msg);
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
            
            {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800 font-medium">
                        ❌ {errorMessage}
                    </p>
                </div>
            )}
            
            <PaymentElement 
                onChange={(e) => {
                    setIsFormComplete(e.complete);
                    if (e.complete) setErrorMessage(''); // Clear error when form becomes complete
                }}
            />
            <Button
                type="submit"
                disabled={!stripe || !elements || isProcessing || !isFormComplete}
                className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isProcessing ? (
                    <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Processing Payment...
                    </>
                ) : !isFormComplete ? (
                    <>
                        <CreditCard className="h-5 w-5 mr-2" />
                        Enter Card Details
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