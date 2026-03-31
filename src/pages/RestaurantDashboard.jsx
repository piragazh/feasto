import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
    UtensilsCrossed, ShoppingBag, History, Settings, LogOut,
    Bell, MessageSquare, BarChart3, Users, Tag, Award,
    Monitor, TabletSmartphone, ChevronDown, ChevronRight,
    Menu, TrendingUp, Truck, UserCheck, RotateCcw,
    GitBranch, PenLine, MapPin, Link2, Cpu, Smartphone,
    MessageCircle, UsersRound, Palette, Star, Sparkles,
    ChefHat, X, PanelLeftClose, PanelLeft, Package, PoundSterling, Printer, WifiOff
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
import OfflineOrdersReview from '@/components/restaurant/OfflineOrdersReview';
import DeliveryZoneManagement from '@/components/restaurant/DeliveryZoneManagement';
import RestaurantSettings from '@/components/restaurant/RestaurantSettings';
import AIMarketingAssistant from '@/components/restaurant/AIMarketingAssistant';
import NotificationSoundManager from '@/components/notifications/NotificationSoundManager';
import BrandingManager from '@/components/restaurant/BrandingManager';
import ThirdPartyIntegrations from '@/components/restaurant/ThirdPartyIntegrations';
import POSConfigurations from '@/components/restaurant/POSConfigurations';
import StaffManagement from '@/components/restaurant/StaffManagement';
import KioskSettings from '@/components/kiosk/KioskSettings';
import CentralizedPrinterSettings from '@/components/restaurant/CentralizedPrinterSettings';
import KitchenDisplaySystem from '@/components/kds/KitchenDisplaySystem';
import SmsNotificationSettings from '@/components/restaurant/SmsNotificationSettings';
import RestaurantPayoutHistory from '@/components/restaurant/RestaurantPayoutHistory';
import SidebarNav from '@/components/restaurant/RestaurantDashboardSidebar';
import RequireAuth from '@/components/auth/RequireAuth';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

// ── Nav definition ──────────────────────────────────────────────────────────
const buildNavSections = (restaurant, pendingOrders, unreadMessagesCount, refundRequests, unresolvedOfflineReviewCount) => [
    {
        id: 'main', label: 'Orders', icon: ShoppingBag,
        items: [
            { id: 'orders', label: 'Live Orders', icon: ShoppingBag, badge: pendingOrders.length },
            { id: 'messages', label: 'Messages', icon: MessageSquare, badge: unreadMessagesCount },
            { id: 'history', label: 'Order History', icon: History },
        ]
    },
    {
        id: 'menu', label: 'Menu & Deals', icon: UtensilsCrossed,
        items: [
            { id: 'menu', label: 'Menu Items', icon: UtensilsCrossed },
            { id: 'deals', label: 'Meal Deals', icon: Package },
            { id: 'reviews', label: 'Reviews', icon: Star },
        ]
    },
    {
        id: 'marketing', label: 'Marketing', icon: Tag,
        items: [
            { id: 'coupons', label: 'Coupons', icon: Tag },
            { id: 'promotions', label: 'Promotions', icon: Sparkles },
            { id: 'ai-marketing', label: 'AI Assistant', icon: Sparkles },
            ...(restaurant?.media_screen_enabled ? [{ id: 'media', label: 'Media Screens', icon: Monitor }] : []),
        ]
    },
    {
        id: 'analytics', label: 'Analytics', icon: BarChart3,
        items: [
            { id: 'analytics', label: 'Overview', icon: BarChart3 },
            { id: 'order-analytics', label: 'Order Insights', icon: TrendingUp },
            { id: 'driver-performance', label: 'Driver Performance', icon: UserCheck },
        ]
    },
    {
        id: 'payouts', label: 'Payouts', icon: PoundSterling,
        items: [
            { id: 'payouts', label: 'Payout History', icon: PoundSterling },
        ]
    },
    {
        id: 'operations', label: 'Operations', icon: ChefHat,
        items: [
            { id: 'kds', label: 'Kitchen Display', icon: ChefHat },
            { id: 'drivers', label: 'Driver Tracking', icon: Truck },
            { id: 'driver-management', label: 'Manage Drivers', icon: Users },
            { id: 'crm', label: 'CRM', icon: UsersRound },
            { id: 'refunds', label: 'Refunds', icon: RotateCcw, badge: refundRequests.length },
            { id: 'offline-orders', label: 'Offline Orders', icon: WifiOff, badge: unresolvedOfflineReviewCount },
            { id: 'batching', label: 'Order Batching', icon: GitBranch },
            { id: 'modifications', label: 'Modifications', icon: PenLine },
        ]
    },
    {
        id: 'settings', label: 'Settings', icon: Settings,
        items: [
            { id: 'settings', label: 'Restaurant Settings', icon: Settings },
            { id: 'branding', label: 'Branding', icon: Palette },
            { id: 'zones', label: 'Delivery Zones', icon: MapPin },
            { id: 'integrations', label: 'Third-Party Orders', icon: Link2 },
            { id: 'printers', label: 'Printer Config', icon: Printer },
            { id: 'pos', label: 'POS Config', icon: Cpu },
            { id: 'kiosk', label: 'Kiosk', icon: Smartphone },
            { id: 'sms', label: 'SMS Notifications', icon: MessageCircle },
            { id: 'staff', label: 'Staff', icon: UserCheck },
        ]
    },
];

