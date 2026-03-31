import React, { useState, useEffect, useRef } from 'react';
import { useState, useEffect } from 'react';
import { CheckCircle2, CreditCard, Banknote, Clock, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'pos_customer_display';

// ── Publisher: call this from POSPayment/POSCart to push state ──────────────
export function publishCustomerDisplay(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, ts: Date.now() }));
}

// ── The display itself (rendered in popup window) ─────────────────────────
export default function CustomerDisplay() {
    const [state, setState] = useState(null);

    useEffect(() => {
        const read = () => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) setState(JSON.parse(raw));
            } catch {}
        };
        read();
        const interval = setInterval(read, 500);
        window.addEventListener('storage', read);
        return () => { clearInterval(interval); window.removeEventListener('storage', read); };
    }, []);

    // Active order — extract state first (hooks below must come before early returns)
    const { items = [], subtotal = 0, discount, total = 0, remaining, paymentMethod, restaurantName, logoUrl } = state || {};
    const effectiveTotal = total;

    // Hooks must be called unconditionally before any early returns — moved up
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Idle / waiting screen — early return AFTER hooks
    if (!state || state.status === 'idle') {
        return <IdleScreen restaurantName={state?.restaurantName} logoUrl={state?.logoUrl} />;
    }

    if (state.status === 'paid') {
        return <ThankYouScreen restaurantName={state?.restaurantName} logoUrl={state?.logoUrl} change={state.change} />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex flex-col font-sans overflow-hidden">
            {/* Slim top bar */}
            <div className="bg-gray-900/80 backdrop-blur border-b border-white/[0.06] px-8 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    {logoUrl ? (
                        <img src={logoUrl} alt={restaurantName} className="w-8 h-8 rounded-lg object-cover" />
                    ) : (
                        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                            <ShoppingBag className="h-4 w-4 text-white" />
                        </div>
                    )}
                    <span className="text-white font-bold text-base">{restaurantName || 'Order Summary'}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Items list */}
                <div className="flex-1 p-6 overflow-y-auto scrollbar-hide">
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-4">Your Order</p>
                    <div className="space-y-2">
                        <AnimatePresence initial={false}>
                            {items.map((item, i) => (
                                <motion.div
                                    key={`${item.name}-${i}`}
                                    initial={{ opacity: 0, x: -24 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 24 }}
                                    transition={{ duration: 0.3 }}
                                    className="flex items-center justify-between bg-white/[0.04] border border-white/[0.06] rounded-2xl px-5 py-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="w-9 h-9 bg-orange-500/20 text-orange-400 rounded-xl flex items-center justify-center text-sm font-black">
                                            {item.quantity}
                                        </span>
                                        <div>
                                            <p className="text-white font-semibold text-lg leading-tight">{item.name}</p>
                                            {item.customizations && Object.keys(item.customizations).length > 0 && (
                                                <p className="text-gray-500 text-xs mt-0.5">
                                                    {Object.values(item.customizations).flat().filter(Boolean).join(', ')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-white font-bold text-xl">£{(item.price * item.quantity).toFixed(2)}</span>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {items.length === 0 && (
                            <p className="text-gray-600 text-center py-16">No items yet</p>
                        )}
                    </div>
                </div>

                {/* Totals panel */}
                <div className="w-80 bg-gray-900/60 border-l border-white/[0.06] p-6 flex flex-col justify-between flex-shrink-0">
                    <div className="space-y-4">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest">Summary</p>

                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-gray-300">
                                <span>Subtotal</span>
                                <span>£{subtotal.toFixed(2)}</span>
                            </div>
                            {discount && (
                                <div className="flex justify-between text-green-400">
                                    <span>Discount</span>
                                    <span>-£{discount.amount.toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-white/[0.08] pt-4">
                            <motion.div
                                key={effectiveTotal}
                                initial={{ scale: 1.04 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.25 }}
                                className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-5 text-center"
                            >
                                <p className="text-orange-300 text-xs font-semibold uppercase tracking-widest mb-1">Total</p>
                                <p className="text-white text-5xl font-black">£{effectiveTotal.toFixed(2)}</p>
                            </motion.div>
                        </div>

                        {remaining !== undefined && remaining > 0 && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-center">
                                <p className="text-red-300 text-xs font-semibold uppercase tracking-widest mb-1">Balance Due</p>
                                <p className="text-white text-3xl font-bold">£{remaining.toFixed(2)}</p>
                            </div>
                        )}

                        {paymentMethod && (
                            <div className="flex items-center gap-2 justify-center mt-2 text-gray-400 text-sm">
                                {paymentMethod === 'card' ? <CreditCard className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                                <span className="capitalize">{paymentMethod} payment</span>
                            </div>
                        )}
                    </div>

                    <p className="text-center text-gray-600 text-xs">Thank you for your order</p>
                </div>
            </div>
        </div>
    );
}

function IdleScreen({ restaurantName, logoUrl }) {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center justify-center gap-8">
            {logoUrl ? (
                <img src={logoUrl} alt={restaurantName} className="w-24 h-24 rounded-3xl object-cover shadow-2xl" />
            ) : (
                <div className="w-24 h-24 bg-orange-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-orange-500/30">
                    <ShoppingBag className="h-12 w-12 text-white" />
                </div>
            )}
            <div className="text-center">
                <h1 className="text-white text-4xl font-black mb-2">{restaurantName || 'Welcome'}</h1>
                <p className="text-gray-500 text-lg">Please place your order at the counter</p>
            </div>
            <div className="text-gray-400 font-mono text-6xl font-light">
                {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    );
}

function ThankYouScreen({ restaurantName, logoUrl, change }) {
    useEffect(() => {
        const t = setTimeout(() => {
            publishCustomerDisplay({ status: 'idle', restaurantName, logoUrl });
        }, 5000);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center justify-center gap-8">
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30 animate-pulse">
                <CheckCircle2 className="h-12 w-12 text-white" />
            </div>
            <div className="text-center">
                <h1 className="text-white text-5xl font-black mb-3">Thank You!</h1>
                <p className="text-gray-400 text-xl">Payment complete</p>
                {change > 0.005 && (
                    <div className="mt-6 bg-green-500/10 border border-green-500/30 rounded-2xl px-8 py-4">
                        <p className="text-green-300 text-sm mb-1">Your change</p>
                        <p className="text-white text-4xl font-bold">£{change.toFixed(2)}</p>
                    </div>
                )}
            </div>
            <p className="text-gray-600 text-sm">Enjoy your meal!</p>
        </div>
    );
}