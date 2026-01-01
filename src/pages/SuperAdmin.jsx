import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SystemOverview from '@/components/superadmin/SystemOverview';
import RestaurantManagement from '@/components/superadmin/RestaurantManagement';
import MessagingCenter from '@/components/superadmin/MessagingCenter';
import CommissionManagement from '@/components/superadmin/CommissionManagement';
import SystemMonitoring from '@/components/superadmin/SystemMonitoring';
import CuisineTypeManagement from '@/components/superadmin/CuisineTypeManagement';
import DomainManagement from '@/components/superadmin/DomainManagement';
import { Shield, Activity, MessageSquare, DollarSign, Settings, Users, Truck, LayoutDashboard, Store, ChefHat, Globe } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function SuperAdmin() {
    const [activeTab, setActiveTab] = useState('overview');

    const { data: user } = useQuery({
        queryKey: ['current-user'],
        queryFn: () => base44.auth.me(),
    });

    // Check if user is admin
    if (user && user.role !== 'admin') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="py-12 text-center">
                        <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
                        <p className="text-gray-600">You don't have permission to access this page.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header with Top Navigation */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white sticky top-0 z-50 shadow-lg">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-3 mb-4">
                        <Shield className="h-8 w-8" />
                        <div>
                            <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
                            <p className="text-slate-300 text-sm">System Management & Monitoring</p>
                        </div>
                    </div>
                    
                    {/* Top Menu Navigation */}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={activeTab === 'overview' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('overview')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <Activity className="h-4 w-4" />
                            Overview
                        </Button>
                        <Button
                            variant={activeTab === 'restaurants' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('restaurants')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <Settings className="h-4 w-4" />
                            Restaurants
                        </Button>
                        <Button
                            variant={activeTab === 'messages' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('messages')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <MessageSquare className="h-4 w-4" />
                            Messages
                        </Button>
                        <Button
                            variant={activeTab === 'commission' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('commission')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <DollarSign className="h-4 w-4" />
                            Commission
                        </Button>
                        <Button
                            variant={activeTab === 'monitoring' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('monitoring')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <Activity className="h-4 w-4" />
                            Monitoring
                        </Button>
                        <Button
                            variant={activeTab === 'cuisine' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('cuisine')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <ChefHat className="h-4 w-4" />
                            Cuisine Types
                        </Button>
                        <Button
                            variant={activeTab === 'domains' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('domains')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <Globe className="h-4 w-4" />
                            Domains
                        </Button>
                        <Button
                            variant={activeTab === 'managers' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('managers')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <Users className="h-4 w-4" />
                            Managers
                        </Button>
                        <Button
                            variant={activeTab === 'drivers' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('drivers')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <Truck className="h-4 w-4" />
                            Drivers
                        </Button>
                        <Button
                            variant={activeTab === 'admin-dashboard' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('admin-dashboard')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <LayoutDashboard className="h-4 w-4" />
                            Analytics
                        </Button>
                        <Button
                            variant={activeTab === 'admin-restaurants' ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTab('admin-restaurants')}
                            className="flex items-center gap-2 text-white hover:bg-white/10"
                        >
                            <Store className="h-4 w-4" />
                            Admin Panel
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 py-8">
                {activeTab === 'overview' && <SystemOverview />}
                {activeTab === 'restaurants' && <RestaurantManagement />}
                {activeTab === 'messages' && <MessagingCenter />}
                {activeTab === 'commission' && <CommissionManagement />}
                {activeTab === 'monitoring' && <SystemMonitoring />}
                {activeTab === 'cuisine' && <CuisineTypeManagement />}
                {activeTab === 'domains' && <DomainManagement />}
                {activeTab === 'managers' && (
                    <iframe 
                        src={createPageUrl('ManageRestaurantManagers')} 
                        className="w-full h-[calc(100vh-200px)] border-0 rounded-lg"
                        title="Restaurant Managers"
                    />
                )}
                {activeTab === 'drivers' && (
                    <iframe 
                        src={createPageUrl('DriverDashboard')} 
                        className="w-full h-[calc(100vh-200px)] border-0 rounded-lg"
                        title="Driver Dashboard"
                    />
                )}
                {activeTab === 'admin-dashboard' && (
                    <iframe 
                        src={createPageUrl('AdminDashboard')} 
                        className="w-full h-[calc(100vh-200px)] border-0 rounded-lg"
                        title="Admin Dashboard"
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
    );
}