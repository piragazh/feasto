import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function CommissionManagement() {
    const [editDialog, setEditDialog] = useState(null);
    const [commissionType, setCommissionType] = useState('percentage');
    const [commissionRate, setCommissionRate] = useState('');
    const [fixedAmount, setFixedAmount] = useState('');
    const queryClient = useQueryClient();

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.filter({ status: 'delivered' }, '-created_date', 1000),
    });

    const updateCommission = useMutation({
        mutationFn: async ({ restaurantId, data }) => {
            return base44.entities.Restaurant.update(restaurantId, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['all-restaurants']);
            setEditDialog(null);
            toast.success('Commission updated successfully!');
        },
    });

    const handleSave = () => {
        if (commissionType === 'percentage' && !commissionRate) {
            toast.error('Please enter commission rate');
            return;
        }
        if (commissionType === 'fixed' && !fixedAmount) {
            toast.error('Please enter fixed amount');
            return;
        }

        updateCommission.mutate({
            restaurantId: editDialog.id,
            data: {
                commission_type: commissionType,
                commission_rate: commissionType === 'percentage' ? parseFloat(commissionRate) : editDialog.commission_rate,
                fixed_commission_amount: commissionType === 'fixed' ? parseFloat(fixedAmount) : null,
            },
        });
    };

    const calculateCommissionEarned = (restaurantId) => {
        const restaurant = restaurants.find(r => r.id === restaurantId);
        const restaurantOrders = orders.filter(o => o.restaurant_id === restaurantId);
        
        return restaurantOrders.reduce((sum, order) => {
            if (restaurant.commission_type === 'fixed') {
                return sum + (restaurant.fixed_commission_amount || 0);
            }
            return sum + (order.total * (restaurant.commission_rate || 15) / 100);
        }, 0);
    };

    const totalCommission = restaurants.reduce((sum, restaurant) => {
        return sum + calculateCommissionEarned(restaurant.id);
    }, 0);

    return (
        <div className="space-y-6">
            {/* Summary */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 mb-1">Total Commission Earned</p>
                            <p className="text-4xl font-bold text-gray-900">£{totalCommission.toFixed(2)}</p>
                        </div>
                        <div className="bg-purple-100 text-purple-600 p-4 rounded-lg">
                            <TrendingUp className="h-8 w-8" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Restaurant Commission List */}
            <Card>
                <CardHeader>
                    <CardTitle>Restaurant Commissions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {restaurants.map(restaurant => {
                            const earned = calculateCommissionEarned(restaurant.id);
                            const orderCount = orders.filter(o => o.restaurant_id === restaurant.id).length;
                            
                            return (
                                <div key={restaurant.id} className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-gray-900">{restaurant.name}</h4>
                                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                            <span>
                                                {restaurant.commission_type === 'percentage' 
                                                    ? `${restaurant.commission_rate || 15}% per order`
                                                    : `£${restaurant.fixed_commission_amount?.toFixed(2) || '0.00'} per order`
                                                }
                                            </span>
                                            <span>•</span>
                                            <span>{orderCount} orders</span>
                                        </div>
                                    </div>
                                    <div className="text-right mr-4">
                                        <p className="text-sm text-gray-600">Earned</p>
                                        <p className="text-xl font-bold text-gray-900">£{earned.toFixed(2)}</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setEditDialog(restaurant);
                                            setCommissionType(restaurant.commission_type || 'percentage');
                                            setCommissionRate(restaurant.commission_rate?.toString() || '15');
                                            setFixedAmount(restaurant.fixed_commission_amount?.toString() || '');
                                        }}
                                    >
                                        <DollarSign className="h-4 w-4 mr-1" />
                                        Edit
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Commission - {editDialog?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Commission Type</label>
                            <Select value={commissionType} onValueChange={setCommissionType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="percentage">Percentage</SelectItem>
                                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {commissionType === 'percentage' ? (
                            <div>
                                <label className="text-sm font-medium mb-2 block">Commission Rate (%)</label>
                                <Input
                                    type="number"
                                    placeholder="e.g., 15"
                                    value={commissionRate}
                                    onChange={(e) => setCommissionRate(e.target.value)}
                                    min="0"
                                    max="100"
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="text-sm font-medium mb-2 block">Fixed Amount (£)</label>
                                <Input
                                    type="number"
                                    placeholder="e.g., 2.50"
                                    value={fixedAmount}
                                    onChange={(e) => setFixedAmount(e.target.value)}
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        )}

                        <Button onClick={handleSave} className="w-full">
                            Save Changes
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}