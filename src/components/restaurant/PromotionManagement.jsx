import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, TrendingUp, Percent, DollarSign, Gift, Truck, Calendar } from 'lucide-react';
import { format, isAfter, isBefore, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';

export default function PromotionManagement({ restaurantId }) {
    const [editingPromotion, setEditingPromotion] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        promotion_type: 'percentage_off',
        discount_value: 0,
        minimum_order: 0,
        start_date: '',
        end_date: '',
        is_active: true,
        usage_limit: null
    });
    const queryClient = useQueryClient();

    const { data: promotions = [] } = useQuery({
        queryKey: ['promotions', restaurantId],
        queryFn: () => base44.entities.Promotion.filter({ restaurant_id: restaurantId }, '-created_date'),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['promotion-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }),
    });

    const createPromotionMutation = useMutation({
        mutationFn: (data) => base44.entities.Promotion.create({ ...data, restaurant_id: restaurantId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotions']);
            toast.success('Promotion created successfully');
            resetForm();
        },
    });

    const updatePromotionMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Promotion.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotions']);
            toast.success('Promotion updated');
            resetForm();
        },
    });

    const deletePromotionMutation = useMutation({
        mutationFn: (id) => base44.entities.Promotion.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotions']);
            toast.success('Promotion deleted');
        },
    });

    const resetForm = () => {
        setEditingPromotion(null);
        setFormData({
            name: '',
            description: '',
            promotion_type: 'percentage_off',
            discount_value: 0,
            minimum_order: 0,
            start_date: '',
            end_date: '',
            is_active: true,
            usage_limit: null
        });
    };

    const handleEdit = (promotion) => {
        setEditingPromotion(promotion);
        setFormData({
            name: promotion.name,
            description: promotion.description || '',
            promotion_type: promotion.promotion_type,
            discount_value: promotion.discount_value,
            minimum_order: promotion.minimum_order || 0,
            start_date: promotion.start_date ? format(new Date(promotion.start_date), "yyyy-MM-dd'T'HH:mm") : '',
            end_date: promotion.end_date ? format(new Date(promotion.end_date), "yyyy-MM-dd'T'HH:mm") : '',
            is_active: promotion.is_active,
            usage_limit: promotion.usage_limit || null
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (new Date(formData.end_date) <= new Date(formData.start_date)) {
            toast.error('End date must be after start date');
            return;
        }

        if (editingPromotion) {
            updatePromotionMutation.mutate({ id: editingPromotion.id, data: formData });
        } else {
            createPromotionMutation.mutate(formData);
        }
    };

    const getPromotionStatus = (promotion) => {
        const now = new Date();
        const start = new Date(promotion.start_date);
        const end = new Date(promotion.end_date);

        if (!promotion.is_active) return { label: 'Inactive', color: 'bg-gray-100 text-gray-700' };
        if (isBefore(now, start)) return { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' };
        if (isAfter(now, end)) return { label: 'Expired', color: 'bg-red-100 text-red-700' };
        if (promotion.usage_limit && promotion.usage_count >= promotion.usage_limit) {
            return { label: 'Limit Reached', color: 'bg-orange-100 text-orange-700' };
        }
        return { label: 'Active', color: 'bg-green-100 text-green-700' };
    };

    const promotionTypeIcons = {
        percentage_off: Percent,
        fixed_amount_off: DollarSign,
        buy_one_get_one: Gift,
        free_delivery: Truck
    };

    const activePromotions = promotions.filter(p => {
        const status = getPromotionStatus(p);
        return status.label === 'Active';
    });

    const totalRevenue = promotions.reduce((sum, p) => sum + (p.total_revenue_generated || 0), 0);
    const totalDiscounts = promotions.reduce((sum, p) => sum + (p.total_discount_given || 0), 0);

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Active Promotions</p>
                                <p className="text-2xl font-bold">{activePromotions.length}</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Revenue</p>
                                <p className="text-2xl font-bold">£{totalRevenue.toFixed(2)}</p>
                            </div>
                            <DollarSign className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Discounts Given</p>
                                <p className="text-2xl font-bold">£{totalDiscounts.toFixed(2)}</p>
                            </div>
                            <Gift className="h-8 w-8 text-orange-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Promotions</p>
                                <p className="text-2xl font-bold">{promotions.length}</p>
                            </div>
                            <Percent className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="manage">
                <TabsList>
                    <TabsTrigger value="manage">Manage Promotions</TabsTrigger>
                    <TabsTrigger value="create">Create New</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="manage" className="space-y-4">
                    {promotions.length === 0 ? (
                        <Card>
                            <CardContent className="text-center py-12">
                                <Gift className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-gray-700 mb-2">No Promotions Yet</h3>
                                <p className="text-gray-500 mb-4">Create your first promotional campaign to boost sales</p>
                            </CardContent>
                        </Card>
                    ) : (
                        promotions.map(promotion => {
                            const status = getPromotionStatus(promotion);
                            const Icon = promotionTypeIcons[promotion.promotion_type] || Percent;
                            
                            return (
                                <Card key={promotion.id}>
                                    <CardContent className="p-6">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <Icon className="h-5 w-5 text-orange-500" />
                                                    <h3 className="font-semibold text-lg">{promotion.name}</h3>
                                                    <Badge className={status.color}>
                                                        {status.label}
                                                    </Badge>
                                                </div>
                                                
                                                {promotion.description && (
                                                    <p className="text-sm text-gray-600 mb-3">{promotion.description}</p>
                                                )}
                                                
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                    <div>
                                                        <p className="text-gray-500">Type</p>
                                                        <p className="font-medium capitalize">
                                                            {promotion.promotion_type.replace(/_/g, ' ')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-gray-500">Discount</p>
                                                        <p className="font-medium">
                                                            {promotion.promotion_type === 'percentage_off' 
                                                                ? `${promotion.discount_value}%`
                                                                : `£${promotion.discount_value}`}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-gray-500">Period</p>
                                                        <p className="font-medium">
                                                            {format(new Date(promotion.start_date), 'MMM d')} - {format(new Date(promotion.end_date), 'MMM d')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-gray-500">Usage</p>
                                                        <p className="font-medium">
                                                            {promotion.usage_count || 0}
                                                            {promotion.usage_limit ? ` / ${promotion.usage_limit}` : ''}
                                                        </p>
                                                    </div>
                                                </div>

                                                {(promotion.total_revenue_generated > 0 || promotion.total_discount_given > 0) && (
                                                    <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-4 text-sm">
                                                        <div>
                                                            <p className="text-gray-500">Revenue Generated</p>
                                                            <p className="font-semibold text-green-600">
                                                                £{(promotion.total_revenue_generated || 0).toFixed(2)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-gray-500">Discounts Given</p>
                                                            <p className="font-semibold text-orange-600">
                                                                £{(promotion.total_discount_given || 0).toFixed(2)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex gap-2">
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    onClick={() => handleEdit(promotion)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    onClick={() => deletePromotionMutation.mutate(promotion.id)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                </TabsContent>

                <TabsContent value="create">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {editingPromotion ? 'Edit Promotion' : 'Create New Promotion'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <Label>Promotion Name *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g., Summer Sale 2024"
                                        required
                                    />
                                </div>

                                <div>
                                    <Label>Description</Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Describe your promotion..."
                                        rows={3}
                                    />
                                </div>

                                <div>
                                    <Label>Promotion Type *</Label>
                                    <Select
                                        value={formData.promotion_type}
                                        onValueChange={(value) => setFormData({ ...formData, promotion_type: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="percentage_off">Percentage Off</SelectItem>
                                            <SelectItem value="fixed_amount_off">Fixed Amount Off</SelectItem>
                                            <SelectItem value="buy_one_get_one">Buy One Get One</SelectItem>
                                            <SelectItem value="free_delivery">Free Delivery</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {formData.promotion_type !== 'free_delivery' && (
                                    <div>
                                        <Label>
                                            Discount Value * ({formData.promotion_type === 'percentage_off' ? '%' : '£'})
                                        </Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.discount_value}
                                            onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })}
                                            required
                                        />
                                    </div>
                                )}

                                <div>
                                    <Label>Minimum Order Amount (£)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.minimum_order}
                                        onChange={(e) => setFormData({ ...formData, minimum_order: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Start Date & Time *</Label>
                                        <Input
                                            type="datetime-local"
                                            value={formData.start_date}
                                            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label>End Date & Time *</Label>
                                        <Input
                                            type="datetime-local"
                                            value={formData.end_date}
                                            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <Label>Usage Limit (optional)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={formData.usage_limit || ''}
                                        onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value ? parseInt(e.target.value) : null })}
                                        placeholder="Leave empty for unlimited"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_active}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                    />
                                    <Label>Active</Label>
                                </div>

                                <div className="flex gap-3 justify-end pt-4">
                                    {editingPromotion && (
                                        <Button type="button" variant="outline" onClick={resetForm}>
                                            Cancel
                                        </Button>
                                    )}
                                    <Button
                                        type="submit"
                                        className="bg-orange-500 hover:bg-orange-600"
                                        disabled={createPromotionMutation.isPending || updatePromotionMutation.isPending}
                                    >
                                        {editingPromotion ? 'Update Promotion' : 'Create Promotion'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analytics">
                    <div className="grid gap-4">
                        {promotions.map(promotion => {
                            const status = getPromotionStatus(promotion);
                            const ROI = promotion.total_discount_given > 0 
                                ? ((promotion.total_revenue_generated - promotion.total_discount_given) / promotion.total_discount_given * 100).toFixed(1)
                                : 0;

                            return (
                                <Card key={promotion.id}>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold text-lg">{promotion.name}</h3>
                                            <Badge className={status.color}>{status.label}</Badge>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="bg-green-50 p-4 rounded-lg">
                                                <p className="text-sm text-green-700 mb-1">Revenue</p>
                                                <p className="text-xl font-bold text-green-600">
                                                    £{(promotion.total_revenue_generated || 0).toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="bg-orange-50 p-4 rounded-lg">
                                                <p className="text-sm text-orange-700 mb-1">Discounts</p>
                                                <p className="text-xl font-bold text-orange-600">
                                                    £{(promotion.total_discount_given || 0).toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="bg-blue-50 p-4 rounded-lg">
                                                <p className="text-sm text-blue-700 mb-1">Usage</p>
                                                <p className="text-xl font-bold text-blue-600">
                                                    {promotion.usage_count || 0}
                                                </p>
                                            </div>
                                            <div className="bg-purple-50 p-4 rounded-lg">
                                                <p className="text-sm text-purple-700 mb-1">ROI</p>
                                                <p className="text-xl font-bold text-purple-600">
                                                    {ROI}%
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}