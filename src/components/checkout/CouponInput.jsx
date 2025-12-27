import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag, Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function CouponInput({ restaurantId, subtotal, onCouponApply }) {
    const [code, setCode] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [appliedCoupon, setAppliedCoupon] = useState(null);

    const validateCoupon = async () => {
        if (!code.trim()) {
            toast.error('Please enter a coupon code');
            return;
        }

        setIsValidating(true);

        try {
            const coupons = await base44.entities.Coupon.filter({ 
                code: code.toUpperCase().trim() 
            });

            if (coupons.length === 0) {
                toast.error('Invalid coupon code');
                setIsValidating(false);
                return;
            }

            const coupon = coupons[0];

            // Validate coupon
            if (!coupon.is_active) {
                toast.error('This coupon is no longer active');
                setIsValidating(false);
                return;
            }

            if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) {
                toast.error('This coupon is not valid for this restaurant');
                setIsValidating(false);
                return;
            }

            if (coupon.minimum_order && subtotal < coupon.minimum_order) {
                toast.error(`Minimum order of £${coupon.minimum_order.toFixed(2)} required`);
                setIsValidating(false);
                return;
            }

            if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
                toast.error('This coupon has reached its usage limit');
                setIsValidating(false);
                return;
            }

            const now = new Date();
            if (coupon.valid_from && new Date(coupon.valid_from) > now) {
                toast.error('This coupon is not yet valid');
                setIsValidating(false);
                return;
            }

            if (coupon.valid_until && new Date(coupon.valid_until) < now) {
                toast.error('This coupon has expired');
                setIsValidating(false);
                return;
            }

            // Calculate discount
            let discount = 0;
            if (coupon.discount_type === 'percentage') {
                discount = (subtotal * coupon.discount_value) / 100;
                if (coupon.max_discount && discount > coupon.max_discount) {
                    discount = coupon.max_discount;
                }
            } else {
                discount = coupon.discount_value;
            }

            setAppliedCoupon({ ...coupon, discount });
            onCouponApply({ ...coupon, discount });
            toast.success(`Coupon applied! You saved £${discount.toFixed(2)}`);

        } catch (error) {
            toast.error('Failed to validate coupon');
            console.error(error);
        } finally {
            setIsValidating(false);
        }
    };

    const removeCoupon = () => {
        setAppliedCoupon(null);
        setCode('');
        onCouponApply(null);
        toast.success('Coupon removed');
    };

    return (
        <div className="space-y-3">
            {appliedCoupon ? (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <Check className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                            <p className="font-semibold text-green-900">{appliedCoupon.code}</p>
                            <p className="text-sm text-green-700">
                                {appliedCoupon.description || `Saved £${appliedCoupon.discount.toFixed(2)}`}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={removeCoupon}
                        className="text-green-600 hover:text-green-800"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Enter coupon code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            onKeyPress={(e) => e.key === 'Enter' && validateCoupon()}
                            className="pl-10 h-12 uppercase"
                            disabled={isValidating}
                        />
                    </div>
                    <Button
                        onClick={validateCoupon}
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
            )}
        </div>
    );
}