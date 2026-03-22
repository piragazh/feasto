import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Gift, TrendingUp } from 'lucide-react';

const tierColors = {
    bronze: 'bg-amber-100 text-amber-800 border-amber-300',
    silver: 'bg-gray-100 text-gray-700 border-gray-300',
    gold: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const tierEmoji = { bronze: '🥉', silver: '🥈', gold: '🥇' };

export default function GuestLoyaltyPoints({ order }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Only show when order is delivered/collected and has a phone
    const isComplete = order.status === 'delivered' || order.status === 'collected';

    useEffect(() => {
        if (!isComplete || !order.phone) return;
        const fetch = async () => {
            try {
                const res = await base44.functions.invoke('getGuestLoyaltyPoints', {
                    phone: order.phone,
                    orderId: order.id,
                });
                setData(res.data);
            } catch (e) {
                // Silently fail — loyalty is a bonus feature
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [order.id, order.status, order.phone]);

    if (!isComplete || !order.phone || loading || !data) return null;

    const pointsThisOrder = order.loyalty_points_earned || 0;
    const tier = data.tier || 'bronze';
    const nextTierPoints = tier === 'bronze' ? 200 : tier === 'silver' ? 500 : null;
    const progress = nextTierPoints ? Math.min(100, (data.total_points / nextTierPoints) * 100) : 100;

    return (
        <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-orange-700">
                    <Star className="h-5 w-5 fill-orange-500 text-orange-500" />
                    Your Loyalty Points
                    <Badge className={`ml-auto text-xs border ${tierColors[tier]}`}>
                        {tierEmoji[tier]} {tier.charAt(0).toUpperCase() + tier.slice(1)}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Points earned this order */}
                {pointsThisOrder > 0 && (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                        <Gift className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-green-800">
                                +{pointsThisOrder} points earned from this order!
                            </p>
                            <p className="text-xs text-green-600">Linked to your phone number</p>
                        </div>
                    </div>
                )}

                {/* Balance */}
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white rounded-lg p-3 border">
                        <p className="text-2xl font-bold text-orange-600">{data.total_points}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Available</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                        <p className="text-2xl font-bold text-gray-700">{data.points_earned}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Total Earned</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                        <p className="text-2xl font-bold text-gray-700">{data.orders_count}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Orders</p>
                    </div>
                </div>

                {/* Progress to next tier */}
                {nextTierPoints && (
                    <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Progress to {tier === 'bronze' ? 'Silver' : 'Gold'}
                            </span>
                            <span>{data.total_points} / {nextTierPoints}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-orange-500 h-2 rounded-full transition-all duration-700"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                <p className="text-xs text-gray-400 text-center">
                    Points are saved against your phone number — accessible on any order
                </p>
            </CardContent>
        </Card>
    );
}