import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Zap, Pizza, Coffee, UtensilsCrossed, Users, ShoppingBag, Star } from 'lucide-react';
import { toast } from 'sonner';

const DEAL_TEMPLATES = [
    {
        id: 'pizza_drink',
        label: '🍕 Pizza & Drink',
        description: 'Classic combo - any pizza with any drink',
        icon: '🍕🥤',
        category_rules: [
            { category: 'Pizza', quantity: 1, label: 'Choose 1 Pizza' },
            { category: 'Drinks', quantity: 1, label: 'Choose 1 Drink' },
        ],
        items: []
    },
    {
        id: 'any_2_burgers',
        label: '🍔 Any 2 Burgers',
        description: 'E.g. Any 2 burgers for £7',
        icon: '🍔🍔',
        category_rules: [
            { category: 'Burgers', quantity: 2, label: 'Choose any 2 Burgers' },
        ],
        items: []
    },
    {
        id: 'family_feast',
        label: '👨‍👩‍👧 Family Feast',
        description: 'Big combo for the whole family',
        icon: '🍽️',
        category_rules: [
            { category: 'Mains', quantity: 2, label: 'Choose 2 Mains' },
            { category: 'Sides', quantity: 2, label: 'Choose 2 Sides' },
            { category: 'Drinks', quantity: 2, label: 'Choose 2 Drinks' },
        ],
        items: []
    },
    {
        id: 'main_side_drink',
        label: '🍱 Main + Side + Drink',
        description: 'Classic meal deal',
        icon: '🍱',
        category_rules: [
            { category: 'Mains', quantity: 1, label: 'Choose 1 Main' },
            { category: 'Sides', quantity: 1, label: 'Choose 1 Side' },
            { category: 'Drinks', quantity: 1, label: 'Choose 1 Drink' },
        ],
        items: []
    },
    {
        id: 'custom',
        label: '✏️ Custom Deal',
        description: 'Build from scratch',
        icon: '✏️',
        category_rules: [],
        items: []
    }
];

const EMPTY_FORM = {
    name: '',
    description: '',
    image_url: '',
    original_price: '',
    deal_price: '',
    items: [],
    category_rules: [],
    is_active: true
};

