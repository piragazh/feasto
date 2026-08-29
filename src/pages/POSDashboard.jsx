import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { LogOut, ShoppingCart, UtensilsCrossed, DollarSign, Monitor, Users, BarChart3, ChevronDown, WifiOff, RefreshCw, Clock, Sun, Moon, ClipboardList, ExternalLink, UserCog, TabletSmartphone, Sunset, Settings } from 'lucide-react';
import { publishCustomerDisplay } from '@/components/pos/CustomerDisplay';
import { createPageUrl } from '@/utils';
import POSOrderEntry from '@/components/pos/POSOrderEntry.jsx';
import { useOfflineSyncState, formatCachedAt } from '@/components/pos/POSOfflineSyncBanner';
import { getLastCachedAt } from '@/components/pos/POSOfflineDB';
import { paletteStyle, DEFAULT_PALETTE, readCachedPalette, writeCachedPalette } from '@/lib/posThemes';
import POSOrderQueue from '@/components/pos/POSOrderQueue.jsx';
import POSPayment from '@/components/pos/POSPayment.jsx';
import KitchenDisplaySystem from '@/components/kds/KitchenDisplaySystem';
import POSWaitlist from '@/components/pos/POSWaitlist.jsx';
import POSReports from '@/components/pos/POSReports.jsx';
import POSOrderHistory from '@/components/pos/POSOrderHistory.jsx';
import POSTablesView from '@/components/pos/POSTablesView.jsx';
import POSStaffManager from '@/components/pos/POSStaffManager.jsx';
import POSStaffLogin from '@/components/pos/POSStaffLogin.jsx';
import POSEndOfDay from '@/components/pos/POSEndOfDay.jsx';
import QZTrayStatusBadge from '@/components/pos/QZTrayStatusBadge.jsx';
import POSPrinterSettings from '@/components/pos/POSPrinterSettings.jsx';
import POSSoundSettings from '@/components/pos/POSSoundSettings.jsx';
import POSThemeSettings from '@/components/pos/POSThemeSettings.jsx';
import { playItemAdded, playItemRemoved } from '@/lib/posSound';
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
    const { isOnline, pendingCount, isSyncing } = useOfflineSyncState();
    const [posTheme, setPosTheme] = useState(() => localStorage.getItem('pos_theme') || 'dark');
    // Accent palette. Stored on the restaurant record so every till at that site
    // matches. The localStorage mirror is keyed BY RESTAURANT - an operator can
    // run several restaurants from one device, and a shared key would paint one
    // restaurant's brand colour onto another's till. Starts at the default and
    // resolves once the restaurant id is known.
    const [posPalette, setPosPalette] = useState(DEFAULT_PALETTE);
    const [activeStaffMember, setActiveStaffMember] = useState(null);
    const [staffList, setStaffList] = useState([]);
    const [showStaffLogin, setShowStaffLogin] = useState(false);
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
    }, []);

    const loadUserAndRestaurant = async () => {
        try {
            const userData = await base44.auth.me();
            if (!userData) { base44.auth.redirectToLogin(); return; }
            setUser(userData);

            let restaurantId = null;
            const urlParams = new URLSearchParams(window.location.search);
            const urlRestaurantId = urlParams.get('restaurant_id') || urlParams.get('restaurantId');
            const urlPosNum = parseInt(urlParams.get('posNum')) || null;

            if (userData.role === 'admin') {
                restaurantId = urlRestaurantId || (await base44.entities.Restaurant.list())?.[0]?.id;
            } else {
                const managers = await base44.entities.RestaurantManager.filter({ user_email: userData.email, is_active: true });
                if (!managers.length) { toast.error('No POS access'); base44.auth.redirectToLogin(); return; }
                const manager = managers[0];
                if (!manager.restaurant_ids?.length) { toast.error('No restaurants assigned'); return; }
                if (urlRestaurantId && !manager.restaurant_ids.includes(urlRestaurantId)) {
                    toast.error('Access denied to this restaurant');
                    base44.auth.redirectToLogin();
                    return;
                }
                restaurantId = urlRestaurantId || manager.restaurant_ids[0];
            }

            if (restaurantId) {
                const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
                if (!r) { toast.error('Restaurant not found'); return; }
                if (userData.role !== 'admin' && !r.pos_enabled) { setAccessDenied(true); return; }
                setRestaurant(r);
                // Paint the cached value for THIS restaurant first (avoids a flash
                // of the default), then trust whatever the record says.
                const cached = readCachedPalette(r.id);
                if (cached) setPosPalette(cached);
                if (r.pos_palette) {
                    setPosPalette(r.pos_palette);
                    writeCachedPalette(r.id, r.pos_palette);
                }
                const maxPos = r.max_pos_count || 1;
                if (urlPosNum && urlPosNum >= 1 && urlPosNum <= maxPos) setPosNumber(urlPosNum);
                else if (maxPos === 1) setPosNumber(1);

                // Load staff for login
                const staff = await base44.entities.StaffMember.filter({ restaurant_id: r.id, is_active: true });
                setStaffList(staff || []);
                if (staff && staff.length > 0) setShowStaffLogin(true);
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
        playItemAdded();
        setCart(prev => {
            const hasCustomizations = item.customizations && Object.keys(item.customizations).length > 0;
            const hasSpecialInstructions = !!item.specialInstructions;

            if (!hasCustomizations && !hasSpecialInstructions) {
                // Identify the base menu item id — strip any cart suffix (e.g. "abc123_1234567890")
                const baseId = item.menu_item_id || item.id;
                const existing = prev.find(i => {
                    const iBaseId = i.menu_item_id || i.id;
                    return iBaseId === baseId &&
                        (!i.customizations || Object.keys(i.customizations).length === 0) &&
                        !i.specialInstructions;
                });
                if (existing) {
                    return prev.map(i => i === existing ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i);
                }
            }
            // Unique cart entry id so customised variants can coexist
            const uniqueId = `${item.menu_item_id || item.id}_${Date.now()}`;
            return [...prev, { ...item, id: uniqueId, menu_item_id: item.menu_item_id || item.id, quantity: item.quantity || 1 }];
        });
    };
    // Replace a cart line in place, preserving its position in the list. Used
    // when staff edit an existing item's customizations - removing and re-adding
    // would jump the line to the bottom of the order, which is disorienting
    // mid-service when reading the cart back to a customer.
    const replaceCartItem = (itemId, newItem) => {
        setCart(prev => prev.map(i => i.id === itemId
            ? { ...newItem, id: itemId, menu_item_id: newItem.menu_item_id || newItem.id }
            : i));
    };
    const removeFromCart = (itemId) => {
        playItemRemoved();
        setCart(prev => prev.filter(i => i.id !== itemId));
    };
    const updateQuantity = (itemId, quantity) => {
        if (quantity < 1) { removeFromCart(itemId); return; }
        // Decide the sound from current state before updating — never inside the
        // setState updater, which React may invoke twice (StrictMode) and would
        // double-play the beep.
        const current = cart.find(i => i.id === itemId);
        if (current) {
            if (quantity > current.quantity) playItemAdded();
            else if (quantity < current.quantity) playItemRemoved();
        }
        setCart(prev => prev.map(i => i.id === itemId ? { ...i, quantity } : i));
    };
    const clearCart = () => {
        setCart([]);
        setDiscount(null);
        window.__phoneOrderDetails = null;
        // Switch back to order-entry tab so cashier sees fresh cart immediately
        setActiveTab('order-entry');
    };
    const [discount, setDiscount] = useState(null);

    // Menu-cache timestamp for the top bar readout. Re-read on a timer so the
    // relative label ("12m ago") stays honest without a page refresh.
    const [menuCachedAt, setMenuCachedAt] = useState(null);
    useEffect(() => {
        if (!restaurant?.id) return undefined;
        const read = () => setMenuCachedAt(getLastCachedAt(restaurant.id, 'menu_items'));
        read();
        const timer = setInterval(read, 60000);
        return () => clearInterval(timer);
    }, [restaurant?.id]);

    // The restaurant record is loaded once on mount. Printer settings live on
    // that record (printer_config.centralized_printers), and they are edited in
    // the Settings tab of this same page - so without a refetch the payment
    // screen keeps handing a STALE restaurant to printWithCentralizedConfig and
    // receipts silently stop printing until the operator reloads the whole page.
    // Refetch whenever the operator leaves Settings so saved printer changes
    // take effect immediately.
    const prevTabRef = React.useRef(activeTab);
    useEffect(() => {
        const leftSettings = prevTabRef.current === 'settings' && activeTab !== 'settings';
        prevTabRef.current = activeTab;
        if (!leftSettings || !restaurant?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const [fresh] = await base44.entities.Restaurant.filter({ id: restaurant.id });
                if (fresh && !cancelled) setRestaurant(fresh);
            } catch (e) {
                console.warn('[POS] Could not refresh restaurant after settings change:', e?.message || e);
            }
        })();
        return () => { cancelled = true; };
    }, [activeTab, restaurant?.id]);
    const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartTotal = discount ? Math.max(0, cartSubtotal - discount.amount) : cartSubtotal;

    const ORDER_TYPES = [
        { id: 'takeaway', label: 'Takeaway' },
        { id: 'phone_collection', label: 'Phone Order' },
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
        { id: 'eod', label: 'End of Day', icon: Sunset },
        { id: 'staff', label: 'Staff', icon: UserCog },
        { id: 'settings', label: 'Settings', icon: Settings },
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

    // Staff login screen
    if (showStaffLogin) {
        return (
            <POSStaffLogin
                staffList={staffList}
                restaurant={restaurant}
                isDark={isDark}
                onLogin={(staffMember) => {
                    setActiveStaffMember(staffMember);
                    setShowStaffLogin(false);
                }}
                onSkip={() => setShowStaffLogin(false)}
            />
        );
    }

    return (
        <div
            className={`h-full min-h-0 ${t.bg} flex flex-col overflow-hidden`}
            style={{ fontFamily: "'Inter', sans-serif", ...paletteStyle(posPalette) }}
        >
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
                                {isSyncing ? (
                                    <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                                ) : (
                                    <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
                                )}
                                <span className={`text-xs ${isSyncing ? 'text-blue-400' : isOnline ? t.textSub : 'text-red-400'}`}>
                                    {isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
                                </span>
                                {!isOnline && pendingCount > 0 && (
                                    <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded-full font-bold">
                                        {pendingCount}
                                    </span>
                                )}
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
                        {!isOnline && (
                            <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/40 rounded-xl px-3 py-2">
                                <WifiOff className="h-3.5 w-3.5 text-red-400" />
                                <span className="text-red-400 font-bold text-xs">OFFLINE</span>
                            </div>
                        )}
                        <div className={`flex items-center gap-1.5 ${t.pill} border ${t.border} rounded-xl px-3 py-2`}>
                            <Clock className={`h-3.5 w-3.5 ${t.textSub}`} />
                            <span className={`${t.text} text-sm font-mono font-semibold`}>
                                {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {/* Menu-cache freshness. Lives here rather than as a banner above
                                the menu grid, where it consumed full-width POS space on every
                                order for what is only a passive status readout. */}
                            {menuCachedAt && (
                                <span
                                    className={`${t.textSub} text-[11px] font-medium border-l ${t.border} pl-1.5 ml-0.5`}
                                    title={`Menu last cached ${new Date(menuCachedAt).toLocaleString()}`}
                                >
                                    menu {formatCachedAt(menuCachedAt)}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2">
                            <ShoppingCart className="h-4 w-4 text-orange-400" />
                            <span className="text-orange-500 font-bold text-sm">{cart.reduce((s, i) => s + i.quantity, 0)} · £{cartTotal.toFixed(2)}</span>
                        </div>

                        {/* QZ Tray status + Open Cash Drawer button */}
                        <QZTrayStatusBadge restaurant={restaurant} isDark={isDark} />

                        {/* Theme toggle */}
                        <button 
                            onClick={toggleTheme}
                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${t.iconBtn}`}>
                            {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                        </button>

                        {maxPos > 1 && (
                            <button 
                                onClick={() => setPosNumber(null)}
                                aria-label="Switch POS terminal"
                                className={`flex items-center gap-1 ${t.textMuted} text-xs px-3 py-2 rounded-lg hover:${isDark ? 'bg-white/5' : 'bg-gray-100'} transition-colors`}>
                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                Switch
                            </button>
                        )}

                        {/* Customer Display button */}
                        <button
                            onClick={() => {
                                publishCustomerDisplay({ status: 'idle', restaurantName: restaurant?.name, logoUrl: restaurant?.logo_url });
                                window.open(createPageUrl('CustomerDisplay'), '_blank', 'width=1024,height=768,menubar=no,toolbar=no,location=no');
                            }}
                            aria-label="Open customer display in new window"
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${t.iconBtn}`}>
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </button>

                        {/* Kiosk button */}
                        <button
                            onClick={() => window.open(createPageUrl('KioskDashboard') + `?restaurant_id=${restaurant.id}`, '_blank')}
                            aria-label="Open self-order kiosk in new window"
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${t.iconBtn}`}>
                            <TabletSmartphone className="h-4 w-4" aria-hidden="true" />
                        </button>

                        {activeStaffMember && (
                            <button 
                                onClick={() => setShowStaffLogin(true)}
                                aria-label={`Switch staff member. Currently: ${activeStaffMember.full_name}`}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${t.iconBtn}`}>
                                <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" aria-hidden="true">
                                    {activeStaffMember.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                                </div>
                                <span className={`text-xs font-semibold ${t.textMuted} hidden sm:block`}>
                                    {activeStaffMember.full_name.split(' ')[0]}
                                </span>
                            </button>
                        )}

                        <button 
                            onClick={() => base44.auth.logout()}
                            aria-label="Sign out"
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${t.iconBtn}`}>
                            <LogOut className="h-4 w-4" aria-hidden="true" />
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
            <main className={`flex-1 min-h-0 p-4 overflow-hidden ${t.bg}`}>
                {activeTab === 'order-entry' && (
                    <POSOrderEntry
                        restaurantId={restaurant.id} cart={cart}
                        onAddItem={addToCart} onRemoveItem={removeFromCart}
                        onUpdateQuantity={updateQuantity} onClearCart={clearCart}
                        onReplaceItem={replaceCartItem}
                        cartTotal={cartTotal} orderType={orderType} setOrderType={setOrderType}
                        posTheme={posTheme}
                        restaurant={restaurant}
                        discount={discount}
                        onApplyDiscount={setDiscount}
                        onRemoveDiscount={() => setDiscount(null)}
                    />
                )}
                {activeTab === 'queue' && <POSOrderQueue restaurantId={restaurant.id} posTheme={posTheme} />}
                {activeTab === 'tables' && <POSTablesView restaurantId={restaurant.id} posTheme={posTheme} />}
                {activeTab === 'waitlist' && <POSWaitlist posTheme={posTheme} />}
                {activeTab === 'payment' && (
                    <POSPayment cart={cart} cartTotal={cartTotal} onPaymentComplete={clearCart}
                        restaurantId={restaurant.id} restaurantName={restaurant.name} orderType={orderType} posTheme={posTheme}
                        discount={discount} restaurant={restaurant} />
                )}
                {activeTab === 'kitchen' && <KitchenDisplaySystem restaurant={restaurant} />}
                {activeTab === 'history' && <POSOrderHistory restaurantId={restaurant.id} posTheme={posTheme} />}
                {activeTab === 'reports' && <POSReports restaurantId={restaurant.id} posTheme={posTheme} />}
                {activeTab === 'eod' && <POSEndOfDay restaurantId={restaurant.id} restaurant={restaurant} posTheme={posTheme} />}
                {activeTab === 'staff' && <POSStaffManager restaurantId={restaurant.id} posTheme={posTheme} currentUser={user} />}
                {/* Settings is built on the shared light UI kit (Card, Label, Switch),
                    not the POS dark tokens. Rather than half-theming it and getting
                    an inconsistent mix, it renders on an explicit light surface so
                    it reads as a deliberate settings sheet rather than a clash.
                    Scrolls independently since it is much taller than a POS tab. */}
                {activeTab === 'settings' && (
                    <div className="h-full min-h-0 overflow-y-auto rounded-2xl bg-gray-50 border border-gray-200 p-4">
                        <div className="space-y-6 max-w-5xl mx-auto">
                            <POSThemeSettings
                                restaurantId={restaurant.id}
                                restaurant={restaurant}
                                onPaletteChange={setPosPalette}
                            />
                            <POSSoundSettings />
                            <POSPrinterSettings restaurantId={restaurant.id} />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}