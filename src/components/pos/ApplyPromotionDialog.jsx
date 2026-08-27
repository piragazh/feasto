/**
 * ApplyPromotionDialog — POS coupon picker
 *
 * Coupon path (hardened):
 *   - Fetches eligible coupons from posGetCoupons (server pre-filtered)
 *   - On Apply: calls posValidateCoupon server-side — validates dates, scope,
 *     minimum spend, global limit, per-customer limit (if phone available)
 *   - Returns a validated coupon object to the parent (POSPayment/POSOrderEntry)
 *   - Parent passes coupon_code to posCreateOrder which re-validates + persists
 *   - usage_count is incremented server-side in posCreateOrder only
 *
 * Manual discount path (unchanged):
 *   - Uses POSDiscountPanel → posApplyDiscount — separate control, requires reason_code
 *
 * What this component does NOT do:
 *   - Direct entity writes (Order.update) — removed
 *   - Client-side coupon math as the authoritative total — server owns it
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Tag, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const MAX_COUPONS = 3;

export default function ApplyPromotionDialog({
    open,
    onClose,
    onApplyCoupon,       // (couponResult) => void  — called with server-validated coupon
    restaurantId,
    cartSubtotal,
    customerPhone = null,    // optional — from phone order details
    customerEmail = null,    // optional
    hasManualDiscount = false, // mutual exclusion: true when a manual discount is active
    appliedCouponCount = 0,  // how many coupons already on this order
    posTheme = 'dark',
}) {
    const isDark = posTheme === 'dark';
    const [manualCode, setManualCode] = useState('');
    const [validating, setValidating] = useState(null); // coupon code being validated
    const [error, setError] = useState(null);

    const couponLimitReached = appliedCouponCount >= MAX_COUPONS;

    // Fetch pre-filtered eligible coupons from server
    const { data: coupons = [], isLoading } = useQuery({
        queryKey: ['pos-eligible-coupons', restaurantId],
        queryFn: async () => {
            const res = await base44.functions.invoke('posGetCoupons', { restaurant_id: restaurantId });
            return res?.data?.coupons || [];
        },
        enabled: !!restaurantId && open,
        staleTime: 30_000, // 30s — short enough to catch usage_limit changes
    });

    const validateAndApply = async (couponCode) => {
        const code = couponCode.trim().toUpperCase();
        if (!code) return;

        setValidating(code);
        setError(null);

        try {
            const res = await base44.functions.invoke('posValidateCoupon', {
                restaurant_id: restaurantId,
                coupon_code: code,
                subtotal: cartSubtotal,
                customer_phone: customerPhone || undefined,
                customer_email: customerEmail || undefined,
                has_manual_discount: hasManualDiscount,
            });

            const result = res?.data;

            if (!result?.valid) {
                setError(result?.error || 'Coupon is not valid');
                toast.error(result?.error || 'Coupon is not valid');
                return;
            }

            toast.success(`Coupon ${result.coupon_code} applied — £${result.discount_amount.toFixed(2)} off`);
            onApplyCoupon(result);
            setManualCode('');
            setError(null);
            onClose();

        } catch (err) {
            const msg = err?.message || 'Failed to validate coupon';
            setError(msg);
            toast.error(msg);
        } finally {
            setValidating(null);
        }
    };

    const handleManualApply = () => validateAndApply(manualCode);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} max-w-lg`}>
                <DialogHeader>
                    <DialogTitle className={`${isDark ? 'text-white' : 'text-gray-900'} flex items-center gap-2`}>
                        <Tag className="h-4 w-4 text-orange-400" />
                        Apply Coupon
                        {appliedCouponCount > 0 && (
                            <span className={`ml-auto text-xs font-normal ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {appliedCouponCount}/{MAX_COUPONS} applied
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {/* Coupon limit warning */}
                {couponLimitReached && !hasManualDiscount && (
                    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 ${isDark ? 'bg-gray-500/10 border-gray-500/30' : 'bg-gray-100 border-gray-300'} border`}>
                        <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                        <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            Maximum {MAX_COUPONS} coupons already applied. Remove one before adding another.
                        </p>
                    </div>
                )}

                {/* Mutual exclusion warning */}
                {hasManualDiscount && (
                    <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
                        <AlertCircle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                        <p className="text-orange-300 text-xs">
                            A manual discount is already applied. Coupons and manual discounts cannot be combined — remove the manual discount first.
                        </p>
                    </div>
                )}

                {/* Manual code entry */}
                <div className="space-y-2">
                    <Label className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Enter coupon code</Label>
                    <div className="flex gap-2">
                        <Input
                            value={manualCode}
                            onChange={e => { setManualCode(e.target.value.toUpperCase()); setError(null); }}
                            onKeyDown={e => e.key === 'Enter' && !couponLimitReached && handleManualApply()}
                            placeholder="e.g. SAVE10"
                            className={`${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'} uppercase`}
                            disabled={couponLimitReached || hasManualDiscount}
                        />
                        <Button
                            onClick={handleManualApply}
                            disabled={!manualCode.trim() || validating === manualCode.trim().toUpperCase() || couponLimitReached || hasManualDiscount}
                            className="bg-orange-500 hover:bg-orange-600 shrink-0"
                        >
                            {validating === manualCode.trim().toUpperCase()
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : 'Apply'
                            }
                        </Button>
                    </div>
                    {error && (
                        <p className="text-red-400 text-xs flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                            {error}
                        </p>
                    )}
                </div>

                {/* Eligible coupon list */}
                <div className="mt-3">
                    <p className={`text-xs mb-2 uppercase tracking-wide font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Available coupons</p>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                        </div>
                    ) : coupons.length === 0 ? (
                        <p className={`text-sm text-center py-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No eligible coupons for this restaurant</p>
                    ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto">
                            {coupons.map(coupon => {
                                const isValidating = validating === coupon.code;
                                const meetsMinimum = !coupon.minimum_order || cartSubtotal >= coupon.minimum_order;
                                return (
                                    <div
                                        key={coupon.id}
                                        className={`p-3 rounded-lg border ${isDark ? (meetsMinimum ? 'bg-gray-700 border-gray-600' : 'bg-gray-700 border-gray-700 opacity-50') : (meetsMinimum ? 'bg-gray-50 border-gray-200' : 'bg-gray-50 border-gray-200 opacity-50')}`}
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-bold text-sm">{coupon.code}</p>
                                                <p className="text-gray-400 text-xs mt-0.5">
                                                    {coupon.discount_type === 'percentage'
                                                        ? `${coupon.discount_value}% off`
                                                        : coupon.discount_type === 'fixed'
                                                        ? `£${coupon.discount_value} off`
                                                        : coupon.discount_type === 'free_delivery'
                                                        ? 'Free delivery'
                                                        : coupon.discount_type === 'free_item'
                                                        ? `Free item: ${coupon.free_item_name || 'see staff'}`
                                                        : coupon.discount_type

                                                    }
                                                    {coupon.minimum_order ? ` · Min £${coupon.minimum_order}` : ''}
                                                    {coupon.max_discount ? ` · Max £${coupon.max_discount}` : ''}
                                                </p>
                                                {coupon.description && (
                                                    <p className="text-gray-500 text-xs mt-0.5 truncate">{coupon.description}</p>
                                                )}
                                                {!meetsMinimum && (
                                                    <p className="text-orange-400 text-xs mt-0.5">
                                                        Need £{(coupon.minimum_order - cartSubtotal).toFixed(2)} more
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => validateAndApply(coupon.code)}
                                                disabled={!meetsMinimum || isValidating || couponLimitReached || hasManualDiscount}
                                                className="bg-green-600 hover:bg-green-700 disabled:opacity-40 shrink-0"
                                            >
                                                {isValidating
                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    : meetsMinimum ? 'Apply' : 'Min not met'
                                                }
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} className={isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900'}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}