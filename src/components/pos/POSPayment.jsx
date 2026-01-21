import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
                {/* Cash Payment */}
                <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <DollarSign className="h-5 w-5 text-green-500" />
                            <h3 className="text-white font-bold text-lg">Cash Payment</h3>
                        </div>

                        <Button
                            variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                            className={`w-full mb-4 ${paymentMethod === 'cash' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 border-gray-600 text-white'}`}
                            onClick={() => setPaymentMethod('cash')}
                        >
                            Select Cash
                        </Button>

                        {paymentMethod === 'cash' && (
                            <div className="space-y-3">
                                <Input
                                    type="number"
                                    placeholder="Amount received"
                                    value={cashReceived}
                                    onChange={(e) => setCashReceived(e.target.value)}
                                    className="bg-gray-700 border-gray-600 text-white"
                                />
                                
                                {cashReceived && (
                                    <div className="bg-gray-700 p-3 rounded">
                                        <div className="text-gray-400 text-sm mb-1">Change</div>
                                        <div className={`text-2xl font-bold ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            £{Math.max(change, 0).toFixed(2)}
                                        </div>
                                    </div>
                                )}

                                <Button
                                    onClick={handleCashPayment}
                                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold h-12"
                                >
                                    Complete Payment
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Card Payment */}
                <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard className="h-5 w-5 text-blue-500" />
                            <h3 className="text-white font-bold text-lg">Card Payment</h3>
                        </div>

                        <Button
                            variant={paymentMethod === 'card' ? 'default' : 'outline'}
                            className={`w-full mb-4 ${paymentMethod === 'card' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 border-gray-600 text-white'}`}
                            onClick={() => setPaymentMethod('card')}
                        >
                            Select Card
                        </Button>

                        {paymentMethod === 'card' && (
                            <div className="space-y-3">
                                <div className="bg-gradient-to-r from-gray-700 to-gray-600 p-4 rounded text-white">
                                    <p className="text-xs text-gray-300 mb-2">Card Number</p>
                                    <p className="font-mono text-lg">•••• •••• •••• 4242</p>
                                </div>

                                <div className="bg-gray-700 p-3 rounded">
                                    <p className="text-gray-400 text-sm mb-1">Amount</p>
                                    <p className="text-white text-2xl font-bold">£{cardAmount.toFixed(2)}</p>
                                </div>

                                <Button
                                    onClick={handleCardPayment}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12"
                                >
                                    Process Card Payment
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}