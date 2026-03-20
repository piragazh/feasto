import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Tag, Send, Gift, Truck, Percent, DollarSign, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import CRMCampaignDialog from './CRMCampaignDialog';

const DISCOUNT_TYPES = [
    { value: 'percentage', label: '% Off', icon: Percent, color: 'text-blue-600', bgColor: 'bg-blue-50' },
    { value: 'fixed', label: '£ Off', icon: DollarSign, color: 'text-green-600', bgColor: 'bg-green-50' },
    { value: 'free_delivery', label: 'Free Delivery', icon: Truck, color: 'text-purple-600', bgColor: 'bg-purple-50' },
    { value: 'free_item', label: 'Free Item', icon: Gift, color: 'text-pink-600', bgColor: 'bg-pink-50' },
    { value: 'buy_one_get_one', label: 'BOGO', icon: ShoppingBag, color: 'text-orange-600', bgColor: 'bg-orange-50' },
];

const defaultForm = {
    code: '',
    description: '',
    discount_type: 'percentage',
    discount_value: '',
    free_item_name: '',
    minimum_order: '',
    max_discount: '',
    valid_from: '',
    valid_until: '',
    usage_limit: '',
    is_active: true
};

function getCouponLabel(coupon) {
    switch (coupon.discount_type) {
        case 'percentage': return `${coupon.discount_value}% Off`;
        case 'fixed': return `£${coupon.discount_value} Off`;
        case 'free_delivery': return 'Free Delivery';
        case 'free_item': return `Free: ${coupon.free_item_name || 'Item'}`;
        case 'buy_one_get_one': return 'Buy 1 Get 1 Free';
        default: return 'Offer';
    }
}

function getTypeInfo(type) {
    return DISCOUNT_TYPES.find(t => t.value === type) || DISCOUNT_TYPES[0];
}

