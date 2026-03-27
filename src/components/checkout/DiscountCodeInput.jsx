/**
 * DiscountCodeInput — Checkout coupon + promotion entry
 *
 * Coupon stacking policy (mirrored from server):
 *   - Up to 3 coupon codes per order (MAX_COUPONS)
 *   - Duplicate codes blocked in UI
 *   - Non-stackable combinations show a clear message
 *   - Server is the authority — client-side checks are UX convenience only
 */
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag, Loader2, Check, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { isWithinInterval } from 'date-fns';
import { useEffect } from 'react';

const MAX_COUPONS = 3; // Must match server MAX_COUPONS_PER_ORDER

export default function DiscountCodeInput({ restaurantId, subtotal, cartItems = [], onCouponApply, onPromotionApply }) {
    const [code, setCode] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [appliedCoupons, setAppliedCoupons] = useState([]);
    const [appliedPromotions, setAppliedPromotions] = useState([]);
    const [stackingError, setStackingError] = useState(null);

    const couponLimitReached = appliedCoupons.length >= MAX_COUPONS;

    // Recalculate BOGO promotions when cart changes
    useEffect(() => {
        if (appliedPromotions.length === 0) return;
        let hasChanges = false;
        const updatedPromotions = appliedPromotions.map(promo => {
            if (promo.promotion_type === 'buy_one_get_one' || promo.promotion_type === 'buy_two_get_one') {
                const newDiscount = calculateBogoDiscount(promo, cartItems);
                if (newDiscount !== promo.discount) {
                    hasChanges = true;
                    return { ...promo, discount: newDiscount };
                }
            }
            return promo;
        });
        if (hasChanges) {
            setAppliedPromotions(updatedPromotions);
            onPromotionApply(updatedPromotions);
        }
    }, [JSON.stringify(cartItems.map(item => ({ id: item.menu_item_id, qty: item.quantity })))]);

    const validateCode = async () => {
        if (!code.trim()) { toast.error('Please enter a code'); return; }
        setIsValidating(true);
        setStackingError(null);
        const upperCode = code.toUpperCase().trim();

        try {
            // Try coupon first
            const coupons = await base44.entities.Coupon.filter({ code: upperCode });
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
                await validatePromotion(promotions[0], false, cartItems);
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
        // UI guard: max 3 coupons
        if (couponLimitReached) {
            toast.error(`Maximum ${MAX_COUPONS} coupon codes per order. Remove one to add another.`);
            return;
        }

        // Duplicate check
        if (appliedCoupons.find(c => c.code === coupon.code)) {
            toast.error('This coupon code is already applied');
            return;
        }

        // Basic UX validation (server re-validates authoritatively at checkout)
        if (!coupon.is_active) { toast.error('This coupon is no longer active'); return; }
        if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) { toast.error('This coupon is not valid for this restaurant'); return; }
        if (coupon.minimum_order && subtotal < coupon.minimum_order) { toast.error(`Minimum order of £${coupon.minimum_order.toFixed(2)} required`); return; }
        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) { toast.error('This coupon has reached its usage limit'); return; }
        const now = new Date();
        if (coupon.valid_from && new Date(coupon.valid_from) > now) { toast.error('This coupon is not yet valid'); return; }
        if (coupon.valid_until && new Date(coupon.valid_until) < now) { toast.error('This coupon has expired'); return; }

        // Stacking compatibility check (UX only — server enforces authoritatively)
        if (appliedCoupons.length >= 1) {
            const wouldBeNonStackable = !coupon.stackable || appliedCoupons.some(c => !c.stackable);
            if (wouldBeNonStackable) {
                const msg = !coupon.stackable
                    ? `Coupon "${coupon.code}" cannot be combined with other coupons.`
                    : 'One of the already-applied coupons cannot be combined with others.';
                setStackingError(msg);
                toast.error(msg);
                return;
            }
        }

        setStackingError(null);

        // Calculate preview discount
        let discount = 0;
        if (coupon.discount_type === 'percentage') {
            discount = (subtotal * coupon.discount_value) / 100;
            if (coupon.max_discount && discount > coupon.max_discount) discount = coupon.max_discount;
        } else if (coupon.discount_type === 'fixed') {
            discount = coupon.discount_value || 0;
        } else if (coupon.discount_type === 'free_delivery') {
            discount = coupon.free_delivery_amount || coupon.discount_value || 0;
        } else if (coupon.discount_type === 'free_item') {
            discount = coupon.discount_value || 0;
        } else {
            discount = coupon.discount_value || 0;
        }
        discount = Math.min(discount, subtotal);

        const newCoupon = { ...coupon, discount };
        setAppliedCoupons(prev => {
            const updated = [...prev, newCoupon];
            onCouponApply(updated);
            return updated;
        });
        setCode('');
        toast.success(`Coupon applied! You saved £${discount.toFixed(2)}`);
    };

    const calculateBogoDiscount = (promotion, cartItems) => {
        if (!promotion.applicable_items || promotion.applicable_items.length === 0) return 0;
        const eligibleItems = cartItems.filter(item => promotion.applicable_items.includes(item.menu_item_id));
        if (eligibleItems.length === 0) return 0;
        let totalDiscount = 0;
        eligibleItems.forEach(item => {
            let freeItems = 0;
            if (promotion.promotion_type === 'buy_one_get_one') freeItems = Math.floor(item.quantity / 2);
            else if (promotion.promotion_type === 'buy_two_get_one') freeItems = Math.floor(item.quantity / 3);
            totalDiscount += freeItems * item.price;
        });
        return totalDiscount;
    };

    const validatePromotion = async (promotion, isAuto = false, cartItems = []) => {
        if (appliedPromotions.find(p => p.id === promotion.id)) {
            if (!isAuto) toast.error('This promotion is already applied');
            return;
        }
        const now = new Date();
        const start = new Date(promotion.start_date);
        const end = new Date(promotion.end_date);
        if (!isWithinInterval(now, { start, end })) { if (!isAuto) toast.error('This promotion has expired'); return; }
        if (promotion.usage_limit && promotion.usage_count >= promotion.usage_limit) { if (!isAuto) toast.error('This promotion has reached its usage limit'); return; }
        if (promotion.minimum_order && subtotal < promotion.minimum_order) { if (!isAuto) toast.error(`Minimum order of £${promotion.minimum_order.toFixed(2)} required`); return; }

        let discount = 0;
        if (promotion.promotion_type === 'percentage_off') {
            discount = (subtotal * promotion.discount_value) / 100;
        } else if (promotion.promotion_type === 'fixed_amount_off') {
            discount = promotion.discount_value;
        } else if (promotion.promotion_type === 'buy_one_get_one' || promotion.promotion_type === 'buy_two_get_one') {
            discount = calculateBogoDiscount(promotion, cartItems);
            if (discount === 0 && !isAuto) { toast.error('No eligible items in cart for this promotion'); return; }
        }

        const newPromotion = { ...promotion, discount };
        setAppliedPromotions(prev => {
            const updated = [...prev, newPromotion];
            onPromotionApply(updated);
            return updated;
        });
        if (!isAuto) toast.success(`Promotion "${promotion.name}" applied! Saved £${discount.toFixed(2)}`);
    };

    const removeDiscount = (type, id) => {
        if (type === 'coupon') {
            const updated = appliedCoupons.filter(c => c.id !== id);
            setAppliedCoupons(updated);
            onCouponApply(updated);
            setStackingError(null);
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
            {/* Applied Discounts */}
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
                                        {coupon.stackable && appliedCoupons.length > 1 && (
                                            <span className="ml-1 text-green-500">· stackable</span>
                                        )}
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
                            <div className="flex items-center gap-2 flex-1">
                                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Tag className="h-4 w-4 text-orange-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-orange-900 text-sm">{promo.name}</p>
                                        {promo.badge_text && (
                                            <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full">{promo.badge_text}</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-orange-700 mt-1">
                                        {promo.condition_text ? `${promo.condition_text} · Saved £${promo.discount.toFixed(2)}` : `Saved £${promo.discount.toFixed(2)}`}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDiscount('promotion', promo.id)}
                                className="text-orange-600 hover:text-orange-800 h-8 w-8 flex-shrink-0"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Stacking error */}
            {stackingError && (
                <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    {stackingError}
                </div>
            )}

            {/* Input row — hidden when limit reached */}
            {!couponLimitReached ? (
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder={appliedCoupons.length > 0 ? `Add another coupon (${MAX_COUPONS - appliedCoupons.length} remaining)` : 'Enter coupon or promo code'}
                            value={code}
                            onChange={(e) => { setCode(e.target.value.toUpperCase()); setStackingError(null); }}
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
                        {isValidating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking...</> : 'Apply'}
                    </Button>
                </div>
            ) : (
                <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Maximum {MAX_COUPONS} coupons applied. Remove one to add a different code.
                </div>
            )}

            {appliedCoupons.length > 0 && appliedCoupons.length < MAX_COUPONS && (
                <p className="text-xs text-gray-400 text-center">
                    {appliedCoupons.every(c => c.stackable)
                        ? `${MAX_COUPONS - appliedCoupons.length} more stackable coupon${MAX_COUPONS - appliedCoupons.length !== 1 ? 's' : ''} can be added`
                        : 'Applied coupon is not stackable — remove it to use a different one'}
                </p>
            )}
        </div>
    );
}