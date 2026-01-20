import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Award, Plus, Edit, Trash2, Star, Gift, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

export default function LoyaltyProgramManagement({ restaurantId }) {
    const [editingReward, setEditingReward] = useState(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        points_required: 100,
        reward_type: 'discount_percentage',
        reward_value: 10,
        is_active: true,
    });
    const queryClient = useQueryClient();

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
    });

    const { data: rewards = [] } = useQuery({
        queryKey: ['loyalty-rewards', restaurantId],
        queryFn: () => base44.entities.LoyaltyReward.filter({ restaurant_id: restaurantId }),
    });

    const { data: loyaltyStats } = useQuery({
        queryKey: ['loyalty-stats', restaurantId],
        queryFn: async () => {
            const transactions = await base44.entities.LoyaltyTransaction.filter({ restaurant_id: restaurantId });
            const points = await base44.entities.LoyaltyPoints.filter({ restaurant_id: restaurantId });
            
            const totalPointsIssued = transactions
                .filter(t => t.type === 'earned')
                .reduce((sum, t) => sum + t.points, 0);
            
            const totalPointsRedeemed = transactions
                .filter(t => t.type === 'redeemed')
                .reduce((sum, t) => sum + Math.abs(t.points), 0);
            
            const activeMembers = points.filter(p => p.points > 0).length;
            
            return {
                totalPointsIssued,
                totalPointsRedeemed,
                activeMembers,
                totalTransactions: transactions.length
            };
        },
    });

    const updateRestaurantMutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant', restaurantId]);
            toast.success('Loyalty program settings updated');
        },
    });

    const createRewardMutation = useMutation({
        mutationFn: (rewardData) => base44.entities.LoyaltyReward.create({
            ...rewardData,
            restaurant_id: restaurantId
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['loyalty-rewards']);
            toast.success('Reward created successfully');
            setIsAddDialogOpen(false);
            resetForm();
        },
    });

    const updateRewardMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.LoyaltyReward.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['loyalty-rewards']);
            toast.success('Reward updated successfully');
            setEditingReward(null);
            resetForm();
        },
    });

    const deleteRewardMutation = useMutation({
        mutationFn: (id) => base44.entities.LoyaltyReward.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['loyalty-rewards']);
            toast.success('Reward deleted');
        },
    });

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            points_required: 100,
            reward_type: 'discount_percentage',
            reward_value: 10,
            is_active: true,
        });
    };

    const handleSubmit = () => {
        if (!formData.name || !formData.points_required) {
            toast.error('Please fill in required fields');
            return;
        }

        if (editingReward) {
            updateRewardMutation.mutate({ id: editingReward.id, data: formData });
        } else {
            createRewardMutation.mutate(formData);
        }
    };

    const handleEdit = (reward) => {
        setEditingReward(reward);
        setFormData({
            name: reward.name,
            description: reward.description || '',
            points_required: reward.points_required,
            reward_type: reward.reward_type,
            reward_value: reward.reward_value,
            is_active: reward.is_active,
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">Loyalty Program Management</h2>
                <p className="text-sm text-gray-500">Manage your customer loyalty program and rewards</p>
            </div>

            {/* Program Settings */}
            <Card>
                <CardHeader>
                    <CardTitle>Program Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Enable Loyalty Program</Label>
                            <p className="text-sm text-gray-500">Allow customers to earn and redeem points</p>
                        </div>
                        <Switch
                            checked={restaurant?.loyalty_program_enabled}
                            onCheckedChange={(checked) => 
                                updateRestaurantMutation.mutate({ loyalty_program_enabled: checked })
                            }
                        />
                    </div>
                    <div>
                        <Label>Points Multiplier</Label>
                        <p className="text-sm text-gray-500 mb-2">Points earned per £1 spent</p>
                        <Input
                            type="number"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value={restaurant?.loyalty_points_multiplier || 1}
                            onChange={(e) => 
                                updateRestaurantMutation.mutate({ 
                                    loyalty_points_multiplier: parseFloat(e.target.value) 
                                })
                            }
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <TrendingUp className="h-4 w-4" />
                            Points Issued
                        </div>
                        <div className="text-2xl font-bold">{loyaltyStats?.totalPointsIssued || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Gift className="h-4 w-4" />
                            Points Redeemed
                        </div>
                        <div className="text-2xl font-bold">{loyaltyStats?.totalPointsRedeemed || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Star className="h-4 w-4" />
                            Active Members
                        </div>
                        <div className="text-2xl font-bold">{loyaltyStats?.activeMembers || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Award className="h-4 w-4" />
                            Transactions
                        </div>
                        <div className="text-2xl font-bold">{loyaltyStats?.totalTransactions || 0}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Rewards */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold">Loyalty Rewards</h3>
                    <Button onClick={() => setIsAddDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Reward
                    </Button>
                </div>

                {rewards.length === 0 ? (
                    <Card>
                        <CardContent className="text-center py-16">
                            <Gift className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-600 mb-2">No Rewards Yet</h3>
                            <p className="text-gray-500 mb-6">Create your first loyalty reward to incentivize customers</p>
                            <Button onClick={() => setIsAddDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Reward
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {rewards.map((reward) => (
                            <Card key={reward.id}>
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle className="flex items-center gap-2">
                                                {reward.name}
                                                <Badge variant={reward.is_active ? 'default' : 'secondary'} className={reward.is_active ? 'bg-green-500' : 'bg-gray-400'}>
                                                    {reward.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </CardTitle>
                                            <p className="text-sm text-gray-500 mt-1">{reward.description}</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                                        <span className="text-sm text-gray-600">Points Required</span>
                                        <span className="text-lg font-bold text-orange-600">{reward.points_required}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                                        <span className="text-sm text-gray-600">Reward</span>
                                        <span className="font-semibold text-blue-600">
                                            {reward.reward_type === 'discount_percentage' && `${reward.reward_value}% off`}
                                            {reward.reward_type === 'discount_fixed' && `£${reward.reward_value} off`}
                                            {reward.reward_type === 'free_item' && 'Free Item'}
                                        </span>
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <Button
                                            onClick={() => handleEdit(reward)}
                                            variant="outline"
                                            className="flex-1"
                                            size="sm"
                                        >
                                            <Edit className="h-3 w-3 mr-1" />
                                            Edit
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                if (confirm('Delete this reward?')) {
                                                    deleteRewardMutation.mutate(reward.id);
                                                }
                                            }}
                                            variant="destructive"
                                            size="sm"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Reward Dialog */}
            <Dialog open={isAddDialogOpen || !!editingReward} onOpenChange={(open) => {
                if (!open) {
                    setIsAddDialogOpen(false);
                    setEditingReward(null);
                    resetForm();
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingReward ? 'Edit Reward' : 'Create New Reward'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="name">Reward Name *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="10% Off Your Next Order"
                            />
                        </div>
                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Input
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Enjoy 10% off on your next purchase"
                            />
                        </div>
                        <div>
                            <Label htmlFor="points_required">Points Required *</Label>
                            <Input
                                id="points_required"
                                type="number"
                                min="1"
                                value={formData.points_required}
                                onChange={(e) => setFormData({ ...formData, points_required: parseInt(e.target.value) })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="reward_type">Reward Type</Label>
                            <select
                                id="reward_type"
                                className="w-full p-2 border rounded-md"
                                value={formData.reward_type}
                                onChange={(e) => setFormData({ ...formData, reward_type: e.target.value })}
                            >
                                <option value="discount_percentage">Percentage Discount</option>
                                <option value="discount_fixed">Fixed Amount Discount</option>
                                <option value="free_item">Free Item</option>
                            </select>
                        </div>
                        {formData.reward_type !== 'free_item' && (
                            <div>
                                <Label htmlFor="reward_value">
                                    {formData.reward_type === 'discount_percentage' ? 'Discount %' : 'Discount Amount (£)'}
                                </Label>
                                <Input
                                    id="reward_value"
                                    type="number"
                                    min="1"
                                    value={formData.reward_value}
                                    onChange={(e) => setFormData({ ...formData, reward_value: parseFloat(e.target.value) })}
                                />
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <Label htmlFor="is_active">Active</Label>
                            <Switch
                                id="is_active"
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setIsAddDialogOpen(false);
                            setEditingReward(null);
                            resetForm();
                        }}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} className="bg-orange-500 hover:bg-orange-600">
                            {editingReward ? 'Update Reward' : 'Create Reward'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}