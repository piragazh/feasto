import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Percent } from 'lucide-react';
import { toast } from 'sonner';

export default function MealDealsManagement({ restaurantId }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingDeal, setEditingDeal] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        image_url: '',
        original_price: '',
        deal_price: '',
        items: [],
        category_rules: [],
        is_active: true
    });

    const queryClient = useQueryClient();

    const { data: deals = [] } = useQuery({
        queryKey: ['meal-deals', restaurantId],
        queryFn: () => base44.entities.MealDeal.filter({ restaurant_id: restaurantId }),
    });

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
    });

    const categories = restaurant?.menu_categories || [];

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.MealDeal.create({ ...data, restaurant_id: restaurantId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['meal-deals']);
            toast.success('Meal deal added');
            resetForm();
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MealDeal.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['meal-deals']);
            toast.success('Meal deal updated');
            resetForm();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.MealDeal.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['meal-deals']);
            toast.success('Meal deal deleted');
        },
    });

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            image_url: '',
            original_price: '',
            deal_price: '',
            items: [],
            category_rules: [],
            is_active: true
        });
        setEditingDeal(null);
        setDialogOpen(false);
    };

    const handleEdit = (deal) => {
        setEditingDeal(deal);
        setFormData({
            name: deal.name,
            description: deal.description || '',
            image_url: deal.image_url || '',
            original_price: deal.original_price?.toString() || '',
            deal_price: deal.deal_price.toString(),
            items: deal.items || [],
            category_rules: deal.category_rules || [],
            is_active: deal.is_active !== false
        });
        setDialogOpen(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = {
            ...formData,
            original_price: formData.original_price ? parseFloat(formData.original_price) : null,
            deal_price: parseFloat(formData.deal_price),
            items: formData.items
        };

        if (editingDeal) {
            updateMutation.mutate({ id: editingDeal.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Meal Deals</h2>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="h-5 w-5 mr-2" />
                            Add Meal Deal
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingDeal ? 'Edit' : 'Add'} Meal Deal</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 pr-4">
                            <div>
                                <Label>Deal Name *</Label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <Label>Description</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={2}
                                />
                            </div>
                            <div>
                                <Label>Image URL</Label>
                                <Input
                                    value={formData.image_url}
                                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                />
                            </div>
                            <div>
                                 <Label>Specific Items in Deal</Label>
                                    <p className="text-xs text-gray-500 mb-2">Optional: Add fixed items that are always included</p>
                                        <div className="space-y-2">
                                            {formData.items.map((item, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <select
                                                        className="flex-1 px-3 py-2 border rounded-md"
                                                        value={item.menu_item_id}
                                                        onChange={(e) => {
                                                            const menuItem = menuItems.find(m => m.id === e.target.value);
                                                            const newItems = [...formData.items];
                                                            newItems[idx] = {
                                                                menu_item_id: e.target.value,
                                                                name: menuItem?.name || '',
                                                                quantity: item.quantity || 1
                                                            };
                                                            setFormData({ ...formData, items: newItems });
                                                        }}
                                                    >
                                                        <option value="">Select menu item</option>
                                                        {menuItems.map(m => (
                                                            <option key={m.id} value={m.id}>{m.name} - £{m.price.toFixed(2)}</option>
                                                        ))}
                                                    </select>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        value={item.quantity}
                                                        onChange={(e) => {
                                                            const newItems = [...formData.items];
                                                            newItems[idx].quantity = parseInt(e.target.value) || 1;
                                                            setFormData({ ...formData, items: newItems });
                                                        }}
                                                        className="w-20"
                                                        placeholder="Qty"
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            const newItems = formData.items.filter((_, i) => i !== idx);
                                                            setFormData({ ...formData, items: newItems });
                                                        }}
                                                    >
                                                        ×
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setFormData({
                                                        ...formData,
                                                        items: [...formData.items, { menu_item_id: '', name: '', quantity: 1 }]
                                                    });
                                                }}
                                            >
                                                Add Item
                                            </Button>
                                        </div>

                                    <div className="mt-6">
                                    <Label>Category Selection Rules</Label>
                                    <div className="space-y-2">
                                        {formData.category_rules.map((rule, idx) => (
                                            <div key={idx} className="flex gap-2 items-start p-3 border rounded-lg">
                                                <div className="flex-1 space-y-2">
                                                    <select
                                                        className="w-full px-3 py-2 border rounded-md"
                                                        value={rule.category}
                                                        onChange={(e) => {
                                                            const newRules = [...formData.category_rules];
                                                            newRules[idx].category = e.target.value;
                                                            setFormData({ ...formData, category_rules: newRules });
                                                        }}
                                                    >
                                                        <option value="">Select category</option>
                                                        {categories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        value={rule.quantity}
                                                        onChange={(e) => {
                                                            const newRules = [...formData.category_rules];
                                                            newRules[idx].quantity = parseInt(e.target.value) || 1;
                                                            setFormData({ ...formData, category_rules: newRules });
                                                        }}
                                                        placeholder="Quantity"
                                                    />
                                                    <Input
                                                        value={rule.label}
                                                        onChange={(e) => {
                                                            const newRules = [...formData.category_rules];
                                                            newRules[idx].label = e.target.value;
                                                            setFormData({ ...formData, category_rules: newRules });
                                                        }}
                                                        placeholder="Label (e.g., Choose 2 Pizzas)"
                                                    />
                                                </div>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        const newRules = formData.category_rules.filter((_, i) => i !== idx);
                                                        setFormData({ ...formData, category_rules: newRules });
                                                    }}
                                                >
                                                    ×
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setFormData({
                                                    ...formData,
                                                    category_rules: [...formData.category_rules, { category: '', quantity: 1, label: '' }]
                                                });
                                            }}
                                        >
                                            Add Category Rule
                                        </Button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Optional: Let customers choose items from these categories
                                    </p>
                                    </div>
                                    </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Original Price (£)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.original_price}
                                        onChange={(e) => setFormData({ ...formData, original_price: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label>Deal Price (£) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.deal_price}
                                        onChange={(e) => setFormData({ ...formData, deal_price: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                />
                                <Label>Active</Label>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <Button type="button" variant="outline" onClick={resetForm}>
                                    Cancel
                                </Button>
                                <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                                    {editingDeal ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {deals.map((deal) => (
                    <Card key={deal.id}>
                        <CardContent className="p-4">
                            <div className="flex gap-4">
                                {deal.image_url && (
                                    <img
                                        src={deal.image_url}
                                        alt={deal.name}
                                        className="w-24 h-24 object-cover rounded-lg"
                                    />
                                )}
                                <div className="flex-1">
                                    <h3 className="font-semibold mb-1">{deal.name}</h3>
                                     <p className="text-sm text-gray-600 mb-2 line-clamp-2">{deal.description}</p>
                                     <p className="text-xs text-gray-500 mb-2">
                                         {[
                                             ...(deal.items?.length > 0 ? [deal.items.map(item => `${item.quantity}x ${item.name}`).join(', ')] : []),
                                             ...(deal.category_rules?.length > 0 ? [deal.category_rules.map(rule => rule.label || `${rule.quantity}x ${rule.category}`).join(' + ')] : [])
                                         ].join(' + ')}
                                     </p>
                                    <div className="flex items-center gap-2 mb-2">
                                        {deal.original_price && (
                                            <span className="text-sm text-gray-400 line-through">
                                                £{deal.original_price.toFixed(2)}
                                            </span>
                                        )}
                                        <span className="text-lg font-bold text-orange-600">
                                            £{deal.deal_price.toFixed(2)}
                                        </span>
                                        {deal.original_price && (
                                            <span className="text-xs text-green-600">
                                                Save {Math.round(((deal.original_price - deal.deal_price) / deal.original_price) * 100)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => handleEdit(deal)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                if (confirm('Delete this deal?')) {
                                                    deleteMutation.mutate(deal.id);
                                                }
                                            }}
                                            className="text-red-600"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}