import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SystemOverview from '@/components/superadmin/SystemOverview';
import RestaurantManagement from '@/components/superadmin/RestaurantManagement';
import MessagingCenter from '@/components/superadmin/MessagingCenter';
import CommissionManagement from '@/components/superadmin/CommissionManagement';
import SystemMonitoring from '@/components/superadmin/SystemMonitoring';
import { Shield, Activity, MessageSquare, DollarSign, Settings } from 'lucide-react';

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
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center gap-3">
                        <Shield className="h-8 w-8" />
                        <div>
                            <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
                            <p className="text-slate-300 text-sm">System Management & Monitoring</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 py-8">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid grid-cols-5 w-full max-w-3xl mb-8">
                        <TabsTrigger value="overview" className="flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            <span className="hidden sm:inline">Overview</span>
                        </TabsTrigger>
                        <TabsTrigger value="restaurants" className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            <span className="hidden sm:inline">Restaurants</span>
                        </TabsTrigger>
                        <TabsTrigger value="messages" className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            <span className="hidden sm:inline">Messages</span>
                        </TabsTrigger>
                        <TabsTrigger value="commission" className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span className="hidden sm:inline">Commission</span>
                        </TabsTrigger>
                        <TabsTrigger value="monitoring" className="flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            <span className="hidden sm:inline">Monitoring</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview">
                        <SystemOverview />
                    </TabsContent>

                    <TabsContent value="restaurants">
                        <RestaurantManagement />
                    </TabsContent>

                    <TabsContent value="messages">
                        <MessagingCenter />
                    </TabsContent>

                    <TabsContent value="commission">
                        <CommissionManagement />
                    </TabsContent>

                    <TabsContent value="monitoring">
                        <SystemMonitoring />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}