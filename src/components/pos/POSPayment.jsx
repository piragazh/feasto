import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { DollarSign, CreditCard, AlertCircle, Smartphone, Wallet, Clock } from 'lucide-react';
import { toast } from 'sonner';
import NumericKeypad from './NumericKeypad';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function POSPayment({ cart, cartTotal, onPaymentComplete, onBackToCart }) {
    const [paymentMethod, setPaymentMethod] = useState(null);
    const [cashReceived, setCashReceived] = useState(0);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const change = cashReceived - cartTotal;

    const handleCashPayment = () => {
        if (cart.length === 0) {
            toast.error('Cart is empty');
            return;
        }
        if (cartTotal <= 0) {
            toast.error('Invalid total amount');
            return;
        }
        if (cashReceived < cartTotal) {
            toast.error('Insufficient amount');
            return;
        }
        toast.success(`Payment complete. Change: £${change.toFixed(2)}`);
        onPaymentComplete();
        setCashReceived(0);
        setPaymentMethod(null);
    };

    const validateCardPayment = () => {
        if (cart.length === 0) {
            toast.error('Cart is empty');
            return false;
        }
        if (cartTotal <= 0) {
            toast.error('Invalid total amount');
            return false;
        }
        return true;
    };

    const handleDigitalPayment = async (method, methodName) => {
        if (!validateCardPayment()) return;
        setPaymentMethod(method);
        setShowConfirmDialog(true);
    };

    const processDigitalPayment = async () => {
        setIsProcessing(true);
        try {
            const methodNames = {
                card: 'Card',
                apple_pay: 'Apple Pay',
                google_pay: 'Google Pay',
                pay_later: 'Pay Later'
            };
            toast.success(`${methodNames[paymentMethod]} payment processed`);
            onPaymentComplete();
            setPaymentMethod(null);
            setShowConfirmDialog(false);
        } catch (error) {
            toast.error('Payment failed');
        } finally {
            setIsProcessing(false);
        }
    };

    if (cart.length === 0) {
        return (
            <div className="flex items-center justify-center h-96 bg-gray-800 rounded-lg border border-gray-700">
                <p className="text-gray-400 text-lg">No items to pay for</p>
            </div>
        );
    }

    const balance = cashReceived - cartTotal;
    const canCompletePayment = cashReceived >= cartTotal;

    return (
        <div className="grid grid-cols-2 gap-6 h-full">
            {/* LEFT: Order Summary */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-white font-bold text-2xl">Order Summary</h2>
                            <Button
                                onClick={onBackToCart}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded h-10"
                            >
                                Back to Cart
                            </Button>
                        </div>

                <div className="space-y-2 mb-4 flex-1 overflow-y-auto">
                    {cart.map(item => (
                        <div key={item.id} className="flex justify-between text-gray-300 text-lg">
                            <span>{item.quantity}x {item.name}</span>
                            <span>£{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                <div className="border-t border-gray-600 pt-4 mt-auto">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 rounded-lg">
                        <p className="text-blue-200 text-lg mb-2">Total Amount</p>
                        <p className="text-white text-5xl font-bold">£{cartTotal.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* RIGHT: Payment Methods & Keypad */}
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 flex flex-col">
                {/* Payment Method Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <Button
                        onClick={() => setPaymentMethod('cash')}
                        className={`h-16 text-lg font-bold rounded-lg transition-all ${
                            paymentMethod === 'cash'
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-700 hover:bg-gray-600 text-white border-2 border-gray-600'
                        }`}
                    >
                        <DollarSign className="h-5 w-5 mr-2" />
                        Cash
                    </Button>

                    <Button
                        onClick={() => handleDigitalPayment('card', 'Card')}
                        className="h-16 text-lg font-bold rounded-lg transition-all bg-gray-700 hover:bg-gray-600 text-white border-2 border-gray-600"
                        disabled={isProcessing}
                    >
                        <CreditCard className="h-5 w-5 mr-2" />
                        Card
                    </Button>

                    <Button
                        onClick={() => handleDigitalPayment('apple_pay', 'Apple Pay')}
                        className="h-16 text-lg font-bold rounded-lg transition-all bg-gray-700 hover:bg-gray-600 text-white border-2 border-gray-600"
                        disabled={isProcessing}
                    >
                        <Smartphone className="h-5 w-5 mr-2" />
                        Apple Pay
                    </Button>

                    <Button
                        onClick={() => handleDigitalPayment('google_pay', 'Google Pay')}
                        className="h-16 text-lg font-bold rounded-lg transition-all bg-gray-700 hover:bg-gray-600 text-white border-2 border-gray-600"
                        disabled={isProcessing}
                    >
                        <Wallet className="h-5 w-5 mr-2" />
                        Google Pay
                    </Button>

                    <Button
                        onClick={() => handleDigitalPayment('pay_later', 'Pay Later')}
                        className="h-16 text-lg font-bold rounded-lg transition-all bg-gray-700 hover:bg-gray-600 text-white border-2 border-gray-600 col-span-2"
                        disabled={isProcessing}
                    >
                        <Clock className="h-5 w-5 mr-2" />
                        Pay Later
                    </Button>
                </div>

                {/* Cash Input Section */}
                {paymentMethod === 'cash' && (
                    <div className="flex-1 flex flex-col">
                        {/* Amount Display */}
                        <div className="bg-gradient-to-r from-green-600 to-green-700 p-4 rounded-lg mb-4">
                            <p className="text-green-200 text-sm mb-1">Amount Received</p>
                            <p className="text-white text-4xl font-bold">£{cashReceived.toFixed(2)}</p>
                        </div>

                        {/* Balance Display */}
                        <div className={`p-4 rounded-lg mb-4 ${
                            canCompletePayment 
                                ? 'bg-blue-600' 
                                : 'bg-red-600'
                        }`}>
                            <p className="text-gray-100 text-sm mb-1">
                                {canCompletePayment ? 'Balance (Change)' : 'Amount Due'}
                            </p>
                            <p className={`text-2xl font-bold ${
                                canCompletePayment 
                                    ? 'text-green-200' 
                                    : 'text-red-200'
                            }`}>
                                £{Math.abs(balance).toFixed(2)}
                            </p>
                        </div>

                        {/* Numeric Keypad */}
                        <div className="flex-1 flex flex-col">
                            <NumericKeypad
                                value={cashReceived}
                                onChange={setCashReceived}
                                onComplete={() => {
                                    if (cashReceived >= cartTotal) {
                                        handleCashPayment();
                                    } else {
                                        toast.error('Insufficient amount');
                                    }
                                }}
                            />
                        </div>

                        {/* Cancel Button */}
                        <Button
                            onClick={() => {
                                setPaymentMethod(null);
                                setCashReceived(0);
                            }}
                            className="w-full mt-4 h-12 text-lg font-bold bg-gray-700 hover:bg-gray-600 text-white"
                        >
                            Cancel
                        </Button>
                    </div>
                )}
            </div>

            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent className="bg-gray-800 border-gray-700">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-blue-500" />
                            Confirm Payment
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-300">
                            {paymentMethod === 'pay_later' 
                                ? `Mark order as "Pay Later" for £${cartTotal.toFixed(2)}?`
                                : `Process payment for £${cartTotal.toFixed(2)}?`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-gray-700 hover:bg-gray-600 text-white border-gray-600">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={processDigitalPayment}
                            disabled={isProcessing}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isProcessing ? 'Processing...' : 'Confirm Payment'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}