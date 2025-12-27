import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Navigation, CheckCircle, MessageSquare } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { format } from 'date-fns';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

export default function DriverActiveDelivery({ order, driver, onComplete }) {
    const [currentLocation, setCurrentLocation] = useState(driver.current_location);
    const queryClient = useQueryClient();

    // Update location every 10 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const newLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        setCurrentLocation(newLocation);
                        base44.entities.Driver.update(driver.id, {
                            current_location: newLocation
                        });
                        base44.entities.Order.update(order.id, {
                            driver_location: newLocation
                        });
                    },
                    (error) => console.error('Location error:', error)
                );
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [driver.id, order.id]);

    const markDeliveredMutation = useMutation({
        mutationFn: async () => {
            await base44.entities.Order.update(order.id, {
                status: 'delivered',
                actual_delivery_time: new Date().toISOString()
            });
            await base44.entities.Driver.update(driver.id, {
                is_available: true,
                current_order_id: null,
                total_deliveries: (driver.total_deliveries || 0) + 1
            });
        },
        onSuccess: () => {
            toast.success('Delivery completed!');
            onComplete();
        },
    });

    const openNavigation = () => {
        const destination = order.delivery_address;
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
        window.open(googleMapsUrl, '_blank');
    };

    const callCustomer = () => {
        window.location.href = `tel:${order.phone}`;
    };

    return (
        <div className="space-y-4">
            {/* Status Card */}
            <Card className="bg-orange-50 border-orange-200">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Active Delivery</h2>
                            <p className="text-sm text-gray-600">Order #{order.id.slice(-6)}</p>
                        </div>
                        <Badge className="bg-orange-500 text-white">
                            In Progress
                        </Badge>
                    </div>
                    
                    {order.estimated_delivery && (
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <span>ETA:</span>
                            <span className="font-semibold">{order.estimated_delivery}</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Map */}
            <Card>
                <CardHeader>
                    <CardTitle>Navigation</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-64 rounded-lg overflow-hidden border mb-4">
                        {currentLocation && (
                            <MapContainer 
                                center={[currentLocation.lat, currentLocation.lng]} 
                                zoom={13} 
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <Marker position={[currentLocation.lat, currentLocation.lng]}>
                                    <Popup>Your Location</Popup>
                                </Marker>
                            </MapContainer>
                        )}
                    </div>
                    <Button 
                        onClick={openNavigation}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                        <Navigation className="h-4 w-4 mr-2" />
                        Open in Google Maps
                    </Button>
                </CardContent>
            </Card>

            {/* Customer Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Delivery Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <p className="text-sm text-gray-600 mb-1">Restaurant</p>
                        <p className="font-semibold">{order.restaurant_name}</p>
                    </div>

                    <div>
                        <p className="text-sm text-gray-600 mb-1">Delivery Address</p>
                        <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-orange-500 mt-1" />
                            <p className="font-semibold">{order.delivery_address}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-sm text-gray-600 mb-1">Customer Phone</p>
                        <Button 
                            onClick={callCustomer}
                            variant="outline"
                            className="w-full"
                        >
                            <Phone className="h-4 w-4 mr-2" />
                            {order.phone}
                        </Button>
                    </div>

                    {order.notes && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-xs font-semibold text-yellow-900 mb-1">
                                Special Instructions
                            </p>
                            <p className="text-sm text-yellow-800">{order.notes}</p>
                        </div>
                    )}

                    <div>
                        <p className="text-sm text-gray-600 mb-1">Order Items</p>
                        <div className="space-y-1">
                            {order.items?.map((item, idx) => (
                                <div key={idx} className="text-sm">
                                    {item.quantity}x {item.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold">Total</span>
                            <span className="text-xl font-bold">${order.total.toFixed(2)}</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            Payment: {order.payment_method?.replace('_', ' ').toUpperCase()}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Complete Delivery */}
            <Button
                onClick={() => markDeliveredMutation.mutate()}
                disabled={markDeliveredMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700 h-14 text-lg"
            >
                <CheckCircle className="h-5 w-5 mr-2" />
                Mark as Delivered
            </Button>
        </div>
    );
}