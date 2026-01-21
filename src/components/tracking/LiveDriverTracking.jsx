import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapContainer, TileLayer, Marker, Polyline, Circle } from 'react-leaflet';
import { Navigation, MapPin, Clock, User, Phone, Bike, Star, Zap } from 'lucide-react';
import { useRealtimeETA } from '@/components/tracking/ETACalculator';
import 'leaflet/dist/leaflet.css';

export default function LiveDriverTracking({ order }) {
    const [lastNotified, setLastNotified] = useState({});

    // Fetch driver data and live location
    const { data: driver } = useQuery({
        queryKey: ['driver-tracking', order.driver_id],
        queryFn: async () => {
            if (!order.driver_id) return null;
            const drivers = await base44.entities.Driver.filter({ id: order.driver_id });
            return drivers[0] || null;
        },
        enabled: !!order.driver_id && order.status === 'out_for_delivery',
        refetchInterval: 5000, // Update every 5 seconds
    });

    // Fetch live order updates (includes driver location)
    const { data: liveOrder } = useQuery({
        queryKey: ['live-order', order.id],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({ id: order.id });
            return orders[0] || order;
        },
        enabled: order.status === 'out_for_delivery',
        refetchInterval: 5000,
    });

    const driverLocation = liveOrder?.driver_location || driver?.current_location;
    const deliveryCoords = order.delivery_coordinates;

    // Real-time ETA with traffic awareness
    const { eta, distance, loading: etaLoading } = useRealtimeETA(
        driverLocation,
        deliveryCoords,
        order.id
    );

    // Calculate distance and check for proximity notifications
    useEffect(() => {
        if (driverLocation && deliveryCoords && deliveryCoords.lat && distance) {

            // Notify when driver is within 1km (nearby)
            if (distance <= 1 && !lastNotified.nearby) {
                setLastNotified(prev => ({ ...prev, nearby: true }));
                
                // Send push notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Driver is Nearby! 🚴', {
                        body: `Your delivery driver is less than 1km away from your location.`,
                        icon: '/icon-192.png',
                        tag: 'driver-nearby'
                    });
                }
            }

            // Notify when driver is within 500m (arriving soon)
            if (distance <= 0.5 && !lastNotified.arriving) {
                setLastNotified(prev => ({ ...prev, arriving: true }));
                
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Driver Arriving Soon! 📍', {
                        body: `Your driver will arrive in approximately ${Math.ceil(distance * 3)} minutes.`,
                        icon: '/icon-192.png',
                        tag: 'driver-arriving'
                    });
                }
            }
        }
    }, [driverLocation, deliveryCoords, lastNotified, distance]);

    if (!driver || !driverLocation || !deliveryCoords || !deliveryCoords.lat) {
        return (
            <Card>
                <CardContent className="text-center py-8">
                    <Navigation className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 text-sm">
                        Driver tracking will appear once your order is out for delivery
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Navigation className="h-5 w-5 text-orange-500 animate-pulse" />
                        <span>Live Tracking</span>
                    </div>
                    <Badge className="bg-green-500 text-white">
                        <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
                        Live
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Driver Info */}
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                    <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
                        <Bike className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                        <p className="font-semibold text-gray-900">{driver.full_name}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Star className="h-3 w-3 fill-orange-400 text-orange-400" />
                            <span>{driver.rating?.toFixed(1) || '5.0'}</span>
                            <span>•</span>
                            <span>{driver.total_deliveries || 0} deliveries</span>
                        </div>
                    </div>
                    {driver.phone && (
                        <a 
                            href={`tel:${driver.phone}`}
                            className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-orange-300 hover:bg-orange-50 transition-colors"
                        >
                            <Phone className="h-4 w-4 text-orange-600" />
                        </a>
                    )}
                </div>

                {/* ETA Display */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <div className="flex items-center gap-2 text-blue-700 mb-1">
                            <Clock className="h-4 w-4" />
                            <span className="text-xs font-medium">Live ETA</span>
                            {etaLoading && <Zap className="h-3 w-3 animate-pulse" />}
                        </div>
                        <p className="text-lg font-bold text-blue-900">
                            {eta ? `${eta} min${eta !== 1 ? 's' : ''}` : 'Calculating...'}
                        </p>
                        <p className="text-[10px] text-blue-600 mt-0.5">Traffic-aware</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <div className="flex items-center gap-2 text-green-700 mb-1">
                            <MapPin className="h-4 w-4" />
                            <span className="text-xs font-medium">Distance</span>
                        </div>
                        <p className="text-lg font-bold text-green-900">
                            {distance ? `${distance} km` : 'Calculating...'}
                        </p>
                        <p className="text-[10px] text-green-600 mt-0.5">Real-time route</p>
                    </div>
                </div>

                {/* Live Map */}
                <div className="h-80 rounded-lg overflow-hidden border-2 border-gray-200">
                    <MapContainer 
                        center={[driverLocation.lat, driverLocation.lng]} 
                        zoom={14} 
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer 
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                        
                        {/* Driver location with animation */}
                        <Marker position={[driverLocation.lat, driverLocation.lng]}>
                        </Marker>
                        <Circle
                            center={[driverLocation.lat, driverLocation.lng]}
                            radius={100}
                            pathOptions={{ color: 'orange', fillColor: 'orange', fillOpacity: 0.2 }}
                        />
                        
                        {/* Delivery destination */}
                        <Marker position={[deliveryCoords.lat, deliveryCoords.lng]}>
                        </Marker>
                        <Circle
                            center={[deliveryCoords.lat, deliveryCoords.lng]}
                            radius={50}
                            pathOptions={{ color: 'green', fillColor: 'green', fillOpacity: 0.2 }}
                        />
                        
                        {/* Route line */}
                        <Polyline 
                            positions={[
                                [driverLocation.lat, driverLocation.lng],
                                [deliveryCoords.lat, deliveryCoords.lng]
                            ]} 
                            pathOptions={{ 
                                color: 'orange',
                                weight: 3,
                                dashArray: '10, 10'
                            }}
                        />
                    </MapContainer>
                </div>

                {/* Status indicator */}
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Location updates every 5 seconds</span>
                </div>

                {/* Privacy note */}
                <p className="text-xs text-center text-gray-500 italic">
                    Driver location is only shared during active delivery for your order
                </p>
            </CardContent>
        </Card>
    );
}