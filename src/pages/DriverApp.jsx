import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { 
    Navigation, MapPin, Phone, MessageSquare, CheckCircle, 
    DollarSign, Package, Clock, User, LogOut, TrendingUp, Star,
    Award, Bike, Send
} from 'lucide-react';
import DriverActiveDelivery from '@/components/driver/DriverActiveDelivery';
import MultiOrderDelivery from '@/components/driver/MultiOrderDelivery';
import DriverOrderList from '@/components/driver/DriverOrderList';
import DriverStats from '@/components/driver/DriverStats';
import DriverCommunication from '@/components/driver/DriverCommunication';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';

export default function DriverApp() {
    const [user, setUser] = useState(null);
    const [driver, setDriver] = useState(null);
    const [messagingOrder, setMessagingOrder] = useState(null);
    const [customerMessage, setCustomerMessage] = useState('');
    const queryClient = useQueryClient();

    useEffect(() => {
        loadDriverData();
    }, []);

    const loadDriverData = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
            
            // Find driver by email
            const drivers = await base44.entities.Driver.filter({ email: userData.email });
            
            if (drivers && drivers.length > 0) {
                setDriver(drivers[0]);
            } else {
                // No driver profile found - show error state
                setDriver('not_found');
            }
        } catch (e) {
            // Not authenticated - Base44 will handle redirect to login automatically
            console.error('Auth error:', e);
        }
    };

    const { data: activeOrders = [] } = useQuery({
        queryKey: ['driver-active-orders', driver?.id],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({
                driver_id: driver.id,
                status: 'out_for_delivery'
            });
            return orders || [];
        },
        enabled: !!driver && driver !== 'not_found' && !!driver.id,
        staleTime: 5000, // 5s cache
        refetchInterval: 10000, // Update every 10 seconds instead of 3
    });

    const { data: availableOrders = [] } = useQuery({
        queryKey: ['available-orders'],
        queryFn: () => base44.entities.Order.filter({
            status: 'preparing',
            driver_id: null
        }),
        enabled: !!driver && driver !== 'not_found' && !!driver.id && activeOrders.length === 0,
        staleTime: 8000, // 8s cache
        refetchInterval: 15000, // Update every 15 seconds instead of 5
    });

    const { data: completedOrders = [] } = useQuery({
        queryKey: ['driver-completed-orders', driver?.id],
        queryFn: () => base44.entities.Order.filter({
            driver_id: driver.id,
            status: 'delivered'
        }),
        enabled: !!driver && driver !== 'not_found' && !!driver.id,
    });

    const todayEarnings = completedOrders
        .filter(order => {
            const orderDate = new Date(order.actual_delivery_time || order.updated_date);
            const today = new Date();
            return orderDate.toDateString() === today.toDateString();
        })
        .reduce((sum, order) => sum + (order.delivery_fee || 0), 0);

    const weekEarnings = completedOrders
        .filter(order => {
            const orderDate = new Date(order.actual_delivery_time || order.updated_date);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return orderDate >= weekAgo;
        })
        .reduce((sum, order) => sum + (order.delivery_fee || 0), 0);

    const toggleAvailabilityMutation = useMutation({
        mutationFn: async (isAvailable) => {
            await base44.entities.Driver.update(driver.id, { is_available: isAvailable });
            return isAvailable;
        },
        onSuccess: (isAvailable) => {
            queryClient.invalidateQueries(['driver-active-orders']);
            queryClient.invalidateQueries(['available-orders']);
            setDriver({ ...driver, is_available: isAvailable });
            toast.success(isAvailable ? 'You are now online' : 'You are now offline');
        },
        onError: (error) => {
            toast.error('Failed to update availability: ' + error.message);
        },
    });

    const { data: orderMessages = [] } = useQuery({
        queryKey: ['order-messages', messagingOrder?.id],
        queryFn: async () => {
            if (!messagingOrder) return [];
            const messages = await base44.entities.Message.filter({ order_id: messagingOrder.id }, '-created_date');
            return Array.isArray(messages) ? messages : [];
        },
        enabled: !!messagingOrder,
        refetchInterval: 5000,
    });

    const sendMessageMutation = useMutation({
        mutationFn: async ({ orderId, restaurantId, message }) => {
            return await base44.entities.Message.create({
                order_id: orderId,
                restaurant_id: restaurantId,
                sender_type: 'restaurant',
                message: message,
                is_read: false
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['order-messages']);
            setCustomerMessage('');
            toast.success('Message sent to customer');
        },
    });

    const handleSendMessage = () => {
        if (!customerMessage.trim() || !messagingOrder) return;
        
        sendMessageMutation.mutate({
            orderId: messagingOrder.id,
            restaurantId: messagingOrder.restaurant_id,
            message: customerMessage
        });
    };

    if (!user || !driver) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    {driver === 'not_found' ? (
                        <Card>
                            <CardContent className="pt-8 pb-8">
                                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <User className="h-8 w-8 text-orange-500" />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Driver Profile Not Found</h2>
                                <p className="text-gray-600 mb-6">
                                    Your account is not registered as a driver yet. Please contact your restaurant manager to add you as a driver.
                                </p>
                                <Button 
                                    onClick={() => base44.auth.logout(createPageUrl('Home'))}
                                    variant="outline"
                                >
                                    <LogOut className="h-4 w-4 mr-2" />
                                    Sign Out
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                            <p className="text-gray-600">Loading driver app...</p>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
            <style>{`
                html, body {
                    overscroll-behavior: none;
                    -webkit-overflow-scrolling: touch;
                    touch-action: manipulation;
                    overflow: hidden;
                }
                @supports (padding: env(safe-area-inset-top)) {
                    .sticky-header { padding-top: env(safe-area-inset-top); }
                    .sticky-footer { padding-bottom: env(safe-area-inset-bottom); }
                }
            `}</style>
            
            {/* Header - Fixed */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg sticky-header flex-shrink-0">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center ring-2 ring-white/30">
                                <Bike className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold">{driver.full_name}</h1>
                                <div className="flex items-center gap-2 text-xs text-orange-100">
                                    <Star className="h-3 w-3 fill-current" />
                                    <span>{driver.rating?.toFixed(1) || '5.0'}</span>
                                    <span>•</span>
                                    <span>{driver.total_deliveries || 0} deliveries</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                                <span className="text-sm font-medium">
                                    {driver.is_available ? 'Online' : 'Offline'}
                                </span>
                                <Switch
                                    checked={driver.is_available}
                                    onCheckedChange={(checked) => 
                                        toggleAvailabilityMutation.mutate(checked)
                                    }
                                    className="data-[state=checked]:bg-green-400"
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => base44.auth.logout()}
                                className="text-white hover:bg-white/20"
                            >
                                <LogOut className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    {/* Quick Stats Bar */}
                    <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <DollarSign className="h-4 w-4" />
                                <span className="text-xs font-medium opacity-90">Today</span>
                            </div>
                            <p className="text-2xl font-bold">£{todayEarnings.toFixed(2)}</p>
                        </div>
                        <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingUp className="h-4 w-4" />
                                <span className="text-xs font-medium opacity-90">This Week</span>
                            </div>
                            <p className="text-2xl font-bold">£{weekEarnings.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content - Scrollable */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto px-4 py-6">
                {activeOrders.length > 0 ? (
                    <>
                        {/* Quick Message Button */}
                        <div className="mb-4">
                            <Button 
                                onClick={() => setMessagingOrder(activeOrders[0])}
                                className="w-full bg-blue-500 hover:bg-blue-600 shadow-lg"
                                size="lg"
                            >
                                <MessageSquare className="h-5 w-5 mr-2" />
                                Message Customer
                            </Button>
                        </div>

                        {activeOrders.length > 1 ? (
                            <MultiOrderDelivery 
                                orders={activeOrders} 
                                driver={driver}
                                onComplete={() => {
                                    queryClient.invalidateQueries(['driver-active-orders']);
                                    queryClient.invalidateQueries(['available-orders']);
                                }}
                            />
                        ) : (
                            <DriverActiveDelivery 
                                order={activeOrders[0]} 
                                driver={driver}
                                onComplete={() => {
                                    queryClient.invalidateQueries(['driver-active-orders']);
                                    queryClient.invalidateQueries(['available-orders']);
                                }}
                            />
                        )}
                    </>
                ) : (
                    <>
                        {/* Quick Actions */}
                        {driver.is_available && availableOrders.length > 0 && (
                            <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 mb-4">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                                                <Package className="h-5 w-5 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-green-900">
                                                    {availableOrders.length} {availableOrders.length === 1 ? 'Order' : 'Orders'} Available
                                                </h3>
                                                <p className="text-sm text-green-700">Ready for pickup</p>
                                            </div>
                                        </div>
                                        <Badge className="bg-green-500 text-white animate-pulse">
                                            New
                                        </Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                    <Tabs defaultValue="orders" className="space-y-4">
                        <TabsList className="grid w-full grid-cols-3 bg-white shadow-sm">
                            <TabsTrigger value="orders" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                                <Package className="h-4 w-4 mr-2" />
                                Available
                                {availableOrders.length > 0 && (
                                    <Badge className="ml-2 bg-red-500 text-white">{availableOrders.length}</Badge>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="stats" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Earnings
                            </TabsTrigger>
                            <TabsTrigger value="messages" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Messages
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="orders">
                            {!driver.is_available ? (
                                <Card className="border-2 border-dashed">
                                    <CardContent className="text-center py-12">
                                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Clock className="h-10 w-10 text-gray-400" />
                                        </div>
                                        <h3 className="text-xl font-semibold text-gray-700 mb-2">
                                            You're Offline
                                        </h3>
                                        <p className="text-gray-500 mb-6">
                                            Turn on availability to see and accept orders
                                        </p>
                                        <Button 
                                            onClick={() => toggleAvailabilityMutation.mutate(true)}
                                            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg"
                                            size="lg"
                                        >
                                            <CheckCircle className="h-5 w-5 mr-2" />
                                            Go Online
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : availableOrders.length === 0 ? (
                                <Card>
                                    <CardContent className="text-center py-12">
                                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <CheckCircle className="h-10 w-10 text-green-500" />
                                        </div>
                                        <h3 className="text-xl font-semibold text-gray-700 mb-2">
                                            All Caught Up!
                                        </h3>
                                        <p className="text-gray-500">
                                            No orders available right now. New orders will appear here automatically.
                                        </p>
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
                    </>
                )}
                </div>
            </div>

            {/* Persistent Bottom Status Bar - Fixed */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-t border-gray-700 shadow-2xl sticky-footer flex-shrink-0">
                <div className="max-w-4xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${driver.is_available ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                            <div>
                                <p className="text-sm font-semibold text-white">
                                    {activeOrders.length > 0 
                                        ? `${activeOrders.length} Active ${activeOrders.length === 1 ? 'Delivery' : 'Deliveries'}` 
                                        : driver.is_available 
                                            ? 'Ready for Orders' 
                                            : 'Offline'}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {activeOrders.length > 0 
                                        ? 'In progress' 
                                        : driver.is_available 
                                            ? `${availableOrders.length} available` 
                                            : 'Go online to receive orders'}
                                </p>
                            </div>
                        </div>
                        {driver.is_available && activeOrders.length === 0 && availableOrders.length > 0 && (
                            <Badge className="bg-green-500 text-white animate-bounce shadow-lg">
                                {availableOrders.length} New
                            </Badge>
                        )}
                        {activeOrders.length > 0 && (
                            <Badge className="bg-orange-500 text-white shadow-lg">
                                En Route
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Customer Messaging Dialog */}
            <Dialog open={!!messagingOrder} onOpenChange={() => setMessagingOrder(null)}>
                <DialogContent className="max-w-md h-[85vh] flex flex-col p-0">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-blue-600" />
                            Message Customer
                        </DialogTitle>
                        <div className="flex items-start gap-2 mt-2">
                            <MapPin className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                            <div className="text-sm text-gray-600">
                                <p className="font-semibold">Order #{messagingOrder?.id?.slice(-6)}</p>
                                <p className="text-xs">{messagingOrder?.delivery_address}</p>
                            </div>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                        {orderMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                                    <MessageSquare className="h-8 w-8 text-blue-500" />
                                </div>
                                <p className="text-gray-600 font-medium">No messages yet</p>
                                <p className="text-sm text-gray-500 mt-1">Start the conversation with the customer</p>
                            </div>
                        ) : (
                            orderMessages.map((msg) => (
                                <div 
                                    key={msg.id}
                                    className={`flex ${msg.sender_type === 'restaurant' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                                        msg.sender_type === 'restaurant' 
                                            ? 'bg-blue-500 text-white rounded-br-sm' 
                                            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                                    }`}>
                                        <p className="text-sm leading-relaxed">{msg.message}</p>
                                        <p className={`text-xs mt-1.5 ${
                                            msg.sender_type === 'restaurant' ? 'text-blue-100' : 'text-gray-500'
                                        }`}>
                                            {new Date(msg.created_date).toLocaleTimeString([], { 
                                                hour: '2-digit', 
                                                minute: '2-digit' 
                                            })}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="border-t bg-white px-4 py-4 space-y-3">
                        {/* Quick Templates */}
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCustomerMessage("I'm on my way!")}
                                className="text-xs"
                            >
                                🚗 On my way
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCustomerMessage("I'm outside. Please come down.")}
                                className="text-xs"
                            >
                                📍 I'm outside
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCustomerMessage("Could you provide more delivery details?")}
                                className="text-xs"
                            >
                                ❓ Need details
                            </Button>
                        </div>

                        <div className="flex gap-2">
                            <Textarea
                                placeholder="Type your message..."
                                value={customerMessage}
                                onChange={(e) => setCustomerMessage(e.target.value)}
                                className="flex-1 min-h-[60px] resize-none rounded-xl border-gray-300 focus:border-blue-500"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                            />
                            <Button 
                                onClick={handleSendMessage}
                                disabled={!customerMessage.trim() || sendMessageMutation.isPending}
                                className="bg-blue-500 hover:bg-blue-600 rounded-xl h-[60px] px-4"
                                size="lg"
                            >
                                <Send className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}