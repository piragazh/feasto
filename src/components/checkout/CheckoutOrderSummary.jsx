import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckoutOrderSummary({
    cart, restaurantName, subtotal, orderType, deliveryFee, zoneAvailable, tiered, zoneMinimum,
    smallOrderSurcharge, discount, appliedCoupons, appliedPromotions, total, minimumOrder,
    restaurant, pointsPerPound
}) {
    return (
        <Card className="sticky top-24">
            <CardHeader>
                <CardTitle>Order Summary</CardTitle>
                {restaurantName && (
                    <p className="text-sm text-gray-500">from {restaurantName}</p>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                {cart.map((item, idx) => (
                    <div key={`${item.menu_item_id}-${idx}`}>
                        <div className="flex justify-between">
                            <div className="flex gap-2 flex-1">
                                <span className="text-gray-500">{item.quantity}x</span>
                                <div className="flex-1">
                                    <span>{String(item.name || '')}</span>
                                    {item.customizations && Object.keys(item.customizations).length > 0 && (
                                        <div className="text-xs text-gray-500 mt-1">
                                            {Object.entries(item.customizations)
                                                .map(([key, value]) => {
                                                    if (!value || (Array.isArray(value) && value.length === 0)) return null;
                                                    if (typeof value === 'object' && !Array.isArray(value)) {
                                                        if (value && 'selection' in value) {
                                                            return <div key={key}>{key.replace(/_/g, ' ')}: {String(value.selection || '')}</div>;
                                                        }
                                                        return null;
                                                    }
                                                    const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
                                                    return <div key={key}>{key.replace(/_/g, ' ')}: {displayValue}</div>;
                                                })
                                                .filter(Boolean)
                                            }
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className="font-medium">£{(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}</span>
                        </div>
                    </div>
                ))}

                <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span>
                        <span>£{subtotal.toFixed(2)}</span>
                    </div>
                    {orderType === 'delivery' && (
                        <>
                            <div className="flex justify-between text-gray-600">
                                <span>
                                    Delivery Fee
                                    {zoneAvailable && tiered?.enabled && (tiered.lower_minimum ?? 0) > 0 && subtotal >= tiered.lower_minimum && subtotal < zoneMinimum && (
                                        <span className="text-xs text-amber-600 ml-1">(reduced rate)</span>
                                    )}
                                </span>
                                <span>{deliveryFee === 0 ? 'FREE' : `£${deliveryFee.toFixed(2)}`}</span>
                            </div>
                            {zoneAvailable && tiered?.enabled && (tiered.lower_minimum ?? 0) > 0 && subtotal >= tiered.lower_minimum && subtotal < zoneMinimum && (
                                <div className="text-xs text-amber-600 bg-amber-50 rounded p-2">
                                    Add £{(zoneMinimum - subtotal).toFixed(2)} more to reach the zone minimum for standard delivery
                                </div>
                            )}
                        </>
                    )}
                    {orderType === 'collection' && (
                        <div className="flex justify-between text-green-600 font-semibold">
                            <span>🏪 Collection Discount</span>
                            <span>FREE</span>
                        </div>
                    )}
                    {smallOrderSurcharge > 0 && (
                        <div className="flex justify-between text-orange-600">
                            <span>Small Order Fee</span>
                            <span>£{smallOrderSurcharge.toFixed(2)}</span>
                        </div>
                    )}
                    {appliedCoupons && appliedCoupons.length > 0 && appliedCoupons.map((coupon) => (
                        <div key={coupon.id} className="flex justify-between text-green-600">
                            <span>Coupon ({String(coupon.code || '')})</span>
                            <span>-£{Number(coupon.discount || 0).toFixed(2)}</span>
                        </div>
                    ))}
                    {appliedPromotions && appliedPromotions.length > 0 && appliedPromotions.map((promo) => (
                        <div key={promo.id} className="flex justify-between text-purple-600">
                            <span>Promo ({String(promo.name || '')})</span>
                            <span>-£{Number(promo.discount || 0).toFixed(2)}</span>
                        </div>
                    ))}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                        <span>Total</span>
                        <span>£{total.toFixed(2)}</span>
                    </div>
                    {restaurant?.loyalty_program_enabled !== false && (
                        <div className="flex justify-between text-orange-600 text-sm pt-2">
                            <span>🎁 You'll earn</span>
                            <span className="font-semibold">{Math.floor(total * pointsPerPound * (restaurant?.loyalty_points_multiplier || 1))} pts</span>
                        </div>
                    )}
                    {smallOrderSurcharge > 0 && (
                        <div className="text-xs text-gray-500 pt-1">
                            * Minimum order: £{minimumOrder.toFixed(2)}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}