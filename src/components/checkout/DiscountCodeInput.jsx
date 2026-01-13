import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag, Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { isWithinInterval } from 'date-fns';
import { useEffect } from 'react';

export default function DiscountCodeInput({ restaurantId, subtotal, onCouponApply, onPromotionApply }) {
    const [code, setCode] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [appliedCoupons, setAppliedCoupons] = useState([]);
    const [appliedPromotions, setAppliedPromotions] = useState([]);
    const [autoPromotions, setAutoPromotions] = useState([]);

    // Auto-apply promotions without code
    useEffect(() => {
        if (!restaurantId) return;
        
        const checkAutoPromotions = async () => {
            try {
                const promotions = await base44.entities.Promotion.filter({
                    restaurant_id: restaurantId,
                    is_active: true
                });

                const now = new Date();
                const validPromotions = promotions.filter(p => {
                    // Only promotions without codes
                    if (p.promotion_code) return false;

                    // Check date range
                    const start = new Date(p.start_date);
                    const end = new Date(p.end_date);
                    if (!isWithinInterval(now, { start, end })) return false;

                    // Check usage limit
                    if (p.usage_limit && p.usage_count >= p.usage_limit) return false;

                    // Check minimum order
                    if (p.minimum_order && subtotal < p.minimum_order) return false;

                    return true;
                });

                setAutoPromotions(validPromotions);

                // Auto-apply all valid promotions
                if (validPromotions.length > 0 && appliedPromotions.length === 0) {
                    for (const promo of validPromotions) {
                        await validatePromotion(promo, true);
                    }
                }
            } catch (error) {
                console.error('Failed to check auto promotions:', error);
            }
        };

        checkAutoPromotions();
    }, [restaurantId, subtotal]);

    const validateCode = async () => {
        if (!code.trim()) {
            toast.error('Please enter a code');
            return;
        }

        setIsValidating(true);
        const upperCode = code.toUpperCase().trim();

        try {
            // Try coupon first
            const coupons = await base44.entities.Coupon.filter({ 
                code: upperCode 
            });

            if (coupons.length > 0) {
                await validateCoupon(coupons[0]);
                setIsValidating(false);
                return;
            }

            // Try promotion code
            const promotions = await base44.entities.Promotion.filter({ 
                restaurant_id: restaurantId,
                promotion_code: upperCode,
                is_active: true
            });

            if (promotions.length > 0) {
                await validatePromotion(promotions[0]);
                setIsValidating(false);
                return;
            }

            toast.error('Invalid code');
            setIsValidating(false);

        } catch (error) {
            toast.error('Failed to validate code');
            console.error(error);
            setIsValidating(false);
        }
    };

    const validateCoupon = async (coupon) => {
        // Check if already applied
        if (appliedCoupons.find(c => c.id === coupon.id)) {
            toast.error('This coupon is already applied');
            return;
        }

        if (!coupon.is_active) {
            toast.error('This coupon is no longer active');
            return;
        }

        if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) {
            toast.error('This coupon is not valid for this restaurant');
            return;
        }

        if (coupon.minimum_order && subtotal < coupon.minimum_order) {
            toast.error(`Minimum order of £${coupon.minimum_order.toFixed(2)} required`);
            return;
        }

        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
            toast.error('This coupon has reached its usage limit');
            return;
        }

        const now = new Date();
        if (coupon.valid_from && new Date(coupon.valid_from) > now) {
            toast.error('This coupon is not yet valid');
            return;
        }

        if (coupon.valid_until && new Date(coupon.valid_until) < now) {
            toast.error('This coupon has expired');
            return;
        }

        let discount = 0;
        if (coupon.discount_type === 'percentage') {
            discount = (subtotal * coupon.discount_value) / 100;
            if (coupon.max_discount && discount > coupon.max_discount) {
                discount = coupon.max_discount;
            }
        } else {
            discount = coupon.discount_value;
        }

        const newCoupon = { ...coupon, discount };
        setAppliedCoupons(prev => [...prev, newCoupon]);
        onCouponApply([...appliedCoupons, newCoupon]);
        toast.success(`Coupon applied! You saved £${discount.toFixed(2)}`);
    };

    const validatePromotion = async (promotion, isAuto = false) => {
        // Check if already applied
        if (appliedPromotions.find(p => p.id === promotion.id)) {
            if (!isAuto) toast.error('This promotion is already applied');
            return;
        }

        const now = new Date();
        const start = new Date(promotion.start_date);
        const end = new Date(promotion.end_date);
        
        if (!isWithinInterval(now, { start, end })) {
            if (!isAuto) toast.error('This promotion has expired');
            return;
        }

        if (promotion.usage_limit && promotion.usage_count >= promotion.usage_limit) {
            if (!isAuto) toast.error('This promotion has reached its usage limit');
            return;
        }

        if (promotion.minimum_order && subtotal < promotion.minimum_order) {
            if (!isAuto) toast.error(`Minimum order of £${promotion.minimum_order.toFixed(2)} required`);
            return;
        }

        let discount = 0;
        if (promotion.promotion_type === 'percentage_off') {
            discount = (subtotal * promotion.discount_value) / 100;
        } else if (promotion.promotion_type === 'fixed_amount_off') {
            discount = promotion.discount_value;
        }

        const newPromotion = { ...promotion, discount };
        setAppliedPromotions(prev => [...prev, newPromotion]);
        onPromotionApply([...appliedPromotions, newPromotion]);
        if (!isAuto) toast.success(`Promotion "${promotion.name}" applied!`);
    };

    const removeDiscount = (type, id) => {
        if (type === 'coupon') {
            const updated = appliedCoupons.filter(c => c.id !== id);
            setAppliedCoupons(updated);
            onCouponApply(updated);
        } else {
            const updated = appliedPromotions.filter(p => p.id !== id);
            setAppliedPromotions(updated);
            onPromotionApply(updated);
        }
        toast.success('Discount removed');
    };

    const allAppliedDiscounts = [...appliedCoupons, ...appliedPromotions];

    return (
        <div className="space-y-3">
            {/* Applied Discounts List */}
            {allAppliedDiscounts.length > 0 && (
                <div className="space-y-2">
                    {appliedCoupons.map((coupon) => (
                        <div key={coupon.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Check className="h-4 w-4 text-green-600" />
                                </div>
                                <div>
                                    <p className="font-semibold text-green-900 text-sm">{coupon.code}</p>
                                    <p className="text-xs text-green-700">
                                        {coupon.description || `Saved £${coupon.discount.toFixed(2)}`}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDiscount('coupon', coupon.id)}
                                className="text-green-600 hover:text-green-800 h-8 w-8"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    {appliedPromotions.map((promo) => (
                        <div key={promo.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Tag className="h-4 w-4 text-orange-600" />
                                </div>
                                <div>
                                    <p className="font-semibold text-orange-900 text-sm">{promo.name}</p>
                                    <p className="text-xs text-orange-700">Saved £{promo.discount.toFixed(2)}</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDiscount('promotion', promo.id)}
                                className="text-orange-600 hover:text-orange-800 h-8 w-8"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Input to add more discounts */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Add another code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        onKeyPress={(e) => e.key === 'Enter' && validateCode()}
                        className="pl-10 h-12 uppercase"
                        disabled={isValidating}
                    />
                </div>
                <Button
                    onClick={validateCode}
                    disabled={isValidating || !code.trim()}
                    className="h-12 px-6"
                    variant="outline"
                >
                    {isValidating ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Checking...
                        </>
                    ) : (
                        'Apply'
                    )}
                </Button>
            </div>
        </div>
    );
}