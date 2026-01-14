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
import { Gift, TrendingUp, Users, Award, Plus, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';

export default function LoyaltyProgramSettings() {
    const [showRewardDialog, setShowRewardDialog] = useState(false);
    const [editingReward, setEditingReward] = useState(null);
    const [rewardForm, setRewardForm] = useState({
        name: '',
        description: '',
        points_required: 0,
        reward_type: 'fixed_discount',
        discount_value: 0,
        is_active: true
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

    const stats = {
        totalRewards: rewards.length,
        totalUsers: userPoints.length,
        totalPoints: userPoints.reduce((sum, up) => sum + (up.points_balance || 0), 0),
        totalTransactions: transactions.length,
        participatingRestaurants: restaurants.filter(r => r.loyalty_program_enabled).length
    };

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

            <Tabs defaultValue="rewards">
                <TabsList>
                    <TabsTrigger value="rewards">Rewards</TabsTrigger>
                    <TabsTrigger value="users">User Points</TabsTrigger>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
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
                            <CardTitle>User Points ({userPoints.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {userPoints.map(up => (
                                    <div key={up.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div>
                                            <p className="font-medium">{up.created_by}</p>
                                            <p className="text-sm text-gray-600">Member since {new Date(up.created_date).toLocaleDateString()}</p>
                                        </div>
                                        <Badge variant="outline" className="text-lg font-bold">
                                            {up.points_balance || 0} pts
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="transactions" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Transactions ({transactions.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {transactions.slice(0, 50).map(tx => (
                                    <div key={tx.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div>
                                            <p className="font-medium">{tx.created_by}</p>
                                            <p className="text-sm text-gray-600">{tx.description}</p>
                                            <p className="text-xs text-gray-400">{new Date(tx.created_date).toLocaleString()}</p>
                                        </div>
                                        <Badge variant={tx.points_change > 0 ? 'default' : 'destructive'}>
                                            {tx.points_change > 0 ? '+' : ''}{tx.points_change} pts
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
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
        </div>
    );
}