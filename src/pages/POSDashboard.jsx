import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import POSLayout from '@/components/pos/POSLayout';
import POSOrderEntry from '@/components/pos/POSOrderEntry.jsx';
import POSOrderQueue from '@/components/pos/POSOrderQueue.jsx';
import POSTableManager from '@/components/pos/POSTableManager.jsx';
import POSPayment from '@/components/pos/POSPayment.jsx';
import POSKitchenDisplay from '@/components/pos/POSKitchenDisplay.jsx';
import POSWaitlist from '@/components/pos/POSWaitlist.jsx';
import POSReports from '@/components/pos/POSReports.jsx';
import { toast } from 'sonner';

export default function POSDashboard() {
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [activeTab, setActiveTab] = useState('order-entry');
    const [cart, setCart] = useState([]);
    const [tables, setTables] = useState({});

    useEffect(() => {
        loadUserAndRestaurant();
    }, []);

    const loadUserAndRestaurant = async () => {
        try {
            const userData = await base44.auth.me();
            if (!userData) {
                base44.auth.redirectToLogin();
                return;
            }
            setUser(userData);

            let restaurantId = null;

            // Check URL parameter first (for admin access)
            const urlParams = new URLSearchParams(window.location.search);
            const urlRestaurantId = urlParams.get('restaurantId');

            // Check if user is admin
            if (userData.role === 'admin') {
                if (urlRestaurantId) {
                    restaurantId = urlRestaurantId;
                } else {
                    const restaurants = await base44.entities.Restaurant.list();
                    if (restaurants.length > 0) {
                        restaurantId = restaurants[0].id;
                    }
                }
            } else {
                // Check if user is restaurant manager
                const managers = await base44.entities.RestaurantManager.filter({
                    user_email: userData.email,
                    is_active: true
                });

                if (managers.length === 0) {
                    toast.error('You do not have access to the POS system');
                    base44.auth.redirectToLogin();
                    return;
                }

                const manager = managers[0];
                if (!manager.restaurant_ids || manager.restaurant_ids.length === 0) {
                    toast.error('No restaurants assigned to your account');
                    return;
                }
                restaurantId = manager.restaurant_ids[0];
            }

            if (restaurantId) {
                const restaurantData = await base44.entities.Restaurant.filter({ id: restaurantId });
                if (restaurantData && restaurantData.length > 0) {
                    setRestaurant(restaurantData[0]);
                    initializeTables(restaurantData[0]);
                } else {
                    toast.error('Restaurant not found');
                }
            } else {
                toast.error('No restaurants available');
            }
        } catch (e) {
            console.error('POS loading error:', e);
            toast.error('Error loading POS system');
            setTimeout(() => base44.auth.redirectToLogin(), 1500);
        }
    };

    const initializeTables = (rest) => {
        // Initialize tables (1-20 by default)
        const newTables = {};
        for (let i = 1; i <= 20; i++) {
            newTables[`table_${i}`] = {
                number: i,
                status: 'empty',
                items: [],
                total: 0
            };
        }
        setTables(newTables);
    };

    const addToCart = (item) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { ...item, quantity: 1 }];
        });
    };

    const removeFromCart = (itemId) => {
        setCart(prev => prev.filter(i => i.id !== itemId));
    };

    const updateQuantity = (itemId, quantity) => {
        if (quantity < 1) {
            removeFromCart(itemId);
            return;
        }
        setCart(prev => prev.map(i => i.id === itemId ? { ...i, quantity } : i));
    };

    const clearCart = () => {
        setCart([]);
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (!user || !restaurant) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading POS System...</p>
                </div>
            </div>
        );
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'order-entry':
                return (
                    <POSOrderEntry 
                        restaurantId={restaurant.id}
                        cart={cart}
                        onAddItem={addToCart}
                        onRemoveItem={removeFromCart}
                        onUpdateQuantity={updateQuantity}
                        onClearCart={clearCart}
                        cartTotal={cartTotal}
                    />
                );
            case 'queue':
                return <POSOrderQueue restaurantId={restaurant.id} />;
            case 'tables':
                return (
                    <POSTableManager 
                        tables={tables}
                        cart={cart}
                        cartTotal={cartTotal}
                        onAddItem={addToCart}
                        onRemoveItem={removeFromCart}
                        onUpdateQuantity={updateQuantity}
                    />
                );
            case 'payment':
                return (
                    <POSPayment 
                        cart={cart}
                        cartTotal={cartTotal}
                        onPaymentComplete={clearCart}
                    />
                );
            case 'kitchen':
                return <POSKitchenDisplay restaurantId={restaurant.id} />;
            case 'waitlist':
                return <POSWaitlist />;
            case 'reports':
                return <POSReports restaurantId={restaurant.id} />;
            default:
                return null;
        }
    };

    return (
        <POSLayout
            currentTab={activeTab}
            onTabChange={setActiveTab}
            restaurant={restaurant}
            user={user}
            cart={cart}
            cartTotal={cartTotal}
        >
            {renderContent()}
        </POSLayout>
    );
}