import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, X } from 'lucide-react';
import SystemOverview from '@/components/superadmin/SystemOverview';
import RestaurantManagement from '@/components/superadmin/RestaurantManagement';
import MessagingCenter from '@/components/superadmin/MessagingCenter';
import CommissionManagement from '@/components/superadmin/CommissionManagement';
import SystemMonitoring from '@/components/superadmin/SystemMonitoring';
import CuisineTypeManagement from '@/components/superadmin/CuisineTypeManagement';
import DomainManagement from '@/components/superadmin/DomainManagement';
import EnhancedAnalytics from '@/components/superadmin/EnhancedAnalytics';
import EnhancedDriverManagement from '@/components/superadmin/EnhancedDriverManagement';
import PlatformRefundOversight from '@/components/superadmin/PlatformRefundOversight';
import PayoutManagement from '@/components/superadmin/PayoutManagement';
import PayoutHistory from '@/components/superadmin/PayoutHistory';
import OrderHistoryManagement from '@/components/superadmin/OrderHistoryManagement';
import ReviewModerationSuper from '@/components/superadmin/ReviewModeration';
import PromotionOversight from '@/components/superadmin/PromotionOversight';
import LoyaltyProgramSettings from '@/components/superadmin/LoyaltyProgramSettings';
import TierBenefitsManagement from '@/components/superadmin/TierBenefitsManagement';
import PublicFilesManagement from '@/components/superadmin/PublicFilesManagement';
import GlobalScreenHealthMonitor from '@/components/superadmin/GlobalScreenHealthMonitor';
import SmsLogViewer from '@/components/superadmin/SmsLogViewer';
import BulkPriceAdjustment from '@/components/superadmin/BulkPriceAdjustment';
import BackupRestore from '@/components/superadmin/BackupRestore';
import { Shield, Activity, MessageSquare, DollarSign, Settings, Users, Truck, LayoutDashboard, Store, ChefHat, Globe, CreditCard, Star, Tag, Award, Upload, Gift, Monitor, Mail, MenuIcon } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useMediaQuery } from '@/hooks/use-mobile';