export default function CouponsManagement({ restaurantId, restaurantName }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState(null);
    const [formData, setFormData] = useState(defaultForm);
    const [crmCoupon, setCrmCoupon] = useState(null);

    const queryClient = useQueryClient();

    const { data: coupons = [] } = useQuery({
        queryKey: ['restaurant-coupons', restaurantId],
        queryFn: () => base44.entities.Coupon.filter({ restaurant_id: restaurantId }),
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.Coupon.create({ ...data, restaurant_id: restaurantId }),
        onSuccess: () => { queryClient.invalidateQueries(['restaurant-coupons']); toast.success('Coupon created'); resetForm(); },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Coupon.update(id, data),
        onSuccess: () => { queryClient.invalidateQueries(['restaurant-coupons']); toast.success('Coupon updated'); resetForm(); },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Coupon.delete(id),
        onSuccess: () => { queryClient.invalidateQueries(['restaurant-coupons']); toast.success('Coupon deleted'); },
    });

    const resetForm = () => {
        setFormData(defaultForm);
        setEditingCoupon(null);
        setDialogOpen(false);
    };

    const handleEdit = (coupon) => {
        setEditingCoupon(coupon);
        setFormData({
            code: coupon.code,
            description: coupon.description || '',
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value?.toString() || '',
            free_item_name: coupon.free_item_name || '',
            minimum_order: coupon.minimum_order?.toString() || '',
            max_discount: coupon.max_discount?.toString() || '',
            valid_from: coupon.valid_from || '',
            valid_until: coupon.valid_until || '',
            usage_limit: coupon.usage_limit?.toString() || '',
            is_active: coupon.is_active !== false
        });
        setDialogOpen(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = {
            ...formData,
            code: formData.code.toUpperCase(),
            discount_value: formData.discount_value ? parseFloat(formData.discount_value) : 0,
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

    const needsValue = ['percentage', 'fixed'].includes(formData.discount_type);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Restaurant Coupons</h2>
                <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="h-5 w-5 mr-2" />
                            Create Coupon
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingCoupon ? 'Edit' : 'Create'} Coupon</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label>Coupon Code *</Label>
                                <Input
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                    className="uppercase font-mono"
                                    placeholder="e.g. SAVE20"
                                    required
                                />
                            </div>

                            <div>
                                <Label>Offer Type *</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                                    {DISCOUNT_TYPES.map(t => {
                                        const Icon = t.icon;
                                        return (
                                            <button
                                                key={t.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, discount_type: t.value })}
                                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-semibold transition-all ${
                                                    formData.discount_type === t.value
                                                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                                                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                                }`}
                                            >
                                                <Icon className="h-4 w-4 flex-shrink-0" />
                                                {t.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {needsValue && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>{formData.discount_type === 'percentage' ? 'Discount %' : 'Amount (£)'} *</Label>
                                        <Input
                                            type="number" step="0.01" min="0"
                                            value={formData.discount_value}
                                            onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                                            placeholder={formData.discount_type === 'percentage' ? 'e.g. 20' : 'e.g. 5.00'}
                                            required
                                        />
                                    </div>
                                    {formData.discount_type === 'percentage' && (
                                        <div>
                                            <Label>Max Discount (£)</Label>
                                            <Input
                                                type="number" step="0.01" min="0"
                                                value={formData.max_discount}
                                                onChange={(e) => setFormData({ ...formData, max_discount: e.target.value })}
                                                placeholder="Optional cap"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {formData.discount_type === 'free_item' && (
                                <div>
                                    <Label>Free Item Name *</Label>
                                    <Input
                                        value={formData.free_item_name}
                                        onChange={(e) => setFormData({ ...formData, free_item_name: e.target.value })}
                                        placeholder="e.g. Garlic Bread, Any Drink"
                                        required
                                    />
                                </div>
                            )}

                            <div>
                                <Label>Description</Label>
                                <Input
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Short description shown to customers"
                                />
                            </div>

                            <div>
                                <Label>Min Order (£)</Label>
                                <Input
                                    type="number" step="0.01" min="0"
                                    value={formData.minimum_order}
                                    onChange={(e) => setFormData({ ...formData, minimum_order: e.target.value })}
                                    placeholder="Optional minimum"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
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
                            </div>

                            <div>
                                <Label>Usage Limit</Label>
                                <Input
                                    type="number" min="1"
                                    value={formData.usage_limit}
                                    onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                                    placeholder="Leave blank for unlimited"
                                />
                            </div>

                            <div className="flex gap-3 justify-end pt-2">
                                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                                <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                                    {editingCoupon ? 'Update' : 'Create'} Coupon
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {coupons.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                    <Tag className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No coupons yet. Create your first one!</p>
                </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coupons.map((coupon) => {
                    const typeInfo = getTypeInfo(coupon.discount_type);
                    const TypeIcon = typeInfo.icon;
                    const isExpired = coupon.valid_until && new Date(coupon.valid_until) < new Date();
                    const usageFull = coupon.usage_limit && coupon.usage_count >= coupon.usage_limit;
                    return (
                        <Card key={coupon.id} className={`${(!coupon.is_active || isExpired || usageFull) ? 'opacity-60' : ''}`}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg ${typeInfo.bgColor}`}>
                                            <TypeIcon className={`h-4 w-4 ${typeInfo.color}`} />
                                        </div>
                                        <div>
                                            <h3 className="font-mono font-bold text-base">{coupon.code}</h3>
                                            <p className={`text-xs font-semibold ${typeInfo.color}`}>{getCouponLabel(coupon)}</p>
                                        </div>
                                    </div>
                                    <Badge variant={coupon.is_active && !isExpired && !usageFull ? 'default' : 'secondary'} className="text-xs">
                                        {isExpired ? 'Expired' : usageFull ? 'Used Up' : coupon.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>

                                {coupon.description && (
                                    <p className="text-xs text-gray-500 mb-2">{coupon.description}</p>
                                )}

                                <div className="flex flex-wrap gap-2 mb-3 text-xs text-gray-500">
                                    {coupon.minimum_order && <span>Min: £{coupon.minimum_order}</span>}
                                    {coupon.valid_until && <span>Until: {new Date(coupon.valid_until).toLocaleDateString()}</span>}
                                    {coupon.usage_limit && <span>Used: {coupon.usage_count || 0}/{coupon.usage_limit}</span>}
                                </div>

                                <div className="flex gap-2 flex-wrap">
                                    <Button size="sm" variant="outline" onClick={() => handleEdit(coupon)} className="h-8 text-xs">
                                        <Edit className="h-3 w-3 mr-1" />Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setCrmCoupon(coupon)}
                                        className="h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                                    >
                                        <Send className="h-3 w-3 mr-1" />Promote via CRM
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => { if (confirm('Delete coupon?')) deleteMutation.mutate(coupon.id); }}
                                        className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* CRM Campaign Dialog triggered from coupon */}
            {crmCoupon && (
                <CRMCampaignDialog
                    open={!!crmCoupon}
                    onClose={() => setCrmCoupon(null)}
                    coupon={crmCoupon}
                    restaurantName={restaurantName || 'Our Restaurant'}
                    targetSegment={{ segment: 'all', count: 0, recipients: [] }}
                    segmentConfig={{ all: { label: 'All Customers' } }}
                />
            )}
        </div>
    );
}