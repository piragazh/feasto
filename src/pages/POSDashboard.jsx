import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, ShoppingCart, UtensilsCrossed, DollarSign, Monitor, Users, BarChart3 } from 'lucide-react';
import POSOrderEntry from '@/components/pos/POSOrderEntry.jsx';
import POSOrderQueue from '@/components/pos/POSOrderQueue.jsx';
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
    const [orderType, setOrderType] = useState('takeaway');

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

    const initializeTables = async (rest) => {
        // Fetch actual tables from database
        try {
            const dbTables = await base44.entities.RestaurantTable.filter({ 
                restaurant_id: rest.id, 
                is_active: true 
            });
            
            const newTables = {};
            dbTables.forEach(table => {
                newTables[`table_${table.id}`] = {
                    number: table.table_number,
                    status: 'empty',
                    items: [],
                    total: 0,
                    id: table.id
                };
            });
            setTables(newTables);
        } catch (error) {
            console.error('Error loading tables:', error);
            toast.error('Failed to load tables');
        }
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

    return (
        <div className="min-h-screen bg-gray-900">
            {/* Header */}
            <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10 shadow-lg">
                <div className="max-w-7xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                <UtensilsCrossed className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">{restaurant.name} - POS</h1>
                                <p className="text-xs text-gray-400">Point of Sale System</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex gap-3 justify-start">
                                <Button
                                    variant={orderType === 'collection' ? 'default' : 'outline'}
                                    onClick={() => setOrderType('collection')}
                                    className={`h-14 px-6 text-base font-bold ${orderType === 'collection' ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                                >
                                    Collection
                                </Button>
                                <Button
                                    variant={orderType === 'takeaway' ? 'default' : 'outline'}
                                    onClick={() => setOrderType('takeaway')}
                                    className={`h-14 px-6 text-base font-bold ${orderType === 'takeaway' ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                                >
                                    Takeaway
                                </Button>
                                <Button
                                    variant={orderType === 'dine_in' ? 'default' : 'outline'}
                                    onClick={() => setOrderType('dine_in')}
                                    className={`h-14 px-6 text-base font-bold ${orderType === 'dine_in' ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                                >
                                    Dine In
                                </Button>
                            </div>
                            <div className="w-24 h-24 bg-orange-500 rounded-lg flex flex-col items-center justify-center">
                                <ShoppingCart className="h-8 w-8 text-white mb-1" />
                                <span className="text-lg font-bold text-white">{cart.length}</span>
                                <span className="text-xs text-white">items</span>
                            </div>
                            <div className="w-24 h-24 bg-blue-500 rounded-lg flex flex-col items-center justify-center">
                                <DollarSign className="h-8 w-8 text-white mb-1" />
                                <span className="text-lg font-bold text-white">£{cartTotal.toFixed(2)}</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => base44.auth.logout()}
                                className="text-gray-400 hover:text-white"
                            >
                                <LogOut className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto p-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-7 bg-gray-800 border border-gray-700 mb-6">
                        <TabsTrigger value="order-entry" className="text-white data-[state=active]:bg-orange-500">
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Orders
                        </TabsTrigger>
                        <TabsTrigger value="queue" className="text-white data-[state=active]:bg-orange-500">
                            <UtensilsCrossed className="h-4 w-4 mr-2" />
                            Queue
                        </TabsTrigger>
                        <TabsTrigger value="tables" className="text-white data-[state=active]:bg-orange-500">
                            <Monitor className="h-4 w-4 mr-2" />
                            Tables
                        </TabsTrigger>
                        <TabsTrigger value="waitlist" className="text-white data-[state=active]:bg-orange-500">
                            <Users className="h-4 w-4 mr-2" />
                            Waitlist
                        </TabsTrigger>
                        <TabsTrigger value="payment" className="text-white data-[state=active]:bg-orange-500">
                            <DollarSign className="h-4 w-4 mr-2" />
                            Payment
                        </TabsTrigger>
                        <TabsTrigger value="kitchen" className="text-white data-[state=active]:bg-orange-500">
                            <Monitor className="h-4 w-4 mr-2" />
                            Kitchen
                        </TabsTrigger>
                        <TabsTrigger value="reports" className="text-white data-[state=active]:bg-orange-500">
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Reports
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="order-entry">
                        <POSOrderEntry 
                            restaurantId={restaurant.id}
                            cart={cart}
                            onAddItem={addToCart}
                            onRemoveItem={removeFromCart}
                            onUpdateQuantity={updateQuantity}
                            onClearCart={clearCart}
                            cartTotal={cartTotal}
                            orderType={orderType}
                            setOrderType={setOrderType}
                        />
                    </TabsContent>

                    <TabsContent value="queue">
                        <POSOrderQueue restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="tables">
                        <POSOrderEntry 
                            restaurantId={restaurant.id}
                            cart={cart}
                            onAddItem={addToCart}
                            onRemoveItem={removeFromCart}
                            onUpdateQuantity={updateQuantity}
                            onClearCart={clearCart}
                            cartTotal={cartTotal}
                            orderType="dine_in"
                            setOrderType={() => {}}
                            viewModeDefault="tables"
                        />
                    </TabsContent>

                    <TabsContent value="payment">
                        <POSPayment 
                            cart={cart}
                            cartTotal={cartTotal}
                            onPaymentComplete={clearCart}
                        />
                    </TabsContent>

                    <TabsContent value="kitchen">
                        <POSKitchenDisplay restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="waitlist">
                        <POSWaitlist />
                    </TabsContent>

                    <TabsContent value="reports">
                        <POSReports restaurantId={restaurant.id} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}