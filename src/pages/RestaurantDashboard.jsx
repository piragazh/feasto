import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
    BarChart3,
    Users,
    Tag,
    Award,
    Monitor,
    TabletSmartphone
} from 'lucide-react';
import LiveOrders from '@/components/restaurant/LiveOrders';

import MenuManagement from '@/components/restaurant/MenuManagement';
import MealDealsManagement from '@/components/restaurant/MealDealsManagement';
import AIMealDealSuggestions from '@/components/restaurant/AIMealDealSuggestions';
import CouponsManagement from '@/components/restaurant/CouponsManagement';
import PastOrders from '@/components/restaurant/PastOrders';
import RestaurantMessages from '@/components/restaurant/RestaurantMessages';

import ReviewManagement from '@/components/restaurant/ReviewManagement';
import RestaurantOnboarding from '@/components/restaurant/RestaurantOnboarding';

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
import BrandingManager from '@/components/restaurant/BrandingManager';
import ThirdPartyIntegrations from '@/components/restaurant/ThirdPartyIntegrations';
import POSConfigurations from '@/components/restaurant/POSConfigurations';
import StaffManagement from '@/components/restaurant/StaffManagement';
import KioskSettings from '@/components/kiosk/KioskSettings';
import KitchenDisplaySystem from '@/components/kds/KitchenDisplaySystem';
import SmsNotificationSettings from '@/components/restaurant/SmsNotificationSettings';
import RestaurantPayoutHistory from '@/components/restaurant/RestaurantPayoutHistory';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

