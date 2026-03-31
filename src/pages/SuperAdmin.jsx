import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import RequireAdmin from '@/components/auth/RequireAdmin';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from 'lucide-react';
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
import OfflineReviewPortfolio from '@/components/superadmin/OfflineReviewPortfolio';
import ManagerOperatorAnalytics from '@/components/superadmin/ManagerOperatorAnalytics';
import OfflineTemporalAnalytics from '@/components/superadmin/OfflineTemporalAnalytics';
import OperatorAnalytics from '@/components/superadmin/OperatorAnalytics';
import ShiftWindowAnalytics from '@/components/superadmin/ShiftWindowAnalytics';
import OfflineRiskDigest from '@/components/superadmin/OfflineRiskDigest';
import WeeklyOpsHealthDashboard from '@/components/superadmin/WeeklyOpsHealthDashboard';
import FailureMonitoringDashboard from '@/components/superadmin/FailureMonitoringDashboard';
import { Shield, Activity, MessageSquare, DollarSign, Settings, Users, Truck, LayoutDashboard, Store, ChefHat, Globe, CreditCard, Star, Tag, Award, Upload, Gift, Monitor, Clock, AlertCircle, Scale, Heart } from 'lucide-react';
import { createPageUrl } from '@/utils/index.ts';
import { useIsMobile } from '@/hooks/use-mobile.jsx';

