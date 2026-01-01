import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, MapPin, Users, CheckCircle, Navigation } from 'lucide-react';
import { toast } from 'sonner';

export default function OrderBatching({ restaurantId }) {
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('');
    const queryClient = useQueryClient();

    const { data: preparingOrders = [], isLoading } = useQuery({
        queryKey: ['preparing-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId, 
            status: 'preparing',
            driver_id: null
        }, '-created_date'),
        refetchInterval: 5000,
    });

    const { data: availableDrivers = [] } = useQuery({
        queryKey: ['available-drivers'],
        queryFn: () => base44.entities.Driver.filter({ is_available: true }),
        refetchInterval: 5000,
    });

    const assignBatchMutation = useMutation({
        mutationFn: async ({ orderIds, driverId }) => {
            const driver = availableDrivers.find(d => d.id === driverId);
            
            // Update all orders with driver and status
            const promises = orderIds.map(orderId => 
                base44.entities.Order.update(orderId, {
                    driver_id: driverId,
                    status: 'out_for_delivery',
                    status_history: [
                        ...(preparingOrders.find(o => o.id === orderId)?.status_history || []),
                        {
                            status: 'out_for_delivery',
                            timestamp: new Date().toISOString(),
                            note: `Batch assigned to driver ${driver.full_name}`
                        }
                    ],
                    estimated_delivery: new Date(Date.now() + 30 * 60000).toISOString()
                })
            );
            
            await Promise.all(promises);
            
            // Update driver status
            await base44.entities.Driver.update(driverId, {
                is_available: false,
                current_order_id: orderIds[0] // Primary order
            });
            
            return { orderIds, driverId };
        },
        onSuccess: ({ orderIds }) => {
            queryClient.invalidateQueries(['preparing-orders']);
            queryClient.invalidateQueries(['available-drivers']);
            toast.success(`Batch of ${orderIds.length} orders assigned successfully!`);
            setSelectedOrders([]);
            setSelectedDriver('');
        },
        onError: () => {
            toast.error('Failed to assign batch');
        }
    });

    const calculateDistance = (coord1, coord2) => {
        if (!coord1 || !coord2) return 0;
        const R = 6371; // km
        const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
        const dLon = (coord2.lng - coord1.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(coord1.lat * Math.PI / 180) * 
                  Math.cos(coord2.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return (R * c).toFixed(1);
    };

    const findNearbyOrders = (baseOrderId) => {
        const baseOrder = preparingOrders.find(o => o.id === baseOrderId);
        if (!baseOrder?.delivery_coordinates) return [];

        return preparingOrders
            .filter(order => {
                if (order.id === baseOrderId || !order.delivery_coordinates) return false;
                const distance = calculateDistance(
                    baseOrder.delivery_coordinates,
                    order.delivery_coordinates
                );
                return parseFloat(distance) <= 2; // Within 2km
            })
            .map(order => order.id);
    };

    const handleToggleOrder = (orderId) => {
        if (selectedOrders.includes(orderId)) {
            setSelectedOrders(selectedOrders.filter(id => id !== orderId));
        } else {
            setSelectedOrders([...selectedOrders, orderId]);
        }
    };

    const handleSmartBatch = (orderId) => {
        const nearby = findNearbyOrders(orderId);
        setSelectedOrders([orderId, ...nearby]);
        toast.success(`Found ${nearby.length} nearby orders within 2km`);
    };

    const handleAssignBatch = () => {
        if (selectedOrders.length === 0) {
            toast.error('Please select at least one order');
            return;
        }
        if (!selectedDriver) {
            toast.error('Please select a driver');
            return;
        }
        assignBatchMutation.mutate({
            orderIds: selectedOrders,
            driverId: selectedDriver
        });
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-orange-500" />
                            Order Batching
                        </CardTitle>
                        {selectedOrders.length > 0 && (
                            <Badge className="bg-orange-500">
                                {selectedOrders.length} orders selected
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {selectedOrders.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <p className="font-semibold text-orange-900">
                                        Assign Batch to Driver
                                    </p>
                                    <p className="text-sm text-orange-700">
                                        {selectedOrders.length} orders ready for batch delivery
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Select driver..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableDrivers.map(driver => (
                                            <SelectItem key={driver.id} value={driver.id}>
                                                {driver.full_name} ({driver.vehicle_type})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    onClick={handleAssignBatch}
                                    disabled={!selectedDriver || assignBatchMutation.isPending}
                                    className="bg-orange-600 hover:bg-orange-700"
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Assign Batch
                                </Button>
                            </div>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading orders...</div>
                    ) : preparingOrders.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No orders ready for batching
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {preparingOrders.map((order) => (
                                <div
                                    key={order.id}
                                    className={`border rounded-lg p-4 ${
                                        selectedOrders.includes(order.id)
                                            ? 'bg-orange-50 border-orange-300'
                                            : 'bg-white'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            checked={selectedOrders.includes(order.id)}
                                            onCheckedChange={() => handleToggleOrder(order.id)}
                                            className="mt-1"
                                        />
                                        <div className="flex-1">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h3 className="font-semibold">
                                                        Order #{order.id.slice(-6)}
                                                    </h3>
                                                    <p className="text-sm text-gray-600">
                                                        {order.phone}
                                                    </p>
                                                </div>
                                                <Badge variant="outline">
                                                    £{order.total.toFixed(2)}
                                                </Badge>
                                            </div>

                                            <div className="flex items-start gap-2 text-sm text-gray-600 mb-3">
                                                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                                                <span className="line-clamp-1">
                                                    {order.delivery_address}
                                                </span>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleSmartBatch(order.id)}
                                                >
                                                    <Navigation className="h-3 w-3 mr-1" />
                                                    Smart Batch
                                                </Button>
                                                {selectedOrders.includes(order.id) && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleToggleOrder(order.id)}
                                                        className="text-red-600"
                                                    >
                                                        Remove
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {availableDrivers.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="h-4 w-4 text-blue-500" />
                            Available Drivers ({availableDrivers.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {availableDrivers.map(driver => (
                                <div
                                    key={driver.id}
                                    className="flex items-center justify-between border rounded p-3"
                                >
                                    <div>
                                        <p className="font-medium">{driver.full_name}</p>
                                        <p className="text-sm text-gray-500 capitalize">
                                            {driver.vehicle_type} • {driver.total_deliveries || 0} deliveries
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="bg-green-50 text-green-700">
                                        Available
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