import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tag, Percent, Gift, Truck, Zap, ShoppingBag, Clock } from 'lucide-react';
import { isWithinInterval, formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';

const PROMO_STYLES = {
    percentage_off:   { bg: 'from-violet-500 to-purple-600', light: 'bg-violet-50 border-violet-200', icon: Percent,      badge: 'bg-violet-100 text-violet-700' },
    fixed_amount_off: { bg: 'from-blue-500 to-indigo-600',   light: 'bg-blue-50 border-blue-200',     icon: Tag,           badge: 'bg-blue-100 text-blue-700' },
    buy_one_get_one:  { bg: 'from-pink-500 to-rose-600',     light: 'bg-pink-50 border-pink-200',      icon: Gift,          badge: 'bg-pink-100 text-pink-700' },
    buy_two_get_one:  { bg: 'from-pink-500 to-rose-600',     light: 'bg-pink-50 border-pink-200',      icon: Gift,          badge: 'bg-pink-100 text-pink-700' },
    free_delivery:    { bg: 'from-green-500 to-emerald-600', light: 'bg-green-50 border-green-200',    icon: Truck,         badge: 'bg-green-100 text-green-700' },
    tiered_discount:  { bg: 'from-amber-500 to-orange-600',  light: 'bg-amber-50 border-amber-200',    icon: Zap,           badge: 'bg-amber-100 text-amber-700' },
    combo_deal:       { bg: 'from-orange-500 to-red-500',    light: 'bg-orange-50 border-orange-200',  icon: ShoppingBag,   badge: 'bg-orange-100 text-orange-700' },
};

const DEFAULT_STYLE = { bg: 'from-orange-500 to-red-500', light: 'bg-orange-50 border-orange-200', icon: Tag, badge: 'bg-orange-100 text-orange-700' };

function getPromoValue(promo) {
    switch (promo.promotion_type) {
        case 'percentage_off':   return `${promo.discount_value}% OFF`;
        case 'fixed_amount_off': return `£${promo.discount_value?.toFixed(2)} OFF`;
        case 'free_delivery':    return 'FREE DELIVERY';
        case 'buy_one_get_one':  return 'BUY 1 GET 1';
        case 'buy_two_get_one':  return 'BUY 2 GET 1';
        case 'tiered_discount':  return 'TIERED DEAL';
        case 'combo_deal':       return 'COMBO DEAL';
        default:                 return 'DEAL';
    }
}

export default function ActivePromotionsBanner({ restaurantId }) {
    const { data: promotions = [] } = useQuery({
        queryKey: ['active-promotions', restaurantId],
        queryFn: async () => {
            const promos = await base44.entities.Promotion.filter({ 
                restaurant_id: restaurantId,
                is_active: true 
            });
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

    return (
        <div className="mb-8">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-2 bg-orange-100 text-orange-700 rounded-full px-3 py-1">
                    <Zap className="h-4 w-4 fill-orange-500" />
                    <span className="text-sm font-bold tracking-wide uppercase">Active Deals</span>
                </div>
                <div className="flex-1 h-px bg-orange-100" />
            </div>

            {/* Promotions */}
            <div className={`grid gap-3 ${promotions.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {promotions.map((promo, index) => {
                    const style = PROMO_STYLES[promo.promotion_type] || DEFAULT_STYLE;
                    const Icon = style.icon;
                    const value = getPromoValue(promo);
                    const endsIn = formatDistanceToNow(new Date(promo.end_date), { addSuffix: true });

                    return (
                        <motion.div
                            key={promo.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.07 }}
                            className="relative overflow-hidden rounded-2xl border-2 border-orange-100 bg-white shadow-sm hover:shadow-md transition-shadow"
                        >
                            {/* Coloured left stripe */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${style.bg}`} />

                            <div className="pl-5 pr-4 py-4 flex items-center gap-4">
                                {/* Icon bubble */}
                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${style.bg} flex items-center justify-center shadow-md flex-shrink-0`}>
                                    <Icon className="h-6 w-6 text-white" />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-900 text-sm truncate">{promo.name}</p>
                                            {promo.condition_text && (
                                                <p className="text-xs text-gray-500 mt-0.5 truncate">{promo.condition_text}</p>
                                            )}
                                            {!promo.condition_text && promo.minimum_order > 0 && (
                                                <p className="text-xs text-gray-500 mt-0.5">Min. spend £{promo.minimum_order.toFixed(2)}</p>
                                            )}
                                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                {promo.promotion_code && (
                                                    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 font-mono text-xs px-2 py-0.5 rounded-md border border-gray-200">
                                                        <Tag className="h-3 w-3" />
                                                        {promo.promotion_code}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                                                    <Clock className="h-3 w-3" />
                                                    Ends {endsIn}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Value badge */}
                                        <div className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-black tracking-tight bg-gradient-to-br ${style.bg} text-white shadow-sm whitespace-nowrap`}>
                                            {value}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}