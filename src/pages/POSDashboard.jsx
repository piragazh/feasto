import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, ShoppingCart, UtensilsCrossed, DollarSign, Monitor, Users, BarChart3, ChevronDown, Wifi, WifiOff, Clock, Sun, Moon, ClipboardList } from 'lucide-react';
import POSOrderEntry from '@/components/pos/POSOrderEntry.jsx';
import POSOrderQueue from '@/components/pos/POSOrderQueue.jsx';
import POSPayment from '@/components/pos/POSPayment.jsx';
import KitchenDisplaySystem from '@/components/kds/KitchenDisplaySystem';
import POSWaitlist from '@/components/pos/POSWaitlist.jsx';
import POSReports from '@/components/pos/POSReports.jsx';
import POSOrderHistory from '@/components/pos/POSOrderHistory.jsx';
import POSTablesView from '@/components/pos/POSTablesView.jsx';
import { toast } from 'sonner';

function useTime() {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return time;
}

export default function POSDashboard() {
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [posNumber, setPosNumber] = useState(null);
    const [activeTab, setActiveTab] = useState('order-entry');
    const [cart, setCart] = useState([]);
    const [orderType, setOrderType] = useState('takeaway');
    const [accessDenied, setAccessDenied] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [posTheme, setPosTheme] = useState(() => localStorage.getItem('pos_theme') || 'dark');
    const time = useTime();

    const toggleTheme = () => {
        const next = posTheme === 'dark' ? 'light' : 'dark';
        setPosTheme(next);
        localStorage.setItem('pos_theme', next);
    };

    const isDark = posTheme === 'dark';
    const t = {
        bg:         isDark ? 'bg-[#0f1117]'   : 'bg-gray-100',
        header:     isDark ? 'bg-[#151720]'   : 'bg-white',
        border:     isDark ? 'border-white/[0.06]' : 'border-gray-200',
        text:       isDark ? 'text-white'      : 'text-gray-900',
        textMuted:  isDark ? 'text-gray-400'  : 'text-gray-500',
        textSub:    isDark ? 'text-gray-500'  : 'text-gray-400',
        pill:       isDark ? 'bg-[#0f1117]'   : 'bg-gray-100',
        iconBtn:    isDark ? 'bg-white/5 hover:bg-white/10 border border-white/[0.06] text-gray-400 hover:text-white' : 'bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 hover:text-gray-900',
        tabActive:  isDark ? 'text-orange-400 border-orange-500' : 'text-orange-500 border-orange-500',
        tabInactive:isDark ? 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600' : 'text-gray-400 border-transparent hover:text-gray-700 hover:border-gray-300',
    };

    useEffect(() => {
        loadUserAndRestaurant();
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    const loadUserAndRestaurant = async () => {
        try {
            const userData = await base44.auth.me();
            if (!userData) { base44.auth.redirectToLogin(); return; }
            setUser(userData);

            let restaurantId = null;
            const urlParams = new URLSearchParams(window.location.search);
            const urlRestaurantId = urlParams.get('restaurantId');
            const urlPosNum = parseInt(urlParams.get('posNum')) || null;

            if (userData.role === 'admin') {
                restaurantId = urlRestaurantId || (await base44.entities.Restaurant.list())?.[0]?.id;
            } else {
                const managers = await base44.entities.RestaurantManager.filter({ user_email: userData.email, is_active: true });
                if (!managers.length) { toast.error('No POS access'); base44.auth.redirectToLogin(); return; }
                const manager = managers[0];
                if (!manager.restaurant_ids?.length) { toast.error('No restaurants assigned'); return; }
                restaurantId = urlRestaurantId || manager.restaurant_ids[0];
            }

            if (restaurantId) {
                const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
                if (!r) { toast.error('Restaurant not found'); return; }
                if (userData.role !== 'admin' && !r.pos_enabled) { setAccessDenied(true); return; }
                setRestaurant(r);
                const maxPos = r.max_pos_count || 1;
                if (urlPosNum && urlPosNum >= 1 && urlPosNum <= maxPos) setPosNumber(urlPosNum);
                else if (maxPos === 1) setPosNumber(1);
            } else {
                toast.error('No restaurants available');
            }
        } catch (e) {
            console.error('POS loading error:', e);
            toast.error('Error loading POS system');
            setTimeout(() => base44.auth.redirectToLogin(), 1500);
        }
    };

    const addToCart = (item) => {
        setCart(prev => {
            // Items with customizations should always be separate entries
            const hasCustomizations = item.customizations && Object.keys(item.customizations).length > 0;
            if (!hasCustomizations) {
                const existing = prev.find(i => i.id === item.id && (!i.customizations || Object.keys(i.customizations).length === 0));
                if (existing) return prev.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i);
            }
            return [...prev, { ...item, quantity: item.quantity || 1 }];
        });
    };
    const removeFromCart = (itemId) => setCart(prev => prev.filter(i => i.id !== itemId));
    const updateQuantity = (itemId, quantity) => {
        if (quantity < 1) { removeFromCart(itemId); return; }
        setCart(prev => prev.map(i => i.id === itemId ? { ...i, quantity } : i));
    };
    const clearCart = () => { setCart([]); setDiscount(null); };
    const [discount, setDiscount] = useState(null);
    const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartTotal = discount ? Math.max(0, cartSubtotal - discount.amount) : cartSubtotal;

    const ORDER_TYPES = [
        { id: 'takeaway', label: 'Takeaway' },
        { id: 'collection', label: 'Collection' },
        { id: 'dine_in', label: 'Dine In' },
    ];

    const TABS = [
        { id: 'order-entry', label: 'Orders', icon: ShoppingCart },
        { id: 'queue', label: 'Queue', icon: UtensilsCrossed },
        { id: 'tables', label: 'Tables', icon: Monitor },
        { id: 'waitlist', label: 'Waitlist', icon: Users },
        { id: 'payment', label: 'Payment', icon: DollarSign },
        { id: 'kitchen', label: 'Kitchen', icon: Monitor },
        { id: 'history', label: 'History', icon: ClipboardList },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
    ];

    if (accessDenied) return (
        <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
            <div className="text-center">
                <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <UtensilsCrossed className="h-10 w-10 text-red-400" />
                </div>
                <h2 className={`${t.text} text-2xl font-bold mb-2`}>POS Access Not Enabled</h2>
                <p className={`${t.textMuted} mb-8 max-w-sm`}>The POS module has not been enabled for your restaurant.</p>
                <Button onClick={() => base44.auth.logout()} className={isDark ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700' : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200'}>
                    Sign Out
                </Button>
            </div>
        </div>
    );

    if (!user || !restaurant) return (
        <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
            <div className="text-center">
                <div className="w-16 h-16 rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin mx-auto mb-4" />
                <p className={`${t.textMuted} font-medium`}>Loading POS System...</p>
            </div>
        </div>
    );

    const maxPos = restaurant.max_pos_count || 1;
    if (maxPos > 1 && !posNumber) return (
        <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
            <div className="text-center max-w-md w-full px-6">
                <div className="w-20 h-20 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/30">
                    <UtensilsCrossed className="h-10 w-10 text-white" />
                </div>
                <h2 className={`${t.text} text-2xl font-bold mb-1`}>{restaurant.name}</h2>
                <p className={`${t.textMuted} mb-8`}>Select a terminal to continue</p>
                <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: maxPos }, (_, i) => i + 1).map(num => (
                        <button key={num} onClick={() => setPosNumber(num)}
                            className={`h-24 ${isDark ? 'bg-[#1a1d27] border-gray-700' : 'bg-white border-gray-200'} hover:bg-orange-500/10 border hover:border-orange-500 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group`}>
                            <ShoppingCart className={`h-7 w-7 ${t.textMuted} group-hover:text-orange-400 transition-colors`} />
                            <span className={`${t.text} font-semibold text-sm`}>Terminal {num}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const posName = maxPos > 1 ? `${restaurant.name} · Terminal ${posNumber}` : restaurant.name;

    return (
        <div className={`min-h-screen ${t.bg} flex flex-col`} style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* ── Header ── */}
            <header className={`${t.header} border-b ${t.border} sticky top-0 z-20 shadow-sm`}>
                <div className="px-5 py-0 flex items-center justify-between h-16">
                    {/* Left: Brand */}
                    <div className="flex items-center gap-3">
                        {restaurant.logo_url ? (
                            <img src={restaurant.logo_url} alt={restaurant.name} className="w-9 h-9 rounded-xl object-cover" />
                        ) : (
                            <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                                <UtensilsCrossed className="h-5 w-5 text-white" />
                            </div>
                        )}
                        <div>
                            <h1 className={`${t.text} font-bold text-base leading-tight`}>{posName}</h1>
                            <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
                                <span className={`text-xs ${t.textSub}`}>{isOnline ? 'Online' : 'Offline'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Center: Order type switcher */}
                    <div className={`flex items-center ${t.pill} rounded-xl p-1 border ${t.border}`}>
                        {ORDER_TYPES.map(ot => (
                            <button key={ot.id} onClick={() => setOrderType(ot.id)}
                                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                                    orderType === ot.id
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                                        : `${t.textMuted} hover:${isDark ? 'text-white' : 'text-gray-900'}`
                                }`}>
                                {ot.label}
                            </button>
                        ))}
                    </div>

                    {/* Right: Stats + actions */}
                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 ${t.pill} border ${t.border} rounded-xl px-3 py-2`}>
                            <Clock className={`h-3.5 w-3.5 ${t.textSub}`} />
                            <span className={`${t.text} text-sm font-mono font-semibold`}>
                                {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2">
                            <ShoppingCart className="h-4 w-4 text-orange-400" />
                            <span className="text-orange-500 font-bold text-sm">{cart.length} · £{cartTotal.toFixed(2)}</span>
                        </div>

                        {/* Theme toggle */}
                        <button onClick={toggleTheme}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${t.iconBtn}`}>
                            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </button>

                        {maxPos > 1 && (
                            <button onClick={() => setPosNumber(null)}
                                className={`flex items-center gap-1 ${t.textMuted} text-xs px-3 py-2 rounded-lg hover:${isDark ? 'bg-white/5' : 'bg-gray-100'} transition-colors`}>
                                <ChevronDown className="h-4 w-4" />
                                Switch
                            </button>
                        )}

                        <button onClick={() => base44.auth.logout()}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${t.iconBtn}`}>
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Tab Bar ── */}
            <div className={`${t.header} border-b ${t.border} px-5`}>
                <div className="flex gap-1">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                                    active ? t.tabActive : t.tabInactive
                                }`}>
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Content ── */}
            <main className={`flex-1 p-4 overflow-hidden ${t.bg}`}>
                {activeTab === 'order-entry' && (
                    <POSOrderEntry
                        restaurantId={restaurant.id} cart={cart}
                        onAddItem={addToCart} onRemoveItem={removeFromCart}
                        onUpdateQuantity={updateQuantity} onClearCart={clearCart}
                        cartTotal={cartTotal} orderType={orderType} setOrderType={setOrderType}
                        posTheme={posTheme}
                        discount={discount}
                        onApplyDiscount={setDiscount}
                        onRemoveDiscount={() => setDiscount(null)}
                    />
                )}
                {activeTab === 'queue' && <POSOrderQueue restaurantId={restaurant.id} />}
                {activeTab === 'tables' && <POSTablesView restaurantId={restaurant.id} />}
                {activeTab === 'waitlist' && <POSWaitlist />}
                {activeTab === 'payment' && (
                    <POSPayment cart={cart} cartTotal={cartTotal} onPaymentComplete={clearCart}
                        restaurantId={restaurant.id} restaurantName={restaurant.name} orderType={orderType} posTheme={posTheme}
                        discount={discount} />
                )}
                {activeTab === 'kitchen' && <KitchenDisplaySystem restaurant={restaurant} />}
                {activeTab === 'history' && <POSOrderHistory restaurantId={restaurant.id} posTheme={posTheme} />}
                {activeTab === 'reports' && <POSReports restaurantId={restaurant.id} posTheme={posTheme} />}
            </main>
        </div>
    );
}