export default function MealDealsManagement({ restaurantId }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingDeal, setEditingDeal] = useState(null);
    const [step, setStep] = useState('template'); // 'template' | 'edit'
    const [formData, setFormData] = useState(EMPTY_FORM);

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

    const categories = useMemo(() => {
        const fromMenu = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
        const fromRestaurant = restaurant?.menu_categories || [];
        return [...new Set([...fromRestaurant, ...fromMenu])].sort();
    }, [menuItems, restaurant]);

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.MealDeal.create({ ...data, restaurant_id: restaurantId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['meal-deals']);
            toast.success('Combo deal created!');
            resetForm();
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MealDeal.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['meal-deals']);
            toast.success('Combo deal updated!');
            resetForm();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.MealDeal.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['meal-deals']);
            toast.success('Deal deleted');
        },
    });

    const resetForm = () => {
        setFormData(EMPTY_FORM);
        setEditingDeal(null);
        setStep('template');
        setDialogOpen(false);
    };

    const handleSelectTemplate = (template) => {
        setFormData(prev => ({
            ...prev,
            name: template.id !== 'custom' ? template.label.replace(/^[^ ]+ /, '') : '',
            description: template.description || '',
            category_rules: template.category_rules.map(r => ({ ...r })),
            items: [],
        }));
        setStep('edit');
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
        setStep('edit');
        setDialogOpen(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.deal_price) {
            toast.error('Name and deal price are required');
            return;
        }
        const data = {
            ...formData,
            original_price: formData.original_price ? parseFloat(formData.original_price) : null,
            deal_price: parseFloat(formData.deal_price),
        };
        if (editingDeal) {
            updateMutation.mutate({ id: editingDeal.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const savings = formData.original_price && formData.deal_price
        ? (parseFloat(formData.original_price) - parseFloat(formData.deal_price)).toFixed(2)
        : null;
    const savingsPct = formData.original_price && formData.deal_price && parseFloat(formData.original_price) > 0
        ? Math.round(((parseFloat(formData.original_price) - parseFloat(formData.deal_price)) / parseFloat(formData.original_price)) * 100)
        : null;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold">Combo Deals</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Pizza & Drink, Family Feast, Any 2 Burgers, and more</p>
                </div>
                <Button
                    className="bg-orange-500 hover:bg-orange-600"
                    onClick={() => { setStep('template'); setEditingDeal(null); setFormData(EMPTY_FORM); setDialogOpen(true); }}
                >
                    <Plus className="h-5 w-5 mr-2" />
                    Create Deal
                </Button>
            </div>

            {/* Deals Grid */}
            {deals.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
                    <div className="text-5xl mb-4">🍽️</div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-1">No combo deals yet</h3>
                    <p className="text-sm text-gray-500 mb-4">Create deals like "Pizza & Drink", "Any 2 Burgers for £7" or a "Family Feast"</p>
                    <Button
                        className="bg-orange-500 hover:bg-orange-600"
                        onClick={() => { setStep('template'); setEditingDeal(null); setFormData(EMPTY_FORM); setDialogOpen(true); }}
                    >
                        <Plus className="h-4 w-4 mr-2" /> Create First Deal
                    </Button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 gap-4">
                    {deals.map((deal) => (
                        <DealCard
                            key={deal.id}
                            deal={deal}
                            onEdit={() => handleEdit(deal)}
                            onDelete={() => {
                                if (confirm('Delete this deal?')) deleteMutation.mutate(deal.id);
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Dialog */}
            <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingDeal ? 'Edit Deal' : step === 'template' ? 'Choose Deal Type' : 'Configure Deal'}
                        </DialogTitle>
                    </DialogHeader>

                    {step === 'template' && !editingDeal ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
                            {DEAL_TEMPLATES.map(tmpl => (
                                <button
                                    key={tmpl.id}
                                    onClick={() => handleSelectTemplate(tmpl)}
                                    className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-left group"
                                >
                                    <span className="text-3xl">{tmpl.icon}</span>
                                    <div>
                                        <div className="font-semibold text-gray-900 group-hover:text-orange-600">{tmpl.label}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">{tmpl.description}</div>
                                        {tmpl.category_rules.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {tmpl.category_rules.map((r, i) => (
                                                    <Badge key={i} variant="secondary" className="text-xs">{r.label}</Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <Label>Deal Name *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Any 2 Burgers for £7, Family Feast"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label>Description</Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="e.g. Choose any 2 burgers from our menu and save!"
                                        rows={2}
                                    />
                                </div>
                                <div>
                                    <Label>Image URL <span className="text-gray-400 font-normal">(optional)</span></Label>
                                    <Input
                                        value={formData.image_url}
                                        onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            {/* Pricing */}
                            <div className="grid grid-cols-2 gap-4 p-4 bg-orange-50 rounded-xl border border-orange-100">
                                <div>
                                    <Label>Original Price (£)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.original_price}
                                        onChange={(e) => setFormData({ ...formData, original_price: e.target.value })}
                                        placeholder="e.g. 12.99"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Shows as strikethrough</p>
                                </div>
                                <div>
                                    <Label>Deal Price (£) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.deal_price}
                                        onChange={(e) => setFormData({ ...formData, deal_price: e.target.value })}
                                        placeholder="e.g. 7.00"
                                        required
                                    />
                                    {savingsPct > 0 && (
                                        <p className="text-xs text-green-600 mt-1 font-medium">🎉 Save {savingsPct}% (£{savings})</p>
                                    )}
                                </div>
                            </div>

                            {/* Category Rules (Let customers choose) */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <Label className="text-base">Customer Choices</Label>
                                        <p className="text-xs text-gray-500">Let customers pick from specific categories</p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setFormData({
                                            ...formData,
                                            category_rules: [...formData.category_rules, { category: '', quantity: 1, label: '' }]
                                        })}
                                    >
                                        <Plus className="h-4 w-4 mr-1" /> Add Choice
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    {formData.category_rules.map((rule, idx) => (
                                        <div key={idx} className="flex gap-2 items-end p-3 border rounded-xl bg-gray-50">
                                            <div className="flex-1 space-y-2">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-xs">Category</Label>
                                                        <select
                                                            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                                                            value={rule.category}
                                                            onChange={(e) => {
                                                                const newRules = [...formData.category_rules];
                                                                newRules[idx].category = e.target.value;
                                                                // Auto-fill label
                                                                if (!newRules[idx].label) {
                                                                    newRules[idx].label = `Choose ${newRules[idx].quantity} ${e.target.value}`;
                                                                }
                                                                setFormData({ ...formData, category_rules: newRules });
                                                            }}
                                                        >
                                                            <option value="">Select category</option>
                                                            {categories.map(cat => (
                                                                <option key={cat} value={cat}>{cat}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                       <Label className="text-xs">How many?</Label>
                                                       <Input
                                                           type="number"
                                                           min="1"
                                                           value={rule.quantity}
                                                           onChange={(e) => {
                                                               const newRules = [...formData.category_rules];
                                                               newRules[idx].quantity = e.target.value === '' ? '' : parseInt(e.target.value);
                                                               setFormData({ ...formData, category_rules: newRules });
                                                           }}
                                                           onBlur={(e) => {
                                                               if (!e.target.value || parseInt(e.target.value) < 1) {
                                                                   const newRules = [...formData.category_rules];
                                                                   newRules[idx].quantity = 1;
                                                                   setFormData({ ...formData, category_rules: newRules });
                                                               }
                                                           }}
                                                           placeholder="e.g. 2"
                                                       />
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Label shown to customer</Label>
                                                    <Input
                                                        value={rule.label}
                                                        onChange={(e) => {
                                                            const newRules = [...formData.category_rules];
                                                            newRules[idx].label = e.target.value;
                                                            setFormData({ ...formData, category_rules: newRules });
                                                        }}
                                                        placeholder={`e.g. Choose any ${rule.quantity} ${rule.category || 'items'}`}
                                                    />
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 mb-0.5"
                                                onClick={() => {
                                                    const newRules = formData.category_rules.filter((_, i) => i !== idx);
                                                    setFormData({ ...formData, category_rules: newRules });
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {formData.category_rules.length === 0 && (
                                        <div className="text-center py-4 text-sm text-gray-400 border-2 border-dashed rounded-xl">
                                            No choices added. Click "Add Choice" to let customers select items.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Fixed Items */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <Label className="text-base">Fixed Items</Label>
                                        <p className="text-xs text-gray-500">Specific items always included in the deal</p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setFormData({
                                            ...formData,
                                            items: [...formData.items, { menu_item_id: '', name: '', quantity: 1 }]
                                        })}
                                    >
                                        <Plus className="h-4 w-4 mr-1" /> Add Fixed Item
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {formData.items.map((item, idx) => (
                                        <div key={idx} className="flex gap-2 items-center p-2 border rounded-lg bg-gray-50">
                                            <select
                                                className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
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
                                                <option value="">Select item</option>
                                                {menuItems.map(m => (
                                                    <option key={m.id} value={m.id}>{m.name} — £{m.price?.toFixed(2)}</option>
                                                ))}
                                            </select>
                                            <Input
                                               type="number"
                                               min="1"
                                               value={item.quantity}
                                               onChange={(e) => {
                                                   const newItems = [...formData.items];
                                                   newItems[idx].quantity = e.target.value === '' ? '' : parseInt(e.target.value);
                                                   setFormData({ ...formData, items: newItems });
                                               }}
                                               onBlur={(e) => {
                                                   if (!e.target.value || parseInt(e.target.value) < 1) {
                                                       const newItems = [...formData.items];
                                                       newItems[idx].quantity = 1;
                                                       setFormData({ ...formData, items: newItems });
                                                   }
                                               }}
                                               className="w-16"
                                               placeholder="Qty"
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="text-red-500"
                                                onClick={() => setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) })}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Active Toggle */}
                            <div className="flex items-center gap-3 py-2 border-t">
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                />
                                <Label>Show this deal on the menu</Label>
                            </div>

                            <div className="flex gap-3 justify-end pt-2">
                                {!editingDeal && (
                                    <Button type="button" variant="ghost" onClick={() => setStep('template')}>
                                        ← Back
                                    </Button>
                                )}
                                <Button type="button" variant="outline" onClick={resetForm}>
                                    Cancel
                                </Button>
                                <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                                    {editingDeal ? 'Save Changes' : 'Create Deal'}
                                </Button>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DealCard({ deal, onEdit, onDelete }) {
    const discount = deal.original_price && deal.deal_price
        ? Math.round(((deal.original_price - deal.deal_price) / deal.original_price) * 100)
        : 0;

    const hasChoices = deal.category_rules?.length > 0;
    const hasFixed = deal.items?.length > 0;

    return (
        <Card className={`overflow-hidden transition-shadow hover:shadow-md ${!deal.is_active ? 'opacity-60' : ''}`}>
            <CardContent className="p-0">
                <div className="flex">
                    {deal.image_url ? (
                        <img
                            src={deal.image_url}
                            alt={deal.name}
                            className="w-28 h-full min-h-[100px] object-cover flex-shrink-0"
                        />
                    ) : (
                        <div className="w-28 min-h-[100px] bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-4xl">{hasChoices ? '🍽️' : '📦'}</span>
                        </div>
                    )}
                    <div className="flex-1 p-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-bold text-gray-900 leading-tight">{deal.name}</h3>
                            <div className="flex gap-1 flex-shrink-0">
                                {!deal.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                                {discount > 0 && <Badge className="bg-green-500 text-white text-xs">{discount}% OFF</Badge>}
                            </div>
                        </div>
                        {deal.description && (
                            <p className="text-xs text-gray-500 mb-2 line-clamp-1">{deal.description}</p>
                        )}

                        {/* What's included */}
                        <div className="space-y-0.5 mb-3">
                            {hasChoices && deal.category_rules.map((rule, i) => (
                                <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
                                    <span className="text-orange-500">✓</span>
                                    <span>{rule.label || `${rule.quantity}x ${rule.category}`}</span>
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">Customer picks</Badge>
                                </div>
                            ))}
                            {hasFixed && deal.items.map((item, i) => (
                                <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
                                    <span className="text-blue-500">•</span>
                                    <span>{item.quantity}x {item.name}</span>
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 bg-blue-50">Fixed</Badge>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {deal.original_price > 0 && (
                                    <span className="text-xs text-gray-400 line-through">£{deal.original_price.toFixed(2)}</span>
                                )}
                                <span className="text-xl font-bold text-orange-600">£{deal.deal_price.toFixed(2)}</span>
                            </div>
                            <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={onEdit} className="h-8 w-8 p-0">
                                    <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={onDelete} className="h-8 w-8 p-0 text-red-600 hover:bg-red-50">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}