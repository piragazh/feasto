import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    UtensilsCrossed, 
    ShoppingBag, 
    History, 
    Settings, 
    LogOut,
    Bell,
    MessageSquare,
    Star,
    BarChart3,
    Navigation,
    Users,
    AlertCircle,
    Tag,
    MapPin
} from 'lucide-react';
import LiveOrders from '@/components/restaurant/LiveOrders';
import OrderQueue from '@/components/restaurant/OrderQueue';
import MenuManagement from '@/components/restaurant/MenuManagement';
import MealDealsManagement from '@/components/restaurant/MealDealsManagement';
import AIMealDealSuggestions from '@/components/restaurant/AIMealDealSuggestions';
import CouponsManagement from '@/components/restaurant/CouponsManagement';
import PastOrders from '@/components/restaurant/PastOrders';
import RestaurantMessages from '@/components/restaurant/RestaurantMessages';
import ReviewsManagement from '@/components/restaurant/ReviewsManagement';
import RestaurantOnboarding from '@/components/restaurant/RestaurantOnboarding';
import RestaurantAnalytics from '@/components/restaurant/RestaurantAnalytics';
import AdvancedAnalytics from '@/components/restaurant/AdvancedAnalytics';
import DriverTracking from '@/components/restaurant/DriverTracking';
import CustomerCRM from '@/components/restaurant/CustomerCRM';
import RefundManagement from '@/components/restaurant/RefundManagement';
import PromotionManagement from '@/components/restaurant/PromotionManagement';
import OrderBatching from '@/components/restaurant/OrderBatching';
import OrderModification from '@/components/restaurant/OrderModification';
import DeliveryZoneManagement from '@/components/restaurant/DeliveryZoneManagement';
import { toast } from 'sonner';

