import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import { MapPin, Navigation, Phone, CheckCircle, Package, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

export default function DriverActiveDelivery({ order, driver, onComplete }) {
    const [currentLocation, setCurrentLocation] = useState(driver.current_location);
    const [showChat, setShowChat] = useState(false);
    const [messageText, setMessageText] = useState('');
    const queryClient = useQueryClient();

    useEffect(() => {
        // Update driver location every 10 seconds
        const locationInterval = setInterval(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const newLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        setCurrentLocation(newLocation);
                        
                        // Update driver location in database
                        base44.entities.Driver.update(driver.id, {
                            current_location: newLocation
                        });
                        
                        // Update order with driver location
                        base44.entities.Order.update(order.id, {
                            driver_location: newLocation
                        });
                    },
                    (error) => console.error('Location error:', error),
                    { enableHighAccuracy: true }
                );
            }
        }, 10000);

        return () => clearInterval(locationInterval);
    }, [driver.id, order.id]);

    const { data: messages = [] } = useQuery({
        queryKey: ['driver-messages', order.id],
        queryFn: () => base44.entities.DriverMessage.filter({
            order_id: order.id,
            driver_id: driver.id
        }),
        refetchInterval: 3000,
    });

    const updateStatusMutation = useMutation({
        mutationFn: async (newStatus) => {
            const statusNote = newStatus === 'delivered' 
                ? 'Order delivered successfully' 
                : `Status updated to ${newStatus}`;
            
            const updates = {
                status: newStatus,
                status_history: [
                    ...(order.status_history || []),
                    { 
                        status: newStatus, 
                        timestamp: new Date().toISOString(),
                        note: statusNote
                    }
                ]
            };

            if (newStatus === 'delivered') {
                updates.actual_delivery_time = new Date().toISOString();
                // Free up driver
                await base44.entities.Driver.update(driver.id, {
                    current_order_id: null,
                    is_available: true,
                    total_deliveries: (driver.total_deliveries || 0) + 1
                });
            }

            return base44.entities.Order.update(order.id, updates);
        },
        onSuccess: (data, newStatus) => {
            queryClient.invalidateQueries(['driver-active-order']);
            toast.success(`Order marked as ${newStatus}`);
            if (newStatus === 'delivered') {
                onComplete();
            }
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

    const handleSendMessage = () => {
        if (!messageText.trim()) return;
        
        sendMessageMutation.mutate({
            order_id: order.id,
            driver_id: driver.id,
            restaurant_id: order.restaurant_id,
            sender_type: 'driver',
            message: messageText
        });
    };

    const calculateETA = () => {
        if (!currentLocation || !order.delivery_coordinates) return 'Calculating...';
        
        // Simple ETA calculation based on distance (can be enhanced with real routing API)
        const R = 6371; // Earth radius in km
        const dLat = (order.delivery_coordinates.lat - currentLocation.lat) * Math.PI / 180;
        const dLon = (order.delivery_coordinates.lng - currentLocation.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(currentLocation.lat * Math.PI / 180) * 
                  Math.cos(order.delivery_coordinates.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        // Assume average speed of 20 km/h
        const timeInHours = distance / 20;
        const timeInMinutes = Math.ceil(timeInHours * 60);
        
        return timeInMinutes < 60 ? `${timeInMinutes} mins` : `${Math.ceil(timeInMinutes / 60)} hr`;
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Navigation className="h-5 w-5 text-orange-500" />
                            Active Delivery
                        </div>
                        <Badge className="bg-orange-500">
                            Order #{order.id.slice(-6)}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Map */}
                    {currentLocation && order.delivery_coordinates && (
                        <div className="h-64 rounded-lg overflow-hidden border">
                            <MapContainer 
                                center={[currentLocation.lat, currentLocation.lng]} 
                                zoom={13} 
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <Marker position={[currentLocation.lat, currentLocation.lng]}>
                                </Marker>
                                <Marker position={[order.delivery_coordinates.lat, order.delivery_coordinates.lng]}>
                                </Marker>
                                <Polyline 
                                    positions={[
                                        [currentLocation.lat, currentLocation.lng],
                                        [order.delivery_coordinates.lat, order.delivery_coordinates.lng]
                                    ]} 
                                    color="orange"
                                    dashArray="5, 10"
                                />
                            </MapContainer>
                        </div>
                    )}

                    {/* Order Details */}
                    <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold">{order.restaurant_name}</h3>
                            <Badge variant="outline">ETA: {calculateETA()}</Badge>
                        </div>
                        
                        <div className="space-y-2 text-sm mb-3">
                            <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                                <div>
                                    <p className="font-medium">Delivery Address:</p>
                                    <p className="text-gray-600">{order.delivery_address}</p>
                                </div>
                            </div>
                            {order.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-gray-500" />
                                    <a href={`tel:${order.phone}`} className="text-blue-600">
                                        {order.phone}
                                    </a>
                                </div>
                            )}
                        </div>

                        <div className="border-t pt-3">
                            <p className="text-sm font-medium mb-2">Order Items:</p>
                            <div className="space-y-1">
                                {order.items.map((item, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                        <span>{item.quantity}x {item.name}</span>
                                        <span>£{(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
                                <span>Total:</span>
                                <span>£{order.total.toFixed(2)}</span>
                            </div>
                        </div>

                        {order.notes && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-3">
                                <p className="text-xs font-medium text-yellow-800 mb-1">Customer Notes:</p>
                                <p className="text-sm text-yellow-700">{order.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2">
                        <Button
                            onClick={() => setShowChat(true)}
                            variant="outline"
                            className="w-full"
                        >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Message Restaurant
                        </Button>
                        
                        <Button
                            onClick={() => updateStatusMutation.mutate('delivered')}
                            disabled={updateStatusMutation.isPending}
                            className="w-full bg-green-600 hover:bg-green-700"
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark as Delivered
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Chat Dialog */}
            <Dialog open={showChat} onOpenChange={setShowChat}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Chat with {order.restaurant_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="h-64 overflow-y-auto border rounded p-3 space-y-2">
                            {messages.length === 0 ? (
                                <p className="text-center text-gray-500 text-sm">No messages yet</p>
                            ) : (
                                messages.map(msg => (
                                    <div
                                        key={msg.id}
                                        className={`p-2 rounded-lg max-w-[80%] ${
                                            msg.sender_type === 'driver'
                                                ? 'bg-blue-100 ml-auto'
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
                                className="bg-blue-600 hover:bg-blue-700"
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