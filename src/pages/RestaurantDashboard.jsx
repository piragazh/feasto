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
import EnhancedAnalyticsDashboard from '@/components/restaurant/EnhancedAnalyticsDashboard';
import DriverTracking from '@/components/restaurant/DriverTracking';
import DriverManagement from '@/components/restaurant/DriverManagement';
import DriverPerformance from '@/components/restaurant/DriverPerformance';
import LoyaltyProgramManagement from '@/components/restaurant/LoyaltyProgramManagement';
import LoyaltyCustomerInsights from '@/components/restaurant/LoyaltyCustomerInsights';
import CustomerCRM from '@/components/restaurant/CustomerCRM';
import RefundManagement from '@/components/restaurant/RefundManagement';
import PromotionManagement from '@/components/restaurant/PromotionManagement';
import OrderBatching from '@/components/restaurant/OrderBatching';
import OrderModification from '@/components/restaurant/OrderModification';
import DeliveryZoneManagement from '@/components/restaurant/DeliveryZoneManagement';
import RestaurantSettings from '@/components/restaurant/RestaurantSettings';
import AIMarketingAssistant from '@/components/restaurant/AIMarketingAssistant';
import { toast } from 'sonner';

export default function RestaurantDashboard() {
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [activeTab, setActiveTab] = useState('orders');
    const [newOrdersCount, setNewOrdersCount] = useState(0);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [showOnboarding, setShowOnboarding] = useState(false);

    const { data: pendingOrders = [] } = useQuery({
        queryKey: ['pending-orders', restaurant?.id],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurant.id, 
            status: 'pending' 
        }),
        enabled: !!restaurant?.id,
        refetchInterval: 10000,
    });

    const { data: refundRequests = [] } = useQuery({
        queryKey: ['refund-requests-count', restaurant?.id],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurant.id, 
            status: 'refund_requested' 
        }),
        enabled: !!restaurant?.id,
        refetchInterval: 30000,
    });

    const { data: orderMessages = [] } = useQuery({
        queryKey: ['order-messages', restaurant?.id],
        queryFn: () => base44.entities.Message.filter({ restaurant_id: restaurant.id }),
        enabled: !!restaurant?.id,
        refetchInterval: 20000,
    });

    const { data: restaurantMessages = [] } = useQuery({
        queryKey: ['restaurant-messages', restaurant?.id],
        queryFn: () => base44.entities.RestaurantMessage.filter({ restaurant_id: restaurant.id }),
        enabled: !!restaurant?.id,
        refetchInterval: 20000,
    });

    const unreadMessagesCount = [...orderMessages, ...restaurantMessages].filter(msg => !msg.is_read).length;

    useEffect(() => {
        loadUserAndRestaurant();
        requestNotificationPermission();
    }, []);

    const loadUserAndRestaurant = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
            
            // Check for restaurantId in URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            const restaurantIdParam = urlParams.get('restaurantId');
            
            // For admin users, load restaurant from URL param or first restaurant
            if (userData.role === 'admin') {
                const allRestaurants = await base44.entities.Restaurant.list();
                
                if (restaurantIdParam) {
                    const restaurantData = allRestaurants.find(r => r.id === restaurantIdParam);
                    if (restaurantData) {
                        setRestaurant(restaurantData);
                        return;
                    }
                }
                
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
            toast.error('Error loading restaurant dashboard');
            base44.auth.redirectToLogin();
        }
    };

    const requestNotificationPermission = async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    };

    useEffect(() => {
        if (pendingOrders.length > newOrdersCount && newOrdersCount > 0) {
            playNotificationSound();
            showNotification('New Order!', `You have ${pendingOrders.length} pending orders`);
        }
        setNewOrdersCount(pendingOrders.length);
    }, [pendingOrders.length]);

    const playNotificationSound = () => {
        // Play notification MP3 file (place your notification.mp3 in the public folder)
        const audio = new Audio('/notification.mp3');
        audio.volume = 0.8; // Adjust volume (0.0 to 1.0)
        audio.play().catch((err) => {
            console.log('Notification sound failed to play:', err);
        });
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
                <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
                                <UtensilsCrossed className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base sm:text-2xl font-bold text-gray-900 truncate">{restaurant.name}</h1>
                                <p className="text-xs sm:text-sm text-gray-500 truncate">{user.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            {pendingOrders.length > 0 && (
                                <Badge className="bg-red-500 text-white px-2 sm:px-3 py-1 text-xs">
                                    <Bell className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                    <span className="hidden sm:inline">{pendingOrders.length} New</span>
                                    <span className="sm:hidden">{pendingOrders.length}</span>
                                </Badge>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => base44.auth.logout()}
                                className="shrink-0"
                            >
                                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto p-3 sm:p-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="flex flex-col gap-2 mb-4 sm:mb-6">
                        <TabsList className="bg-white p-1 shadow-sm overflow-x-auto flex-nowrap">
                            <TabsTrigger value="orders" className="relative whitespace-nowrap text-xs sm:text-sm">
                                <ShoppingBag className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Live Orders</span>
                                <span className="sm:hidden">Orders</span>
                                {pendingOrders.length > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                                        {pendingOrders.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="menu" className="whitespace-nowrap text-xs sm:text-sm">
                                <UtensilsCrossed className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Menu Items</span>
                                <span className="sm:hidden">Menu</span>
                            </TabsTrigger>
                            <TabsTrigger value="deals" className="whitespace-nowrap text-xs sm:text-sm">
                                <span className="hidden sm:inline">Meal Deals</span>
                                <span className="sm:hidden">Deals</span>
                            </TabsTrigger>
                            <TabsTrigger value="coupons" className="whitespace-nowrap text-xs sm:text-sm">
                                Coupons
                            </TabsTrigger>
                            <TabsTrigger value="history" className="whitespace-nowrap text-xs sm:text-sm">
                                <History className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Past Orders</span>
                                <span className="sm:hidden">History</span>
                            </TabsTrigger>
                            <TabsTrigger value="messages" className="relative whitespace-nowrap text-xs sm:text-sm">
                                <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Messages</span>
                                <span className="sm:hidden">Chat</span>
                                {unreadMessagesCount > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                                        {unreadMessagesCount}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="reviews" className="whitespace-nowrap text-xs sm:text-sm">
                                <Star className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Reviews</span>
                                <span className="sm:hidden">⭐</span>
                            </TabsTrigger>
                            <TabsTrigger value="analytics" className="whitespace-nowrap text-xs sm:text-sm">
                                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Analytics</span>
                                <span className="sm:hidden">📊</span>
                            </TabsTrigger>
                        </TabsList>
                        
                        <TabsList className="bg-white p-1 shadow-sm overflow-x-auto flex-nowrap">
                            <TabsTrigger value="drivers" className="whitespace-nowrap text-xs sm:text-sm">
                                <Navigation className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Driver Tracking</span>
                                <span className="sm:hidden">Track</span>
                            </TabsTrigger>
                            <TabsTrigger value="driver-management" className="whitespace-nowrap text-xs sm:text-sm">
                                <Users className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Manage Drivers</span>
                                <span className="sm:hidden">Drivers</span>
                            </TabsTrigger>
                            <TabsTrigger value="driver-performance" className="whitespace-nowrap text-xs sm:text-sm">
                                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Performance</span>
                                <span className="sm:hidden">📈</span>
                            </TabsTrigger>
                            <TabsTrigger value="loyalty-program" className="whitespace-nowrap text-xs sm:text-sm">
                                <Award className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Loyalty Program</span>
                                <span className="sm:hidden">🏆</span>
                            </TabsTrigger>
                            <TabsTrigger value="loyalty-insights" className="whitespace-nowrap text-xs sm:text-sm">
                                <Users className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Loyalty Insights</span>
                                <span className="sm:hidden">📊</span>
                            </TabsTrigger>
                            <TabsTrigger value="crm" className="whitespace-nowrap text-xs sm:text-sm">
                                <Users className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                CRM
                            </TabsTrigger>
                            <TabsTrigger value="refunds" className="relative whitespace-nowrap text-xs sm:text-sm">
                                <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Refunds</span>
                                <span className="sm:hidden">💰</span>
                                {refundRequests.length > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                                        {refundRequests.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="promotions" className="whitespace-nowrap text-xs sm:text-sm">
                                <Tag className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Promotions</span>
                                <span className="sm:hidden">🏷️</span>
                            </TabsTrigger>
                            <TabsTrigger value="ai-marketing" className="whitespace-nowrap text-xs sm:text-sm">
                                <span className="hidden sm:inline">AI Marketing</span>
                                <span className="sm:hidden">✨</span>
                            </TabsTrigger>
                            <TabsTrigger value="batching" className="whitespace-nowrap text-xs sm:text-sm">
                                <ShoppingBag className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Order Batching</span>
                                <span className="sm:hidden">Batch</span>
                            </TabsTrigger>
                            <TabsTrigger value="modifications" className="whitespace-nowrap text-xs sm:text-sm">
                                <Settings className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Modifications</span>
                                <span className="sm:hidden">Mods</span>
                            </TabsTrigger>
                            <TabsTrigger value="zones" className="whitespace-nowrap text-xs sm:text-sm">
                                <MapPin className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                Zones
                            </TabsTrigger>
                            <TabsTrigger value="settings" className="whitespace-nowrap text-xs sm:text-sm">
                                <Settings className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Settings</span>
                                <span className="sm:hidden">⚙️</span>
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
                        <EnhancedAnalyticsDashboard restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="drivers">
                        <DriverTracking restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="driver-management">
                        <DriverManagement restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="driver-performance">
                        <DriverPerformance restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="loyalty-program">
                        <LoyaltyProgramManagement restaurantId={restaurant.id} />
                    </TabsContent>

                    <TabsContent value="loyalty-insights">
                        <LoyaltyCustomerInsights restaurantId={restaurant.id} />
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

                    <TabsContent value="ai-marketing">
                        <AIMarketingAssistant restaurantId={restaurant.id} />
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

                    <TabsContent value="settings">
                        <RestaurantSettings restaurantId={restaurant.id} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}