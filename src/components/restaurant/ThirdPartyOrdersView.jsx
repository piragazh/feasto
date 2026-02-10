import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from 'lucide-react';

export default function ThirdPartyOrdersView({ restaurantId }) {
    const { data: thirdPartyOrders = [], isLoading } = useQuery({
        queryKey: ['third-party-orders', restaurantId],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({
                restaurant_id: restaurantId,
                third_party_platform: { $exists: true }
            });
            return orders || [];
        },
        enabled: !!restaurantId,
        refetchInterval: 30000 // Refetch every 30 seconds
    });

    const platformIcons = {
        uber_eats: '🚗',
        deliveroo: '🚲',
        just_eat: '🍽️'
    };

    const platformColors = {
        uber_eats: 'bg-black text-white',
        deliveroo: 'bg-green-600 text-white',
        just_eat: 'bg-orange-500 text-white'
    };

    if (isLoading) {
        return <div className="text-gray-500">Loading third-party orders...</div>;
    }

    if (thirdPartyOrders.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No third-party orders yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {thirdPartyOrders.map(order => (
                <Card key={order.id} className="border-l-4 border-l-orange-500">
                    <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-2xl w-8 h-8 rounded flex items-center justify-center ${platformColors[order.third_party_platform]}`}>
                                        {platformIcons[order.third_party_platform]}
                                    </span>
                                    <div>
                                        <p className="font-semibold text-sm">
                                            {order.third_party_order_id || `Order #${order.id.slice(0, 8)}`}
                                        </p>
                                        <Badge variant="outline" className="text-xs">
                                            {order.third_party_platform.replace('_', ' ').toUpperCase()}
                                        </Badge>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600">
                                    {order.items?.length || 0} items • £{order.total?.toFixed(2) || '0.00'}
                                </p>
                            </div>
                            <Badge variant="secondary">{order.status}</Badge>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}