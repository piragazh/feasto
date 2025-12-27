import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, Phone, Navigation, CheckCircle, Package, Bike } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { format } from 'date-fns';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

export default function DriverDashboard() {
    const [driver, setDriver] = useState(null);
    const [location, setLocation] = useState(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        loadDriver();
        startLocationTracking();
    }, []);

    const loadDriver = async () => {
        try {
            const user = await base44.auth.me();
            if (!user.driver_id) {
                toast.error('No driver profile assigned');
                return;
            }
            const drivers = await base44.entities.Driver.filter({ id: user.driver_id });
            if (drivers[0]) {
                setDriver(drivers[0]);
            }
        } catch (e) {
            base44.auth.redirectToLogin();
        }
    };

    const startLocationTracking = () => {
        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    const newLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    setLocation(newLocation);
                    updateDriverLocation(newLocation);
                },
                (error) => console.error('Location error:', error),
                { enableHighAccuracy: true, maximumAge: 5000 }
            );
        }
    };

    const updateDriverLocation = async (loc) => {
        if (!driver) return;
        try {
            await base44.entities.Driver.update(driver.id, { current_location: loc });
            
            // Update current order's driver location
            if (driver.current_order_id) {
                await base44.entities.Order.update(driver.current_order_id, { driver_location: loc });
            }
        } catch (e) {
            console.error('Failed to update location:', e);
        }
    };

    const { data: assignedOrder } = useQuery({
        queryKey: ['driver-current-order', driver?.current_order_id],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({ id: driver.current_order_id });
            return orders[0];
        },
        enabled: !!driver?.current_order_id,
        refetchInterval: 3000,
    });

    const { data: availableOrders = [] } = useQuery({
        queryKey: ['available-deliveries'],
        queryFn: () => base44.entities.Order.filter({ 
            status: 'preparing',
            driver_id: null 
        }),
        enabled: !driver?.current_order_id && driver?.is_available,
        refetchInterval: 5000,
    });

    const toggleAvailabilityMutation = useMutation({
        mutationFn: (isAvailable) => base44.entities.Driver.update(driver.id, { is_available: isAvailable }),
        onSuccess: () => {
            queryClient.invalidateQueries(['driver-current-order']);
            loadDriver();
        },
    });

    const acceptOrderMutation = useMutation({
        mutationFn: async (orderId) => {
            await base44.entities.Order.update(orderId, { 
                driver_id: driver.id,
                status: 'out_for_delivery'
            });
            await base44.entities.Driver.update(driver.id, { 
                current_order_id: orderId,
                is_available: false
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries();
            loadDriver();
            toast.success('Order accepted! Starting delivery');
        },
    });

    const completeDeliveryMutation = useMutation({
        mutationFn: async () => {
            await base44.entities.Order.update(assignedOrder.id, { 
                status: 'delivered',
                actual_delivery_time: new Date().toISOString()
            });
            await base44.entities.Driver.update(driver.id, { 
                current_order_id: null,
                is_available: true,
                total_deliveries: (driver.total_deliveries || 0) + 1
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries();
            loadDriver();
            toast.success('Delivery completed! Ready for next order');
        },
    });

    if (!driver) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading driver dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white border-b shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
                                <Bike className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">{driver.full_name}</h1>
                                <p className="text-sm text-gray-500">{driver.total_deliveries || 0} deliveries</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="availability">Available</Label>
                                <Switch
                                    id="availability"
                                    checked={driver.is_available}
                                    onCheckedChange={(checked) => toggleAvailabilityMutation.mutate(checked)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-4 space-y-6">
                {assignedOrder ? (
                    <>
                        <Card className="border-2 border-orange-500">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Navigation className="h-5 w-5 text-orange-500" />
                                    Active Delivery
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <p className="text-sm text-gray-600 mb-1">Restaurant</p>
                                    <p className="font-semibold">{assignedOrder.restaurant_name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600 mb-1">Delivery Address</p>
                                    <div className="flex items-start gap-2">
                                        <MapPin className="h-4 w-4 text-gray-500 mt-1" />
                                        <p className="font-medium">{assignedOrder.delivery_address}</p>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600 mb-1">Customer Phone</p>
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4 text-gray-500" />
                                        <a href={`tel:${assignedOrder.phone}`} className="font-medium text-blue-600">
                                            {assignedOrder.phone}
                                        </a>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600 mb-1">Order Items</p>
                                    {assignedOrder.items?.map((item, idx) => (
                                        <p key={idx} className="text-sm">
                                            {item.quantity}x {item.name}
                                        </p>
                                    ))}
                                </div>
                                {assignedOrder.notes && (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                                        <p className="text-sm font-semibold text-yellow-900 mb-1">Special Instructions:</p>
                                        <p className="text-sm text-yellow-800">{assignedOrder.notes}</p>
                                    </div>
                                )}
                                <Button 
                                    onClick={() => completeDeliveryMutation.mutate()}
                                    className="w-full bg-green-600 hover:bg-green-700"
                                    size="lg"
                                >
                                    <CheckCircle className="h-5 w-5 mr-2" />
                                    Mark as Delivered
                                </Button>
                            </CardContent>
                        </Card>

                        {location && assignedOrder.delivery_coordinates && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Navigation Map</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-96 rounded-lg overflow-hidden">
                                        <MapContainer 
                                            center={[location.lat, location.lng]} 
                                            zoom={13} 
                                            style={{ height: '100%', width: '100%' }}
                                        >
                                            <TileLayer
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <Marker position={[location.lat, location.lng]}>
                                                <Popup>Your Location</Popup>
                                            </Marker>
                                            <Marker position={[assignedOrder.delivery_coordinates.lat, assignedOrder.delivery_coordinates.lng]}>
                                                <Popup>Delivery Destination</Popup>
                                            </Marker>
                                            <Polyline 
                                                positions={[
                                                    [location.lat, location.lng],
                                                    [assignedOrder.delivery_coordinates.lat, assignedOrder.delivery_coordinates.lng]
                                                ]} 
                                                color="orange"
                                            />
                                        </MapContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </>
                ) : driver.is_available ? (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Available Deliveries</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {availableOrders.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Package className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                                        <p className="text-gray-500">No deliveries available right now</p>
                                        <p className="text-sm text-gray-400 mt-1">Check back in a moment</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {availableOrders.map(order => (
                                            <div key={order.id} className="border rounded-lg p-4">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div>
                                                        <p className="font-semibold">{order.restaurant_name}</p>
                                                        <p className="text-sm text-gray-600">{order.delivery_address}</p>
                                                    </div>
                                                    <Badge className="bg-green-100 text-green-700">
                                                        ${order.total?.toFixed(2)}
                                                    </Badge>
                                                </div>
                                                <Button 
                                                    onClick={() => acceptOrderMutation.mutate(order.id)}
                                                    className="w-full mt-2"
                                                    size="sm"
                                                >
                                                    Accept Delivery
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                ) : (
                    <Card>
                        <CardContent className="text-center py-12">
                            <p className="text-gray-500 mb-2">You're currently offline</p>
                            <p className="text-sm text-gray-400">Toggle availability to start receiving orders</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}