export default function SuperAdmin() {
    const [activeTab, setActiveTab] = useState('overview');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
    const isMobile = useMediaQuery('(max-width: 768px)');

    const { data: user, isLoading } = useQuery({
        queryKey: ['current-user'],
        queryFn: async () => {
            try {
                const userData = await base44.auth.me();
                if (!userData || userData.role !== 'admin') {
                    base44.auth.redirectToLogin();
                    return null;
                }
                return userData;
            } catch (error) {
                base44.auth.redirectToLogin();
                return null;
            }
        },
    });

    const menuGroups = [
        {
            title: 'Core Management',
            items: [
                { id: 'overview', label: 'Dashboard', icon: Activity },
                { id: 'orders', label: 'Order History', icon: Store },
                { id: 'restaurants', label: 'Restaurants', icon: Store },
                { id: 'messages', label: 'Messages', icon: MessageSquare },
            ]
        },
        {
            title: 'Financial',
            items: [
                { id: 'commission', label: 'Commission', icon: DollarSign },
                { id: 'sms-log', label: 'SMS Log', icon: MessageSquare },
                { id: 'payouts', label: 'Payouts', icon: CreditCard },
                { id: 'payout-history', label: 'Payout History', icon: DollarSign },
                { id: 'refunds', label: 'Refunds', icon: Shield },
                { id: 'analytics', label: 'Analytics', icon: LayoutDashboard },
            ]
        },
        {
            title: 'Operations',
            items: [
                { id: 'drivers', label: 'Driver Management', icon: Truck },
                { id: 'monitoring', label: 'Monitoring', icon: Activity },
                { id: 'screens', label: 'Screen Health', icon: Monitor },
                { id: 'bulk-price', label: 'Bulk Price Adjust', icon: DollarSign },
                { id: 'backup-restore', label: 'Backup & Restore', icon: Settings },
            ]
        },
        {
            title: 'Configuration',
            items: [
                { id: 'cuisine', label: 'Cuisine Types', icon: ChefHat },
                { id: 'domains', label: 'Domains', icon: Globe },
                { id: 'managers', label: 'Managers', icon: Users },
                { id: 'admin-restaurants', label: 'Admin Panel', icon: Settings },
            ]
        },
        {
            title: 'Marketing',
            items: [
                { id: 'reviews', label: 'Reviews', icon: Star },
                { id: 'promotions', label: 'Promotions', icon: Tag },
                { id: 'loyalty', label: 'Loyalty Program', icon: Award },
                { id: 'tier-benefits', label: 'Tier Benefits', icon: Gift },
                { id: 'files', label: 'Files', icon: Upload },
            ]
        }
    ];

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Checking access...</p>
                </div>
            </div>
        );
    }
    
    if (!user) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex">
            {/* Sidebar */}
            <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 fixed h-screen overflow-y-auto shadow-lg z-40`}>
                {/* Logo */}
                <div className="sticky top-0 bg-slate-950 p-4 border-b border-slate-700 flex items-center justify-between">
                    <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center w-full'}`}>
                        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Shield className="h-6 w-6" />
                        </div>
                        {sidebarOpen && <span className="font-bold text-lg truncate">Admin</span>}
                    </div>
                </div>

                {/* Menu Groups */}
                <nav className="p-4 space-y-6">
                    {menuGroups.map((group) => (
                        <div key={group.title}>
                            {sidebarOpen && (
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
                                    {group.title}
                                </p>
                            )}
                            <div className="space-y-1">
                                {group.items.map((item) => {
                                    const IconComponent = item.icon;
                                    const isActive = activeTab === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveTab(item.id)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                                                isActive
                                                    ? 'bg-orange-500 text-white shadow-lg'
                                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                            } ${!sidebarOpen && 'justify-center'}`}
                                            title={!sidebarOpen ? item.label : ''}
                                        >
                                            <IconComponent className="h-5 w-5 flex-shrink-0" />
                                            {sidebarOpen && <span className="text-sm font-medium truncate">{item.label}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* User Info */}
                {sidebarOpen && (
                    <div className="absolute bottom-0 w-full p-4 border-t border-slate-700 bg-slate-950">
                        <div className="text-xs text-slate-400">
                            <p className="truncate font-semibold">{user?.full_name}</p>
                            <p className="truncate text-slate-500">{user?.email}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} flex-1 transition-all duration-300`}>
                {/* Top Header */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
                    <div className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <Shield className="h-5 w-5 text-gray-600" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
                                <p className="text-sm text-gray-500">System Management & Control</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                            <p className="text-xs text-gray-500">Administrator</p>
                        </div>
                    </div>
                </div>

                {/* Page Content */}
                <div className="max-w-7xl mx-auto">
                    {activeTab === 'overview' && <SystemOverview />}
                    {activeTab === 'orders' && <OrderHistoryManagement />}
                    {activeTab === 'restaurants' && <RestaurantManagement />}
                    {activeTab === 'messages' && <MessagingCenter />}
                    {activeTab === 'commission' && <CommissionManagement />}
                    {activeTab === 'monitoring' && <SystemMonitoring />}
                    {activeTab === 'cuisine' && <CuisineTypeManagement />}
                    {activeTab === 'domains' && <DomainManagement />}
                    {activeTab === 'analytics' && <EnhancedAnalytics />}
                    {activeTab === 'drivers' && <EnhancedDriverManagement />}
                    {activeTab === 'refunds' && <PlatformRefundOversight />}
                    {activeTab === 'payouts' && <PayoutManagement />}
                    {activeTab === 'payout-history' && <PayoutHistory />}
                    {activeTab === 'reviews' && <ReviewModerationSuper />}
                    {activeTab === 'promotions' && <PromotionOversight />}
                    {activeTab === 'loyalty' && <LoyaltyProgramSettings />}
                    {activeTab === 'tier-benefits' && <TierBenefitsManagement />}
                    {activeTab === 'files' && <PublicFilesManagement />}
                    {activeTab === 'screens' && <GlobalScreenHealthMonitor />}
                    {activeTab === 'sms-log' && <SmsLogViewer />}
                    {activeTab === 'bulk-price' && <BulkPriceAdjustment />}
                    {activeTab === 'backup-restore' && <BackupRestore />}
                    {activeTab === 'managers' && (
                        <iframe 
                            src={createPageUrl('ManageRestaurantManagers')} 
                            className="w-full h-[calc(100vh-200px)] border-0 rounded-lg"
                            title="Restaurant Managers"
                        />
                    )}
                    {activeTab === 'admin-restaurants' && (
                        <iframe 
                            src={createPageUrl('AdminRestaurants')} 
                            className="w-full h-[calc(100vh-200px)] border-0 rounded-lg"
                            title="Admin Restaurants"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}