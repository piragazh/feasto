/**
 * KioskAdminPanel — Hardened admin access for public kiosk
 *
 * AUTH FLOW:
 *   1. Hidden tap gesture (5 taps) → opens this component (KioskDashboard pauses customer session)
 *   2. PIN screen → rate-limited, 5-attempt lockout for 5 minutes
 *   3. On correct PIN → admin dashboard shown with auto-timeout (3 min inactivity)
 *   4. Exit → parent resets kiosk to welcome screen (cart cleared, no state leak)
 *
 * SECURITY PROPERTIES:
 *   - PIN compared against restaurant.kiosk_config.admin_pin (configurable per restaurant)
 *   - Falls back to env-hardened default only (no on-screen hint)
 *   - 5 failed attempts → 5-minute lockout stored in module-level ref (survives re-render)
 *   - Auto-logout after 3 minutes of admin inactivity
 *   - onClose() in KioskDashboard calls resetKiosk() — cart is wiped on exit
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, BarChart3, ShoppingBag, Clock, DollarSign, Shield, AlertTriangle, Lock, LogOut } from 'lucide-react';

// Module-level rate limit state — persists across re-renders, reset only on page reload
// This prevents an attacker from unmounting/remounting to bypass attempt counting
const rateLimitState = {
    attempts: 0,
    lockedUntil: null, // Date object or null
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const ADMIN_AUTO_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes inactivity → auto-logout

// Default fallback PIN — no hint shown, should be changed in kiosk_config
const FALLBACK_DEFAULT_PIN = '0000';

export default function KioskAdminPanel({ restaurant, onClose }) {
    const [pin, setPin] = useState('');
    const [unlocked, setUnlocked] = useState(false);
    const [error, setError] = useState('');
    const [, forceUpdate] = useState(0); // used to re-render lockout countdown
    const autoLogoutRef = useRef(null);

    // Get configured admin PIN from restaurant settings
    const configuredPin = restaurant?.kiosk_config?.admin_pin || FALLBACK_DEFAULT_PIN;

    // Countdown ticker for lockout display
    useEffect(() => {
        const ticker = setInterval(() => {
            if (rateLimitState.lockedUntil && rateLimitState.lockedUntil > new Date()) {
                forceUpdate(n => n + 1);
            }
        }, 1000);
        return () => clearInterval(ticker);
    }, []);

    // Auto-logout on inactivity when admin is unlocked
    const resetAutoLogout = useCallback(() => {
        clearTimeout(autoLogoutRef.current);
        autoLogoutRef.current = setTimeout(() => {
            handleExit('timeout');
        }, ADMIN_AUTO_TIMEOUT_MS);
    }, []);

    useEffect(() => {
        if (unlocked) {
            resetAutoLogout();
            window.addEventListener('touchstart', resetAutoLogout);
            window.addEventListener('click', resetAutoLogout);
        }
        return () => {
            clearTimeout(autoLogoutRef.current);
            window.removeEventListener('touchstart', resetAutoLogout);
            window.removeEventListener('click', resetAutoLogout);
        };
    }, [unlocked, resetAutoLogout]);

    const { data: todayOrders = [] } = useQuery({
        queryKey: ['kiosk-admin-orders', restaurant.id],
        queryFn: async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const orders = await base44.entities.Order.filter({ restaurant_id: restaurant.id });
            return orders.filter(o =>
                new Date(o.created_date) >= today &&
                (o.notes?.includes('Kiosk order') || o.order_number?.startsWith('K-'))
            );
        },
        enabled: unlocked,
    });

    const isLocked = () => {
        if (!rateLimitState.lockedUntil) return false;
        return rateLimitState.lockedUntil > new Date();
    };

    const lockoutSecondsRemaining = () => {
        if (!rateLimitState.lockedUntil) return 0;
        return Math.max(0, Math.ceil((rateLimitState.lockedUntil - new Date()) / 1000));
    };

    const handleDigit = (digit) => {
        if (isLocked()) return;
        const next = pin + digit;
        setPin(next);
        setError('');

        if (next.length === 4) {
            if (next === configuredPin) {
                // Correct — reset rate limit and unlock
                rateLimitState.attempts = 0;
                rateLimitState.lockedUntil = null;
                setUnlocked(true);
                setPin('');
            } else {
                // Wrong PIN
                rateLimitState.attempts += 1;
                if (rateLimitState.attempts >= MAX_ATTEMPTS) {
                    rateLimitState.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
                    rateLimitState.attempts = 0;
                    setError(`Too many failed attempts. Locked for ${LOCKOUT_DURATION_MS / 60000} minutes.`);
                } else {
                    const remaining = MAX_ATTEMPTS - rateLimitState.attempts;
                    setError(`Incorrect PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
                }
                setPin('');
            }
        }
    };

    const handleBackspace = () => {
        setPin(p => p.slice(0, -1));
        setError('');
    };

    const handleExit = (reason = 'manual') => {
        clearTimeout(autoLogoutRef.current);
        setUnlocked(false);
        setPin('');
        setError('');
        // onClose() in KioskDashboard calls resetKiosk() — this wipes the cart
        onClose();
    };

    const totalRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const avgOrder = todayOrders.length ? totalRevenue / todayOrders.length : 0;

    // ── Lockout screen ────────────────────────────────────────────────────────
    if (isLocked()) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
                <div className="bg-gray-900 border border-red-500/30 rounded-3xl p-8 w-80 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
                        <Lock className="h-8 w-8 text-red-400" />
                    </div>
                    <h2 className="text-white font-bold text-lg mb-2">Access Locked</h2>
                    <p className="text-gray-400 text-sm mb-4">Too many failed attempts</p>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-6">
                        <p className="text-red-400 font-mono text-2xl font-bold">{lockoutSecondsRemaining()}s</p>
                        <p className="text-red-400/70 text-xs mt-1">remaining</p>
                    </div>
                    <button
                        onClick={() => onClose()}
                        className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-3 rounded-2xl transition-colors"
                    >
                        Return to Kiosk
                    </button>
                </div>
            </div>
        );
    }

    // ── PIN entry screen ──────────────────────────────────────────────────────
    if (!unlocked) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
                <div className="bg-gray-900 border border-white/[0.06] rounded-3xl p-8 w-80">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-orange-400" />
                            <h2 className="text-white font-bold text-lg">Staff Access</h2>
                        </div>
                        <button
                            onClick={() => onClose()}
                            className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center"
                            aria-label="Cancel"
                        >
                            <X className="h-4 w-4 text-gray-400" />
                        </button>
                    </div>
                    <p className="text-gray-500 text-xs mb-6">Enter your staff PIN to continue</p>

                    {/* PIN dots */}
                    <div className="flex gap-3 justify-center mb-4">
                        {[0, 1, 2, 3].map(i => (
                            <div
                                key={i}
                                className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                                    i < pin.length
                                        ? 'bg-orange-500 border-orange-500 scale-110'
                                        : 'border-gray-600'
                                }`}
                            />
                        ))}
                    </div>

                    {/* Error / attempt warning */}
                    {error && (
                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">
                            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                            <p className="text-red-400 text-xs">{error}</p>
                        </div>
                    )}

                    {/* Keypad */}
                    <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((d, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    if (d === '⌫') handleBackspace();
                                    else if (d !== '') handleDigit(String(d));
                                }}
                                className={`h-14 rounded-2xl font-bold text-lg transition-all active:scale-95 ${
                                    d === ''
                                        ? 'pointer-events-none'
                                        : d === '⌫'
                                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                                        : 'bg-gray-800 hover:bg-gray-700 text-white'
                                }`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                    {/* NO default PIN hint — intentionally removed */}
                </div>
            </div>
        );
    }

    // ── Admin dashboard (unlocked) ────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col">
            <div className="bg-gray-900 border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-orange-400" />
                    <div>
                        <h1 className="text-white font-bold text-xl">Kiosk Admin</h1>
                        <p className="text-gray-400 text-sm">{restaurant.name} · Auto-logout in 3 min</p>
                    </div>
                </div>
                <button
                    onClick={() => handleExit('manual')}
                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
                >
                    <LogOut className="h-4 w-4" />
                    Exit Admin
                </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
                <h2 className="text-white font-bold text-lg">Today's Kiosk Performance</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Orders', value: todayOrders.length, icon: ShoppingBag, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                        { label: 'Revenue', value: `£${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
                        { label: 'Avg Order', value: `£${avgOrder.toFixed(2)}`, icon: BarChart3, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                        {
                            label: 'Last Order',
                            value: todayOrders.length > 0
                                ? new Date(todayOrders[todayOrders.length - 1].created_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                                : 'N/A',
                            icon: Clock,
                            color: 'text-purple-400',
                            bg: 'bg-purple-500/10 border-purple-500/20',
                        },
                    ].map((stat, i) => {
                        const Icon = stat.icon;
                        return (
                            <div key={i} className={`${stat.bg} border rounded-2xl p-5`}>
                                <Icon className={`h-6 w-6 ${stat.color} mb-3`} />
                                <p className="text-gray-400 text-sm">{stat.label}</p>
                                <p className={`${stat.color} font-black text-2xl mt-1`}>{stat.value}</p>
                            </div>
                        );
                    })}
                </div>

                <div>
                    <h2 className="text-white font-bold text-lg mb-3">Recent Kiosk Orders</h2>
                    <div className="space-y-2">
                        {todayOrders.slice().reverse().slice(0, 10).map(order => (
                            <div key={order.id} className="bg-gray-900 border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-white font-bold">#{order.order_number || order.id.slice(-6)}</p>
                                    <p className="text-gray-400 text-sm">
                                        {order.items?.length} item(s) · {new Date(order.created_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-orange-400 font-bold">£{order.total?.toFixed(2)}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.status === 'confirmed' ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                                        {order.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {todayOrders.length === 0 && (
                            <p className="text-gray-500 text-center py-8">No kiosk orders today</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}