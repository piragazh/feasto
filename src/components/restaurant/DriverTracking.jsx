import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { MapPin, Navigation, Phone, Bike, Car, Zap, MessageSquare, User, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from 'date-fns';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

export default function DriverTracking({ restaurantId }) {
    const [assigningOrder, setAssigningOrder] = useState(null);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [messagingDriver, setMessagingDriver] = useState(null);
    const [messageText, setMessageText] = useState('');
    const queryClient = useQueryClient();

    const { data: activeDeliveries = [] } = useQuery({
        queryKey: ['active-deliveries', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: 'out_for_delivery'
        }),
        refetchInterval: 3000,
    });

    const { data: preparingOrders = [] } = useQuery({
        queryKey: ['preparing-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: 'preparing'
        }),
        refetchInterval: 3000,
    });

    const { data: drivers = [] } = useQuery({
        queryKey: ['drivers-status'],
        queryFn: () => base44.entities.Driver.list(),
        refetchInterval: 5000,
    });

    const { data: driverMessages = [] } = useQuery({
        queryKey: ['driver-messages', restaurantId, messagingDriver?.id],
        queryFn: () => base44.entities.DriverMessage.filter({
            restaurant_id: restaurantId,
            driver_id: messagingDriver?.id,
            order_id: messagingDriver?.orderId
        }),
        enabled: !!messagingDriver,
        refetchInterval: 3000,
    });

    const assignDriverMutation = useMutation({
        mutationFn: async ({ orderId, driverId }) => {
            const driver = drivers.find(d => d.id === driverId);
            await base44.entities.Driver.update(driverId, {
                current_order_id: orderId,
                is_available: false
            });
            return base44.entities.Order.update(orderId, {
                driver_id: driverId,
                status: 'out_for_delivery',
                status_history: [
                    ...(assigningOrder?.status_history || []),
                    { 
                        status: 'out_for_delivery', 
                        timestamp: new Date().toISOString(),
                        note: `Assigned to ${driver?.full_name || 'driver'}`
                    }
                ]
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['preparing-orders']);
            queryClient.invalidateQueries(['active-deliveries']);
            queryClient.invalidateQueries(['drivers-status']);
            toast.success('Driver assigned successfully');
            setAssigningOrder(null);
            setSelectedDriver('');
        },
    });

    const sendMessageMutation = useMutation({
        mutationFn: (data) => base44.entities.DriverMessage.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['driver-messages']);
            setMessageText('');
            toast.success('Message sent');
        },
    });

    const activeDrivers = drivers.filter(d => d.current_order_id && 
        activeDeliveries.some(order => order.id === d.current_order_id)
    );

    const availableDrivers = drivers.filter(d => d.is_available);

    const vehicleIcons = {
        bike: Bike,
        scooter: Zap,
        car: Car
    };

    const handleSendMessage = () => {
        if (!messageText.trim() || !messagingDriver) return;
        
        sendMessageMutation.mutate({
            order_id: messagingDriver.orderId,
            driver_id: messagingDriver.id,
            restaurant_id: restaurantId,
            sender_type: 'restaurant',
            message: messageText
        });
    };

    return (
        <div className="space-y-6">
            {/* Orders Awaiting Driver Assignment */}
            {preparingOrders.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-orange-500" />
                            Orders Ready for Pickup
                            <Badge className="ml-auto bg-orange-500">
                                {preparingOrders.length} Waiting
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {preparingOrders.map(order => (
                                <div key={order.id} className="border rounded-lg p-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold">Order #{order.id.slice(-6)}</p>
                                        <p className="text-sm text-gray-600">{order.delivery_address}</p>
                                        <p className="text-xs text-gray-500">Total: £{order.total.toFixed(2)}</p>
                                    </div>
                                    <Button 
                                        onClick={() => setAssigningOrder(order)}
                                        className="bg-orange-500 hover:bg-orange-600"
                                    >
                                        <User className="h-4 w-4 mr-2" />
                                        Assign Driver
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Live Tracking Map */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Navigation className="h-5 w-5 text-orange-500" />
                        Live Driver Tracking
                        {activeDrivers.length > 0 && (
                            <Badge className="ml-auto bg-orange-500">
                                {activeDrivers.length} Active
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {activeDeliveries.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-500">No active deliveries at the moment</p>
                        </div>
                    ) : (
                        <>
                            <div className="h-96 rounded-lg overflow-hidden border mb-4">
                                <MapContainer 
                                    center={activeDeliveries[0]?.driver_location ? 
                                        [activeDeliveries[0].driver_location.lat, activeDeliveries[0].driver_location.lng] : 
                                        [51.5074, -0.1278]
                                    } 
                                    zoom={12} 
                                    style={{ height: '100%', width: '100%' }}
                                >
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    />
                                    {activeDeliveries.map(order => {
                                        const driver = drivers.find(d => d.id === order.driver_id);
                                        return order.driver_location && (
                                            <React.Fragment key={order.id}>
                                                <Marker position={[order.driver_location.lat, order.driver_location.lng]}>
                                                    <Popup>
                                                        <div className="text-sm">
                                                            <p className="font-semibold">{driver?.full_name || 'Driver'}</p>
                                                            <p>Order #{order.id.slice(-6)}</p>
                                                        </div>
                                                    </Popup>
                                                </Marker>
                                                {order.delivery_coordinates && (
                                                    <>
                                                        <Marker position={[order.delivery_coordinates.lat, order.delivery_coordinates.lng]}>
                                                            <Popup>Delivery Destination</Popup>
                                                        </Marker>
                                                        <Polyline 
                                                            positions={[
                                                                [order.driver_location.lat, order.driver_location.lng],
                                                                [order.delivery_coordinates.lat, order.delivery_coordinates.lng]
                                                            ]} 
                                                            color="orange"
                                                            dashArray="5, 10"
                                                        />
                                                    </>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </MapContainer>
                            </div>

                            <div className="space-y-3">
                                {activeDeliveries.map(order => {
                                    const driver = drivers.find(d => d.id === order.driver_id);
                                    const VehicleIcon = driver ? vehicleIcons[driver.vehicle_type] || Bike : Bike;
                                    
                                    return (
                                        <div key={order.id} className="border rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <VehicleIcon className="h-4 w-4 text-orange-500" />
                                                        <p className="font-semibold">{driver?.full_name || 'Driver'}</p>
                                                        <Badge variant="outline" className="text-xs">
                                                            ⭐ {driver?.rating || 5.0}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-gray-600">Order #{order.id.slice(-6)}</p>
                                                    <div className="flex items-start gap-1 mt-1">
                                                        <MapPin className="h-3 w-3 text-gray-400 mt-0.5" />
                                                        <p className="text-xs text-gray-500">{order.delivery_address}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right space-y-2">
                                                    <Badge className="bg-orange-100 text-orange-700">
                                                        En Route
                                                    </Badge>
                                                    {driver?.phone && (
                                                        <a href={`tel:${driver.phone}`} className="text-xs text-blue-600 block">
                                                            <Phone className="h-3 w-3 inline mr-1" />
                                                            Call
                                                        </a>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="w-full"
                                                        onClick={() => setMessagingDriver({ ...driver, orderId: order.id })}
                                                    >
                                                        <MessageSquare className="h-3 w-3 mr-1" />
                                                        Message
                                                    </Button>
                                                </div>
                                            </div>
                                            {order.estimated_delivery && (
                                                <p className="text-xs text-gray-500 mt-2">
                                                    ETA: {order.estimated_delivery}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Driver Fleet Status */}
            <Card>
                <CardHeader>
                    <CardTitle>Driver Fleet Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">
                                {availableDrivers.length}
                            </p>
                            <p className="text-sm text-gray-600">Available Drivers</p>
                        </div>
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                            <p className="text-2xl font-bold text-orange-600">
                                {activeDrivers.length}
                            </p>
                            <p className="text-sm text-gray-600">On Delivery</p>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-2xl font-bold text-gray-600">
                                {drivers.length}
                            </p>
                            <p className="text-sm text-gray-600">Total Drivers</p>
                        </div>
                    </div>

                    {/* Available Drivers List */}
                    {availableDrivers.length > 0 && (
                        <div className="mt-4">
                            <h3 className="font-semibold text-sm mb-2">Available Drivers</h3>
                            <div className="space-y-2">
                                {availableDrivers.map(driver => {
                                    const VehicleIcon = vehicleIcons[driver.vehicle_type] || Bike;
                                    return (
                                        <div key={driver.id} className="flex items-center gap-2 p-2 border rounded">
                                            <VehicleIcon className="h-4 w-4 text-gray-500" />
                                            <span className="text-sm">{driver.full_name}</span>
                                            <Badge variant="outline" className="ml-auto text-xs">
                                                ⭐ {driver.rating || 5.0}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Assign Driver Dialog */}
            <Dialog open={!!assigningOrder} onOpenChange={() => setAssigningOrder(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Assign Driver to Order #{assigningOrder?.id?.slice(-6)}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-600 mb-2">Delivery Address:</p>
                            <p className="text-sm font-medium">{assigningOrder?.delivery_address}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Select Driver</label>
                            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose an available driver" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableDrivers.map(driver => (
                                        <SelectItem key={driver.id} value={driver.id}>
                                            {driver.full_name} - {driver.vehicle_type} (⭐ {driver.rating})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button variant="outline" onClick={() => setAssigningOrder(null)}>
                                Cancel
                            </Button>
                            <Button
                                disabled={!selectedDriver || assignDriverMutation.isPending}
                                onClick={() => assignDriverMutation.mutate({
                                    orderId: assigningOrder.id,
                                    driverId: selectedDriver
                                })}
                                className="bg-orange-500 hover:bg-orange-600"
                            >
                                Assign Driver
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Driver Messaging Dialog */}
            <Dialog open={!!messagingDriver} onOpenChange={() => setMessagingDriver(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Chat with {messagingDriver?.full_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="h-64 overflow-y-auto border rounded p-3 space-y-2">
                            {driverMessages.length === 0 ? (
                                <p className="text-center text-gray-500 text-sm">No messages yet</p>
                            ) : (
                                driverMessages.map(msg => (
                                    <div
                                        key={msg.id}
                                        className={`p-2 rounded-lg max-w-[80%] ${
                                            msg.sender_type === 'restaurant'
                                                ? 'bg-orange-100 ml-auto'
                                                : 'bg-gray-100'
                                        }`}
                                    >
                                        <p className="text-sm">{msg.message}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {format(new Date(msg.created_date), 'h:mm a')}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Textarea
                                placeholder="Type a message..."
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                rows={2}
                            />
                            <Button
                                onClick={handleSendMessage}
                                disabled={!messageText.trim() || sendMessageMutation.isPending}
                                className="bg-orange-500 hover:bg-orange-600"
                            >
                                Send
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}