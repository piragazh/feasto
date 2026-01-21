import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import { Navigation, MapPin, Phone, CheckCircle, AlertTriangle, Route, Clock } from 'lucide-react';
import { optimizeRoute, calculateDistance, calculateETA, checkDeviation, generateDirections } from './RouteOptimizer';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

export default function MultiOrderDelivery({ orders, driver, onComplete }) {
    const [currentLocation, setCurrentLocation] = useState(driver.current_location);
    const [optimizedOrders, setOptimizedOrders] = useState([]);
    const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
    const [directions, setDirections] = useState([]);
    const [deviationWarning, setDeviationWarning] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        // Optimize route on mount or when orders change
        if (orders.length > 0 && currentLocation) {
            const optimized = optimizeRoute(currentLocation, orders);
            setOptimizedOrders(optimized);
            
            if (optimized[0]) {
                const dirs = generateDirections(currentLocation, optimized[0].delivery_coordinates);
                setDirections(dirs);
            }
        }
    }, [orders, currentLocation]);

    useEffect(() => {
        // Update driver location and check deviation
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

                        // Check for deviation
                        if (optimizedOrders[currentOrderIndex]) {
                            const targetCoords = optimizedOrders[currentOrderIndex].delivery_coordinates;
                            if (targetCoords) {
                                const isDeviated = checkDeviation(newLocation, targetCoords, 2);
                                setDeviationWarning(isDeviated);
                                
                                if (isDeviated && !deviationWarning) {
                                    toast.warning('You appear to be off route. Recalculating...');
                                    // Re-optimize remaining orders
                                    const remaining = optimizedOrders.slice(currentOrderIndex);
                                    const reoptimized = optimizeRoute(newLocation, remaining);
                                    setOptimizedOrders([
                                        ...optimizedOrders.slice(0, currentOrderIndex),
                                        ...reoptimized
                                    ]);
                                }
                            }
                        }
                    },
                    (error) => console.error('Location error:', error),
                    { enableHighAccuracy: true }
                );
            }
        }, 10000);

        return () => clearInterval(locationInterval);
    }, [driver.id, optimizedOrders, currentOrderIndex, deviationWarning]);

    const completeOrderMutation = useMutation({
        mutationFn: async (orderId) => {
            await base44.entities.Order.update(orderId, {
                status: 'delivered',
                actual_delivery_time: new Date().toISOString(),
                status_history: [
                    ...(orders.find(o => o.id === orderId)?.status_history || []),
                    { 
                        status: 'delivered', 
                        timestamp: new Date().toISOString(),
                        note: 'Order delivered successfully'
                    }
                ]
            });

            // Update driver stats
            await base44.entities.Driver.update(driver.id, {
                total_deliveries: (driver.total_deliveries || 0) + 1
            });
        },
        onSuccess: () => {
            toast.success('Order completed');
            
            // Move to next order
            if (currentOrderIndex < optimizedOrders.length - 1) {
                setCurrentOrderIndex(currentOrderIndex + 1);
                const nextOrder = optimizedOrders[currentOrderIndex + 1];
                if (nextOrder && nextOrder.delivery_coordinates) {
                    const dirs = generateDirections(currentLocation, nextOrder.delivery_coordinates);
                    setDirections(dirs);
                }
            } else {
                // All orders completed
                base44.entities.Driver.update(driver.id, {
                    current_order_id: null,
                    is_available: true
                });
                toast.success('All deliveries completed! 🎉');
                onComplete();
            }
            
            queryClient.invalidateQueries(['driver-active-orders']);
        },
    });

    const openNavigation = (order) => {
        if (order.delivery_coordinates && order.delivery_coordinates.lat && order.delivery_coordinates.lng) {
            const { lat, lng } = order.delivery_coordinates;
            
            // Create waypoints for multi-stop navigation
            const waypoints = optimizedOrders
                .slice(currentOrderIndex + 1)
                .filter(o => o.delivery_coordinates)
                .map(o => `${o.delivery_coordinates.lat},${o.delivery_coordinates.lng}`)
                .join('/');
            
            const url = waypoints 
                ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&waypoints=${waypoints}`
                : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
            
            window.open(url, '_blank');
        } else if (order.delivery_address) {
            const encodedAddress = encodeURIComponent(order.delivery_address);
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
        }
    };

    const currentOrder = optimizedOrders[currentOrderIndex];
    const totalDistance = optimizedOrders.reduce((sum, order, idx) => {
        if (idx === 0) return sum;
        const prev = idx === 0 ? currentLocation : optimizedOrders[idx - 1].delivery_coordinates;
        const curr = order.delivery_coordinates;
        if (prev && curr) {
            return sum + calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        }
        return sum;
    }, 0);

    if (!currentOrder) {
        return (
            <Card>
                <CardContent className="text-center py-12">
                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">All Deliveries Completed!</h3>
                    <p className="text-gray-600">Great job on completing all your orders.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Route Summary */}
            <Card className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                                <Route className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-orange-900">
                                    {optimizedOrders.length} Stop Route (Optimized)
                                </h3>
                                <p className="text-sm text-orange-700">
                                    {currentOrderIndex + 1} of {optimizedOrders.length} • {totalDistance.toFixed(1)}km total
                                </p>
                            </div>
                        </div>
                        {deviationWarning && (
                            <Badge className="bg-red-500 text-white">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Off Route
                            </Badge>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Map with Optimized Route */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Current Delivery ({currentOrderIndex + 1}/{optimizedOrders.length})</span>
                        <Badge className="bg-orange-500">
                            #{currentOrder.id.slice(-6)}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {currentLocation && (
                        <div className="h-80 rounded-lg overflow-hidden border">
                            <MapContainer 
                                center={[currentLocation.lat, currentLocation.lng]} 
                                zoom={13} 
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                
                                {/* Driver location */}
                                <Marker position={[currentLocation.lat, currentLocation.lng]}>
                                    <Popup>Your Location</Popup>
                                </Marker>
                                
                                {/* All delivery stops with numbers */}
                                {optimizedOrders.map((order, idx) => {
                                    if (order.delivery_coordinates && order.delivery_coordinates.lat) {
                                        return (
                                            <Marker 
                                                key={order.id}
                                                position={[order.delivery_coordinates.lat, order.delivery_coordinates.lng]}
                                            >
                                                <Popup>
                                                    <div className="text-sm">
                                                        <p className="font-semibold">Stop {idx + 1}</p>
                                                        <p>{order.restaurant_name}</p>
                                                        <p className="text-xs text-gray-600">{order.delivery_address}</p>
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        );
                                    }
                                    return null;
                                })}
                                
                                {/* Route line */}
                                <Polyline 
                                    positions={[
                                        [currentLocation.lat, currentLocation.lng],
                                        ...optimizedOrders
                                            .filter(o => o.delivery_coordinates && o.delivery_coordinates.lat)
                                            .map(o => [o.delivery_coordinates.lat, o.delivery_coordinates.lng])
                                    ]} 
                                    color="orange"
                                    weight={3}
                                />
                            </MapContainer>
                        </div>
                    )}

                    {/* Turn-by-turn Directions */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                            <Navigation className="h-4 w-4" />
                            Directions to Next Stop
                        </h4>
                        <div className="space-y-2">
                            {directions.map((dir, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-sm">
                                    <span className="text-blue-600 font-medium">{idx + 1}.</span>
                                    <div className="flex-1">
                                        <p className="text-blue-900">{dir.instruction}</p>
                                        <p className="text-xs text-blue-700">{dir.distance}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Current Order Details */}
                    <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold">{currentOrder.restaurant_name}</h3>
                            <Badge variant="outline">
                                <Clock className="h-3 w-3 mr-1" />
                                ETA: {calculateETA(calculateDistance(
                                    currentLocation.lat,
                                    currentLocation.lng,
                                    currentOrder.delivery_coordinates?.lat || 0,
                                    currentOrder.delivery_coordinates?.lng || 0
                                ))}
                            </Badge>
                        </div>
                        
                        <div className="space-y-2 text-sm mb-3">
                            <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                                <div>
                                    <p className="font-medium">Delivery Address:</p>
                                    <p className="text-gray-600">{currentOrder.delivery_address}</p>
                                </div>
                            </div>
                            {currentOrder.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-gray-500" />
                                    <a href={`tel:${currentOrder.phone}`} className="text-blue-600">
                                        {currentOrder.phone}
                                    </a>
                                </div>
                            )}
                        </div>

                        <div className="border-t pt-3">
                            <p className="text-sm font-medium mb-2">Order Items:</p>
                            <div className="space-y-1">
                                {currentOrder.items?.map((item, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                        <span>{item.quantity}x {item.name}</span>
                                        <span>£{(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {currentOrder.notes && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-3">
                                <p className="text-xs font-medium text-yellow-800 mb-1">Customer Notes:</p>
                                <p className="text-sm text-yellow-700">{currentOrder.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2">
                        <Button
                            onClick={() => openNavigation(currentOrder)}
                            variant="outline"
                            className="w-full"
                        >
                            <Navigation className="h-4 w-4 mr-2" />
                            Open in Maps (Multi-Stop)
                        </Button>
                        
                        <Button
                            onClick={() => completeOrderMutation.mutate(currentOrder.id)}
                            disabled={completeOrderMutation.isPending}
                            className="w-full bg-green-600 hover:bg-green-700"
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Complete This Delivery
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Upcoming Stops */}
            {optimizedOrders.length > currentOrderIndex + 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Upcoming Stops</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {optimizedOrders.slice(currentOrderIndex + 1).map((order, idx) => (
                                <div key={order.id} className="flex items-center gap-3 p-2 border rounded-lg">
                                    <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-semibold">
                                        {currentOrderIndex + idx + 2}
                                    </div>
                                    <div className="flex-1 text-sm">
                                        <p className="font-medium">{order.restaurant_name}</p>
                                        <p className="text-xs text-gray-600">{order.delivery_address}</p>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        #{order.id.slice(-6)}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}