import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import KioskWelcome from '@/components/kiosk/KioskWelcome';
import KioskMenu from '@/components/kiosk/KioskMenu';
import KioskCart from '@/components/kiosk/KioskCart';
import KioskPayment from '@/components/kiosk/KioskPayment';
import KioskConfirmation from '@/components/kiosk/KioskConfirmation';
import KioskAdminPanel from '@/components/kiosk/KioskAdminPanel';

// SCREENS: welcome → menu → cart → payment → confirmation
export default function KioskDashboard() {
    const [screen, setScreen] = useState('welcome');
    const [orderType, setOrderType] = useState('takeaway'); // 'takeaway' | 'dine_in'
    const [cart, setCart] = useState([]);
    const [placedOrder, setPlacedOrder] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showAdmin, setShowAdmin] = useState(false);
    const [adminTapCount, setAdminTapCount] = useState(0);
    const [selectedTable, setSelectedTable] = useState(null);

    // Get restaurantId from URL
    const urlParams = new URLSearchParams(window.location.search);
    const restaurantId = urlParams.get('restaurant_id') || urlParams.get('restaurantId');

    useEffect(() => {
        if (restaurantId) loadRestaurant();
        else setLoading(false);
    }, [restaurantId]);

    // Auto-reset to welcome after inactivity
    useEffect(() => {
        if (screen === 'welcome') return;
        let timer = setTimeout(() => {
            if (screen !== 'confirmation') {
                setScreen('welcome');
                setCart([]);
                setOrderType('takeaway');
                setSelectedTable(null);
            }
        }, 120000); // 2 min inactivity reset
        return () => clearTimeout(timer);
    }, [screen]);

    const loadRestaurant = async () => {
        try {
            const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
            setRestaurant(r);
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

    if (loading) return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin mx-auto mb-4" />
                <p className="text-gray-400 font-medium">Loading Kiosk...</p>
            </div>
        </div>
    );

    if (!restaurantId || !restaurant) return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center text-center px-8">
            <div>
                <div className="text-6xl mb-4">🍽️</div>
                <h2 className="text-white text-2xl font-bold mb-2">Kiosk Setup Required</h2>
                <p className="text-gray-400 mb-6">Add <code className="bg-gray-800 px-2 py-1 rounded text-orange-400">?restaurant_id=YOUR_ID</code> to the URL</p>
            </div>
        </div>
    );

    if (showAdmin) return (
        <KioskAdminPanel restaurant={restaurant} onClose={() => setShowAdmin(false)} />
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