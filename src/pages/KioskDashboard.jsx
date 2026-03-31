/**
 * KioskDashboard — Device-bound kiosk
 *
 * RESTAURANT RESOLUTION ORDER:
 *   1. localStorage binding (authoritative — set at first setup or by admin rebind)
 *   2. URL ?restaurant_id= (first-time setup only — auto-persisted to localStorage)
 *   3. Unconfigured fallback screen (no URL param, no binding)
 *
 * URL param changes during normal operation are IGNORED.
 * Only an authenticated admin action can rebind the device.
 */

import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import KioskWelcome from '@/components/kiosk/KioskWelcome';
import KioskMenu from '@/components/kiosk/KioskMenu';
import KioskCart from '@/components/kiosk/KioskCart';
import KioskPayment from '@/components/kiosk/KioskPayment';
import KioskConfirmation from '@/components/kiosk/KioskConfirmation';
import KioskAdminPanel from '@/components/kiosk/KioskAdminPanel';
import KioskIdleMediaOverlay from '@/components/kiosk/KioskIdleMediaOverlay';
import { resolveRestaurantId } from '@/lib/kioskDeviceBinding';

// SCREENS: welcome → menu → cart → payment → confirmation
// MODES: ordering (show kiosk) | idle_media (show promotions fullscreen)
export default function KioskDashboard() {
    const [screen, setScreen] = useState('welcome');
     const [mode, setMode] = useState('ordering'); // 'ordering' | 'idle_media'
     const [orderType, setOrderType] = useState('takeaway');
     const [cart, setCart] = useState(() => {
         try {
             const saved = sessionStorage.getItem('kiosk_cart');
             return saved ? JSON.parse(saved) : [];
         } catch {
             return [];
         }
     });
     const [placedOrder, setPlacedOrder] = useState(null);
     const [printerError, setPrinterError] = useState(false);
     const [restaurant, setRestaurant] = useState(null);
     const [loading, setLoading] = useState(true);
     const [showAdmin, setShowAdmin] = useState(false);
     const [adminTapCount, setAdminTapCount] = useState(0);
     const [selectedTable, setSelectedTable] = useState(null);

    // Resolve restaurant ID from binding (localStorage-first, URL only for first setup)
    const { restaurantId } = resolveRestaurantId();

    // Persist cart to sessionStorage
    useEffect(() => {
        try {
            sessionStorage.setItem('kiosk_cart', JSON.stringify(cart));
        } catch {
            // ignore storage quota errors
        }
    }, [cart]);

    useEffect(() => {
        if (restaurantId) loadRestaurant(restaurantId);
        else setLoading(false);
    }, [restaurantId]);

    // Inactivity tracking: reset on interaction, transition to idle_media after timeout
    useEffect(() => {
        if (!restaurant) return;

        // Config: idle media settings (defaults if not set)
        const kioskConfig = restaurant.kiosk_config || {};
        const idleMediaEnabled = kioskConfig.kiosk_idle_media_enabled !== false; // default true
        const idleMediaTimeout = (kioskConfig.kiosk_idle_media_timeout_seconds ?? 60) * 1000;
        const orderResetTimeout = (kioskConfig.idle_timeout_seconds ?? 120) * 1000;

        // Don't set inactivity timers during payment, confirmation, or if idle_media disabled
        const isPaymentOrConfirm = screen === 'payment' || screen === 'confirmation';
        if (isPaymentOrConfirm || !idleMediaEnabled) return;

        const handleActivity = () => {
            // Reset all timers on any interaction
            clearTimeout(window.__kioskIdleMediaTimer);
            clearTimeout(window.__kioskResetTimer);
            
            // Exit media mode immediately on interaction
            if (mode === 'idle_media') {
                setMode('ordering');
            }

            // Set idle_media timeout (60s by default)
            window.__kioskIdleMediaTimer = setTimeout(() => {
                // Clear session before showing media
                setCart([]);
                setPlacedOrder(null);
                setPrinterError(false);
                setOrderType('takeaway');
                setSelectedTable(null);
                setScreen('welcome');
                setMode('idle_media');
                
                // Set order reset timer (if media is shown, full reset happens after this time)
                window.__kioskResetTimer = setTimeout(() => {
                    if (mode === 'idle_media') {
                        setMode('ordering');
                        setScreen('welcome');
                    }
                }, orderResetTimeout);
            }, idleMediaTimeout);
        };

        // Trigger on any interaction
        handleActivity();
        window.addEventListener('touchstart', handleActivity);
        window.addEventListener('click', handleActivity);
        
        return () => {
            clearTimeout(window.__kioskIdleMediaTimer);
            clearTimeout(window.__kioskResetTimer);
            window.removeEventListener('touchstart', handleActivity);
            window.removeEventListener('click', handleActivity);
        };
    }, [screen, mode, restaurant]);

    // Report kiosk status to admin dashboard every 30 seconds
    useEffect(() => {
        if (!restaurantId || !restaurant) return;

        const reportStatus = async () => {
            try {
                const kioskId = localStorage.getItem('kioskDeviceId') || `kiosk_${restaurantId}_${Math.random().toString(36).substr(2, 9)}`;
                if (!localStorage.getItem('kioskDeviceId')) {
                    localStorage.setItem('kioskDeviceId', kioskId);
                }

                const isActive = screen !== 'welcome' || mode === 'ordering';
                await base44.functions.invoke('trackKioskStatus', {
                    restaurantId,
                    kioskId,
                    status: isActive ? 'active' : 'idle',
                    orderCount: cart.length,
                    lastActivity: new Date().toISOString()
                });
            } catch (error) {
                console.error('Failed to report kiosk status:', error);
            }
        };

        reportStatus();
        const statusInterval = setInterval(reportStatus, 30000); // Report every 30 seconds
        return () => clearInterval(statusInterval);
    }, [restaurantId, restaurant, screen, mode, cart.length]);

    const loadRestaurant = async (id) => {
        try {
            const [r] = await base44.entities.Restaurant.filter({ id });
            setRestaurant(r || null);
        } catch (e) {
            toast.error('Failed to load restaurant');
        } finally {
            setLoading(false);
        }
    };

    const addToCart = (item) => {
        setCart(prev => {
            const hasCustomizations = item.customizations && Object.keys(item.customizations).length > 0;
            if (!hasCustomizations) {
                const existing = prev.find(i => i.id === item.id && (!i.customizations || Object.keys(i.customizations).length === 0));
                if (existing) return prev.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i);
            }
            return [...prev, { ...item, cartId: `${item.id}_${Date.now()}`, quantity: item.quantity || 1 }];
        });
    };

    const updateQuantity = (cartId, qty) => {
        if (qty < 1) { removeItem(cartId); return; }
        setCart(prev => prev.map(i => i.cartId === cartId ? { ...i, quantity: qty } : i));
    };

    const removeItem = (cartId) => setCart(prev => prev.filter(i => i.cartId !== cartId));

    const editItem = (cartId, updated) => {
        setCart(prev => prev.map(i => i.cartId === cartId
            ? { ...i, price: updated.price, quantity: updated.quantity, customizations: updated.customizations, itemQuantities: updated.itemQuantities }
            : i
        ));
    };

    const cartTotal = cart.reduce((s, i) => {
        const itemPrice = Number(i.price) || 0;
        const qty = Number(i.quantity) || 1;
        return s + (itemPrice * qty);
    }, 0);
    const cartCount = cart.reduce((s, i) => s + (Number(i.quantity) || 1), 0);

    const handleOrderPlaced = (order, hadPrinterError = false) => {
        setPlacedOrder(order);
        setPrinterError(hadPrinterError);
        setScreen('confirmation');
    };

    const resetKiosk = () => {
        setCart([]);
        setPlacedOrder(null);
        setPrinterError(false);
        setOrderType('takeaway');
        setSelectedTable(null);
        setScreen('welcome');
    };

    // Secret admin access: tap logo 5 times
    const handleLogoTap = () => {
        setAdminTapCount(prev => {
            const next = prev + 1;
            if (next >= 5) { setShowAdmin(true); return 0; }
            return next;
        });
    };

    // Callback for admin rebind — reload restaurant from new binding
    const handleAdminRebind = (newRestaurantId) => {
        setLoading(true);
        setRestaurant(null);
        loadRestaurant(newRestaurantId);
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin mx-auto mb-4" />
                <p className="text-gray-400 font-medium">Loading Kiosk...</p>
            </div>
        </div>
    );

    // Unconfigured device fallback
    if (!restaurantId || !restaurant) return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center text-center px-8">
            <div>
                <div className="text-6xl mb-4">🍽️</div>
                <h2 className="text-white text-2xl font-bold mb-2">Kiosk Not Configured</h2>
                <p className="text-gray-400 mb-3 max-w-sm">
                    This device has not been bound to a restaurant yet.
                </p>
                <p className="text-gray-600 text-sm mb-6">
                    For initial setup, add{' '}
                    <code className="bg-gray-800 px-2 py-1 rounded text-orange-400">?restaurant_id=YOUR_ID</code>{' '}
                    to the URL. Once set, the device remembers its restaurant and ignores URL changes.
                </p>
                <p className="text-gray-700 text-xs">Ask your system administrator to configure this device.</p>
            </div>
        </div>
    );

    if (showAdmin) return (
        <KioskAdminPanel
            restaurant={restaurant}
            onClose={() => {
                setShowAdmin(false);
                resetKiosk(); // wipe cart + session — no state leaks
            }}
            onRebind={handleAdminRebind}
        />
    );

    // Idle media mode: show promotions fullscreen with smooth transitions
    if (mode === 'idle_media') {
        return (
            <KioskIdleMediaOverlay
                restaurantId={restaurantId}
                screenName={restaurant?.kiosk_config?.idle_media_screen_name || 'Kiosk Promo'}
                onExit={() => {
                    setMode('ordering');
                    setScreen('welcome');
                }}
            />
        );
    }

    return (
        <div className="fixed inset-0 bg-gray-950 overflow-hidden select-none">
            <AnimatePresence mode="wait">
                {screen === 'welcome' && (
                    <motion.div
                        key="welcome"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <KioskWelcome
                            restaurant={restaurant}
                            onStart={(type) => { setOrderType(type); setScreen('menu'); }}
                            onLogoTap={handleLogoTap}
                        />
                    </motion.div>
                )}
                {screen === 'menu' && (
                    <motion.div
                        key="menu"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <KioskMenu
                            restaurant={restaurant}
                            restaurantId={restaurantId}
                            cart={cart}
                            cartTotal={cartTotal}
                            cartCount={cartCount}
                            orderType={orderType}
                            onAddItem={addToCart}
                            onViewCart={() => setScreen('cart')}
                            onBack={resetKiosk}
                        />
                    </motion.div>
                )}
                {screen === 'cart' && (
                    <motion.div
                        key="cart"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <KioskCart
                            cart={cart}
                            cartTotal={cartTotal}
                            orderType={orderType}
                            restaurant={restaurant}
                            selectedTable={selectedTable}
                            onUpdateQuantity={updateQuantity}
                            onRemoveItem={removeItem}
                            onEditItem={editItem}
                            onBack={() => setScreen('menu')}
                            onCheckout={() => setScreen('payment')}
                            onClearCart={() => setCart([])}
                        />
                    </motion.div>
                )}
                {screen === 'payment' && (
                    <motion.div
                        key="payment"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <KioskPayment
                            cart={cart}
                            cartTotal={cartTotal}
                            orderType={orderType}
                            restaurant={restaurant}
                            restaurantId={restaurantId}
                            selectedTable={selectedTable}
                            onBack={() => setScreen('cart')}
                            onOrderPlaced={handleOrderPlaced}
                        />
                    </motion.div>
                )}
                {screen === 'confirmation' && (
                    <motion.div
                        key="confirmation"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <KioskConfirmation
                            order={placedOrder}
                            orderType={orderType}
                            restaurant={restaurant}
                            onDone={resetKiosk}
                            printerFailed={printerError}
                            paymentMethod={placedOrder?.payment_method}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}