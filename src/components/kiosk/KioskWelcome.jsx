import React, { useState, useEffect } from 'react';
import { UtensilsCrossed, ShoppingBag } from 'lucide-react';

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
    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-8 py-4">
                <LiveClock />
                <div className="w-24" />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                {/* Logo */}
                <div className="mb-8 cursor-pointer" onClick={onLogoTap}>
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
                </div>

                <h1 className="text-white text-5xl font-black mb-3 tracking-tight">
                    {restaurant.name}
                </h1>
                {restaurant.description && (
                    <p className="text-gray-400 text-xl mb-2 max-w-xl">{restaurant.description}</p>
                )}
                {restaurant.cuisine_type && (
                    <span className="inline-block bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-medium px-4 py-1.5 rounded-full mb-12">
                        {restaurant.cuisine_type}
                    </span>
                )}

                <p className="text-gray-300 text-2xl font-semibold mb-10">How would you like to order?</p>

                {/* Order Type Buttons */}
                <div className="flex gap-6 w-full max-w-2xl">
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
                </div>

                {/* Touch prompt */}
                <div className="mt-16 flex flex-col items-center gap-2 animate-pulse">
                    <div className="w-1 h-1 rounded-full bg-gray-600" />
                    <div className="flex gap-1">
                        <div className="w-1 h-1 rounded-full bg-gray-500" />
                        <div className="w-1 h-1 rounded-full bg-gray-500" />
                        <div className="w-1 h-1 rounded-full bg-gray-500" />
                    </div>
                    <p className="text-gray-500 text-sm mt-2">Touch to get started</p>
                </div>
            </div>

            {/* Footer */}
            <div className="py-4 text-center">
                <p className="text-gray-700 text-xs">Self-Order Kiosk · Powered by MealDrop</p>
            </div>
        </div>
    );
}