function SidebarContent({ menuGroups, activeTab, setActiveTab, setMobileSheetOpen, sidebarOpen, isMobile, user }) {
    return (
        <div className="flex flex-col h-full">
            <div className="sticky top-0 bg-slate-950 p-5 border-b border-slate-700 flex items-center justify-between">
                <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center w-full'}`}>
                    <div className="w-11 h-11 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                        <Shield className="h-6 w-6 text-white" />
                    </div>
                    {(sidebarOpen || isMobile) && <span className="font-bold text-lg text-white truncate">Admin Hub</span>}
                </div>
            </div>
            <nav className="p-5 space-y-7 flex-1 overflow-y-auto">
                {menuGroups.map((group) => (
                    <div key={group.title}>
                        {(sidebarOpen || isMobile) && (
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">
                                {group.title}
                            </p>
                        )}
                        <div className="space-y-1.5">
                            {group.items.map((item) => {
                                const IconComponent = item.icon;
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            setActiveTab(item.id);
                                            setMobileSheetOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-all duration-200 ${
                                            isActive
                                                ? 'bg-orange-500 text-white shadow-lg scale-105'
                                                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                                        } ${!sidebarOpen && !isMobile && 'justify-center'}`}
                                        title={!sidebarOpen && !isMobile ? item.label : ''}
                                    >
                                        <IconComponent className="h-5 w-5 flex-shrink-0" />
                                        {(sidebarOpen || isMobile) && <span className="text-sm font-semibold truncate">{item.label}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>
            {(sidebarOpen || isMobile) && (
                <div className="p-5 border-t border-slate-700 bg-slate-950">
                    <div className="text-xs text-slate-400 space-y-1">
                        <p className="truncate font-semibold text-slate-200">{user?.full_name}</p>
                        <p className="truncate text-slate-500 text-xs">{user?.email}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function SuperAdminInner() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
    const isMobile = useIsMobile();

    const menuGroups = [
        {
            title: 'Core Management',
            items: [
                { id: 'overview', label: 'Dashboard', icon: Activity },
                { id: 'ops-health', label: 'Ops Health', icon: Heart },
                { id: 'risk-digest', label: 'Risk Digest', icon: AlertCircle },
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
                { id: 'reconciliation', label: 'Reconciliation', icon: Scale },
                { id: 'analytics', label: 'Analytics', icon: LayoutDashboard },
            ]
        },
        {
            title: 'Operations',
            items: [
                { id: 'drivers', label: 'Driver Management', icon: Truck },
                { id: 'monitoring', label: 'Monitoring', icon: Activity },
                { id: 'failures', label: 'Failures', icon: AlertCircle },
                { id: 'screens', label: 'Screen Health', icon: Monitor },
                { id: 'offline-reviews', label: 'Offline Reviews', icon: Activity },
                { id: 'operator-analytics', label: 'Operator Analytics', icon: Users },
                { id: 'manager-analytics', label: 'Manager Analytics', icon: Users },
                { id: 'temporal-analytics', label: 'Temporal Analytics', icon: Clock },
                { id: 'shift-windows', label: 'Shift Window Analytics', icon: Clock },
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

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Desktop Sidebar */}
            <div className={`hidden md:flex ${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 fixed h-screen shadow-xl z-40 flex-col border-r border-slate-800`}>
                <SidebarContent menuGroups={menuGroups} activeTab={activeTab} setActiveTab={setActiveTab} setMobileSheetOpen={setMobileSheetOpen} sidebarOpen={sidebarOpen} isMobile={isMobile} user={user} />
            </div>

            {/* Mobile Sheet Sidebar */}
            <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
                <SheetTrigger asChild>
                    <div className="md:hidden fixed top-20 left-4 z-30">
                        <Button size="icon" variant="ghost" className="rounded-lg hover:bg-gray-200">
                            <Menu className="h-6 w-6 text-gray-700" />
                        </Button>
                    </div>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 bg-slate-900 text-white p-0 border-0">
                    <SidebarContent menuGroups={menuGroups} activeTab={activeTab} setActiveTab={setActiveTab} setMobileSheetOpen={setMobileSheetOpen} sidebarOpen={sidebarOpen} isMobile={isMobile} user={user} />
                </SheetContent>
            </Sheet>

            {/* Main Content */}
            <div className={`${sidebarOpen ? 'md:ml-64' : 'md:ml-20'} flex-1 transition-all duration-300 pt-20 md:pt-0`}>
                {/* Top Header */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
                    <div className="px-6 md:px-8 py-5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="hidden md:block p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                            >
                                <Menu className="h-5 w-5 text-gray-600" />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 truncate">Super Admin</h1>
                                <p className="text-sm text-gray-500 hidden sm:block">System Management & Operations</p>
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-gray-900 hidden sm:block">{user?.full_name}</p>
                            <p className="text-xs text-gray-500 hidden sm:block">Admin</p>
                        </div>
                    </div>
                </div>

                {/* Page Content */}
                <div className="px-6 md:px-8 py-8 md:py-10">
                    {activeTab === 'overview' && <SystemOverview />}
                    {activeTab === 'ops-health' && <WeeklyOpsHealthDashboard />}
                    {activeTab === 'risk-digest' && <OfflineRiskDigest />}
                    {activeTab === 'orders' && <OrderHistoryManagement />}
                    {activeTab === 'restaurants' && <RestaurantManagement />}
                    {activeTab === 'messages' && <MessagingCenter />}
                    {activeTab === 'commission' && <CommissionManagement />}
                    {activeTab === 'monitoring' && <SystemMonitoring />}
                    {activeTab === 'failures' && <FailureMonitoringDashboard />}
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
                    {activeTab === 'offline-reviews' && <OfflineReviewPortfolio />}
                    {activeTab === 'operator-analytics' && <OperatorAnalytics />}
                    {activeTab === 'manager-analytics' && <ManagerOperatorAnalytics mode="superadmin" />}
                    {activeTab === 'temporal-analytics' && <OfflineTemporalAnalytics />}
                    {activeTab === 'shift-windows' && <ShiftWindowAnalytics />}
                    {activeTab === 'sms-log' && <SmsLogViewer />}
                    {activeTab === 'bulk-price' && <BulkPriceAdjustment />}
                    {activeTab === 'backup-restore' && <BackupRestore />}
                    {activeTab === 'managers' && (
                        <div className="w-full h-[calc(100vh-250px)] md:h-[calc(100vh-200px)] border-0 rounded-lg overflow-hidden">
                            <iframe 
                                src={createPageUrl('ManageRestaurantManagers')} 
                                className="w-full h-full border-0"
                                title="Restaurant Managers"
                            />
                        </div>
                    )}
                    {activeTab === 'admin-restaurants' && (
                        <div className="w-full h-[calc(100vh-250px)] md:h-[calc(100vh-200px)] border-0 rounded-lg overflow-hidden">
                            <iframe 
                                src={createPageUrl('AdminRestaurants')} 
                                className="w-full h-full border-0"
                                title="Admin Restaurants"
                            />
                        </div>
                    )}
                    {activeTab === 'reconciliation' && (
                        <div className="w-full h-[calc(100vh-250px)] md:h-[calc(100vh-200px)] border-0 rounded-lg overflow-hidden">
                            <iframe 
                                src={createPageUrl('ReconciliationDashboard')} 
                                className="w-full h-full border-0"
                                title="Reconciliation Dashboard"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function SuperAdmin() {
    return (
        <RequireAdmin>
            <SuperAdminInner />
        </RequireAdmin>
    );
}