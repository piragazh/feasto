import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Gift, TrendingUp, Users, Award, Plus, Trash2, Edit, Settings, Store, BarChart3, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

export default function LoyaltyProgramSettings() {
    const [showRewardDialog, setShowRewardDialog] = useState(false);
    const [editingReward, setEditingReward] = useState(null);
    const [showSettingsDialog, setShowSettingsDialog] = useState(false);
    const [rewardForm, setRewardForm] = useState({
        name: '',
        description: '',
        points_required: 0,
        reward_type: 'fixed_discount',
        discount_value: 0,
        is_active: true
    });
    const [settings, setSettings] = useState({
        points_per_pound: 1,
        first_order_bonus: 50,
        referral_bonus: 100,
        minimum_order_for_points: 5
    });
    const queryClient = useQueryClient();

    const { data: rewards = [] } = useQuery({
        queryKey: ['loyalty-rewards'],
        queryFn: () => base44.entities.LoyaltyReward.list(),
    });

    const { data: transactions = [] } = useQuery({
        queryKey: ['loyalty-transactions'],
        queryFn: () => base44.entities.LoyaltyTransaction.list(),
    });

    const { data: userPoints = [] } = useQuery({
        queryKey: ['loyalty-points'],
        queryFn: () => base44.entities.LoyaltyPoints.list(),
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: systemSettings = [] } = useQuery({
        queryKey: ['system-settings'],
        queryFn: async () => {
            const settings = await base44.entities.SystemSettings.list();
            return settings;
        },
    });

    // Load settings on mount
    React.useEffect(() => {
        if (systemSettings && systemSettings.length > 0) {
            const settingsMap = {};
            systemSettings.forEach(s => {
                settingsMap[s.setting_key] = s.setting_value;
            });
            setSettings({
                points_per_pound: parseFloat(settingsMap['loyalty_points_per_pound'] || 1),
                first_order_bonus: parseFloat(settingsMap['loyalty_first_order_bonus'] || 50),
                referral_bonus: parseFloat(settingsMap['loyalty_referral_bonus'] || 100),
                minimum_order_for_points: parseFloat(settingsMap['loyalty_minimum_order'] || 5)
            });
        }
    }, [systemSettings]);

    const createRewardMutation = useMutation({
        mutationFn: (data) => base44.entities.LoyaltyReward.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['loyalty-rewards']);
            toast.success('Reward created successfully');
            setShowRewardDialog(false);
            resetForm();
        },
    });

    const updateRewardMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.LoyaltyReward.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['loyalty-rewards']);
            toast.success('Reward updated successfully');
            setShowRewardDialog(false);
            resetForm();
        },
    });

    const deleteRewardMutation = useMutation({
        mutationFn: (id) => base44.entities.LoyaltyReward.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['loyalty-rewards']);
            toast.success('Reward deleted successfully');
        },
    });

    const updateSystemSettingMutation = useMutation({
        mutationFn: async ({ key, value, description }) => {
            const existing = systemSettings.find(s => s.setting_key === key);
            if (existing) {
                return base44.entities.SystemSettings.update(existing.id, {
                    setting_value: value.toString(),
                    description
                });
            } else {
                return base44.entities.SystemSettings.create({
                    setting_key: key,
                    setting_value: value.toString(),
                    description
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['system-settings']);
        },
    });

    const resetForm = () => {
        setRewardForm({
            name: '',
            description: '',
            points_required: 0,
            reward_type: 'fixed_discount',
            discount_value: 0,
            is_active: true
        });
        setEditingReward(null);
    };

    const handleSaveReward = () => {
        if (editingReward) {
            updateRewardMutation.mutate({ id: editingReward.id, data: rewardForm });
        } else {
            createRewardMutation.mutate(rewardForm);
        }
    };

    const handleEditReward = (reward) => {
        setEditingReward(reward);
        setRewardForm({
            name: reward.name,
            description: reward.description || '',
            points_required: reward.points_required,
            reward_type: reward.reward_type,
            discount_value: reward.discount_value || 0,
            is_active: reward.is_active !== false
        });
        setShowRewardDialog(true);
    };

    const handleSaveSettings = async () => {
        await Promise.all([
            updateSystemSettingMutation.mutateAsync({
                key: 'loyalty_points_per_pound',
                value: settings.points_per_pound,
                description: 'Points earned per £1 spent'
            }),
            updateSystemSettingMutation.mutateAsync({
                key: 'loyalty_first_order_bonus',
                value: settings.first_order_bonus,
                description: 'Bonus points for first order'
            }),
            updateSystemSettingMutation.mutateAsync({
                key: 'loyalty_referral_bonus',
                value: settings.referral_bonus,
                description: 'Points for referring a friend'
            }),
            updateSystemSettingMutation.mutateAsync({
                key: 'loyalty_minimum_order',
                value: settings.minimum_order_for_points,
                description: 'Minimum order value to earn points'
            })
        ]);
        toast.success('Settings updated successfully');
        setShowSettingsDialog(false);
    };

    const stats = {
        totalRewards: rewards.length,
        totalUsers: userPoints.length,
        totalPoints: userPoints.reduce((sum, up) => sum + (up.total_points || 0), 0),
        totalTransactions: transactions.length,
        participatingRestaurants: restaurants.filter(r => r.loyalty_program_enabled).length
    };

    const topCustomers = userPoints
        .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
        .slice(0, 10);

    const earnedTransactions = transactions.filter(t => t.transaction_type === 'earned');
    const redeemedTransactions = transactions.filter(t => t.transaction_type === 'redeemed');
    const totalEarnedPoints = earnedTransactions.reduce((sum, t) => sum + (t.points || 0), 0);
    const totalRedeemedPoints = redeemedTransactions.reduce((sum, t) => sum + (t.points || 0), 0);

    const participatingRestaurants = restaurants.filter(r => r.loyalty_program_enabled).sort((a, b) => (b.loyalty_points_multiplier || 1) - (a.loyalty_points_multiplier || 1));

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Active Users</p>
                                <p className="text-2xl font-bold">{stats.totalUsers}</p>
                            </div>
                            <Users className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Points</p>
                                <p className="text-2xl font-bold">{stats.totalPoints.toLocaleString()}</p>
                            </div>
                            <Award className="h-8 w-8 text-orange-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Rewards</p>
                                <p className="text-2xl font-bold">{stats.totalRewards}</p>
                            </div>
                            <Gift className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Transactions</p>
                                <p className="text-2xl font-bold">{stats.totalTransactions}</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Restaurants</p>
                                <p className="text-2xl font-bold">{stats.participatingRestaurants}</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-indigo-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Program Settings</CardTitle>
                    <Button onClick={() => setShowSettingsDialog(true)} variant="outline">
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="border rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">Points per £1</p>
                            <p className="text-2xl font-bold text-orange-500">{settings.points_per_pound}</p>
                        </div>
                        <div className="border rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">First Order Bonus</p>
                            <p className="text-2xl font-bold text-green-500">{settings.first_order_bonus} pts</p>
                        </div>
                        <div className="border rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">Referral Bonus</p>
                            <p className="text-2xl font-bold text-blue-500">{settings.referral_bonus} pts</p>
                        </div>
                        <div className="border rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">Min Order</p>
                            <p className="text-2xl font-bold text-purple-500">£{settings.minimum_order_for_points}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="rewards">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="rewards">Rewards</TabsTrigger>
                    <TabsTrigger value="users">Top Customers</TabsTrigger>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                    <TabsTrigger value="restaurants">Restaurants</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="rewards" className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Loyalty Rewards</CardTitle>
                            <Button onClick={() => { resetForm(); setShowRewardDialog(true); }}>
                                <Plus className="h-4 w-4 mr-2" />
                                Create Reward
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {rewards.length === 0 ? (
                                <div className="text-center py-12">
                                    <Gift className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No Rewards Yet</h3>
                                    <p className="text-gray-500">Create your first loyalty reward</p>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {rewards.map(reward => (
                                        <div key={reward.id} className="border rounded-lg p-4 hover:bg-gray-50">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-lg">{reward.name}</h3>
                                                    <p className="text-sm text-gray-600 mt-1">{reward.description}</p>
                                                </div>
                                                <Badge className="ml-2">{reward.points_required} points</Badge>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                                                <span className="capitalize">{reward.reward_type.replace('_', ' ')}</span>
                                                {reward.discount_value > 0 && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="font-medium text-green-600">
                                                            {reward.reward_type === 'percentage_discount' ? `${reward.discount_value}% off` : `£${reward.discount_value} off`}
                                                        </span>
                                                    </>
                                                )}
                                                {!reward.is_active && (
                                                    <>
                                                        <span>•</span>
                                                        <Badge variant="destructive">Inactive</Badge>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" onClick={() => handleEditReward(reward)}>
                                                    <Edit className="h-4 w-4 mr-1" />
                                                    Edit
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="destructive" 
                                                    onClick={() => {
                                                        if (confirm('Delete this reward?')) {
                                                            deleteRewardMutation.mutate(reward.id);
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-1" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="users" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Top Customers by Points ({topCustomers.length} of {userPoints.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {topCustomers.length === 0 ? (
                                <div className="text-center py-8">
                                    <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">No customer data yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {topCustomers.map((customer, idx) => (
                                        <div key={customer.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-lg text-gray-400 w-6">#{idx + 1}</span>
                                                <div>
                                                    <p className="font-medium">{customer.user_email}</p>
                                                    <p className="text-xs text-gray-600">Member since {new Date(customer.created_date).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <Badge className="text-lg font-bold bg-orange-100 text-orange-800">
                                                {customer.total_points || 0} pts
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="transactions" className="space-y-4">
                    {/* Transaction Stats */}
                    <div className="grid md:grid-cols-3 gap-4">
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600">Total Transactions</p>
                                        <p className="text-2xl font-bold">{transactions.length}</p>
                                    </div>
                                    <TrendingUp className="h-8 w-8 text-blue-500" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600">Total Earned</p>
                                        <p className="text-2xl font-bold text-green-600">{totalEarnedPoints.toLocaleString()}</p>
                                    </div>
                                    <TrendingUp className="h-8 w-8 text-green-500" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600">Total Redeemed</p>
                                        <p className="text-2xl font-bold text-red-600">{totalRedeemedPoints.toLocaleString()}</p>
                                    </div>
                                    <TrendingDown className="h-8 w-8 text-red-500" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction History (Latest 50)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {transactions.length === 0 ? (
                                <div className="text-center py-8">
                                    <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">No transactions yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {transactions.slice(0, 50).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map(tx => (
                                        <div key={tx.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">{tx.user_email}</p>
                                                <p className="text-xs text-gray-600">{tx.description}</p>
                                                <p className="text-xs text-gray-400 mt-1">{new Date(tx.created_date).toLocaleString()}</p>
                                            </div>
                                            <Badge variant={tx.transaction_type === 'earned' ? 'default' : 'destructive'} className="ml-2 flex-shrink-0">
                                                {tx.transaction_type === 'earned' ? '+' : '-'}{tx.points || 0} pts
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="restaurants" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Participating Restaurants ({participatingRestaurants.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {participatingRestaurants.length === 0 ? (
                                <div className="text-center py-8">
                                    <Store className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">No participating restaurants</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {participatingRestaurants.map((restaurant) => (
                                        <div key={restaurant.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                                            <div className="flex items-center gap-3">
                                                {restaurant.logo_url && (
                                                    <img src={restaurant.logo_url} alt={restaurant.name} className="h-10 w-10 rounded object-cover" />
                                                )}
                                                <div className="flex-1">
                                                    <p className="font-medium">{restaurant.name}</p>
                                                    <p className="text-xs text-gray-600">{restaurant.cuisine_type}</p>
                                                </div>
                                            </div>
                                            <Badge variant="outline" className="flex-shrink-0">
                                                {restaurant.loyalty_points_multiplier || 1}x multiplier
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analytics" className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5" />
                                    Customer Engagement
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-gray-600">Total Users</span>
                                    <span className="font-bold">{stats.totalUsers}</span>
                                </div>
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-gray-600">Avg Points/User</span>
                                    <span className="font-bold">{stats.totalUsers > 0 ? Math.round(stats.totalPoints / stats.totalUsers) : 0}</span>
                                </div>
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-gray-600">Total Points Issued</span>
                                    <span className="font-bold text-green-600">{totalEarnedPoints.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Total Points Redeemed</span>
                                    <span className="font-bold text-red-600">{totalRedeemedPoints.toLocaleString()}</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Gift className="h-5 w-5" />
                                    Rewards & Redemption
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-gray-600">Active Rewards</span>
                                    <span className="font-bold">{rewards.filter(r => r.is_active).length}</span>
                                </div>
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-gray-600">Total Rewards</span>
                                    <span className="font-bold">{stats.totalRewards}</span>
                                </div>
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-gray-600">Redemption Rate</span>
                                    <span className="font-bold">{stats.totalPoints > 0 ? Math.round((totalRedeemedPoints / totalEarnedPoints) * 100) : 0}%</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Outstanding Points</span>
                                    <span className="font-bold">{(totalEarnedPoints - totalRedeemedPoints).toLocaleString()}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Reward Dialog */}
            <Dialog open={showRewardDialog} onOpenChange={setShowRewardDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingReward ? 'Edit Reward' : 'Create Reward'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Name</Label>
                            <Input
                                value={rewardForm.name}
                                onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
                                placeholder="e.g., £5 Off Next Order"
                            />
                        </div>
                        <div>
                            <Label>Description</Label>
                            <Input
                                value={rewardForm.description}
                                onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                                placeholder="Reward description"
                            />
                        </div>
                        <div>
                            <Label>Points Required</Label>
                            <Input
                                type="number"
                                value={rewardForm.points_required}
                                onChange={(e) => setRewardForm({ ...rewardForm, points_required: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <Label>Reward Type</Label>
                            <select
                                className="w-full border rounded-md px-3 py-2"
                                value={rewardForm.reward_type}
                                onChange={(e) => setRewardForm({ ...rewardForm, reward_type: e.target.value })}
                            >
                                <option value="percentage_discount">Percentage Discount</option>
                                <option value="fixed_discount">Fixed Discount</option>
                                <option value="free_delivery">Free Delivery</option>
                                <option value="free_item">Free Item</option>
                            </select>
                        </div>
                        <div>
                            <Label>
                                {rewardForm.reward_type === 'percentage_discount' ? 'Discount (%)' : 'Discount Value (£)'}
                            </Label>
                            <Input
                                type="number"
                                step={rewardForm.reward_type === 'percentage_discount' ? '1' : '0.01'}
                                value={rewardForm.discount_value}
                                onChange={(e) => setRewardForm({ ...rewardForm, discount_value: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                checked={rewardForm.is_active}
                                onChange={(e) => setRewardForm({ ...rewardForm, is_active: e.target.checked })}
                                className="rounded"
                            />
                            <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowRewardDialog(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveReward}>
                            {editingReward ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Settings Dialog */}
            <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Loyalty Program Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Points per £1 Spent</Label>
                            <Input
                                type="number"
                                step="0.1"
                                value={settings.points_per_pound}
                                onChange={(e) => setSettings({ ...settings, points_per_pound: parseFloat(e.target.value) || 0 })}
                            />
                            <p className="text-xs text-gray-500 mt-1">How many points customers earn for every £1 spent</p>
                        </div>
                        <div>
                            <Label>First Order Bonus Points</Label>
                            <Input
                                type="number"
                                value={settings.first_order_bonus}
                                onChange={(e) => setSettings({ ...settings, first_order_bonus: parseInt(e.target.value) || 0 })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Bonus points awarded on customer's first order</p>
                        </div>
                        <div>
                            <Label>Referral Bonus Points</Label>
                            <Input
                                type="number"
                                value={settings.referral_bonus}
                                onChange={(e) => setSettings({ ...settings, referral_bonus: parseInt(e.target.value) || 0 })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Points awarded for referring a friend</p>
                        </div>
                        <div>
                            <Label>Minimum Order for Points (£)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={settings.minimum_order_for_points}
                                onChange={(e) => setSettings({ ...settings, minimum_order_for_points: parseFloat(e.target.value) || 0 })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Orders below this amount won't earn points</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveSettings}>
                            Save Settings
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}