import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MapPin, Clock, Phone, Package, CheckCircle, Loader2, Star } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { format } from 'date-fns';
import RateDriverDialog from '@/components/driver/RateDriverDialog';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const statusConfig = {
    pending: { label: 'Order Placed', icon: Clock, color: 'bg-yellow-100 text-yellow-700', progress: 20 },
    confirmed: { label: 'Confirmed', icon: CheckCircle, color: 'bg-blue-100 text-blue-700', progress: 40 },
    preparing: { label: 'Preparing', icon: Package, color: 'bg-purple-100 text-purple-700', progress: 60 },
    out_for_delivery: { label: 'Out for Delivery', icon: MapPin, color: 'bg-orange-100 text-orange-700', progress: 80 },
    delivered: { label: 'Delivered', icon: CheckCircle, color: 'bg-green-100 text-green-700', progress: 100 },
    cancelled: { label: 'Cancelled', icon: Clock, color: 'bg-red-100 text-red-700', progress: 0 },
};

export default function TrackOrder() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');
    const [showRatingDialog, setShowRatingDialog] = useState(false);
    const [driverLocation, setDriverLocation] = useState(null);

    const { data: order, isLoading } = useQuery({
        queryKey: ['track-order', orderId],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({ id: orderId });
            return orders[0];
        },
        enabled: !!orderId,
        refetchInterval: 3000, // Update every 3 seconds
    });

    useEffect(() => {
        // Simulate driver location updates when order is out for delivery
        if (order?.status === 'out_for_delivery') {
            simulateDriverMovement();
        }
    }, [order?.status]);

    const simulateDriverMovement = () => {
        // In a real app, this would come from a GPS tracking API
        // For demo purposes, we'll simulate movement near a fixed location
        const baseLocation = [40.7589, -73.9851]; // Example: Times Square, NYC
        const interval = setInterval(() => {
            const randomOffset = () => (Math.random() - 0.5) * 0.01;
            setDriverLocation([
                baseLocation[0] + randomOffset(),
                baseLocation[1] + randomOffset()
            ]);
        }, 5000);

        return () => clearInterval(interval);
    };

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant-for-tracking', order?.restaurant_id],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: order.restaurant_id });
            return restaurants[0];
        },
        enabled: !!order?.restaurant_id,
    });

    const { data: driverRatings = [] } = useQuery({
        queryKey: ['driver-ratings', order?.driver_id, order?.id],
        queryFn: async () => {
            const user = await base44.auth.me();
            return base44.entities.DriverRating.filter({ 
                order_id: order.id,
                created_by: user.email
            });
        },
        enabled: !!order?.driver_id && order?.status === 'delivered',
    });

    const hasRatedDriver = driverRatings.length > 0;

    if (!orderId) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="text-center py-8">
                        <p className="text-gray-600 mb-4">No order ID provided</p>
                        <Link to={createPageUrl('Orders')}>
                            <Button>View My Orders</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="max-w-4xl mx-auto px-4 py-8">
                    <Skeleton className="h-12 w-48 mb-6" />
                    <Skeleton className="h-64 w-full mb-6" />
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="text-center py-8">
                        <p className="text-gray-600 mb-4">Order not found</p>
                        <Link to={createPageUrl('Orders')}>
                            <Button>View My Orders</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const status = statusConfig[order.status] || statusConfig.pending;
    const StatusIcon = status.icon;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <Link to={createPageUrl('Orders')}>
                        <Button size="icon" variant="ghost" className="rounded-full">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Track Order</h1>
                        <p className="text-sm text-gray-500">Order #{order.id.slice(-8)}</p>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                {/* Order Status Progress */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-center mb-6">
                            <div className={`w-20 h-20 rounded-full ${status.color} flex items-center justify-center`}>
                                <StatusIcon className="h-10 w-10" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
                            {status.label}
                        </h2>
                        {order.estimated_delivery && order.status !== 'delivered' && order.status !== 'cancelled' && (
                            <p className="text-center text-gray-600 mb-4">
                                <Clock className="h-4 w-4 inline mr-1" />
                                Estimated delivery: {order.estimated_delivery}
                            </p>
                        )}
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
                            <div 
                                className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${status.progress}%` }}
                            />
                        </div>

                        {/* Status Timeline */}
                        <div className="space-y-3">
                            {order.status_history?.map((entry, idx) => {
                                const stepStatus = statusConfig[entry.status];
                                const StepIcon = stepStatus?.icon || Clock;
                                return (
                                    <div key={idx} className="flex items-start gap-3">
                                        <div className="mt-1">
                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-900">
                                                {stepStatus?.label || entry.status}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {format(new Date(entry.timestamp), 'MMM d, h:mm a')}
                                            </p>
                                            {entry.note && (
                                                <p className="text-sm text-gray-600 mt-1">{entry.note}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {order.status === 'cancelled' && order.rejection_reason && (
                            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm font-semibold text-red-900 mb-1">Order Cancelled</p>
                                <p className="text-sm text-red-700">{order.rejection_reason}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Map - Show when out for delivery */}
                {order.status === 'out_for_delivery' && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-orange-500" />
                                Delivery Location
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-64 rounded-lg overflow-hidden border">
                                {driverLocation ? (
                                    <MapContainer 
                                        center={driverLocation} 
                                        zoom={13} 
                                        style={{ height: '100%', width: '100%' }}
                                    >
                                        <TileLayer
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <Marker position={driverLocation}>
                                            <Popup>Delivery driver is here</Popup>
                                        </Marker>
                                        <Circle 
                                            center={driverLocation} 
                                            radius={200} 
                                            pathOptions={{ color: 'orange', fillColor: 'orange', fillOpacity: 0.2 }}
                                        />
                                    </MapContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center bg-gray-100">
                                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                🚗 Your order is on the way! The driver is nearby.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Restaurant Info */}
                {restaurant && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Restaurant Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-start gap-4">
                                {restaurant.image_url && (
                                    <img 
                                        src={restaurant.image_url} 
                                        alt={restaurant.name}
                                        className="w-16 h-16 rounded-lg object-cover"
                                    />
                                )}
                                <div className="flex-1">
                                    <h3 className="font-semibold text-lg">{restaurant.name}</h3>
                                    {restaurant.address && (
                                        <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                            <MapPin className="h-4 w-4" />
                                            {restaurant.address}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Order Details */}
                <Card>
                    <CardHeader>
                        <CardTitle>Order Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <h4 className="font-semibold text-gray-700 mb-2">Items</h4>
                            {order.items?.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-sm py-1">
                                    <span className="text-gray-600">
                                        {item.quantity}x {item.name}
                                    </span>
                                    <span className="text-gray-900">
                                        £{(item.price * item.quantity).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="border-t pt-3 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Subtotal</span>
                                <span className="text-gray-900">£{order.subtotal?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Delivery Fee</span>
                                <span className="text-gray-900">£{order.delivery_fee?.toFixed(2)}</span>
                            </div>
                            {order.discount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span>Discount</span>
                                    <span>-£{order.discount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                <span>Total</span>
                                <span>£{order.total?.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="border-t pt-3">
                            <h4 className="font-semibold text-gray-700 mb-2">Delivery Information</h4>
                            <div className="space-y-1 text-sm">
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                                    <span className="text-gray-600">{order.delivery_address}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-gray-500" />
                                    <span className="text-gray-600">{order.phone}</span>
                                </div>
                            </div>
                            {order.notes && (
                                <div className="mt-2 bg-gray-50 rounded p-2">
                                    <p className="text-xs text-gray-500 mb-1">Special Instructions:</p>
                                    <p className="text-sm text-gray-700">{order.notes}</p>
                                </div>
                            )}
                        </div>

                        {order.status === 'delivered' && order.driver_id && !hasRatedDriver && (
                            <Button 
                                onClick={() => setShowRatingDialog(true)}
                                className="w-full bg-orange-500 hover:bg-orange-600 mt-4"
                            >
                                <Star className="h-4 w-4 mr-2" />
                                Rate Your Driver
                            </Button>
                        )}
                    </CardContent>
                </Card>

                <RateDriverDialog
                    open={showRatingDialog}
                    onClose={() => setShowRatingDialog(false)}
                    order={order}
                    ratedBy="customer"
                />
            </div>
        </div>
    );
}