import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UtensilsCrossed, ShoppingBag } from 'lucide-react';
import { StaffHelpScreen } from './KioskStaffHelp';

function LiveClock() {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return (
        <span className="text-gray-400 text-lg font-mono">
            {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
    );
}

export default function KioskWelcome({ restaurant, onStart, onLogoTap }) {
    // Block ordering if restaurant is closed or has disabled ordering
    const kioskConfig = restaurant?.kiosk_config || {};
    const orderingDisabled = kioskConfig.ordering_disabled === true;
    const restaurantClosed = restaurant?.is_open === false;

    if (restaurantClosed || orderingDisabled) {
        const message = orderingDisabled
            ? 'Ordering is temporarily unavailable on this kiosk.'
            : 'We\'re not taking orders right now.';
        const detail = restaurant?.opening_hours
            ? 'Please check our opening hours or ask a member of staff.'
            : undefined;
        return (
            <StaffHelpScreen
                icon={UtensilsCrossed}
                iconColor="text-gray-400"
                iconBg="bg-gray-800 border-gray-700"
                title={orderingDisabled ? 'Ordering Paused' : 'We\'re Closed'}
                subtitle={message}
                detail={detail}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-8 py-4">
                <LiveClock />
                <div className="w-24" />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                {/* Logo with fade-in animation */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="mb-8 cursor-pointer"
                    onClick={onLogoTap}
                >
                    {restaurant.logo_url ? (
                        <img
                            src={restaurant.logo_url}
                            alt={restaurant.name}
                            className="w-28 h-28 rounded-3xl object-cover shadow-2xl shadow-orange-500/20 border border-white/10"
                        />
                    ) : (
                        <div className="w-28 h-28 rounded-3xl bg-orange-500 flex items-center justify-center shadow-2xl shadow-orange-500/30">
                            <UtensilsCrossed className="h-14 w-14 text-white" />
                        </div>
                    )}
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="text-white text-5xl font-black mb-3 tracking-tight"
                >
                    {restaurant.name}
                </motion.h1>
                {restaurant.description && (
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="text-gray-400 text-xl mb-2 max-w-xl"
                    >
                        {restaurant.description}
                    </motion.p>
                )}
                {restaurant.cuisine_type && (
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="inline-block bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-medium px-4 py-1.5 rounded-full mb-12"
                    >
                        {restaurant.cuisine_type}
                    </motion.span>
                )}

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="text-gray-300 text-2xl font-semibold mb-10"
                >
                    How would you like to order?
                </motion.p>

                {/* Order Type Buttons with staggered animation */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="flex gap-6 w-full max-w-2xl"
                >
                    <button
                        onClick={() => onStart('dine_in')}
                        className="flex-1 bg-white/5 hover:bg-orange-500 border border-white/10 hover:border-orange-500 rounded-3xl p-10 flex flex-col items-center gap-4 transition-all duration-300 group hover:shadow-2xl hover:shadow-orange-500/30 active:scale-95"
                    >
                        <div className="w-20 h-20 rounded-2xl bg-orange-500/10 group-hover:bg-white/20 flex items-center justify-center transition-colors">
                            <UtensilsCrossed className="h-10 w-10 text-orange-400 group-hover:text-white transition-colors" />
                        </div>
                        <div>
                            <p className="text-white text-2xl font-bold">Eat In</p>
                            <p className="text-gray-400 group-hover:text-white/70 text-sm mt-1 transition-colors">Dine at your table</p>
                        </div>
                    </button>

                    <button
                        onClick={() => onStart('takeaway')}
                        className="flex-1 bg-white/5 hover:bg-orange-500 border border-white/10 hover:border-orange-500 rounded-3xl p-10 flex flex-col items-center gap-4 transition-all duration-300 group hover:shadow-2xl hover:shadow-orange-500/30 active:scale-95"
                    >
                        <div className="w-20 h-20 rounded-2xl bg-orange-500/10 group-hover:bg-white/20 flex items-center justify-center transition-colors">
                            <ShoppingBag className="h-10 w-10 text-orange-400 group-hover:text-white transition-colors" />
                        </div>
                        <div>
                            <p className="text-white text-2xl font-bold">Takeaway</p>
                            <p className="text-gray-400 group-hover:text-white/70 text-sm mt-1 transition-colors">Take your food to go</p>
                        </div>
                    </button>
                </motion.div>

                {/* Touch prompt with pulse animation */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                    className="mt-16 flex flex-col items-center gap-2"
                >
                    <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-1 h-1 rounded-full bg-gray-600"
                    />
                    <div className="flex gap-1">
                        <motion.div
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                            className="w-1 h-1 rounded-full bg-gray-500"
                        />
                        <motion.div
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                            className="w-1 h-1 rounded-full bg-gray-500"
                        />
                        <motion.div
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                            className="w-1 h-1 rounded-full bg-gray-500"
                        />
                    </div>
                    <p className="text-gray-500 text-sm mt-2">Tap to get started</p>
                </motion.div>
            </div>

            {/* Footer */}
            <div className="py-4 text-center">
                <p className="text-gray-700 text-xs">Self-Order Kiosk · Powered by MealDrop</p>
            </div>
        </div>
    );
}