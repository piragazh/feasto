import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import { MapPin, Navigation, Phone, CheckCircle, Package, MessageSquare, Camera, Star } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from 'date-fns';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

export default function DriverActiveDelivery({ order, driver, onComplete }) {
    const [currentLocation, setCurrentLocation] = useState(driver.current_location);
    const [showChat, setShowChat] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [showProofDialog, setShowProofDialog] = useState(false);
    const [proofPhoto, setProofPhoto] = useState(null);
    const [showRatingDialog, setShowRatingDialog] = useState(false);
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
        mutationFn: async ({ status: newStatus, proofUrl }) => {
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
                if (proofUrl) {
                    updates.proof_of_delivery = proofUrl;
                }
                
                // Free up driver
                await base44.entities.Driver.update(driver.id, {
                    current_order_id: null,
                    is_available: true,
                    total_deliveries: (driver.total_deliveries || 0) + 1
                });

                // Notify customer
                await base44.functions.invoke('sendNotification', {
                    userId: order.created_by,
                    title: 'Order Delivered!',
                    message: `Your order from ${order.restaurant_name} has been delivered.`,
                    type: 'delivered',
                    orderId: order.id
                });
            }

            return base44.entities.Order.update(order.id, updates);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries(['driver-active-order']);
            toast.success(`Order marked as ${variables.status}`);
            if (variables.status === 'delivered') {
                setShowProofDialog(false);
                setShowRatingDialog(true);
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

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            setProofPhoto(file_url);
            toast.success('Photo uploaded');
        } catch (error) {
            toast.error('Failed to upload photo');
        }
    };

    const handleCompleteDelivery = async () => {
        if (!proofPhoto) {
            toast.error('Please upload proof of delivery');
            return;
        }
        updateStatusMutation.mutate({ status: 'delivered', proofUrl: proofPhoto });
    };

    const openNavigation = () => {
        if (order.delivery_coordinates) {
            const { lat, lng } = order.delivery_coordinates;
            // Open in Google Maps or Apple Maps
            const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
            window.open(url, '_blank');
        } else {
            toast.error('Delivery coordinates not available');
        }
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
                            onClick={openNavigation}
                            variant="outline"
                            className="w-full"
                        >
                            <Navigation className="h-4 w-4 mr-2" />
                            Open Navigation
                        </Button>
                        
                        <Button
                            onClick={() => setShowChat(true)}
                            variant="outline"
                            className="w-full"
                        >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Message Restaurant
                        </Button>
                        
                        <Button
                            onClick={() => setShowProofDialog(true)}
                            className="w-full bg-green-600 hover:bg-green-700"
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Complete Delivery
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

            {/* Proof of Delivery Dialog */}
            <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Proof of Delivery</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="proof-photo" className="mb-2 block">
                                Upload Photo *
                            </Label>
                            <div className="border-2 border-dashed rounded-lg p-6 text-center">
                                {proofPhoto ? (
                                    <div>
                                        <img src={proofPhoto} alt="Proof" className="max-h-48 mx-auto mb-2 rounded" />
                                        <Button variant="outline" size="sm" onClick={() => setProofPhoto(null)}>
                                            Change Photo
                                        </Button>
                                    </div>
                                ) : (
                                    <label htmlFor="proof-photo" className="cursor-pointer">
                                        <Camera className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                                        <p className="text-sm text-gray-600">Click to upload photo</p>
                                        <Input
                                            id="proof-photo"
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handlePhotoUpload}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowProofDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCompleteDelivery}
                            disabled={!proofPhoto || updateStatusMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            Complete Delivery
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Rating Dialog */}
            <Dialog open={showRatingDialog} onOpenChange={() => {
                setShowRatingDialog(false);
                onComplete();
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delivery Completed! 🎉</DialogTitle>
                    </DialogHeader>
                    <div className="text-center py-4">
                        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                        <p className="text-lg font-semibold mb-2">Great job!</p>
                        <p className="text-gray-600">Order delivered successfully</p>
                    </div>
                    <Button
                        onClick={() => {
                            setShowRatingDialog(false);
                            onComplete();
                        }}
                        className="w-full bg-orange-500 hover:bg-orange-600"
                    >
                        Continue
                    </Button>
                </DialogContent>
            </Dialog>
        </div>
    );
}