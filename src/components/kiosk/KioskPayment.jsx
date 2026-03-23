import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, CreditCard, Banknote, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { printWithCentralizedConfig } from '@/lib/printUtils';

const PAYMENT_METHODS = [
    { id: 'card', label: 'Pay by Card', icon: CreditCard, description: 'Tap, insert or swipe your card' },
    { id: 'cash', label: 'Pay with Cash', icon: Banknote, description: 'Pay at the counter' },
];

export default function KioskPayment({
    cart, cartTotal, orderType, restaurant, restaurantId,
    selectedTable, onBack, onOrderPlaced
}) {
    const [paymentMethod, setPaymentMethod] = useState('card');
    const [placing, setPlacing] = useState(false);
    const [step, setStep] = useState('select'); // 'select' | 'card_terminal' | 'confirming'

    const orderTypeLabel = orderType === 'dine_in' ? 'Eat In' : 'Takeaway';

    const placeOrder = async () => {
        setPlacing(true);
        setStep('confirming');
        try {
            // Generate order number
            const orderNum = `K-${Math.floor(1000 + Math.random() * 9000)}`;
            const order = await base44.entities.Order.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurant?.name,
                order_number: orderNum,
                items: cart.map(item => ({
                    menu_item_id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    customizations: item.customizations || {},
                    itemQuantities: item.itemQuantities || {},
                })),
                subtotal: cartTotal,
                delivery_fee: 0,
                discount: 0,
                total: cartTotal,
                payment_method: paymentMethod,
                order_type: orderType === 'dine_in' ? 'dine_in' : 'takeaway',
                status: paymentMethod === 'cash' ? 'pending' : 'confirmed',
                notes: 'Kiosk order',
                ...(selectedTable ? { table_id: selectedTable.id, table_number: selectedTable.table_number } : {}),
            });
            const placedOrder = { ...order, order_number: orderNum };
            // Auto-print via kiosk_order channel (silently — don't block on failure)
            printWithCentralizedConfig(placedOrder, restaurant, 'kiosk_order').catch(() => {});
            onOrderPlaced(placedOrder);
        } catch (err) {
            toast.error('Failed to place order. Please try again.');
            setStep('select');
            setPlacing(false);
        }
    };

    const handleProceed = () => {
        if (paymentMethod === 'card') {
            setStep('card_terminal');
        } else {
            placeOrder();
        }
    };

    if (step === 'card_terminal') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-32 h-32 rounded-3xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-8 animate-pulse">
                    <CreditCard className="h-16 w-16 text-blue-400" />
                </div>
                <h2 className="text-white text-3xl font-black mb-3">Please pay at the card terminal</h2>
                <p className="text-gray-400 text-xl mb-10">Tap, insert or swipe your card on the terminal</p>
                <div className="bg-gray-900 border border-white/[0.06] rounded-2xl px-8 py-5 mb-10">
                    <p className="text-gray-400 text-sm mb-1">Amount to pay</p>
                    <p className="text-orange-400 font-black text-4xl">£{cartTotal.toFixed(2)}</p>
                </div>
                <div className="flex gap-4 w-full max-w-md">
                    <button onClick={() => setStep('select')} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-4 rounded-2xl transition-colors">
                        ← Back
                    </button>
                    <button
                        onClick={placeOrder}
                        disabled={placing}
                        className="flex-2 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-bold py-4 px-8 rounded-2xl transition-colors flex items-center justify-center gap-2"
                    >
                        {placing ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                        Payment Complete
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'confirming') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-24 h-24 rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin mb-8" />
                <h2 className="text-white text-2xl font-bold">Placing your order...</h2>
                <p className="text-gray-400 mt-2">Please wait</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col">
            {/* Header */}
            <div className="bg-gray-900 border-b border-white/[0.06] px-6 py-4 flex items-center gap-4">
                <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors">
                    <ArrowLeft className="h-5 w-5 text-white" />
                </button>
                <div>
                    <h1 className="text-white font-bold text-2xl">Payment</h1>
                    <p className="text-gray-400 text-sm">{orderTypeLabel} · {restaurant.name}</p>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 max-w-xl mx-auto w-full">
                {/* Order total */}
                <div className="w-full bg-gray-900 border border-white/[0.06] rounded-3xl p-8 mb-8 text-center">
                    <p className="text-gray-400 text-sm mb-2 uppercase tracking-wider font-medium">Total to Pay</p>
                    <p className="text-orange-400 font-black text-5xl">£{cartTotal.toFixed(2)}</p>
                    <p className="text-gray-600 text-sm mt-2">{cart.reduce((s, i) => s + i.quantity, 0)} item{cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}</p>
                </div>

                {/* Payment method selection */}
                <h2 className="text-white font-bold text-xl mb-4 self-start">Choose Payment Method</h2>
                <div className="w-full space-y-3 mb-8">
                    {PAYMENT_METHODS.map(method => {
                        const Icon = method.icon;
                        const selected = paymentMethod === method.id;
                        return (
                            <button
                                key={method.id}
                                onClick={() => setPaymentMethod(method.id)}
                                className={`w-full flex items-center gap-5 p-6 rounded-2xl border transition-all ${
                                    selected
                                        ? 'bg-orange-500 border-orange-500 shadow-lg shadow-orange-500/30'
                                        : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                                }`}
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${selected ? 'bg-white/20' : 'bg-gray-800'}`}>
                                    <Icon className={`h-7 w-7 ${selected ? 'text-white' : 'text-orange-400'}`} />
                                </div>
                                <div className="text-left flex-1">
                                    <p className={`font-bold text-lg ${selected ? 'text-white' : 'text-white'}`}>{method.label}</p>
                                    <p className={`text-sm ${selected ? 'text-white/70' : 'text-gray-500'}`}>{method.description}</p>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selected ? 'border-white bg-white' : 'border-gray-600'}`}>
                                    {selected && <div className="w-3 h-3 rounded-full bg-orange-500" />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={handleProceed}
                    disabled={placing}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-5 rounded-2xl text-xl transition-all active:scale-[0.98] shadow-lg shadow-orange-500/30"
                >
                    {paymentMethod === 'card' ? 'Proceed to Card Terminal' : 'Place Order & Pay at Counter'}
                </button>
            </div>
        </div>
    );
}