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
import KioskWelcome from '@/components/kiosk/KioskWelcome';
import KioskMenu from '@/components/kiosk/KioskMenu';
import KioskCart from '@/components/kiosk/KioskCart';
import KioskPayment from '@/components/kiosk/KioskPayment';
import KioskConfirmation from '@/components/kiosk/KioskConfirmation';
import KioskAdminPanel from '@/components/kiosk/KioskAdminPanel';
import { resolveRestaurantId } from '@/lib/kioskDeviceBinding';

// SCREENS: welcome → menu → cart → payment → confirmation
export default function KioskDashboard() {
    const [screen, setScreen] = useState('welcome');
    const [orderType, setOrderType] = useState('takeaway');
    const [cart, setCart] = useState([]);
    const [placedOrder, setPlacedOrder] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showAdmin, setShowAdmin] = useState(false);
    const [adminTapCount, setAdminTapCount] = useState(0);
    const [selectedTable, setSelectedTable] = useState(null);

    // Resolve restaurant ID from binding (localStorage-first, URL only for first setup)
    const { restaurantId } = resolveRestaurantId();

    useEffect(() => {
        if (restaurantId) loadRestaurant(restaurantId);
        else setLoading(false);
    }, [restaurantId]);

    // Auto-reset to welcome after inactivity
    useEffect(() => {
        if (screen === 'welcome' || screen === 'confirmation') return;
        const reset = () => {
            clearTimeout(window.__kioskInactivityTimer);
            window.__kioskInactivityTimer = setTimeout(() => {
                setScreen('welcome');
                setCart([]);
                setOrderType('takeaway');
                setSelectedTable(null);
            }, 120000); // 2 min
        };
        reset();
        window.addEventListener('touchstart', reset);
        window.addEventListener('click', reset);
        return () => {
            clearTimeout(window.__kioskInactivityTimer);
            window.removeEventListener('touchstart', reset);
            window.removeEventListener('click', reset);
        };
    }, [screen]);

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

    const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

    const handleOrderPlaced = (order) => {
        setPlacedOrder(order);
        setScreen('confirmation');
    };

    const resetKiosk = () => {
        setCart([]);
        setPlacedOrder(null);
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

    return (
        <div className="min-h-screen bg-gray-950 overflow-hidden select-none">
            {screen === 'welcome' && (
                <KioskWelcome
                    restaurant={restaurant}
                    onStart={(type) => { setOrderType(type); setScreen('menu'); }}
                    onLogoTap={handleLogoTap}
                />
            )}
            {screen === 'menu' && (
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
            )}
            {screen === 'cart' && (
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
            )}
            {screen === 'payment' && (
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
            )}
            {screen === 'confirmation' && (
                <KioskConfirmation
                    order={placedOrder}
                    orderType={orderType}
                    restaurant={restaurant}
                    onDone={resetKiosk}
                />
            )}
        </div>
    );
}