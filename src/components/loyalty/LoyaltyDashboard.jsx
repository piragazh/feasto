import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, Gift, TrendingUp, History, Crown, Award, Star, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import RedeemRewardDialog from './RedeemRewardDialog';

export default function LoyaltyDashboard({ userEmail }) {
    const queryClient = useQueryClient();

    const { data: loyaltyPoints } = useQuery({
        queryKey: ['loyaltyPoints', userEmail],
        queryFn: async () => {
            const points = await base44.entities.LoyaltyPoints.filter({ user_email: userEmail });
            return points[0] || null;
        },
        enabled: !!userEmail
    });

    const { data: transactions = [] } = useQuery({
        queryKey: ['loyaltyTransactions', userEmail],
        queryFn: () => base44.entities.LoyaltyTransaction.filter({ user_email: userEmail }, '-created_date', 20),
        enabled: !!userEmail
    });

    const { data: rewards = [] } = useQuery({
        queryKey: ['loyaltyRewards'],
        queryFn: () => base44.entities.LoyaltyReward.filter({ is_active: true })
    });

    const tierInfo = {
        bronze: { name: 'Bronze', color: 'bg-amber-700', icon: Award, threshold: 0 },
        silver: { name: 'Silver', color: 'bg-gray-400', icon: Star, threshold: 500 },
        gold: { name: 'Gold', color: 'bg-yellow-500', icon: Crown, threshold: 1500 },
        platinum: { name: 'Platinum', color: 'bg-purple-600', icon: Sparkles, threshold: 3000 }
    };

    const currentTier = loyaltyPoints?.tier || 'bronze';
    const currentTierInfo = tierInfo[currentTier];
    const nextTierKey = Object.keys(tierInfo)[Object.keys(tierInfo).indexOf(currentTier) + 1];
    const nextTier = nextTierKey ? tierInfo[nextTierKey] : null;

    const progressToNext = nextTier 
        ? ((loyaltyPoints?.points_earned || 0) - currentTierInfo.threshold) / (nextTier.threshold - currentTierInfo.threshold) * 100
        : 100;

    const availableRewards = rewards.filter(r => {
        const tierIndex = Object.keys(tierInfo).indexOf(currentTier);
        const requiredTierIndex = Object.keys(tierInfo).indexOf(r.tier_required);
        return tierIndex >= requiredTierIndex && (loyaltyPoints?.total_points || 0) >= r.points_required;
    });

    const TierIcon = currentTierInfo.icon;

    return (
        <div className="space-y-6">
            {/* Points Balance Card */}
            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-orange-100 text-sm">Your Points Balance</p>
                            <CardTitle className="text-4xl font-bold mt-2">
                                {loyaltyPoints?.total_points || 0}
                            </CardTitle>
                        </div>
                        <div className={`w-16 h-16 ${currentTierInfo.color} rounded-full flex items-center justify-center`}>
                            <TierIcon className="w-8 h-8 text-white" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between text-sm mb-2">
                        <span>{currentTierInfo.name} Member</span>
                        {nextTier && <span>Next: {nextTier.name}</span>}
                    </div>
                    {nextTier && (
                        <>
                            <Progress value={progressToNext} className="h-2 bg-orange-400" />
                            <p className="text-xs text-orange-100 mt-2">
                                {nextTier.threshold - (loyaltyPoints?.points_earned || 0)} points to {nextTier.name}
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <TrendingUp className="w-8 h-8 mx-auto text-green-600 mb-2" />
                        <p className="text-2xl font-bold">{loyaltyPoints?.points_earned || 0}</p>
                        <p className="text-xs text-gray-500">Total Earned</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 text-center">
                        <Gift className="w-8 h-8 mx-auto text-purple-600 mb-2" />
                        <p className="text-2xl font-bold">{loyaltyPoints?.points_redeemed || 0}</p>
                        <p className="text-xs text-gray-500">Total Redeemed</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 text-center">
                        <Trophy className="w-8 h-8 mx-auto text-orange-600 mb-2" />
                        <p className="text-2xl font-bold">{loyaltyPoints?.orders_count || 0}</p>
                        <p className="text-xs text-gray-500">Orders</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 text-center">
                        <TierIcon className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                        <p className="text-2xl font-bold capitalize">{currentTier}</p>
                        <p className="text-xs text-gray-500">Tier</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="rewards" className="w-full">
                <TabsList className="w-full">
                    <TabsTrigger value="rewards" className="flex-1">Available Rewards</TabsTrigger>
                    <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
                </TabsList>

                <TabsContent value="rewards" className="space-y-4 mt-4">
                    {availableRewards.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-gray-500">
                                <Gift className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                <p>No rewards available yet. Keep earning points!</p>
                            </CardContent>
                        </Card>
                    ) : (
                        availableRewards.map(reward => (
                            <Card key={reward.id} className="hover:shadow-lg transition-shadow">
                                <CardContent className="p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-16 h-16 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <Gift className="w-8 h-8 text-orange-600" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg">{reward.name}</h3>
                                            <p className="text-sm text-gray-600 mb-3">{reward.description}</p>
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-orange-500">{reward.points_required} points</Badge>
                                                <Badge variant="outline" className="capitalize">{reward.tier_required}</Badge>
                                            </div>
                                        </div>
                                        <Button className="bg-orange-500 hover:bg-orange-600">
                                            Redeem
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </TabsContent>

                <TabsContent value="history" className="space-y-3 mt-4">
                    {transactions.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-gray-500">
                                <History className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                <p>No transaction history yet</p>
                            </CardContent>
                        </Card>
                    ) : (
                        transactions.map(txn => (
                            <Card key={txn.id}>
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">{txn.description}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(txn.created_date).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold ${txn.transaction_type === 'earned' ? 'text-green-600' : 'text-red-600'}`}>
                                                {txn.transaction_type === 'earned' ? '+' : '-'}{Math.abs(txn.points)}
                                            </p>
                                            <Badge variant="outline" className="text-xs capitalize">
                                                {txn.transaction_type}
                                            </Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}