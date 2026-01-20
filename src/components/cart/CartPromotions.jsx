import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Gift, Lock } from 'lucide-react';
import { isWithinInterval } from 'date-fns';

export default function CartPromotions({ restaurantId, subtotal }) {
    const [availablePromotions, setAvailablePromotions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!restaurantId) {
            setLoading(false);
            return;
        }

        const fetchPromotions = async () => {
            try {
                const promotions = await base44.entities.Promotion.filter({
                    restaurant_id: restaurantId,
                    is_active: true
                });

                // Filter to only those with minimum_order conditions
                const autoPromotions = promotions.filter(p => {
                    const now = new Date();
                    const start = new Date(p.start_date);
                    const end = new Date(p.end_date);
                    
                    return isWithinInterval(now, { start, end }) && 
                           p.condition_type === 'minimum_order' && 
                           p.minimum_order > 0;
                });

                setAvailablePromotions(autoPromotions);
            } catch (error) {
                console.error('Failed to fetch promotions:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPromotions();
    }, [restaurantId]);

    if (loading || availablePromotions.length === 0) return null;

    // Find the next unlocked promotion (or closest one)
    const sortedPromos = [...availablePromotions].sort((a, b) => a.minimum_order - b.minimum_order);
    const nextPromo = sortedPromos.find(p => subtotal < p.minimum_order);
    const unlockedPromos = sortedPromos.filter(p => subtotal >= p.minimum_order);

    return (
        <div className="px-6 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b space-y-2">
            {/* Show all unlocked promotions */}
            {unlockedPromos.length > 0 && (
                <div className="space-y-1.5">
                    {unlockedPromos.map((promo) => {
                        let discountText = '';
                        if (promo.promotion_type === 'percentage_off') {
                            discountText = `${promo.discount_value}% OFF`;
                        } else if (promo.promotion_type === 'fixed_amount_off') {
                            discountText = `£${promo.discount_value} OFF`;
                        } else if (promo.promotion_type === 'free_delivery') {
                            discountText = 'FREE DELIVERY';
                        }

                        const discount = promo.promotion_type === 'percentage_off' 
                            ? (subtotal * promo.discount_value) / 100 
                            : promo.promotion_type === 'fixed_amount_off'
                            ? promo.discount_value
                            : 2.99;

                        return (
                            <div key={promo.id} className="flex items-center justify-between bg-white/80 rounded-lg p-2">
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs">✓</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-gray-700 truncate">{promo.name}</p>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-green-600 ml-2 whitespace-nowrap">
                                    You save £{discount.toFixed(2)}!
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Show next promotion to unlock */}
            {nextPromo && (
                <div>
                    <div className="flex items-center justify-between bg-white/80 rounded-lg p-2">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                                <Lock className="h-3 w-3 text-gray-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-700 truncate">{nextPromo.name}</p>
                                <p className="text-[10px] text-gray-500">
                                    Add £{Math.max(0, nextPromo.minimum_order - subtotal).toFixed(2)} more
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="mt-1.5 bg-white rounded-full h-1.5 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all"
                            style={{ width: `${Math.min(100, (subtotal / nextPromo.minimum_order) * 100)}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}