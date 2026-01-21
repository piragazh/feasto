import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function ApplyPromotionDialog({ order, open, onClose, onUpdate, restaurantId }) {
    const [discountAmount, setDiscountAmount] = useState(0);
    const [discountType, setDiscountType] = useState('fixed');
    const [promoCode, setPromoCode] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState(null);

    const { data: promotions = [] } = useQuery({
        queryKey: ['promotions', restaurantId],
        queryFn: () => base44.entities.Promotion.filter({ restaurant_id: restaurantId, is_active: true }),
        enabled: !!restaurantId && open,
    });

    const { data: coupons = [] } = useQuery({
        queryKey: ['coupons', restaurantId],
        queryFn: () => base44.entities.Coupon.filter({ restaurant_id: restaurantId, is_active: true }),
        enabled: !!restaurantId && open,
    });

    const calculateDiscount = (type, value) => {
        if (type === 'fixed') {
            return Math.min(value, order.subtotal || order.total);
        }
        return Math.min((order.subtotal || order.total) * (value / 100), (order.subtotal || order.total));
    };

    const handleApplyCustomDiscount = () => {
        if (discountAmount <= 0) {
            toast.error('Discount amount must be greater than 0');
            return;
        }
        const finalDiscount = calculateDiscount(discountType, discountAmount);
        setAppliedDiscount({ type: discountType, value: discountAmount, amount: finalDiscount });
        toast.success(`Discount of £${finalDiscount.toFixed(2)} applied`);
    };

    const handleApplyPromotion = (promo) => {
        let discountValue = promo.discount_value;
        const finalDiscount = calculateDiscount(promo.promotion_type.includes('percentage') ? 'percentage' : 'fixed', discountValue);
        setAppliedDiscount({ type: promo.promotion_type, value: discountValue, amount: finalDiscount, promoName: promo.name });
        toast.success(`${promo.name} applied!`);
    };

    const handleApplyCoupon = (coupon) => {
        if (coupon.minimum_order && (order.subtotal || order.total) < coupon.minimum_order) {
            toast.error(`Minimum order of £${coupon.minimum_order} required`);
            return;
        }
        let discountValue = coupon.discount_value;
        const finalDiscount = calculateDiscount(coupon.discount_type === 'percentage' ? 'percentage' : 'fixed', discountValue);
        setAppliedDiscount({ type: coupon.discount_type, value: discountValue, amount: finalDiscount, code: coupon.code });
        toast.success(`Coupon ${coupon.code} applied!`);
    };

    const handleSaveDiscount = async () => {
        if (!appliedDiscount) {
            toast.error('No discount to apply');
            return;
        }

        try {
            const currentDiscount = order.discount || 0;
            await base44.entities.Order.update(order.id, {
                discount: currentDiscount + appliedDiscount.amount,
                total: Math.max(0, (order.total || 0) - appliedDiscount.amount)
            });
            toast.success('Discount applied to order');
            onUpdate();
            setAppliedDiscount(null);
            setDiscountAmount(0);
            setPromoCode('');
            onClose();
        } catch (error) {
            toast.error('Failed to apply discount');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white">Apply Discount - Order #{order?.id.slice(0, 8)}</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="custom" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-gray-700">
                        <TabsTrigger value="custom" className="text-white">Custom</TabsTrigger>
                        <TabsTrigger value="promotions" className="text-white">Promotions</TabsTrigger>
                        <TabsTrigger value="coupons" className="text-white">Coupons</TabsTrigger>
                    </TabsList>

                    {/* Custom Discount */}
                    <TabsContent value="custom" className="space-y-4">
                        <div className="bg-gray-700 p-3 rounded mb-4">
                            <p className="text-gray-400 text-sm">Order Total</p>
                            <p className="text-orange-400 text-2xl font-bold">£{(order?.total || 0).toFixed(2)}</p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <Label className="text-white text-sm">Discount Type</Label>
                                <div className="flex gap-2 mt-1">
                                    <Button
                                        onClick={() => setDiscountType('fixed')}
                                        variant={discountType === 'fixed' ? 'default' : 'outline'}
                                        className={`flex-1 ${discountType === 'fixed' ? 'bg-orange-500' : 'bg-gray-700 border-gray-600'} text-white`}
                                    >
                                        £ Fixed
                                    </Button>
                                    <Button
                                        onClick={() => setDiscountType('percentage')}
                                        variant={discountType === 'percentage' ? 'default' : 'outline'}
                                        className={`flex-1 ${discountType === 'percentage' ? 'bg-orange-500' : 'bg-gray-700 border-gray-600'} text-white`}
                                    >
                                        % Percentage
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label className="text-white text-sm">Amount</Label>
                                <Input
                                    type="number"
                                    value={discountAmount}
                                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                                    placeholder={discountType === 'percentage' ? '0-100' : '0.00'}
                                    min="0"
                                    step={discountType === 'percentage' ? '1' : '0.01'}
                                    className="bg-gray-700 border-gray-600 text-white"
                                />
                            </div>

                            {discountAmount > 0 && (
                                <div className="bg-gray-700 p-2 rounded">
                                    <p className="text-gray-400 text-sm">Applied Discount</p>
                                    <p className="text-green-400 font-bold">
                                        £{calculateDiscount(discountType, discountAmount).toFixed(2)}
                                    </p>
                                </div>
                            )}

                            <Button
                                onClick={handleApplyCustomDiscount}
                                className="w-full bg-orange-500 hover:bg-orange-600"
                            >
                                Apply Custom Discount
                            </Button>
                        </div>
                    </TabsContent>

                    {/* Promotions */}
                    <TabsContent value="promotions" className="space-y-2 max-h-60 overflow-y-auto">
                        {promotions.length === 0 ? (
                            <p className="text-gray-400 text-center py-4">No active promotions</p>
                        ) : (
                            promotions.map(promo => (
                                <div key={promo.id} className="bg-gray-700 p-3 rounded border border-gray-600">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="text-white font-medium">{promo.name}</p>
                                            <p className="text-gray-400 text-xs">{promo.description}</p>
                                        </div>
                                        <Button
                                            onClick={() => handleApplyPromotion(promo)}
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            Apply
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </TabsContent>

                    {/* Coupons */}
                    <TabsContent value="coupons" className="space-y-2 max-h-60 overflow-y-auto">
                        {coupons.length === 0 ? (
                            <p className="text-gray-400 text-center py-4">No active coupons</p>
                        ) : (
                            coupons.map(coupon => (
                                <div key={coupon.id} className="bg-gray-700 p-3 rounded border border-gray-600">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="text-white font-bold">{coupon.code}</p>
                                            <p className="text-gray-400 text-xs">
                                                {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `£${coupon.discount_value}`} off
                                                {coupon.minimum_order && ` - Min £${coupon.minimum_order}`}
                                            </p>
                                        </div>
                                        <Button
                                            onClick={() => handleApplyCoupon(coupon)}
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            Apply
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </TabsContent>
                </Tabs>

                {/* Applied Discount Summary */}
                {appliedDiscount && (
                    <div className="bg-green-700/30 border border-green-600 p-3 rounded">
                        <p className="text-green-300 text-sm font-medium">
                            {appliedDiscount.promoName || appliedDiscount.code || 'Custom Discount'} - £{appliedDiscount.amount.toFixed(2)}
                        </p>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} className="bg-gray-700 border-gray-600 text-white">Cancel</Button>
                    <Button onClick={handleSaveDiscount} className="bg-orange-500 hover:bg-orange-600" disabled={!appliedDiscount}>
                        Save Discount
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}