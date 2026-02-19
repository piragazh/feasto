import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { DollarSign, CreditCard, AlertCircle, PlusCircle, Trash2, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import NumericKeypad from './NumericKeypad';
import { savePendingOrder } from './POSOfflineDB';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const QUICK_AMOUNTS = [5, 10, 20, 50];

export default function POSPayment({ cart, cartTotal, onPaymentComplete, onBackToCart, restaurantId, restaurantName, orderType }) {
    // Split payment: array of { method, amount }
    const [payments, setPayments] = useState([]);
    const [activeMethod, setActiveMethod] = useState(null); // 'cash' | 'card' | null
    const [rawValue, setRawValue] = useState('');
    const [showCardConfirm, setShowCardConfirm] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, cartTotal - totalPaid);
    const change = totalPaid - cartTotal;
    const numericInput = rawValue === '' ? 0 : parseInt(rawValue, 10) / 100;

    const createOrder = async (paymentSummary) => {
        if (!restaurantId) return;
        const dominantMethod = paymentSummary.length === 1 ? paymentSummary[0].method : 'cash';
        const orderData = {
            restaurant_id: restaurantId,
            restaurant_name: restaurantName || 'POS Order',
            items: cart.map(item => ({
                menu_item_id: item.menu_item_id || item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                customizations: item.customizations || {}
            })),
            subtotal: cartTotal,
            delivery_fee: 0,
            discount: 0,
            total: cartTotal,
            status: 'confirmed',
            order_type: orderType || 'collection',
            payment_method: dominantMethod,
            notes: paymentSummary.length > 1
                ? paymentSummary.map(p => `${p.method}: £${p.amount.toFixed(2)}`).join(', ')
                : undefined,
        };

        if (!navigator.onLine) {
            // Save to IndexedDB for later sync
            await savePendingOrder(orderData);
            return { offline: true };
        }

        await base44.entities.Order.create(orderData);
        return { offline: false };
    };

    const completePayment = async (finalPayments) => {
        setIsProcessing(true);
        try {
            await createOrder(finalPayments);
            const hasCash = finalPayments.find(p => p.method === 'cash');
            if (hasCash) {
                toast.success(`Payment complete. Change: £${change.toFixed(2)}`);
            } else {
                toast.success('Payment complete');
            }
            onPaymentComplete();
        } catch (e) {
            toast.error('Payment failed');
        } finally {
            setIsProcessing(false);
        }
    };

    // Add a payment entry
    const addPayment = (method, amount) => {
        if (amount <= 0) return;
        const allPayments = [...payments, { method, amount }];
        setPayments(allPayments);
        setActiveMethod(null);
        setRawValue('');

        const newTotalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
        if (newTotalPaid >= cartTotal) {
            // Auto complete
            completePayment(allPayments);
        }
    };

    const removePayment = (idx) => {
        setPayments(prev => prev.filter((_, i) => i !== idx));
    };

    // Cash quick button: use remaining if amount > remaining
    const handleQuickCash = (amount) => {
        addPayment('cash', Math.min(amount, remaining === 0 ? amount : amount));
    };

    // Cash keypad confirm
    const handleCashConfirm = () => {
        if (numericInput <= 0) {
            toast.error('Enter an amount');
            return;
        }
        addPayment('cash', numericInput);
    };

    // Card confirm
    const processCard = async () => {
        const amount = numericInput > 0 ? numericInput : remaining;
        addPayment('card', amount);
        setShowCardConfirm(false);
    };

    if (cart.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 bg-gray-800 rounded-lg border border-gray-700">
                <p className="text-gray-400 text-lg">No items to pay for</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-4 h-full">
            {/* LEFT: Summary */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-white font-bold text-lg">Order Summary</h2>
                    {onBackToCart && (
                        <Button onClick={onBackToCart} size="sm"
                            className="bg-gray-700 hover:bg-gray-600 text-white h-8 px-3 text-sm">
                            ← Back
                        </Button>
                    )}
                </div>

                <div className="space-y-1 flex-1 overflow-y-auto mb-3">
                    {cart.map(item => (
                        <div key={item.id} className="flex justify-between text-gray-300 text-sm">
                            <span>{item.quantity}x {item.name}</span>
                            <span>£{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                {/* Totals */}
                <div className="border-t border-gray-600 pt-3 space-y-2">
                    <div className="bg-blue-700 p-3 rounded-lg">
                        <p className="text-blue-200 text-xs">Total</p>
                        <p className="text-white text-3xl font-bold">£{cartTotal.toFixed(2)}</p>
                    </div>

                    {payments.length > 0 && (
                        <>
                            <div className="space-y-1">
                                {payments.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between bg-gray-700 rounded px-3 py-1.5">
                                        <span className="text-gray-300 text-sm capitalize">{p.method}</span>
                                        <span className="text-white text-sm font-semibold">£{p.amount.toFixed(2)}</span>
                                        <button onClick={() => removePayment(i)} className="text-red-400 hover:text-red-300 ml-2">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {remaining > 0 ? (
                                <div className="bg-red-700 p-2.5 rounded-lg">
                                    <p className="text-red-200 text-xs">Still owed</p>
                                    <p className="text-white text-2xl font-bold">£{remaining.toFixed(2)}</p>
                                </div>
                            ) : (
                                <div className="bg-green-700 p-2.5 rounded-lg">
                                    <p className="text-green-200 text-xs">Change</p>
                                    <p className="text-white text-2xl font-bold">£{change.toFixed(2)}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* RIGHT: Payment */}
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 flex flex-col overflow-y-auto">
                {/* Method buttons */}
                {!activeMethod && (
                    <>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <Button onClick={() => setActiveMethod('cash')}
                                className="h-14 text-lg font-bold bg-green-700 hover:bg-green-600 text-white">
                                <DollarSign className="h-5 w-5 mr-1" /> Cash
                            </Button>
                            <Button onClick={() => setActiveMethod('card')}
                                className="h-14 text-lg font-bold bg-blue-700 hover:bg-blue-600 text-white">
                                <CreditCard className="h-5 w-5 mr-1" /> Card
                            </Button>
                        </div>

                        {/* Exact / quick-pay */}
                        <p className="text-gray-500 text-xs mb-2">Quick cash</p>
                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {QUICK_AMOUNTS.map(amt => (
                                <Button key={amt} onClick={() => handleQuickCash(amt)}
                                    className="h-10 text-base font-bold bg-gray-700 hover:bg-gray-600 text-white border border-gray-600">
                                    £{amt}
                                </Button>
                            ))}
                        </div>

                        {/* Exact amount button */}
                        <Button onClick={() => {
                            // Pre-fill remaining as exact
                            const pence = Math.round(remaining * 100);
                            setRawValue(pence > 0 ? String(pence) : '');
                            setActiveMethod('cash');
                        }}
                            className="w-full h-10 text-sm font-bold bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 mb-3">
                            Exact Amount (£{remaining.toFixed(2)})
                        </Button>

                        {/* Charge full to card button */}
                        <Button onClick={() => { setActiveMethod('card'); }}
                            className="w-full h-10 text-sm font-bold bg-blue-800 hover:bg-blue-700 text-white border border-blue-700">
                            Charge £{remaining.toFixed(2)} to Card
                        </Button>
                    </>
                )}

                {/* Cash keypad */}
                {activeMethod === 'cash' && (
                    <div className="flex flex-col gap-2">
                        <p className="text-green-400 text-sm font-semibold">Cash payment — enter amount</p>

                        {/* Quick preset buttons */}
                        <div className="grid grid-cols-4 gap-1.5 mb-1">
                            {QUICK_AMOUNTS.map(amt => (
                                <Button key={amt} onClick={() => {
                                    setRawValue(String(amt * 100));
                                }}
                                    className={`h-9 text-sm font-bold border border-gray-600 ${
                                        numericInput === amt
                                            ? 'bg-green-600 text-white'
                                            : 'bg-gray-700 hover:bg-gray-600 text-white'
                                    }`}>
                                    £{amt}
                                </Button>
                            ))}
                        </div>

                        <NumericKeypad
                            rawValue={rawValue}
                            onRawChange={setRawValue}
                            onComplete={handleCashConfirm}
                        />

                        <Button onClick={() => { setActiveMethod(null); setRawValue(''); }}
                            className="w-full h-9 text-sm bg-gray-700 hover:bg-gray-600 text-white mt-1">
                            Cancel
                        </Button>
                    </div>
                )}

                {/* Card — ask amount or full */}
                {activeMethod === 'card' && (
                    <div className="flex flex-col gap-3">
                        <p className="text-blue-400 text-sm font-semibold">Card payment</p>

                        <div className="grid grid-cols-2 gap-3">
                            <Button onClick={() => {
                                const pence = Math.round(remaining * 100);
                                setRawValue(String(pence));
                                setShowCardConfirm(true);
                            }}
                                className="h-14 text-sm font-bold bg-blue-700 hover:bg-blue-600 text-white">
                                Full remaining<br/>£{remaining.toFixed(2)}
                            </Button>
                            <Button onClick={() => setShowCardConfirm(true)}
                                disabled={numericInput <= 0}
                                className="h-14 text-sm font-bold bg-blue-900 hover:bg-blue-800 text-white border border-blue-700">
                                Custom amount<br/>{numericInput > 0 ? `£${numericInput.toFixed(2)}` : '(enter below)'}
                            </Button>
                        </div>

                        <NumericKeypad
                            rawValue={rawValue}
                            onRawChange={setRawValue}
                            onComplete={() => setShowCardConfirm(true)}
                        />

                        <Button onClick={() => { setActiveMethod(null); setRawValue(''); }}
                            className="w-full h-9 text-sm bg-gray-700 hover:bg-gray-600 text-white">
                            Cancel
                        </Button>
                    </div>
                )}
            </div>

            {/* Card Confirm Dialog */}
            <AlertDialog open={showCardConfirm} onOpenChange={setShowCardConfirm}>
                <AlertDialogContent className="bg-gray-800 border-gray-700">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-blue-500" />
                            Confirm Card Payment
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-300">
                            Process card payment for £{(numericInput > 0 ? numericInput : remaining).toFixed(2)}?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-gray-700 hover:bg-gray-600 text-white border-gray-600">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={processCard} disabled={isProcessing}
                            className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isProcessing ? 'Processing...' : 'Confirm'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}