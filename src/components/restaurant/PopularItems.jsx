import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp } from 'lucide-react';
import MenuItemCard from './MenuItemCard';
import { Skeleton } from "@/components/ui/skeleton";

export default function PopularItems({ restaurantId, onItemClick }) {
    const { data: orders = [] } = useQuery({
        queryKey: ['restaurant-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: 'delivered'
        }, '-created_date', 100),
        enabled: !!restaurantId,
    });

    const { data: menuItems = [], isLoading } = useQuery({
        queryKey: ['menuItems', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    // Calculate item popularity based on order data
    const itemPopularity = React.useMemo(() => {
        const counts = {};
        orders.forEach(order => {
            order.items?.forEach(item => {
                const itemId = item.menu_item_id;
                counts[itemId] = (counts[itemId] || 0) + item.quantity;
            });
        });
        return counts;
    }, [orders]);

    // Get top 6 popular items
    const popularItems = React.useMemo(() => {
        return menuItems
            .map(item => ({
                ...item,
                orderCount: itemPopularity[item.id] || 0
            }))
            .filter(item => item.orderCount > 0)
            .sort((a, b) => b.orderCount - a.orderCount)
            .slice(0, 6);
    }, [menuItems, itemPopularity]);

    if (isLoading) {
        return (
            <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-orange-500" />
                    Popular Items
                </h2>
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (popularItems.length === 0) return null;

    return (
        <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-orange-500" />
                Popular Items
            </h2>
            <div className="space-y-4">
                {popularItems.map((item, index) => (
                    <div key={item.id} className="relative">
                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-lg">
                            {index + 1}
                        </div>
                        <MenuItemCard item={item} onAddToCart={onItemClick} />
                    </div>
                ))}
            </div>
        </div>
    );
}