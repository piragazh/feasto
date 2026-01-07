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
        <div className="mb-6">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl p-4 shadow-lg">
                <div className="flex items-center gap-2 mb-3">
                    <Tag className="h-5 w-5" />
                    <h3 className="font-bold text-lg">Active Promotions</h3>
                </div>
                <div className="space-y-2">
                    {promotions.map((promo) => {
                        const Icon = iconMap[promo.promotion_type] || Tag;
                        return (
                            <motion.div
                                key={promo.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="bg-white/20 backdrop-blur-sm rounded-lg p-3"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 bg-white/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-semibold">{promo.name}</h4>
                                            {promo.promotion_code && (
                                                <Badge className="bg-white text-orange-600 font-mono font-bold">
                                                    {promo.promotion_code}
                                                </Badge>
                                            )}
                                        </div>
                                        {promo.description && (
                                            <p className="text-sm text-white/90">{promo.description}</p>
                                        )}
                                        <p className="text-sm text-white/80 mt-1">
                                            {promo.promotion_type === 'percentage_off' && 
                                                `Get ${promo.discount_value}% off your order`}
                                            {promo.promotion_type === 'fixed_amount_off' && 
                                                `Save £${promo.discount_value.toFixed(2)} on your order`}
                                            {promo.promotion_type === 'free_delivery' && 
                                                'Free delivery on this order'}
                                            {promo.promotion_type === 'buy_one_get_one' && 
                                                'Buy one get one free'}
                                            {promo.minimum_order > 0 && 
                                                ` • Min order £${promo.minimum_order.toFixed(2)}`}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}