export default function RestaurantDashboard() {
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [activeTab, setActiveTab] = useState('orders');
    const [newOrdersCount, setNewOrdersCount] = useState(0);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        loadUserAndRestaurant();
        requestNotificationPermission();
    }, []);

    const loadUserAndRestaurant = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
            
            // For admin users, just show first restaurant
            if (userData.role === 'admin') {
                const allRestaurants = await base44.entities.Restaurant.list();
                if (allRestaurants.length > 0) {
                    setRestaurant(allRestaurants[0]);
                }
                return;
            }
            
            // Check if user is a restaurant manager
            const managerRecords = await base44.entities.RestaurantManager.filter({ 
                user_email: userData.email,
                is_active: true 
            });
            
            if (managerRecords.length > 0) {
                // User is a restaurant manager
                const manager = managerRecords[0];
                if (manager.restaurant_ids && manager.restaurant_ids.length > 0) {
                    // Load first assigned restaurant
                    const allRestaurants = await base44.entities.Restaurant.list();
                    const restaurantData = allRestaurants.find(r => r.id === manager.restaurant_ids[0]);
                    if (restaurantData) {
                        setRestaurant(restaurantData);
                    } else {
                        toast.error('Restaurant not found');
                    }
                } else {
                    toast.error('No restaurant assigned to your account');
                }
            } else {
                toast.error('No restaurant assigned to this account. Please contact admin.');
            }
        } catch (e) {
            console.error('Error loading restaurant:', e);
            toast.error('Error loading restaurant dashboard');
            base44.auth.redirectToLogin();
        }
    };

    const requestNotificationPermission = async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    };

    const { data: pendingOrders = [] } = useQuery({
        queryKey: ['pending-orders', restaurant?.id],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurant.id, 
            status: 'pending' 
        }),
        enabled: !!restaurant,
        refetchInterval: 3000, // Check every 3 seconds
    });

    const { data: refundRequests = [] } = useQuery({
        queryKey: ['refund-requests-count', restaurant?.id],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurant.id, 
            status: 'refund_requested' 
        }),
        enabled: !!restaurant,
        refetchInterval: 5000,
    });

    const { data: orderMessages = [] } = useQuery({
        queryKey: ['order-messages', restaurant?.id],
        queryFn: () => base44.entities.Message.filter({ restaurant_id: restaurant.id }),
        enabled: !!restaurant,
        refetchInterval: 5000,
    });

    const { data: restaurantMessages = [] } = useQuery({
        queryKey: ['restaurant-messages', restaurant?.id],
        queryFn: () => base44.entities.RestaurantMessage.filter({ restaurant_id: restaurant.id }),
        enabled: !!restaurant,
        refetchInterval: 5000,
    });

    const unreadMessagesCount = [...orderMessages, ...restaurantMessages].filter(msg => !msg.is_read).length;

    useEffect(() => {
        if (pendingOrders.length > newOrdersCount && newOrdersCount > 0) {
            playNotificationSound();
            showNotification('New Order!', `You have ${pendingOrders.length} pending orders`);
        }
        setNewOrdersCount(pendingOrders.length);
    }, [pendingOrders.length]);

    const playNotificationSound = () => {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE=');
        audio.play().catch(() => {});
    };

    const showNotification = (title, body) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/icon.png' });
        }
    };

    if (!user || !restaurant) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {showOnboarding && (
                <RestaurantOnboarding 
                    restaurant={restaurant}
                    onComplete={() => setShowOnboarding(false)}
                />
            )}

            {/* Header */}
            <div className="bg-white border-b shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
                                <UtensilsCrossed className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
                                <p className="text-sm text-gray-500">{user.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {pendingOrders.length > 0 && (
                                <Badge className="bg-red-500 text-white px-3 py-1">
                                    <Bell className="h-4 w-4 mr-1" />
                                    {pendingOrders.length} New Orders
                                </Badge>
                            )}
                            <Button
                                variant="ghost"
                                onClick={() => base44.auth.logout()}
                            >
                                <LogOut className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto p-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="flex flex-col gap-2 mb-6">
                        <TabsList className="bg-white p-1 shadow-sm">
                            <TabsTrigger value="orders" className="relative">
                                <ShoppingBag className="h-4 w-4 mr-2" />
                                Live Orders
                                {pendingOrders.length > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                                        {pendingOrders.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="menu">
                                <UtensilsCrossed className="h-4 w-4 mr-2" />
                                Menu Items
                            </TabsTrigger>
                            <TabsTrigger value="deals">
                                Meal Deals
                            </TabsTrigger>
                            <TabsTrigger value="coupons">
                                Coupons
                            </TabsTrigger>
                            <TabsTrigger value="history">
                                <History className="h-4 w-4 mr-2" />
                                Past Orders
                            </TabsTrigger>
                            <TabsTrigger value="messages" className="relative">
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Messages
                                {unreadMessagesCount > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                                        {unreadMessagesCount}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="reviews">
                                <Star className="h-4 w-4 mr-2" />
                                Reviews
                            </TabsTrigger>
                            <TabsTrigger value="analytics">
                                <BarChart3 className="h-4 w-4 mr-2" />
                                Analytics
                            </TabsTrigger>
                        </TabsList>
                        
                        <TabsList className="bg-white p-1 shadow-sm">
                            <TabsTrigger value="drivers">
                                <Navigation className="h-4 w-4 mr-2" />
                                Drivers
                            </TabsTrigger>
                            <TabsTrigger value="crm">
                                <Users className="h-4 w-4 mr-2" />
                                CRM
                            </TabsTrigger>
                            <TabsTrigger value="refunds" className="relative">
                                <AlertCircle className="h-4 w-4 mr-2" />
                                Refunds
                                {refundRequests.length > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                                        {refundRequests.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="promotions">
                                <Tag className="h-4 w-4 mr-2" />
                                Promotions
                            </TabsTrigger>
                            <TabsTrigger value="batching">
                                <ShoppingBag className="h-4 w-4 mr-2" />
                                Order Batching
                            </TabsTrigger>
                            <TabsTrigger value="modifications">
                                <Settings className="h-4 w-4 mr-2" />
                                Modifications
                            </TabsTrigger>
                            <TabsTrigger value="zones">
                                <MapPin className="h-4 w-4 mr-2" />
                                Zones
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="orders">
                        <OrderQueue 
                            restaurantId={restaurant.id} 
                            onOrderUpdate={() => {}} 
                        />
                    </TabsContent>

                    <TabsContent value="menu">
                        <MenuManagement restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="deals">
                        <AIMealDealSuggestions restaurantId={restaurant.id} />
                        <MealDealsManagement restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="coupons">
                        <CouponsManagement restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="history">
                        <PastOrders restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="messages">
                        <RestaurantMessages restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="reviews">
                        <ReviewsManagement restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="analytics">
                        <AdvancedAnalytics restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="drivers">
                        <DriverTracking restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="crm">
                        <CustomerCRM restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="refunds">
                        <RefundManagement restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="promotions">
                        <PromotionManagement restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="batching">
                        <OrderBatching restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="modifications">
                        <OrderModification restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="zones">
                        <DeliveryZoneManagement 
                            restaurantId={restaurant.id}
                            restaurantLocation={restaurant.latitude && restaurant.longitude ? {
                                lat: restaurant.latitude,
                                lng: restaurant.longitude
                            } : null}
                        />
                    </TabsContent>
                    </Tabs>
                    </div>
                    </div>
                    );
                    }