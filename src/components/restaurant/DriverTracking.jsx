import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { MapPin, Navigation, Phone, Bike, Car, Zap } from 'lucide-react';
import { format } from 'date-fns';
import 'leaflet/dist/leaflet.css';

export default function DriverTracking({ restaurantId }) {
    const { data: activeDeliveries = [] } = useQuery({
        queryKey: ['active-deliveries', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: 'out_for_delivery'
        }),
        refetchInterval: 3000,
    });

    const { data: drivers = [] } = useQuery({
        queryKey: ['drivers-status'],
        queryFn: () => base44.entities.Driver.list(),
        refetchInterval: 5000,
    });

    const activeDrivers = drivers.filter(d => d.current_order_id && 
        activeDeliveries.some(order => order.id === d.current_order_id)
    );

    const vehicleIcons = {
        bike: Bike,
        scooter: Zap,
        car: Car
    };

    return (
        <div className="space-y-6">
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
                        <div className="h-96 rounded-lg overflow-hidden border mb-4">
                            <MapContainer 
                                center={activeDeliveries[0]?.driver_location ? 
                                    [activeDeliveries[0].driver_location.lat, activeDeliveries[0].driver_location.lng] : 
                                    [40.7589, -73.9851]
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
                    )}

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
                                        <div className="text-right">
                                            <Badge className="bg-orange-100 text-orange-700">
                                                En Route
                                            </Badge>
                                            {driver?.phone && (
                                                <a href={`tel:${driver.phone}`} className="text-xs text-blue-600 block mt-2">
                                                    <Phone className="h-3 w-3 inline mr-1" />
                                                    Call Driver
                                                </a>
                                            )}
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
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Driver Fleet Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">
                                {drivers.filter(d => d.is_available).length}
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
                </CardContent>
            </Card>
        </div>
    );
}