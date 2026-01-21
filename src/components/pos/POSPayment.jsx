import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { DollarSign, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import NumericKeypad from './NumericKeypad';

export default function POSPayment({ cart, cartTotal, onPaymentComplete }) {
    const [paymentMethod, setPaymentMethod] = useState(null);
    const [cashReceived, setCashReceived] = useState(0);
    const [showKeypad, setShowKeypad] = useState(false);

    const change = cashReceived - cartTotal;

    const handleCashPayment = () => {
        if (cashReceived < cartTotal) {
            toast.error('Insufficient amount');
            return;
        }
        toast.success(`Payment complete. Change: £${change.toFixed(2)}`);
        onPaymentComplete();
        setCashReceived(0);
        setPaymentMethod(null);
    };

    const handleCardPayment = () => {
        toast.success('Card payment processed');
        onPaymentComplete();
        setPaymentMethod(null);
    };

    if (cart.length === 0) {
        return (
            <div className="flex items-center justify-center h-96 bg-gray-800 rounded-lg border border-gray-700">
                <p className="text-gray-400 text-lg">No items to pay for</p>
            </div>
        );
    }

    if (showKeypad && paymentMethod === 'cash') {
        return (
            <div className="max-w-2xl mx-auto">
                <NumericKeypad
                    value={cashReceived}
                    onChange={setCashReceived}
                    onComplete={() => {
                        if (cashReceived >= cartTotal) {
                            handleCashPayment();
                            setShowKeypad(false);
                        } else {
                            toast.error('Insufficient amount');
                        }
                    }}
                />
                <Button
                    onClick={() => {
                        setShowKeypad(false);
                        setCashReceived(0);
                    }}
                    className="w-full mt-4 h-14 text-lg font-bold bg-gray-600 hover:bg-gray-700 text-white"
                >
                    Cancel
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Order Summary */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h2 className="text-white font-bold text-2xl mb-4">Order Summary</h2>

                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                    {cart.map(item => (
                        <div key={item.id} className="flex justify-between text-gray-300 text-lg">
                            <span>{item.quantity}x {item.name}</span>
                            <span>£{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                <div className="border-t border-gray-600 pt-4">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 rounded-lg">
                        <p className="text-blue-200 text-lg mb-2">Total Amount</p>
                        <p className="text-white text-5xl font-bold">£{cartTotal.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* Payment Methods */}
            <div className="grid grid-cols-2 gap-4">
                <Button
                    onClick={() => {
                        setPaymentMethod('cash');
                        setShowKeypad(true);
                    }}
                    className={`h-24 text-2xl font-bold rounded-lg transition-all ${
                        paymentMethod === 'cash'
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-white border-2 border-gray-600'
                    }`}
                >
                    <DollarSign className="h-8 w-8 mr-2" />
                    Cash
                </Button>

                <Button
                    onClick={() => {
                        setPaymentMethod('card');
                        handleCardPayment();
                    }}
                    className={`h-24 text-2xl font-bold rounded-lg transition-all ${
                        paymentMethod === 'card'
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-white border-2 border-gray-600'
                    }`}
                >
                    <CreditCard className="h-8 w-8 mr-2" />
                    Card
                </Button>
            </div>
        </div>
    );
}