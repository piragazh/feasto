import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, Star, Gift, TrendingUp, Crown } from 'lucide-react';
import { Progress } from "@/components/ui/progress";

export default function LoyaltyRewards({ user }) {
    const { data: userPoints } = useQuery({
        queryKey: ['loyalty-points', user.email],
        queryFn: async () => {
            const points = await base44.entities.LoyaltyPoints.filter({ created_by: user.email });
            return points[0] || { points_balance: 0 };
        },
    });

    const { data: rewards = [] } = useQuery({
        queryKey: ['loyalty-rewards'],
        queryFn: () => base44.entities.LoyaltyReward.filter({ is_active: true }),
    });

    const { data: settings = [] } = useQuery({
        queryKey: ['loyalty-settings'],
        queryFn: () => base44.entities.SystemSettings.list(),
    });

    const getSetting = (key, defaultValue) => {
        const setting = settings.find(s => s.setting_key === key);
        return setting ? parseFloat(setting.setting_value) || defaultValue : defaultValue;
    };

    const pointsPerPound = getSetting('loyalty_points_per_pound', 10);
    const firstOrderBonus = getSetting('loyalty_first_order_bonus', 50);
    const referralBonus = getSetting('loyalty_referral_bonus', 100);
    const minOrderValue = getSetting('loyalty_min_order_value', 0);

    const loyaltyPoints = userPoints?.points_balance || 0;
    const totalOrders = user.total_orders || 0;
    const totalSpent = user.total_spent || 0;

    // Calculate tier
    const getTier = () => {
        if (loyaltyPoints >= 1000) return { name: 'Platinum', color: 'text-purple-600', icon: Crown };
        if (loyaltyPoints >= 500) return { name: 'Gold', color: 'text-yellow-600', icon: Award };
        if (loyaltyPoints >= 200) return { name: 'Silver', color: 'text-gray-600', icon: Star };
        return { name: 'Bronze', color: 'text-orange-600', icon: Gift };
    };

    const tier = getTier();
    const TierIcon = tier.icon;

    const nextTierPoints = loyaltyPoints >= 1000 ? null : 
                          loyaltyPoints >= 500 ? 1000 : 
                          loyaltyPoints >= 200 ? 500 : 200;

    const progressToNext = nextTierPoints ? 
        ((loyaltyPoints % (nextTierPoints === 1000 ? 500 : nextTierPoints === 500 ? 300 : 200)) / 
        (nextTierPoints === 1000 ? 500 : nextTierPoints === 500 ? 300 : 200)) * 100 : 100;

    const availableRewards = rewards.map(reward => ({
        ...reward,
        available: loyaltyPoints >= reward.points_required
    }));

    return (
        <div className="space-y-6">
            {/* Loyalty Status */}
            <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                                <TierIcon className={`h-8 w-8 ${tier.color}`} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">{tier.name} Member</h2>
                                <p className="text-gray-600">You have {loyaltyPoints} points</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Member since</p>
                            <p className="font-semibold">{new Date(user.created_date).toLocaleDateString()}</p>
                        </div>
                    </div>

                    {nextTierPoints && (
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-600">Progress to next tier</span>
                                <span className="font-medium">{nextTierPoints - loyaltyPoints} points to go</span>
                            </div>
                            <Progress value={progressToNext} className="h-2" />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Award className="h-6 w-6 text-orange-600" />
                        </div>
                        <p className="text-3xl font-bold text-orange-600">{loyaltyPoints}</p>
                        <p className="text-sm text-gray-600">Total Points</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 text-center">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <TrendingUp className="h-6 w-6 text-blue-600" />
                        </div>
                        <p className="text-3xl font-bold text-blue-600">{totalOrders}</p>
                        <p className="text-sm text-gray-600">Total Orders</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 text-center">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Gift className="h-6 w-6 text-green-600" />
                        </div>
                        <p className="text-3xl font-bold text-green-600">£{totalSpent.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">Total Spent</p>
                    </CardContent>
                </Card>
            </div>

            {/* Available Rewards */}
            <Card>
                <CardHeader>
                    <CardTitle>Available Rewards</CardTitle>
                </CardHeader>
                <CardContent>
                    {availableRewards.length === 0 ? (
                        <div className="text-center py-8">
                            <Gift className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">No rewards available yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {availableRewards.map((reward) => (
                                <div
                                    key={reward.id}
                                    className={`flex items-center justify-between p-4 rounded-lg border ${
                                        reward.available 
                                            ? 'bg-green-50 border-green-200' 
                                            : 'bg-gray-50 border-gray-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Gift className={`h-6 w-6 ${reward.available ? 'text-green-600' : 'text-gray-400'}`} />
                                        <div>
                                            <p className="font-semibold">{reward.name}</p>
                                            <p className="text-sm text-gray-500">{reward.description}</p>
                                            <p className="text-sm text-gray-600 mt-1">
                                                {reward.points_required} points • {reward.reward_type === 'percentage_discount' ? `${reward.discount_value}% off` : reward.reward_type === 'fixed_discount' ? `£${reward.discount_value} off` : reward.reward_type.replace('_', ' ')}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant={reward.available ? 'default' : 'secondary'}>
                                        {reward.available ? 'Available' : 'Locked'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* How to Earn */}
            <Card>
                <CardHeader>
                    <CardTitle>How to Earn Points</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                            <span>Earn {pointsPerPound} points for every £1 spent</span>
                        </li>
                        {firstOrderBonus > 0 && (
                            <li className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                                <span>Get {firstOrderBonus} bonus points on your first order</span>
                            </li>
                        )}
                        {referralBonus > 0 && (
                            <li className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                                <span>Earn {referralBonus} points for every friend you refer</span>
                            </li>
                        )}
                        {minOrderValue > 0 && (
                            <li className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                                <span>Minimum order value: £{minOrderValue.toFixed(2)}</span>
                            </li>
                        )}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}