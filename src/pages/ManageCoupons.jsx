import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Percent, DollarSign, Calendar, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function ManageCoupons() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState(null);
    const [formData, setFormData] = useState({
        code: '',
        description: '',
        discount_type: 'percentage',
        discount_value: '',
        minimum_order: '',
        max_discount: '',
        valid_from: '',
        valid_until: '',
        usage_limit: '',
        is_active: true
    });

    const queryClient = useQueryClient();

    const { data: coupons = [], isLoading } = useQuery({
        queryKey: ['coupons'],
        queryFn: () => base44.entities.Coupon.list('-created_date'),
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.Coupon.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['coupons']);
            toast.success('Coupon created successfully');
            setIsDialogOpen(false);
            resetForm();
        },
        onError: () => toast.error('Failed to create coupon')
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Coupon.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['coupons']);
            toast.success('Coupon updated successfully');
            setIsDialogOpen(false);
            setEditingCoupon(null);
            resetForm();
        },
        onError: () => toast.error('Failed to update coupon')
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Coupon.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['coupons']);
            toast.success('Coupon deleted');
        },
        onError: () => toast.error('Failed to delete coupon')
    });

    const resetForm = () => {
        setFormData({
            code: '',
            description: '',
            discount_type: 'percentage',
            discount_value: '',
            minimum_order: '',
            max_discount: '',
            valid_from: '',
            valid_until: '',
            usage_limit: '',
            is_active: true
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const data = {
            ...formData,
            code: formData.code.toUpperCase().trim(),
            discount_value: parseFloat(formData.discount_value),
            minimum_order: formData.minimum_order ? parseFloat(formData.minimum_order) : null,
            max_discount: formData.max_discount ? parseFloat(formData.max_discount) : null,
            usage_limit: formData.usage_limit ? parseInt(formData.usage_limit) : null,
        };

        if (editingCoupon) {
            updateMutation.mutate({ id: editingCoupon.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleEdit = (coupon) => {
        setEditingCoupon(coupon);
        setFormData({
            code: coupon.code,
            description: coupon.description || '',
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value.toString(),
            minimum_order: coupon.minimum_order?.toString() || '',
            max_discount: coupon.max_discount?.toString() || '',
            valid_from: coupon.valid_from || '',
            valid_until: coupon.valid_until || '',
            usage_limit: coupon.usage_limit?.toString() || '',
            is_active: coupon.is_active
        });
        setIsDialogOpen(true);
    };

    const handleDelete = (id) => {
        if (confirm('Are you sure you want to delete this coupon?')) {
            deleteMutation.mutate(id);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Manage Coupons</h1>
                        <p className="text-gray-500 mt-1">Create and manage promotional codes</p>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) {
                            setEditingCoupon(null);
                            resetForm();
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button className="bg-orange-500 hover:bg-orange-600">
                                <Plus className="h-5 w-5 mr-2" />
                                Create Coupon
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}
                                </DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <Label>Coupon Code *</Label>
                                        <Input
                                            value={formData.code}
                                            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                            placeholder="e.g., SAVE20"
                                            className="uppercase"
                                            required
                                        />
                                    </div>
                                    
                                    <div className="col-span-2">
                                        <Label>Description</Label>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="e.g., Get 20% off your order"
                                            rows={2}
                                        />
                                    </div>

                                    <div>
                                        <Label>Discount Type *</Label>
                                        <Select
                                            value={formData.discount_type}
                                            onValueChange={(value) => setFormData({ ...formData, discount_type: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="percentage">Percentage Off</SelectItem>
                                                <SelectItem value="fixed">Fixed Amount Off</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div>
                                        <Label>
                                            {formData.discount_type === 'percentage' ? 'Percentage (%)' : 'Amount ($)'} *
                                        </Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={formData.discount_value}
                                            onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                                            placeholder={formData.discount_type === 'percentage' ? '20' : '5.00'}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <Label>Minimum Order ($)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={formData.minimum_order}
                                            onChange={(e) => setFormData({ ...formData, minimum_order: e.target.value })}
                                            placeholder="0.00"
                                        />
                                    </div>

                                    {formData.discount_type === 'percentage' && (
                                        <div>
                                            <Label>Max Discount ($)</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={formData.max_discount}
                                                onChange={(e) => setFormData({ ...formData, max_discount: e.target.value })}
                                                placeholder="10.00"
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <Label>Valid From</Label>
                                        <Input
                                            type="date"
                                            value={formData.valid_from}
                                            onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <Label>Valid Until</Label>
                                        <Input
                                            type="date"
                                            value={formData.valid_until}
                                            onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <Label>Usage Limit</Label>
                                        <Input
                                            type="number"
                                            value={formData.usage_limit}
                                            onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                                            placeholder="Unlimited"
                                        />
                                    </div>

                                    <div>
                                        <Label>Status</Label>
                                        <Select
                                            value={formData.is_active ? 'active' : 'inactive'}
                                            onValueChange={(value) => setFormData({ ...formData, is_active: value === 'active' })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="inactive">Inactive</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setIsDialogOpen(false);
                                            setEditingCoupon(null);
                                            resetForm();
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="bg-orange-500 hover:bg-orange-600"
                                        disabled={createMutation.isPending || updateMutation.isPending}
                                    >
                                        {editingCoupon ? 'Update' : 'Create'} Coupon
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {isLoading ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-64 rounded-2xl" />
                        ))}
                    </div>
                ) : coupons.length === 0 ? (
                    <Card className="text-center py-16">
                        <CardContent>
                            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Percent className="h-10 w-10 text-orange-500" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2">No coupons yet</h3>
                            <p className="text-gray-500 mb-6">Create your first promotional coupon</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {coupons.map((coupon, index) => (
                            <motion.div
                                key={coupon.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                            >
                                <Card className="relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 opacity-5 rounded-full -translate-y-8 translate-x-8" />
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <CardTitle className="text-2xl font-mono mb-2">
                                                    {coupon.code}
                                                </CardTitle>
                                                <p className="text-sm text-gray-500 line-clamp-2">
                                                    {coupon.description || 'No description'}
                                                </p>
                                            </div>
                                            <Badge variant={coupon.is_active ? 'default' : 'secondary'}>
                                                {coupon.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
                                            {coupon.discount_type === 'percentage' ? (
                                                <Percent className="h-5 w-5 text-orange-600" />
                                            ) : (
                                                <DollarSign className="h-5 w-5 text-orange-600" />
                                            )}
                                            <div>
                                                <p className="font-semibold text-orange-900">
                                                    {coupon.discount_type === 'percentage'
                                                        ? `${coupon.discount_value}% Off`
                                                        : `$${coupon.discount_value} Off`}
                                                </p>
                                                {coupon.minimum_order > 0 && (
                                                    <p className="text-xs text-orange-700">
                                                        Min. order: ${coupon.minimum_order.toFixed(2)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2 text-sm">
                                            {coupon.valid_until && (
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <Calendar className="h-4 w-4" />
                                                    <span>Expires: {new Date(coupon.valid_until).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                            {coupon.usage_limit && (
                                                <div className="text-gray-600">
                                                    Used: {coupon.usage_count || 0} / {coupon.usage_limit}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEdit(coupon)}
                                                className="flex-1"
                                            >
                                                <Edit className="h-4 w-4 mr-1" />
                                                Edit
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDelete(coupon.id)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}