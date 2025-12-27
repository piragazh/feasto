import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { 
    Navigation, MapPin, Phone, MessageSquare, CheckCircle, 
    DollarSign, Package, Clock, User, LogOut
} from 'lucide-react';
import DriverActiveDelivery from '@/components/driver/DriverActiveDelivery';
import DriverOrderList from '@/components/driver/DriverOrderList';
import DriverStats from '@/components/driver/DriverStats';
import DriverCommunication from '@/components/driver/DriverCommunication';

export default function DriverApp() {
    const [user, setUser] = useState(null);
    const [driver, setDriver] = useState(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        loadDriverData();
    }, []);

    const loadDriverData = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
            
            if (!userData.driver_id) {
                // Create driver profile if not exists
                const newDriver = await base44.entities.Driver.create({
                    full_name: userData.full_name,
                    phone: userData.phone || '',
                    vehicle_type: 'bike',
                    is_available: true,
                    current_location: { lat: 0, lng: 0 }
                });
                
                await base44.auth.updateMe({ driver_id: newDriver.id });
                setDriver(newDriver);
            } else {
                const drivers = await base44.entities.Driver.filter({ id: userData.driver_id });
                setDriver(drivers[0]);
            }
        } catch (e) {
            base44.auth.redirectToLogin();
        }
    };

    const { data: activeOrder } = useQuery({
        queryKey: ['driver-active-order', driver?.id],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({
                driver_id: driver.id,
                status: 'out_for_delivery'
            });
            return orders[0] || null;
        },
        enabled: !!driver,
        refetchInterval: 3000,
    });

    const { data: availableOrders = [] } = useQuery({
        queryKey: ['available-orders'],
        queryFn: () => base44.entities.Order.filter({
            status: 'preparing',
            driver_id: null
        }),
        enabled: !!driver && !activeOrder,
        refetchInterval: 5000,
    });

    const toggleAvailabilityMutation = useMutation({
        mutationFn: (isAvailable) => 
            base44.entities.Driver.update(driver.id, { is_available: isAvailable }),
        onSuccess: () => {
            queryClient.invalidateQueries(['driver-active-order']);
            loadDriverData();
        },
    });

    if (!user || !driver) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading driver app...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b shadow-sm sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                                <Navigation className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-gray-900">{driver.full_name}</h1>
                                <p className="text-xs text-gray-500">Driver App</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">
                                    {driver.is_available ? 'Available' : 'Offline'}
                                </span>
                                <Switch
                                    checked={driver.is_available}
                                    onCheckedChange={(checked) => 
                                        toggleAvailabilityMutation.mutate(checked)
                                    }
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => base44.auth.logout()}
                            >
                                <LogOut className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto px-4 py-6">
                {activeOrder ? (
                    <DriverActiveDelivery 
                        order={activeOrder} 
                        driver={driver}
                        onComplete={() => {
                            queryClient.invalidateQueries(['driver-active-order']);
                            queryClient.invalidateQueries(['available-orders']);
                        }}
                    />
                ) : (
                    <Tabs defaultValue="orders" className="space-y-4">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="orders">
                                <Package className="h-4 w-4 mr-2" />
                                Available
                            </TabsTrigger>
                            <TabsTrigger value="stats">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Earnings
                            </TabsTrigger>
                            <TabsTrigger value="messages">
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Messages
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="orders">
                            {!driver.is_available ? (
                                <Card>
                                    <CardContent className="text-center py-12">
                                        <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                        <h3 className="text-xl font-semibold text-gray-700 mb-2">
                                            You're Offline
                                        </h3>
                                        <p className="text-gray-500 mb-4">
                                            Turn on availability to see and accept orders
                                        </p>
                                        <Button 
                                            onClick={() => toggleAvailabilityMutation.mutate(true)}
                                            className="bg-orange-500 hover:bg-orange-600"
                                        >
                                            Go Online
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : (
                                <DriverOrderList 
                                    orders={availableOrders} 
                                    driverId={driver.id}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="stats">
                            <DriverStats driverId={driver.id} />
                        </TabsContent>

                        <TabsContent value="messages">
                            <DriverCommunication driverId={driver.id} />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    );
}