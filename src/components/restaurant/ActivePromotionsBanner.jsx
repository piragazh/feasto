import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from "@/components/ui/badge";
import { Tag, Percent, DollarSign, Gift, Truck } from 'lucide-react';
import { isWithinInterval } from 'date-fns';
import { motion } from 'framer-motion';

export default function ActivePromotionsBanner({ restaurantId }) {
    const { data: promotions = [] } = useQuery({
        queryKey: ['active-promotions', restaurantId],
        queryFn: async () => {
            const promos = await base44.entities.Promotion.filter({ 
                restaurant_id: restaurantId,
                is_active: true 
            });
            // Filter for currently active promotions
            const now = new Date();
            return promos.filter(p => {
                const start = new Date(p.start_date);
                const end = new Date(p.end_date);
                return isWithinInterval(now, { start, end }) && 
                       (!p.usage_limit || p.usage_count < p.usage_limit);
            });
        },
    });

    if (promotions.length === 0) return null;

    const iconMap = {
        percentage_off: Percent,
        fixed_amount_off: DollarSign,
        buy_one_get_one: Gift,
        free_delivery: Truck
    };

    return (
        <div className="mb-4">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg p-3 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                    <Tag className="h-4 w-4" />
                    <h3 className="font-bold text-sm">Active Promotions</h3>
                </div>
                <div className="space-y-1.5">
                    {promotions.map((promo) => {
                        const Icon = iconMap[promo.promotion_type] || Tag;
                        return (
                            <div
                                key={promo.id}
                                className="bg-white/20 backdrop-blur-sm rounded-md p-2"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm truncate">{promo.name}</span>
                                            {promo.promotion_code && (
                                                <Badge className="bg-white text-orange-600 font-mono text-xs px-1.5 py-0">
                                                    {promo.promotion_code}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-white/90 truncate">
                                            {promo.promotion_type === 'percentage_off' && 
                                                `${promo.discount_value}% off`}
                                            {promo.promotion_type === 'fixed_amount_off' && 
                                                `Save £${promo.discount_value.toFixed(2)}`}
                                            {promo.promotion_type === 'free_delivery' && 
                                                'Free delivery'}
                                            {promo.promotion_type === 'buy_one_get_one' && 
                                                'BOGO'}
                                            {promo.minimum_order > 0 && 
                                                ` • Min £${promo.minimum_order.toFixed(2)}`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}