import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RedeemRewardDialog({ reward, open, onOpenChange, onSuccess }) {
    const [loading, setLoading] = useState(false);
    const [couponCode, setCouponCode] = useState(null);

    const handleRedeem = async () => {
        setLoading(true);
        try {
            const response = await base44.functions.invoke('redeemReward', { reward_id: reward.id });
            setCouponCode(response.data.coupon_code);
            toast.success(response.data.message);
            onSuccess?.(response.data);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to redeem reward');
        } finally {
            setLoading(false);
        }
    };

    const copyCoupon = () => {
        navigator.clipboard.writeText(couponCode);
        toast.success('Coupon copied to clipboard!');
    };

    if (!reward) return null;

    return (
        <Dialog open={open} onOpenChange={() => {
            setCouponCode(null);
            onOpenChange(false);
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{couponCode ? 'Coupon Generated!' : 'Redeem Reward'}</DialogTitle>
                    <DialogDescription>
                        {couponCode ? 'Your coupon code is ready to use' : 'Are you sure you want to redeem this reward?'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {!couponCode ? (
                        <div className="bg-orange-50 p-4 rounded-lg">
                            <h3 className="font-bold text-lg">{reward.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{reward.description}</p>
                            <div className="mt-3 flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Cost:</span>
                                <span className="font-bold text-orange-600">{reward.points_required} points</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-6 rounded-lg border-2 border-orange-300">
                            <p className="text-sm text-gray-600 mb-2">Your coupon code:</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 bg-white px-4 py-3 rounded font-bold text-lg text-orange-600 tracking-widest">
                                    {couponCode}
                                </code>
                                <Button onClick={copyCoupon} variant="outline" size="sm">
                                    Copy
                                </Button>
                            </div>
                            <p className="text-xs text-gray-600 mt-3">Valid for 90 days. Use at checkout to apply your reward.</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {!couponCode ? (
                        <>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleRedeem} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
                                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {loading ? 'Redeeming...' : 'Redeem Now'}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={() => onOpenChange(false)} className="w-full bg-orange-500 hover:bg-orange-600">
                            Done
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}