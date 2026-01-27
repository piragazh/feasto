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
    MapPin,
    Award,
    Monitor
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
import ReviewManagement from '@/components/restaurant/ReviewManagement';
import RestaurantOnboarding from '@/components/restaurant/RestaurantOnboarding';
import RestaurantAnalytics from '@/components/restaurant/RestaurantAnalytics';
import AdvancedAnalytics from '@/components/restaurant/AdvancedAnalytics';
import EnhancedAnalyticsDashboard from '@/components/restaurant/EnhancedAnalyticsDashboard';
import OrderAnalyticsDashboard from '@/components/restaurant/OrderAnalyticsDashboard';
import DriverTracking from '@/components/restaurant/DriverTracking';
import DriverManagement from '@/components/restaurant/DriverManagement';
import DriverPerformance from '@/components/restaurant/DriverPerformance';
import CustomerCRM from '@/components/restaurant/CustomerCRM';
import RefundManagement from '@/components/restaurant/RefundManagement';
import PromotionManagement from '@/components/restaurant/PromotionManagement';
import OrderBatching from '@/components/restaurant/OrderBatching';
import OrderModification from '@/components/restaurant/OrderModification';
import DeliveryZoneManagement from '@/components/restaurant/DeliveryZoneManagement';
import RestaurantSettings from '@/components/restaurant/RestaurantSettings';
import AIMarketingAssistant from '@/components/restaurant/AIMarketingAssistant';
import NotificationSoundManager from '@/components/notifications/NotificationSoundManager';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

