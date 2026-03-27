import React, { useEffect, useState } from 'react';
import { CheckCircle, UtensilsCrossed, Printer } from 'lucide-react';

export default function KioskConfirmation({ order, orderType, restaurant, onDone, printerFailed = false, paymentMethod }) {
    const [countdown, setCountdown] = useState(30);
    const orderNum = order?.order_number || order?.id?.slice(-4).toUpperCase();

    useEffect(() => {
        const t = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) { clearInterval(t); onDone(); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
            {/* Success animation */}
            <div className="relative mb-8">
                <div className="w-36 h-36 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                    <CheckCircle className="h-20 w-20 text-green-400" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-green-500/20 animate-ping" />
            </div>

            <h1 className="text-white text-4xl font-black mb-3">Order Placed!</h1>
            <p className="text-gray-400 text-xl mb-8 max-w-md">
                {paymentMethod === 'pay_at_counter'
                    ? 'Please go to the counter to pay. Your order will be prepared after payment is confirmed.'
                    : orderType === 'dine_in'
                        ? 'Your food will be brought to your table'
                        : 'Your order is being prepared. You\'ll be called when it\'s ready'}
            </p>

            {paymentMethod === 'pay_at_counter' && (
                <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-2xl px-6 py-4 mb-6 max-w-sm w-full">
                    <span className="text-2xl">🧾</span>
                    <p className="text-orange-300 text-sm font-medium text-left">
                        Take this order number to the counter and pay — kitchen will start once payment is confirmed.
                    </p>
                </div>
            )}

            {/* Order Number */}
            <div className="bg-gray-900 border border-white/[0.06] rounded-3xl px-12 py-8 mb-4">
                <p className="text-gray-400 text-sm uppercase tracking-widest font-medium mb-2">Order Number</p>
                <p className="text-orange-400 font-black text-6xl tracking-widest">{orderNum}</p>
            </div>

            <p className="text-gray-500 text-sm mb-4">Keep this number to collect your order</p>

            {printerFailed && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mb-6 max-w-sm w-full">
                    <Printer className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                    <p className="text-yellow-300 text-sm">Receipt printer unavailable — no receipt will be printed. Please note your order number.</p>
                </div>
            )}

            {/* Receipt-like items */}
            {order?.items && (
                <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-5 max-w-sm w-full mb-10 text-left">
                    <p className="text-gray-400 text-xs uppercase tracking-wider mb-3 font-medium">Your Order</p>
                    {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm py-1.5 border-b border-white/[0.04] last:border-0">
                            <span className="text-gray-300">{item.name} × {item.quantity}</span>
                            <span className="text-gray-400">£{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                    <div className="flex justify-between font-bold mt-3 pt-2">
                        <span className="text-white">Total</span>
                        <span className="text-orange-400">£{order.total?.toFixed(2)}</span>
                    </div>
                </div>
            )}

            <button
                onClick={onDone}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-12 py-4 rounded-2xl text-lg transition-all active:scale-95"
            >
                Start New Order
            </button>

            <p className="text-gray-600 text-sm mt-4">
                Returning to home in <span className="text-gray-400 font-bold">{countdown}s</span>
            </p>
        </div>
    );
}