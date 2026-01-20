import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Award, Star, Gift, TrendingUp, Crown, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { toast } from 'sonner';
import RedeemRewardDialog from '../loyalty/RedeemRewardDialog';

export default function LoyaltyRewards({ user }) {
    const [selectedReward, setSelectedReward] = useState(null);
    const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: userPoints } = useQuery({
        queryKey: ['loyalty-points', user.email],
        queryFn: async () => {
            const points = await base44.entities.LoyaltyPoints.filter({ user_email: user.email });
            return points[0] || { total_points: 0 };
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

    const { data: redeemCoupons = [] } = useQuery({
        queryKey: ['redeemed-coupons', user.email],
        queryFn: async () => {
            try {
                const coupons = await base44.entities.Coupon.filter({ is_active: true });
                // Filter coupons that were created for this user (redeemed rewards)
                return coupons.filter(c => c.description && c.description.startsWith('Reward:'));
            } catch (e) {
                return [];
            }
        },
    });

    const { data: pointsHistory = [] } = useQuery({
        queryKey: ['points-history', user.email],
        queryFn: async () => {
            try {
                const transactions = await base44.entities.LoyaltyTransaction.filter({ user_email: user.email });
                return transactions.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
            } catch (e) {
                return [];
            }
        },
    });

    const getSetting = (key, defaultValue) => {
        const setting = settings.find(s => s.setting_key === key);
        return setting ? parseFloat(setting.setting_value) || defaultValue : defaultValue;
    };

    const pointsPerPound = getSetting('loyalty_points_per_pound', 10);
    const firstOrderBonus = getSetting('loyalty_first_order_bonus', 50);
    const referralBonus = getSetting('loyalty_referral_bonus', 100);
    const minOrderValue = getSetting('loyalty_min_order_value', 0);

    const loyaltyPoints = userPoints?.total_points || 0;
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

    const { data: tierBenefits = [] } = useQuery({
        queryKey: ['tier-benefits', tier.name],
        queryFn: async () => {
            try {
                const benefits = await base44.entities.LoyaltyTierBenefit.filter({ tier_name: tier.name, is_active: true });
                return benefits;
            } catch (e) {
                return [];
            }
        },
    });
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

    const handleRedeemSuccess = () => {
        queryClient.invalidateQueries({ queryKey: ['loyalty-points', user.email] });
        queryClient.invalidateQueries({ queryKey: ['redeemed-coupons', user.email] });
    };

    const copyCouponCode = (code) => {
        navigator.clipboard.writeText(code);
        toast.success('Coupon code copied to clipboard!');
    };

    const isExpired = (expiresAt) => {
        return new Date(expiresAt) < new Date();
    };

    return (
        <div className="space-y-6">
            {selectedReward && (
                <RedeemRewardDialog 
                    reward={selectedReward} 
                    open={redeemDialogOpen} 
                    onOpenChange={setRedeemDialogOpen}
                    onSuccess={handleRedeemSuccess}
                />
            )}
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

            {/* Tier Benefits */}
            {tierBenefits.length > 0 && (
                <Card className="border-2 border-orange-200 bg-orange-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Gift className="h-5 w-5 text-orange-600" />
                            Your {tier.name} Tier Benefits
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 gap-3">
                            {tierBenefits.map((benefit) => (
                                <div
                                    key={benefit.id}
                                    className="p-3 rounded-lg bg-white border border-orange-100"
                                >
                                    <p className="font-semibold text-gray-900 text-sm">{benefit.benefit_name}</p>
                                    <p className="text-xs text-gray-600 mt-1">{benefit.benefit_description}</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Rewards Tabs */}
            <Tabs defaultValue="available" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="available">Available Rewards</TabsTrigger>
                    <TabsTrigger value="redeemed">Redeemed Coupons</TabsTrigger>
                    <TabsTrigger value="history">Points History</TabsTrigger>
                </TabsList>

                {/* Available Rewards Tab */}
                <TabsContent value="available">
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
                                            <div className="flex gap-2">
                                                <Badge variant={reward.available ? 'default' : 'secondary'}>
                                                    {reward.available ? 'Available' : 'Locked'}
                                                </Badge>
                                                {reward.available && (
                                                    <Button 
                                                        size="sm" 
                                                        className="bg-orange-500 hover:bg-orange-600"
                                                        onClick={() => {
                                                            setSelectedReward(reward);
                                                            setRedeemDialogOpen(true);
                                                        }}
                                                    >
                                                        Redeem
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Redeemed Coupons Tab */}
                <TabsContent value="redeemed">
                    <Card>
                        <CardHeader>
                            <CardTitle>Your Redeemed Coupons</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {redeemCoupons.length === 0 ? (
                                <div className="text-center py-8">
                                    <Gift className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                    <p className="text-gray-500">No redeemed coupons yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {redeemCoupons.map((coupon) => {
                                        const expired = coupon.expires_at && isExpired(coupon.expires_at);
                                        return (
                                            <div
                                                key={coupon.id}
                                                className={`p-4 rounded-lg border ${
                                                    expired 
                                                        ? 'bg-gray-50 border-gray-200' 
                                                        : 'bg-blue-50 border-blue-200'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <p className="font-semibold text-gray-900">{coupon.description}</p>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            {coupon.discount_type === 'percentage' 
                                                                ? `${coupon.discount_value}% off` 
                                                                : `£${coupon.discount_value} off`}
                                                        </p>
                                                    </div>
                                                    <Badge variant={expired ? 'secondary' : 'default'} className="ml-2">
                                                        {expired ? 'Expired' : 'Active'}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <code className="bg-white px-3 py-2 rounded font-mono font-bold text-orange-600 text-sm flex-1 border border-gray-200">
                                                        {coupon.code}
                                                    </code>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => copyCouponCode(coupon.code)}
                                                        disabled={expired}
                                                        className="gap-1"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                        Copy
                                                    </Button>
                                                </div>
                                                {coupon.expires_at && (
                                                    <p className={`text-xs mt-2 ${expired ? 'text-red-600' : 'text-gray-600'}`}>
                                                        {expired ? 'Expired on' : 'Expires'} {new Date(coupon.expires_at).toLocaleDateString()}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Points History Tab */}
                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <CardTitle>Points Transaction History</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {pointsHistory.length === 0 ? (
                                <div className="text-center py-8">
                                    <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                    <p className="text-gray-500">No transaction history yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {pointsHistory.map((transaction) => {
                                        const isExpired = transaction.is_expired;
                                        const isRedeemed = transaction.transaction_type === 'redeemed';
                                        const isEarned = transaction.transaction_type === 'earned';
                                        
                                        return (
                                            <div
                                                key={transaction.id}
                                                className="flex items-center justify-between p-3 rounded-lg border bg-gray-50"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {isRedeemed ? (
                                                        <Gift className="h-5 w-5 text-red-600" />
                                                    ) : isExpired ? (
                                                        <AlertCircle className="h-5 w-5 text-gray-400" />
                                                    ) : (
                                                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                                                    )}
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{transaction.description}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(transaction.created_date).toLocaleDateString()} {new Date(transaction.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`font-semibold ${
                                                        isRedeemed || isExpired ? 'text-red-600' : 'text-green-600'
                                                    }`}>
                                                        {transaction.points > 0 ? '+' : ''}{transaction.points}
                                                    </p>
                                                    {isExpired && <p className="text-xs text-gray-500">Expired</p>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

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