// ── Main component ──────────────────────────────────────────────────────────
function RestaurantDashboardInner() {
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [activeTab, setActiveTab] = useState('orders');
    const [activeSection, setActiveSection] = useState('main');
    const [newOrdersCount, setNewOrdersCount] = useState(0);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const { data: pendingOrders = [] } = useQuery({
        queryKey: ['pending-orders', restaurant?.id],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurant.id, status: 'pending' }),
        enabled: !!restaurant?.id,
        refetchInterval: 30000,
    });

    const { data: refundRequests = [] } = useQuery({
        queryKey: ['refund-requests-count', restaurant?.id],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurant.id, status: 'refund_requested' }),
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

    const { data: offlineOrdersForBadge = [] } = useQuery({
        queryKey: ['offline-orders-badge', restaurant?.id],
        queryFn: async () => {
            const flagged = await base44.entities.Order.filter({
                restaurant_id: restaurant.id,
                offline_created: true,
                needs_review: true,
            });
            return flagged.filter(o => !o.offline_review_status || o.offline_review_status === 'new');
        },
        enabled: !!restaurant?.id,
        refetchInterval: 30000,
    });

    const unreadMessagesCount = [...orderMessages, ...restaurantMessages].filter(m => !m.is_read).length;
    const unresolvedOfflineReviewCount = offlineOrdersForBadge.length;

    useEffect(() => { 
        const init = async () => {
            await loadUserAndRestaurant();
            requestNotificationPermission();
        };
        init();
    }, []);

    useEffect(() => {
        if (!restaurant?.id) return;
        const track = async () => {
            try { await base44.functions.invoke('trackDashboardActivity', { restaurant_id: restaurant.id }); } catch {}
        };
        track();
        const interval = setInterval(track, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [restaurant?.id]);

    const loadUserAndRestaurant = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
            const urlParams = new URLSearchParams(window.location.search);
            const restaurantIdParam = urlParams.get('restaurantId');

            if (userData.role === 'admin') {
                const allRestaurants = await base44.entities.Restaurant.list();
                if (restaurantIdParam) {
                    const r = allRestaurants.find(res => res.id === restaurantIdParam);
                    if (r) {
                        try {
                            await base44.functions.invoke('enforceRestaurantPermissions', { restaurantId: restaurantIdParam });
                            setRestaurant(r);
                            return;
                        } catch (e) {
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

            const managerRecords = await base44.entities.RestaurantManager.filter({ user_email: userData.email, is_active: true });
            if (managerRecords.length > 0) {
                const manager = managerRecords[0];
                if (manager.restaurant_ids?.length > 0) {
                    const restaurantId = restaurantIdParam || manager.restaurant_ids[0];
                    try {
                        await base44.functions.invoke('enforceRestaurantPermissions', { restaurantId });
                        const allRestaurants = await base44.entities.Restaurant.list();
                        const r = allRestaurants.find(res => res.id === restaurantId);
                        if (r) {
                            setRestaurant(r);
                        } else {
                            toast.error('Restaurant not found');
                        }
                    } catch (e) {
                        toast.error('Access denied to this restaurant');
                    }
                } else {
                    toast.error('No restaurant assigned to your account');
                }
            } else {
                toast.error('No restaurant assigned. Please contact admin.');
            }
        } catch (e) {
            toast.error('Error loading restaurant dashboard');
            base44.auth.redirectToLogin();
        }
    };

    const requestNotificationPermission = async () => {
        if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    };

    useEffect(() => {
        if (newOrdersCount > 0 && pendingOrders.length > newOrdersCount) {
            const audio = new Audio('/notification.mp3');
            audio.volume = 0.8;
            audio.play().catch(() => {});
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('New Order!', { body: `You have ${pendingOrders.length} pending orders`, icon: '/icon.png' });
            }
        }
        setNewOrdersCount(pendingOrders.length);
    }, [pendingOrders.length]);

    const navigate = (section, tab) => {
        setActiveSection(section);
        setActiveTab(tab);
        setMobileMenuOpen(false);
    };

    const navSections = buildNavSections(restaurant, pendingOrders, unreadMessagesCount, refundRequests, unresolvedOfflineReviewCount);

    if (!user || !restaurant) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white/60 text-sm">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    const totalAlerts = pendingOrders.length + unreadMessagesCount + refundRequests.length + unresolvedOfflineReviewCount;

    // ── Sidebar inner (shared between desktop and mobile sheet) ──────────────
    const SidebarContent = ({ onClose }) => (
        <div className={`flex flex-col h-full bg-gradient-to-b from-slate-900 to-slate-800 ${onClose ? 'w-72' : sidebarCollapsed ? 'w-16' : 'w-60'} transition-all duration-200`}>
            {/* Logo / restaurant info */}
            <div className={`flex items-center gap-3 px-4 py-4 border-b border-white/10 ${sidebarCollapsed && !onClose ? 'justify-center' : ''}`}>
                <div className="h-9 w-9 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {restaurant.logo_url
                        ? <img src={restaurant.logo_url} alt={restaurant.name} className="h-full w-full object-cover" />
                        : <UtensilsCrossed className="h-5 w-5 text-white" />
                    }
                </div>
                {(!sidebarCollapsed || onClose) && (
                    <div className="min-w-0 flex-1">
                        <p className="text-white font-semibold text-sm truncate">{restaurant.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${restaurant.is_open ? 'bg-green-400' : 'bg-gray-400'}`} />
                            <span className="text-xs text-slate-400">{restaurant.is_open ? 'Open' : 'Closed'}</span>
                        </div>
                    </div>
                )}
                {onClose && (
                    <button onClick={onClose} className="text-slate-400 hover:text-white ml-auto">
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            {/* Alert strip */}
            {totalAlerts > 0 && (!sidebarCollapsed || onClose) && (
                <div className="mx-3 mt-3 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2">
                    <Bell className="h-4 w-4 text-red-400 flex-shrink-0 animate-pulse" />
                    <span className="text-xs text-red-300 font-medium">{totalAlerts} alert{totalAlerts !== 1 ? 's' : ''} need attention</span>
                </div>
            )}

            {/* Nav */}
            <SidebarNav
                sections={navSections}
                activeSection={activeSection}
                activeTab={activeTab}
                onNavigate={navigate}
                collapsed={sidebarCollapsed && !onClose}
                restaurant={restaurant}
            />

            {/* Bottom actions */}
            <div className={`border-t border-white/10 p-3 space-y-1 ${sidebarCollapsed && !onClose ? 'flex flex-col items-center' : ''}`}>
                {restaurant?.pos_enabled && (
                    <button
                        onClick={() => window.open(createPageUrl('POSDashboard') + `?restaurant_id=${restaurant.id}`, '_blank')}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                    >
                        <Cpu className="h-4 w-4 flex-shrink-0" />
                        {(!sidebarCollapsed || onClose) && <span>Open POS</span>}
                    </button>
                )}
                {restaurant?.pos_enabled && (
                    <button
                        onClick={() => window.open(createPageUrl('KioskDashboard') + `?restaurant_id=${restaurant.id}`, '_blank')}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                    >
                        <TabletSmartphone className="h-4 w-4 flex-shrink-0" />
                        {(!sidebarCollapsed || onClose) && <span>Open Kiosk</span>}
                    </button>
                )}
                <button
                    onClick={() => base44.auth.logout()}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
                >
                    <LogOut className="h-4 w-4 flex-shrink-0" />
                    {(!sidebarCollapsed || onClose) && <span>Sign Out</span>}
                </button>
            </div>
        </div>
    );

    // ── Content renderer ─────────────────────────────────────────────────────
    const renderContent = () => {
        if (activeSection === 'main') {
            return (
                <Tabs value={activeTab} onValueChange={t => setActiveTab(t)}>
                    <TabsContent value="orders"><LiveOrders restaurantId={restaurant.id} onOrderUpdate={() => {}} /></TabsContent>
                    <TabsContent value="messages"><RestaurantMessages restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="history"><PastOrders restaurantId={restaurant.id} /></TabsContent>
                </Tabs>
            );
        }
        if (activeSection === 'menu') {
            return (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsContent value="menu"><MenuManagement restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="deals">
                        <AIMealDealSuggestions restaurantId={restaurant.id} />
                        <MealDealsManagement restaurantId={restaurant.id} />
                    </TabsContent>
                    <TabsContent value="reviews"><ReviewManagement restaurantId={restaurant.id} /></TabsContent>
                </Tabs>
            );
        }
        if (activeSection === 'marketing') {
            return (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsContent value="coupons"><CouponsManagement restaurantId={restaurant.id} restaurantName={restaurant.name} /></TabsContent>
                    <TabsContent value="promotions"><PromotionManagement restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="ai-marketing"><AIMarketingAssistant restaurantId={restaurant.id} /></TabsContent>
                    {restaurant?.media_screen_enabled && (
                        <TabsContent value="media">
                            <Card>
                                <CardHeader><CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" />Media Screen Management</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-gray-600 mb-4">Manage promotional content, screens, and layouts for in-store displays.</p>
                                    <Button onClick={() => window.location.href = createPageUrl('MediaScreenManagement') + `?restaurantId=${restaurant.id}`}>
                                        <Monitor className="h-4 w-4 mr-2" />Open Media Screen Manager
                                    </Button>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>
            );
        }
        if (activeSection === 'analytics') {
            return (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsContent value="analytics"><EnhancedAnalyticsDashboard restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="order-analytics"><OrderAnalyticsDashboard restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="driver-performance"><DriverPerformance restaurantId={restaurant.id} /></TabsContent>
                </Tabs>
            );
        }
        if (activeSection === 'payouts') {
            return <RestaurantPayoutHistory restaurantId={restaurant.id} />;
        }
        if (activeSection === 'operations') {
            return (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsContent value="kds"><KitchenDisplaySystem restaurant={restaurant} /></TabsContent>
                    <TabsContent value="drivers"><DriverTracking restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="driver-management"><DriverManagement restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="crm"><CustomerCRM restaurantId={restaurant.id} restaurantName={restaurant.name} /></TabsContent>
                    <TabsContent value="refunds"><RefundManagement restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="offline-orders"><OfflineOrdersReview restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="batching"><OrderBatching restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="modifications"><OrderModification restaurantId={restaurant.id} /></TabsContent>
                </Tabs>
            );
        }
        if (activeSection === 'settings') {
            return (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsContent value="settings"><RestaurantSettings restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="branding"><BrandingManager restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="zones">
                        <DeliveryZoneManagement
                            restaurantId={restaurant.id}
                            restaurantLocation={restaurant.latitude && restaurant.longitude ? { lat: restaurant.latitude, lng: restaurant.longitude } : null}
                        />
                    </TabsContent>
                    <TabsContent value="integrations"><ThirdPartyIntegrations restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="printers"><CentralizedPrinterSettings restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="pos"><POSConfigurations restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="kiosk"><KioskSettings restaurantId={restaurant.id} /></TabsContent>
                    <TabsContent value="sms"><SmsNotificationSettings restaurantId={restaurant.id} currentSettings={restaurant.sms_notification_settings} /></TabsContent>
                    <TabsContent value="staff"><StaffManagement restaurantId={restaurant.id} /></TabsContent>
                </Tabs>
            );
        }
    };

    // ── Page title for breadcrumb ─────────────────────────────────────────────
    const currentSection = navSections.find(s => s.id === activeSection);
    const currentItem = currentSection?.items.find(i => i.id === activeTab);
    const pageTitle = currentItem?.label || currentSection?.label || 'Dashboard';

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50">
            <NotificationSoundManager restaurantId={restaurant?.id} />

            {showOnboarding && (
                <RestaurantOnboarding restaurant={restaurant} onComplete={() => setShowOnboarding(false)} />
            )}

            {/* ── Desktop Sidebar ── */}
            <aside className="hidden md:flex flex-col flex-shrink-0 overflow-hidden h-screen sticky top-0">
                <SidebarContent />
                {/* Collapse toggle */}
                <button
                    onClick={() => setSidebarCollapsed(c => !c)}
                    className="absolute bottom-24 -right-3 z-10 h-6 w-6 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-slate-400 hover:text-white shadow hidden md:flex"
                >
                    {sidebarCollapsed ? <PanelLeft className="h-3 w-3" /> : <PanelLeftClose className="h-3 w-3" />}
                </button>
            </aside>

            {/* ── Main area ── */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                {/* Top bar */}
                <header className="bg-white border-b shadow-sm flex-shrink-0 z-10">
                    <div className="flex items-center gap-3 px-4 py-3">
                        {/* Mobile hamburger */}
                        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                            <SheetTrigger asChild>
                                <button className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 relative">
                                    <Menu className="h-5 w-5" />
                                    {totalAlerts > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                                            {totalAlerts}
                                        </span>
                                    )}
                                </button>
                            </SheetTrigger>
                            <SheetContent side="left" className="p-0 w-72 border-0">
                                <SidebarContent onClose={() => setMobileMenuOpen(false)} />
                            </SheetContent>
                        </Sheet>

                        {/* Breadcrumb */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-gray-400 text-sm hidden sm:block">{currentSection?.label}</span>
                            <ChevronRight className="h-4 w-4 text-gray-300 hidden sm:block" />
                            <h1 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{pageTitle}</h1>
                        </div>

                        {/* Right side badges */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {pendingOrders.length > 0 && (
                                <button onClick={() => navigate('main', 'orders')} className="flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors">
                                    <Bell className="h-3.5 w-3.5 animate-pulse" />
                                    {pendingOrders.length} New
                                </button>
                            )}
                            {unreadMessagesCount > 0 && (
                                <button onClick={() => navigate('main', 'messages')} className="flex items-center gap-1.5 bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    {unreadMessagesCount}
                                </button>
                            )}
                            {refundRequests.length > 0 && (
                                <button onClick={() => navigate('operations', 'refunds')} className="flex items-center gap-1.5 bg-orange-50 text-orange-600 border border-orange-200 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-orange-100 transition-colors">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    {refundRequests.length}
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-5">
                    {renderContent()}
                </main>
            </div>
        </div>
    );
}

export default function RestaurantDashboard() {
    return (
        <RequireAuth>
            <RestaurantDashboardInner />
        </RequireAuth>
    );
}