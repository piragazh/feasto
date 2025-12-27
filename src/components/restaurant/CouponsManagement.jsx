import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Tag } from 'lucide-react';
import { toast } from 'sonner';

export default function CouponsManagement({ restaurantId }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState(null);
    const [formData, setFormData] = useState({
        code: '',
        description: '',
        discount_type: 'percentage',
        discount_value: '',
        minimum_order: '',
        is_active: true
    });

    const queryClient = useQueryClient();

    const { data: coupons = [] } = useQuery({
        queryKey: ['restaurant-coupons', restaurantId],
        queryFn: () => base44.entities.Coupon.filter({ restaurant_id: restaurantId }),
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.Coupon.create({ ...data, restaurant_id: restaurantId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-coupons']);
            toast.success('Coupon created');
            resetForm();
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Coupon.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-coupons']);
            toast.success('Coupon updated');
            resetForm();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Coupon.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-coupons']);
            toast.success('Coupon deleted');
        },
    });

    const resetForm = () => {
        setFormData({
            code: '',
            description: '',
            discount_type: 'percentage',
            discount_value: '',
            minimum_order: '',
            is_active: true
        });
        setEditingCoupon(null);
        setDialogOpen(false);
    };

    const handleEdit = (coupon) => {
        setEditingCoupon(coupon);
        setFormData({
            code: coupon.code,
            description: coupon.description || '',
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value.toString(),
            minimum_order: coupon.minimum_order?.toString() || '',
            is_active: coupon.is_active !== false
        });
        setDialogOpen(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = {
            ...formData,
            code: formData.code.toUpperCase(),
            discount_value: parseFloat(formData.discount_value),
            minimum_order: formData.minimum_order ? parseFloat(formData.minimum_order) : null
        };

        if (editingCoupon) {
            updateMutation.mutate({ id: editingCoupon.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Restaurant Coupons</h2>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="h-5 w-5 mr-2" />
                            Create Coupon
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingCoupon ? 'Edit' : 'Create'} Coupon</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label>Code *</Label>
                                <Input
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                    className="uppercase"
                                    required
                                />
                            </div>
                            <div>
                                <Label>Description</Label>
                                <Input
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Type</Label>
                                    <Select
                                        value={formData.discount_type}
                                        onValueChange={(value) => setFormData({ ...formData, discount_type: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="percentage">Percentage</SelectItem>
                                            <SelectItem value="fixed">Fixed Amount</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Value *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.discount_value}
                                        onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Min Order ($)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.minimum_order}
                                    onChange={(e) => setFormData({ ...formData, minimum_order: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-3 justify-end">
                                <Button type="button" variant="outline" onClick={resetForm}>
                                    Cancel
                                </Button>
                                <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                                    {editingCoupon ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
                {coupons.map((coupon) => (
                    <Card key={coupon.id}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Tag className="h-4 w-4 text-orange-500" />
                                <h3 className="font-mono font-bold text-lg">{coupon.code}</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{coupon.description}</p>
                            <p className="font-semibold text-orange-600 mb-3">
                                {coupon.discount_type === 'percentage' 
                                    ? `${coupon.discount_value}% Off` 
                                    : `$${coupon.discount_value} Off`}
                            </p>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => handleEdit(coupon)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        if (confirm('Delete coupon?')) {
                                            deleteMutation.mutate(coupon.id);
                                        }
                                    }}
                                    className="text-red-600"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}