export default function RestaurantDashboard() {
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [activeTab, setActiveTab] = useState('orders');
    const [activeSection, setActiveSection] = useState('main');
    const [newOrdersCount, setNewOrdersCount] = useState(0);

    const [showOnboarding, setShowOnboarding] = useState(false);

    const { data: pendingOrders = [] } = useQuery({
        queryKey: ['pending-orders', restaurant?.id],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurant.id, 
            status: 'pending' 
        }),
        enabled: !!restaurant?.id,
        refetchInterval: 30000,
    });

    const { data: refundRequests = [] } = useQuery({
        queryKey: ['refund-requests-count', restaurant?.id],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurant.id, 
            status: 'refund_requested' 
        }),
        enabled: !!restaurant?.id,
        refetchInterval: 60000,
    });

    const { data: orderMessages = [] } = useQuery({
        queryKey: ['order-messages', restaurant?.id],
        queryFn: () => base44.entities.Message.filter({ restaurant_id: restaurant.id }),
        enabled: !!restaurant?.id,
        refetchInterval: 45000,
    });

    const { data: restaurantMessages = [] } = useQuery({
        queryKey: ['restaurant-messages', restaurant?.id],
        queryFn: () => base44.entities.RestaurantMessage.filter({ restaurant_id: restaurant.id }),
        enabled: !!restaurant?.id,
        refetchInterval: 45000,
    });

    const unreadMessagesCount = [...orderMessages, ...restaurantMessages].filter(msg => !msg.is_read).length;

    useEffect(() => {
        loadUserAndRestaurant();
        requestNotificationPermission();
    }, []);

    // Track dashboard activity every 5 minutes
    useEffect(() => {
        if (!restaurant?.id) return;

        const trackActivity = async () => {
            try {
                await base44.functions.invoke('trackDashboardActivity', {
                    restaurant_id: restaurant.id
                });
            } catch (error) {
                console.error('Failed to track activity:', error);
            }
        };

        // Track immediately on mount
        trackActivity();

        // Then track every 5 minutes
        const interval = setInterval(trackActivity, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [restaurant?.id]);

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
                        // CRITICAL: Verify permission even for admin
                        try {
                            await base44.functions.invoke('enforceRestaurantPermissions', {
                                restaurantId: restaurantIdParam
                            });
                            setRestaurant(restaurantData);
                            return;
                        } catch (permError) {
                            toast.error('Access denied to this restaurant');
                            return;
                        }
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
                    // Load first assigned restaurant with permission check
                    const restaurantId = restaurantIdParam || manager.restaurant_ids[0];
                    
                    // CRITICAL: Verify permission
                    try {
                        await base44.functions.invoke('enforceRestaurantPermissions', {
                            restaurantId
                        });
                        
                        const allRestaurants = await base44.entities.Restaurant.list();
                        const restaurantData = allRestaurants.find(r => r.id === restaurantId);
                        if (restaurantData) {
                            setRestaurant(restaurantData);
                        } else {
                            toast.error('Restaurant not found');
                        }
                    } catch (permError) {
                        toast.error('Access denied to this restaurant');
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
        // Only trigger notifications if count increased AND not initial load
        if (newOrdersCount > 0 && pendingOrders.length > newOrdersCount) {
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
                            {restaurant?.pos_enabled && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(createPageUrl('KioskDashboard') + `?restaurant_id=${restaurant.id}`, '_blank')}
                                    className="hidden sm:flex items-center gap-2"
                                    title="Open Self-Order Kiosk"
                                >
                                    <TabletSmartphone className="h-4 w-4" />
                                    Kiosk
                                </Button>
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
                <div className="bg-white rounded-lg shadow-sm p-2 mb-4 overflow-x-auto scrollbar-hide">
                    <div className="flex gap-1 sm:gap-2 flex-nowrap">
                        {[
                            { id: 'main', label: 'Main', icon: ShoppingBag },
                            { id: 'menu', label: 'Menu & Deals', icon: UtensilsCrossed },
                            { id: 'marketing', label: 'Marketing', icon: Tag },
                            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                            { id: 'payouts', label: 'Payouts', icon: Award },
                            { id: 'operations', label: 'Operations', icon: Users },
                            { id: 'settings', label: 'Settings', icon: Settings }
                        ].map(({ id, label, icon: Icon }) => (
                            <Button
                                key={id}
                                variant={activeSection === id ? 'default' : 'ghost'}
                                onClick={() => setActiveSection(id)}
                                className="whitespace-nowrap text-xs sm:text-sm"
                                size="sm"
                            >
                                <Icon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                                <span className="hidden sm:inline">{label}</span>
                                <span className="sm:hidden">{label.split(' ')[0]}</span>
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto p-3 sm:p-4">
                {/* MAIN SECTION */}
                {activeSection === 'main' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            <Card className="cursor-pointer active:shadow-md sm:hover:shadow-lg transition-all touch-manipulation" onClick={() => setActiveTab('orders')}>
                                <CardContent className="p-4 sm:p-6">
                                    <div className="flex items-center gap-3 sm:gap-4">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-500 rounded-lg sm:rounded-xl flex items-center justify-center relative flex-shrink-0">
                                            <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                                            {pendingOrders.length > 0 && (
                                                <span className="absolute -top-1 -right-1 h-5 w-5 sm:h-6 sm:w-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs">
                                                    {pendingOrders.length}
                                                </span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold text-base sm:text-lg truncate">Live Orders</h3>
                                            <p className="text-xs sm:text-sm text-gray-500 truncate">Manage orders</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="cursor-pointer active:shadow-md sm:hover:shadow-lg transition-all touch-manipulation" onClick={() => setActiveTab('messages')}>
                                <CardContent className="p-4 sm:p-6">
                                    <div className="flex items-center gap-3 sm:gap-4">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500 rounded-lg sm:rounded-xl flex items-center justify-center relative flex-shrink-0">
                                            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                                            {unreadMessagesCount > 0 && (
                                                <span className="absolute -top-1 -right-1 h-5 w-5 sm:h-6 sm:w-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs">
                                                    {unreadMessagesCount}
                                                </span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold text-base sm:text-lg truncate">Messages</h3>
                                            <p className="text-xs sm:text-sm text-gray-500 truncate">Chats & alerts</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="cursor-pointer active:shadow-md sm:hover:shadow-lg transition-all touch-manipulation" onClick={() => setActiveTab('history')}>
                                <CardContent className="p-4 sm:p-6">
                                    <div className="flex items-center gap-3 sm:gap-4">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                                            <History className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold text-base sm:text-lg truncate">Order History</h3>
                                            <p className="text-xs sm:text-sm text-gray-500 truncate">View past</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab}>

                            <TabsContent value="orders">
                                <LiveOrders restaurantId={restaurant.id} onOrderUpdate={() => {}} />
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
                        <TabsList className="mb-4 overflow-x-auto flex-wrap h-auto">
                            <TabsTrigger value="menu" className="text-xs sm:text-sm">Menu Items</TabsTrigger>
                            <TabsTrigger value="deals" className="text-xs sm:text-sm">Meal Deals</TabsTrigger>
                            <TabsTrigger value="reviews" className="text-xs sm:text-sm">Reviews</TabsTrigger>
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
                            <CouponsManagement restaurantId={restaurant.id} restaurantName={restaurant.name} />
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

                {/* PAYOUTS SECTION */}
                {activeSection === 'payouts' && (
                    <RestaurantPayoutHistory restaurantId={restaurant.id} />
                )}

                {/* OPERATIONS SECTION */}
                {activeSection === 'operations' && (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4 flex-wrap">
                            <TabsTrigger value="kds">Kitchen Display</TabsTrigger>
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
                        <TabsContent value="kds">
                            <KitchenDisplaySystem restaurant={restaurant} />
                        </TabsContent>
                        <TabsContent value="drivers">
                            <DriverTracking restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="driver-management">
                            <DriverManagement restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="crm">
                            <CustomerCRM restaurantId={restaurant.id} restaurantName={restaurant.name} />
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
                        <TabsList className="mb-4 flex-wrap">
                            <TabsTrigger value="settings">Restaurant Settings</TabsTrigger>
                            <TabsTrigger value="branding">Branding</TabsTrigger>
                            <TabsTrigger value="zones">Delivery Zones</TabsTrigger>
                            <TabsTrigger value="integrations">Third-Party Orders</TabsTrigger>
                            <TabsTrigger value="pos">POS Configurations</TabsTrigger>
                            <TabsTrigger value="kiosk">Kiosk</TabsTrigger>
                            <TabsTrigger value="sms">SMS Notifications</TabsTrigger>
                            <TabsTrigger value="staff">Staff</TabsTrigger>
                        </TabsList>
                        <TabsContent value="settings">
                            <RestaurantSettings restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="branding">
                            <BrandingManager restaurantId={restaurant.id} />
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
                        <TabsContent value="integrations">
                            <ThirdPartyIntegrations restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="pos">
                            <POSConfigurations restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="kiosk">
                            <KioskSettings restaurantId={restaurant.id} />
                        </TabsContent>
                        <TabsContent value="sms">
                            <SmsNotificationSettings restaurantId={restaurant.id} currentSettings={restaurant.sms_notification_settings} />
                        </TabsContent>
                        <TabsContent value="staff">
                            <StaffManagement restaurantId={restaurant.id} />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    );
}