export default function RestaurantDashboard() {
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [activeTab, setActiveTab] = useState('orders');
    const [activeSection, setActiveSection] = useState('main');
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
            <NotificationSoundManager restaurantId={restaurant?.id} />
            
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

            {/* Navigation Sections */}
            <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-4">
                <div className="bg-white rounded-lg shadow-sm p-2 mb-4">
                    <div className="flex gap-2 overflow-x-auto">
                        <Button
                            variant={activeSection === 'main' ? 'default' : 'ghost'}
                            onClick={() => setActiveSection('main')}
                            className="whitespace-nowrap"
                        >
                            <ShoppingBag className="h-4 w-4 mr-2" />
                            Main
                        </Button>
                        <Button
                            variant={activeSection === 'menu' ? 'default' : 'ghost'}
                            onClick={() => setActiveSection('menu')}
                            className="whitespace-nowrap"
                        >
                            <UtensilsCrossed className="h-4 w-4 mr-2" />
                            Menu & Deals
                        </Button>
                        <Button
                            variant={activeSection === 'marketing' ? 'default' : 'ghost'}
                            onClick={() => setActiveSection('marketing')}
                            className="whitespace-nowrap"
                        >
                            <Tag className="h-4 w-4 mr-2" />
                            Marketing
                        </Button>
                        <Button
                            variant={activeSection === 'analytics' ? 'default' : 'ghost'}
                            onClick={() => setActiveSection('analytics')}
                            className="whitespace-nowrap"
                        >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Analytics
                        </Button>
                        <Button
                            variant={activeSection === 'operations' ? 'default' : 'ghost'}
                            onClick={() => setActiveSection('operations')}
                            className="whitespace-nowrap"
                        >
                            <Users className="h-4 w-4 mr-2" />
                            Operations
                        </Button>
                        <Button
                            variant={activeSection === 'settings' ? 'default' : 'ghost'}
                            onClick={() => setActiveSection('settings')}
                            className="whitespace-nowrap"
                        >
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto p-3 sm:p-4">
                {/* MAIN SECTION */}
                {activeSection === 'main' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => setActiveTab('orders')}>
                                <CardContent className="p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center relative">
                                            <ShoppingBag className="h-6 w-6 text-white" />
                                            {pendingOrders.length > 0 && (
                                                <span className="absolute -top-1 -right-1 h-6 w-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                                                    {pendingOrders.length}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Live Orders</h3>
                                            <p className="text-sm text-gray-500">Manage incoming orders</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => setActiveTab('messages')}>
                                <CardContent className="p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center relative">
                                            <MessageSquare className="h-6 w-6 text-white" />
                                            {unreadMessagesCount > 0 && (
                                                <span className="absolute -top-1 -right-1 h-6 w-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                                                    {unreadMessagesCount}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Messages</h3>
                                            <p className="text-sm text-gray-500">Customer & admin chats</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => setActiveTab('history')}>
                                <CardContent className="p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center">
                                            <History className="h-6 w-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Order History</h3>
                                            <p className="text-sm text-gray-500">View past orders</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab}>

                            <TabsContent value="orders">
                                <OrderQueue restaurantId={restaurant.id} onOrderUpdate={() => {}} />
                            </TabsContent>
                            <TabsContent value="messages">
                                <RestaurantMessages restaurantId={restaurant.id} />
                            </TabsContent>
                            <TabsContent value="history">
                                <PastOrders restaurantId={restaurant.id} />
                            </TabsContent>
                        </Tabs>
                    </div>
                )}

                {/* MENU & DEALS SECTION */}
                {activeSection === 'menu' && (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4">
                            <TabsTrigger value="menu">Menu Items</TabsTrigger>
                            <TabsTrigger value="deals">Meal Deals</TabsTrigger>
                            <TabsTrigger value="reviews">Reviews</TabsTrigger>
                        </TabsList>
                        <TabsContent value="menu">
                            <MenuManagement restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="deals">
                            <AIMealDealSuggestions restaurantId={restaurant.id} />
                            <MealDealsManagement restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="reviews">
                            <ReviewManagement restaurantId={restaurant.id} />
                        </TabsContent>
                    </Tabs>
                )}

                {/* MARKETING SECTION */}
                {activeSection === 'marketing' && (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4">
                            <TabsTrigger value="coupons">Coupons</TabsTrigger>
                            <TabsTrigger value="promotions">Promotions</TabsTrigger>
                            <TabsTrigger value="ai-marketing">AI Assistant</TabsTrigger>
                            {restaurant?.media_screen_enabled && (
                                <TabsTrigger value="media">Media Screens</TabsTrigger>
                            )}
                        </TabsList>
                        <TabsContent value="coupons">
                            <CouponsManagement restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="promotions">
                            <PromotionManagement restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="ai-marketing">
                            <AIMarketingAssistant restaurantId={restaurant.id} />
                        </TabsContent>
                        {restaurant?.media_screen_enabled && (
                            <TabsContent value="media">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Monitor className="h-5 w-5" />
                                            Media Screen Management
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-gray-600 mb-4">
                                            Manage promotional content, screens, and layouts for in-store displays.
                                        </p>
                                        <Button 
                                            onClick={() => window.location.href = createPageUrl('MediaScreenManagement') + `?restaurantId=${restaurant.id}`}
                                            className="w-full sm:w-auto"
                                        >
                                            <Monitor className="h-4 w-4 mr-2" />
                                            Open Media Screen Manager
                                        </Button>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}
                    </Tabs>
                )}

                {/* ANALYTICS SECTION */}
                {activeSection === 'analytics' && (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4">
                            <TabsTrigger value="analytics">Overview</TabsTrigger>
                            <TabsTrigger value="order-analytics">Order Insights</TabsTrigger>
                            <TabsTrigger value="driver-performance">Driver Performance</TabsTrigger>
                        </TabsList>
                        <TabsContent value="analytics">
                            <EnhancedAnalyticsDashboard restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="order-analytics">
                            <OrderAnalyticsDashboard restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="driver-performance">
                            <DriverPerformance restaurantId={restaurant.id} />
                        </TabsContent>
                    </Tabs>
                )}

                {/* OPERATIONS SECTION */}
                {activeSection === 'operations' && (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4 flex-wrap">
                            <TabsTrigger value="drivers">Driver Tracking</TabsTrigger>
                            <TabsTrigger value="driver-management">Manage Drivers</TabsTrigger>
                            <TabsTrigger value="crm">CRM</TabsTrigger>
                            <TabsTrigger value="refunds" className="relative">
                                Refunds
                                {refundRequests.length > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                                        {refundRequests.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="batching">Order Batching</TabsTrigger>
                            <TabsTrigger value="modifications">Modifications</TabsTrigger>
                        </TabsList>
                        <TabsContent value="drivers">
                            <DriverTracking restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="driver-management">
                            <DriverManagement restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="crm">
                            <CustomerCRM restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="refunds">
                            <RefundManagement restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="batching">
                            <OrderBatching restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="modifications">
                            <OrderModification restaurantId={restaurant.id} />
                        </TabsContent>
                    </Tabs>
                )}

                {/* SETTINGS SECTION */}
                {activeSection === 'settings' && (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4">
                            <TabsTrigger value="settings">Restaurant Settings</TabsTrigger>
                            <TabsTrigger value="zones">Delivery Zones</TabsTrigger>
                        </TabsList>
                        <TabsContent value="settings">
                            <RestaurantSettings restaurantId={restaurant.id} />
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
                )}
            </div>
        </div>
    );
}