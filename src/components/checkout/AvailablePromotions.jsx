import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Gift, Lock, Check } from 'lucide-react';
import { isWithinInterval } from 'date-fns';

export default function AvailablePromotions({ restaurantId, subtotal, onPromotionApply, appliedPromotions = [] }) {
    const [availablePromotions, setAvailablePromotions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!restaurantId) {
            setLoading(false);
            return;
        }

        const fetchPromotions = async () => {
            try {
                // Fetch all active promotions for this restaurant
                const promotions = await base44.entities.Promotion.filter({
                    restaurant_id: restaurantId,
                    is_active: true
                });

                // Filter to only those with minimum_order conditions (auto-apply promotions)
                const autoPromotions = promotions.filter(p => {
                    // Check if promotion is currently active (within date range)
                    const now = new Date();
                    const start = new Date(p.start_date);
                    const end = new Date(p.end_date);
                    
                    if (!isWithinInterval(now, { start, end })) return false;

                    // Only include promotions with minimum order conditions
                    return p.condition_type === 'minimum_order' && p.minimum_order > 0;
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

    // Auto-apply promotions when thresholds are met
    useEffect(() => {
        const autoApply = async () => {
            for (const promo of availablePromotions) {
                // Skip if already applied
                if (appliedPromotions.find(p => p.id === promo.id)) continue;

                // Check if minimum order is met
                if (subtotal >= promo.minimum_order) {
                    // Check usage limit
                    if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
                        continue;
                    }

                    // Apply promotion
                    let discount = 0;
                    if (promo.promotion_type === 'percentage_off') {
                        discount = (subtotal * promo.discount_value) / 100;
                    } else if (promo.promotion_type === 'fixed_amount_off') {
                        discount = promo.discount_value;
                    } else if (promo.promotion_type === 'free_delivery') {
                        discount = 2.99; // Default delivery fee
                    }

                    const promoWithDiscount = { ...promo, discount };
                    onPromotionApply(prev => {
                        // Avoid duplicates
                        if (prev.find(p => p.id === promo.id)) return prev;
                        return [...prev, promoWithDiscount];
                    });
                }
            }
        };

        autoApply();
    }, [subtotal, availablePromotions, appliedPromotions]);

    if (loading || availablePromotions.length === 0) return null;

    // Filter to show only promotions not yet applied
    const unappliedPromotions = availablePromotions.filter(
        p => !appliedPromotions.find(ap => ap.id === p.id)
    );

    if (unappliedPromotions.length === 0) return null;

    return (
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
            <div className="p-4 space-y-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Gift className="h-5 w-5 text-purple-600" />
                    Available Promotions
                </h3>

                <div className="space-y-2">
                    {unappliedPromotions.map((promo) => {
                        const amountLeft = Math.max(0, promo.minimum_order - subtotal);
                        const isQualified = subtotal >= promo.minimum_order;
                        const progress = Math.min(100, (subtotal / promo.minimum_order) * 100);

                        let discountText = '';
                        if (promo.promotion_type === 'percentage_off') {
                            discountText = `${promo.discount_value}% OFF`;
                        } else if (promo.promotion_type === 'fixed_amount_off') {
                            discountText = `£${promo.discount_value} OFF`;
                        } else if (promo.promotion_type === 'free_delivery') {
                            discountText = 'FREE DELIVERY';
                        }

                        return (
                            <div 
                                key={promo.id}
                                className={`p-3 rounded-lg border-2 transition-all ${
                                    isQualified
                                        ? 'bg-green-50 border-green-300'
                                        : 'bg-white border-purple-200'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            {isQualified ? (
                                                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                                            ) : (
                                                <Lock className="h-4 w-4 text-purple-600 flex-shrink-0" />
                                            )}
                                            <div>
                                                <p className="font-semibold text-sm">
                                                    {promo.name}
                                                </p>
                                                <p className="text-xs text-gray-600">
                                                    {promo.condition_text || `Spend £${promo.minimum_order}`}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="mt-2">
                                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className={`h-full transition-all ${
                                                        isQualified
                                                            ? 'bg-green-500'
                                                            : 'bg-purple-500'
                                                    }`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center mt-1">
                                                <span className="text-xs text-gray-600">
                                                    £{subtotal.toFixed(2)} / £{promo.minimum_order.toFixed(2)}
                                                </span>
                                                {isQualified ? (
                                                    <span className="text-xs font-semibold text-green-600">
                                                        ✓ Unlocked
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-semibold text-purple-600">
                                                        £{amountLeft.toFixed(2)} to go
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Discount Badge */}
                                    <div className={`px-2 py-1 rounded-lg text-center flex-shrink-0 ${
                                        isQualified
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-purple-100 text-purple-700'
                                    }`}>
                                        <p className="text-xs font-bold">
                                            {discountText}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}