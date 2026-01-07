import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tag, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isWithinInterval } from 'date-fns';

export default function PromotionCodeInput({ restaurantId, subtotal, onPromotionApply }) {
    const [code, setCode] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [appliedPromotion, setAppliedPromotion] = useState(null);

    const applyPromotionCode = async () => {
        if (!code.trim()) return;

        setIsChecking(true);
        try {
            // Find promotion by code
            const promotions = await base44.entities.Promotion.filter({ 
                restaurant_id: restaurantId,
                promotion_code: code.toUpperCase(),
                is_active: true
            });

            if (promotions.length === 0) {
                toast.error('Invalid promotion code');
                setIsChecking(false);
                return;
            }

            const promotion = promotions[0];

            // Validate promotion is currently active
            const now = new Date();
            const start = new Date(promotion.start_date);
            const end = new Date(promotion.end_date);
            
            if (!isWithinInterval(now, { start, end })) {
                toast.error('This promotion has expired');
                setIsChecking(false);
                return;
            }

            // Check usage limit
            if (promotion.usage_limit && promotion.usage_count >= promotion.usage_limit) {
                toast.error('This promotion has reached its usage limit');
                setIsChecking(false);
                return;
            }

            // Check minimum order requirement
            if (promotion.minimum_order && subtotal < promotion.minimum_order) {
                toast.error(`Minimum order of £${promotion.minimum_order.toFixed(2)} required`);
                setIsChecking(false);
                return;
            }

            // Calculate discount
            let discount = 0;
            if (promotion.promotion_type === 'percentage_off') {
                discount = (subtotal * promotion.discount_value) / 100;
            } else if (promotion.promotion_type === 'fixed_amount_off') {
                discount = promotion.discount_value;
            } else if (promotion.promotion_type === 'free_delivery') {
                discount = 0; // Handled separately in checkout
            }

            setAppliedPromotion({ ...promotion, calculatedDiscount: discount });
            onPromotionApply({ ...promotion, discount });
            toast.success(`Promotion "${promotion.name}" applied!`);
            setCode('');
        } catch (error) {
            toast.error('Failed to apply promotion');
        }
        setIsChecking(false);
    };

    const removePromotion = () => {
        setAppliedPromotion(null);
        onPromotionApply(null);
        toast.success('Promotion removed');
    };

    return (
        <div className="space-y-3">
            {appliedPromotion ? (
                <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-orange-600" />
                        <div>
                            <p className="font-semibold text-orange-900">{appliedPromotion.name}</p>
                            <p className="text-xs text-orange-700">
                                {appliedPromotion.promotion_type === 'percentage_off' && 
                                    `${appliedPromotion.discount_value}% off`}
                                {appliedPromotion.promotion_type === 'fixed_amount_off' && 
                                    `£${appliedPromotion.discount_value.toFixed(2)} off`}
                                {appliedPromotion.promotion_type === 'free_delivery' && 
                                    'Free delivery'}
                                {appliedPromotion.promotion_type === 'buy_one_get_one' && 
                                    'Buy one get one free'}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={removePromotion}
                        className="h-8 w-8"
                    >
                        <X className="h-4 w-4 text-orange-600" />
                    </Button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <Input
                        placeholder="Enter promo code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && applyPromotionCode()}
                        className="uppercase"
                    />
                    <Button
                        onClick={applyPromotionCode}
                        disabled={!code.trim() || isChecking}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        {isChecking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            'Apply'
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
}