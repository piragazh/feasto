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
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import ImportFromJustEat from './ImportFromJustEat';
import AIMenuInsights from './AIMenuInsights';
import CustomOptionTemplates from './CustomOptionTemplates';

export default function MenuManagement({ restaurantId }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterAvailable, setFilterAvailable] = useState('all');
    const [selectedItems, setSelectedItems] = useState([]);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: '',
        image_url: '',
        is_popular: false,
        is_vegetarian: false,
        is_spicy: false,
        is_available: true,
        customization_options: []
    });

    const queryClient = useQueryClient();

    const { data: menuItems = [], isLoading } = useQuery({
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

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.MenuItem.create({ ...data, restaurant_id: restaurantId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success('Menu item added');
            resetForm();
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MenuItem.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success('Menu item updated');
            resetForm();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.MenuItem.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success('Menu item deleted');
        },
    });

    const addCategoryMutation = useMutation({
        mutationFn: (categoryName) => {
            const currentCategories = restaurant?.menu_categories || [];
            return base44.entities.Restaurant.update(restaurantId, {
                menu_categories: [...currentCategories, categoryName]
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant']);
            toast.success('Category added');
            setNewCategoryName('');
            setEditingCategory(null);
            setCategoryDialogOpen(false);
        },
    });

    const editCategoryMutation = useMutation({
        mutationFn: ({ oldName, newName }) => {
            const currentCategories = restaurant?.menu_categories || [];
            const updatedCategories = currentCategories.map(c => c === oldName ? newName : c);
            return base44.entities.Restaurant.update(restaurantId, {
                menu_categories: updatedCategories
            });
        },
        onSuccess: async (_, { oldName, newName }) => {
            // Update all menu items with the old category
            const itemsToUpdate = menuItems.filter(item => item.category === oldName);
            for (const item of itemsToUpdate) {
                await base44.entities.MenuItem.update(item.id, { category: newName });
            }
            queryClient.invalidateQueries(['restaurant']);
            queryClient.invalidateQueries(['menu-items']);
            toast.success('Category updated');
            setNewCategoryName('');
            setEditingCategory(null);
            setCategoryDialogOpen(false);
        },
    });

    const removeCategoryMutation = useMutation({
        mutationFn: (categoryName) => {
            const currentCategories = restaurant?.menu_categories || [];
            const currentOrder = restaurant?.category_order || [];
            return base44.entities.Restaurant.update(restaurantId, {
                menu_categories: currentCategories.filter(c => c !== categoryName),
                category_order: currentOrder.filter(c => c !== categoryName)
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant']);
            toast.success('Category removed');
        },
    });

    const reorderCategoriesMutation = useMutation({
        mutationFn: (newOrder) => {
            return base44.entities.Restaurant.update(restaurantId, {
                category_order: newOrder
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant']);
            toast.success('Category order updated');
        },
    });

    const moveCategory = (index, direction) => {
        const orderedCategories = getOrderedCategories();
        const newOrder = Array.from(orderedCategories);
        const newIndex = direction === 'up' ? index - 1 : index + 1;

        if (newIndex < 0 || newIndex >= newOrder.length) return;

        [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
        reorderCategoriesMutation.mutate(newOrder);
    };

    const getOrderedCategories = () => {
        const currentOrder = restaurant?.category_order || [];
        const allCategories = restaurant?.menu_categories || [];
        
        // Start with ordered categories
        const ordered = currentOrder.filter(cat => allCategories.includes(cat));
        
        // Add any new categories not in the order yet
        const unordered = allCategories.filter(cat => !currentOrder.includes(cat));
        
        return [...ordered, ...unordered];
    };

    const bulkDeleteMutation = useMutation({
        mutationFn: async (itemIds) => {
            for (const id of itemIds) {
                await base44.entities.MenuItem.delete(id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success(`Deleted ${selectedItems.length} items`);
            setSelectedItems([]);
        },
    });

    const toggleAvailability = (item) => {
        updateMutation.mutate({
            id: item.id,
            data: { is_available: !item.is_available }
        });
    };

    const handleImageUpload = async (file) => {
        setUploadingImage(true);
        try {
            const result = await base44.integrations.Core.UploadFile({ file });
            setFormData({ ...formData, image_url: result.file_url });
            toast.success('Image uploaded');
        } catch (error) {
            toast.error('Failed to upload image');
        } finally {
            setUploadingImage(false);
        }
    };

    const handleBulkDelete = () => {
        if (confirm(`Delete ${selectedItems.length} selected items?`)) {
            bulkDeleteMutation.mutate(selectedItems);
        }
    };

    const toggleSelectItem = (itemId) => {
        setSelectedItems(prev => 
            prev.includes(itemId) 
                ? prev.filter(id => id !== itemId)
                : [...prev, itemId]
        );
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === filteredMenuItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(filteredMenuItems.map(item => item.id));
        }
    };

    const categories = getOrderedCategories();
    
    const filteredMenuItems = menuItems.filter(item => {
        const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
        const matchesAvailability = filterAvailable === 'all' || 
            (filterAvailable === 'available' && item.is_available !== false) ||
            (filterAvailable === 'unavailable' && item.is_available === false);
        return matchesCategory && matchesAvailability;
    });

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            price: '',
            category: '',
            image_url: '',
            is_popular: false,
            is_vegetarian: false,
            is_spicy: false,
            is_available: true,
            customization_options: []
        });
        setEditingItem(null);
        setDialogOpen(false);
    };

    const handleEdit = (item) => {
        setEditingItem(item);
        // Ensure meal_customizations are properly loaded
        const customizations = (item.customization_options || []).map(opt => ({
            ...opt,
            meal_customizations: opt.meal_customizations || []
        }));
        setFormData({
            name: item.name,
            description: item.description || '',
            price: item.price.toString(),
            category: item.category || '',
            image_url: item.image_url || '',
            is_popular: item.is_popular || false,
            is_vegetarian: item.is_vegetarian || false,
            is_spicy: item.is_spicy || false,
            is_available: item.is_available !== false,
            customization_options: customizations
        });
        setDialogOpen(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = {
            ...formData,
            price: parseFloat(formData.price)
        };

        if (editingItem) {
            updateMutation.mutate({ id: editingItem.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    return (
        <div className="space-y-6">
            <AIMenuInsights restaurantId={restaurantId} />
            
            <CustomOptionTemplates restaurantId={restaurantId} />
            
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-semibold">Menu Categories</h3>
                            <p className="text-sm text-gray-500">Drag to reorder how categories appear on your menu</p>
                        </div>
                        <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setCategoryDialogOpen(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Category
                        </Button>
                    </div>
                    {categories.length === 0 ? (
                        <p className="text-sm text-gray-500">No categories yet. Add your first category to organize your menu.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {categories.map((category, index) => (
                                <div key={category} className="flex items-center gap-1 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors group">
                                    <button
                                        onClick={() => moveCategory(index, 'up')}
                                        disabled={index === 0}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        title="Move left"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5 text-gray-600" />
                                    </button>
                                    
                                    <span className="font-medium text-sm text-gray-900 whitespace-nowrap">{category}</span>
                                    
                                    <button
                                        onClick={() => moveCategory(index, 'down')}
                                        disabled={index === categories.length - 1}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        title="Move right"
                                    >
                                        <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                                    </button>
                                    
                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1 pl-1 border-l border-gray-300 transition-all">
                                        <button
                                            onClick={() => {
                                                setEditingCategory(category);
                                                setNewCategoryName(category);
                                                setCategoryDialogOpen(true);
                                            }}
                                            className="p-0.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                            title="Edit"
                                        >
                                            <Edit className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm(`Remove category "${category}"?`)) {
                                                    removeCategoryMutation.mutate(category);
                                                }
                                            }}
                                            className="p-0.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Menu Items</h2>
                <div className="flex gap-2">
                    <ImportFromJustEat restaurantId={restaurantId} />
                    <Dialog open={dialogOpen} onOpenChange={(open) => {
                        setDialogOpen(open);
                        if (!open) resetForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button className="bg-orange-500 hover:bg-orange-600">
                                <Plus className="h-5 w-5 mr-2" />
                                Add Menu Item
                            </Button>
                        </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingItem ? 'Edit' : 'Add'} Menu Item</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <Label>Item Name *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label>Description</Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={3}
                                    />
                                </div>
                                <div>
                                    <Label>Price (£) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <Label>Category</Label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">Select a category</option>
                                        {categories.map((cat) => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                    {categories.length === 0 && (
                                        <p className="text-xs text-gray-500 mt-1">Add categories first to organize your menu</p>
                                    )}
                                </div>
                                <div className="col-span-2">
                                    <Label>Image</Label>
                                    <div className="space-y-2">
                                        <Input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleImageUpload(file);
                                            }}
                                            disabled={uploadingImage}
                                        />
                                        <Input
                                            value={formData.image_url}
                                            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                            placeholder="Or paste image URL"
                                        />
                                        {uploadingImage && <p className="text-xs text-gray-500">Uploading image...</p>}
                                        {formData.image_url && (
                                            <img src={formData.image_url} alt="Preview" className="h-20 w-20 object-cover rounded" />
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_popular}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_popular: checked })}
                                    />
                                    <Label>Popular Item</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_vegetarian}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_vegetarian: checked })}
                                    />
                                    <Label>Vegetarian</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_spicy}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_spicy: checked })}
                                    />
                                    <Label>Spicy</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_available}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_available: checked })}
                                    />
                                    <Label>Available</Label>
                                    </div>
                                    </div>

                                    {/* Customization Options */}
                                    <div className="col-span-2 space-y-3">
                                    <div className="flex items-center justify-between">
                                    <Label className="text-base">Customization Options</Label>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setFormData({
                                                ...formData,
                                                customization_options: [
                                                   ...formData.customization_options,
                                                   { name: '', type: 'single', required: false, max_quantity: 1, options: [{ label: '', price: 0 }] }
                                                ]
                                            });
                                        }}
                                    >
                                        Add Customization
                                    </Button>
                                    </div>
                                    {formData.customization_options.map((custom, idx) => (
                                    <Card key={idx} className="p-3">
                                        <div className="space-y-2">
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="Name (e.g., Size, Toppings)"
                                                    value={custom.name}
                                                    onChange={(e) => {
                                                        const newCustoms = [...formData.customization_options];
                                                        newCustoms[idx].name = e.target.value;
                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                    }}
                                                />
                                                <select
                                                    className="px-3 py-2 border rounded-md"
                                                    value={custom.type}
                                                    onChange={(e) => {
                                                        const newCustoms = [...formData.customization_options];
                                                        newCustoms[idx].type = e.target.value;
                                                        // Initialize meal options if switching to meal_upgrade type
                                                        if (e.target.value === 'meal_upgrade') {
                                                            newCustoms[idx].options = [
                                                                { label: 'On its Own', price: 0 },
                                                                { label: 'Meal', price: 0 }
                                                            ];
                                                            newCustoms[idx].meal_customizations = [];
                                                        }
                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                    }}
                                                >
                                                    <option value="single">Single Choice</option>
                                                    <option value="multiple">Multiple Choice</option>
                                                    <option value="meal_upgrade">Meal Upgrade (On its Own / Meal)</option>
                                                </select>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        const newCustoms = formData.customization_options.filter((_, i) => i !== idx);
                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                    }}
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                            {custom.type !== 'meal_upgrade' && (
                                                <div className="space-y-2">
                                                    <Label className="text-sm">Load Options</Label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <select
                                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                            onChange={(e) => {
                                                                if (e.target.value) {
                                                                    const categoryItems = menuItems.filter(item => item.category === e.target.value);
                                                                    const newOptions = categoryItems.map(item => ({
                                                                        label: item.name,
                                                                        price: 0
                                                                    }));
                                                                    const newCustoms = [...formData.customization_options];
                                                                    newCustoms[idx].options = newOptions;
                                                                    setFormData({ ...formData, customization_options: newCustoms });
                                                                    toast.success(`Loaded ${newOptions.length} items from ${e.target.value}`);
                                                                    e.target.value = '';
                                                                }
                                                            }}
                                                            defaultValue=""
                                                        >
                                                            <option value="">From category...</option>
                                                            {categories.map((cat) => (
                                                                <option key={cat} value={cat}>{cat}</option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                            onChange={(e) => {
                                                                if (e.target.value) {
                                                                    const templates = restaurant?.custom_option_templates || [];
                                                                    const template = templates.find(t => t.name === e.target.value);
                                                                    if (template) {
                                                                        const newCustoms = [...formData.customization_options];
                                                                        newCustoms[idx].options = [...template.options];
                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                        toast.success(`Loaded template: ${template.name}`);
                                                                        e.target.value = '';
                                                                    }
                                                                }
                                                            }}
                                                            defaultValue=""
                                                        >
                                                            <option value="">From template...</option>
                                                            {(restaurant?.custom_option_templates || []).map((template) => (
                                                                <option key={template.name} value={template.name}>{template.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={custom.required}
                                                        onCheckedChange={(checked) => {
                                                            const newCustoms = [...formData.customization_options];
                                                            newCustoms[idx].required = checked;
                                                            setFormData({ ...formData, customization_options: newCustoms });
                                                        }}
                                                    />
                                                    <Label className="text-sm">Required</Label>
                                                </div>
                                                {custom.type !== 'single' && (
                                                    <div className="flex items-center gap-2">
                                                        <Label className="text-sm">Max Quantity:</Label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={custom.max_quantity || 1}
                                                            onChange={(e) => {
                                                                const newCustoms = [...formData.customization_options];
                                                                newCustoms[idx].max_quantity = parseInt(e.target.value) || 1;
                                                                setFormData({ ...formData, customization_options: newCustoms });
                                                            }}
                                                            className="w-20 h-9"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                {custom.type === 'meal_upgrade' ? (
                                                    <>
                                                        <Label className="text-sm font-medium">Meal Pricing</Label>
                                                        {custom.options.map((opt, optIdx) => (
                                                            <div key={optIdx} className="flex gap-2 items-center">
                                                                <Input
                                                                    value={opt.label}
                                                                    onChange={(e) => {
                                                                        const newCustoms = [...formData.customization_options];
                                                                        newCustoms[idx].options[optIdx].label = e.target.value;
                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                    }}
                                                                    className="flex-1"
                                                                    placeholder={optIdx === 0 ? "On its Own" : "Meal"}
                                                                />
                                                                <Input
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder={optIdx === 0 ? "£0.00 (base)" : "Extra £"}
                                                                    value={opt.price}
                                                                    onChange={(e) => {
                                                                        const newCustoms = [...formData.customization_options];
                                                                        newCustoms[idx].options[optIdx].price = parseFloat(e.target.value) || 0;
                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                    }}
                                                                    className="w-32"
                                                                />
                                                            </div>
                                                        ))}
                                                        
                                                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                                            <Label className="text-sm font-medium mb-2 block">Meal Options (shown when "Meal" is selected)</Label>
                                                            {(custom.meal_customizations || []).map((mealCustom, mealIdx) => (
                                                                <Card key={mealIdx} className="p-3 mb-2 bg-white">
                                                                    <div className="space-y-2">
                                                                        <div className="flex gap-2">
                                                                            <Input
                                                                                placeholder="e.g., Choose A Drink"
                                                                                value={mealCustom.name}
                                                                                onChange={(e) => {
                                                                                    const newCustoms = [...formData.customization_options];
                                                                                    newCustoms[idx].meal_customizations[mealIdx].name = e.target.value;
                                                                                    setFormData({ ...formData, customization_options: newCustoms });
                                                                                }}
                                                                                className="flex-1"
                                                                            />
                                                                            <select
                                                                                className="px-2 py-1 border rounded text-sm"
                                                                                value={mealCustom.type}
                                                                                onChange={(e) => {
                                                                                    const newCustoms = [...formData.customization_options];
                                                                                    newCustoms[idx].meal_customizations[mealIdx].type = e.target.value;
                                                                                    setFormData({ ...formData, customization_options: newCustoms });
                                                                                }}
                                                                            >
                                                                                <option value="single">Single</option>
                                                                                <option value="multiple">Multiple</option>
                                                                            </select>
                                                                            <Button
                                                                                type="button"
                                                                                size="sm"
                                                                                variant="ghost"
                                                                                onClick={() => {
                                                                                    const newCustoms = [...formData.customization_options];
                                                                                    newCustoms[idx].meal_customizations = newCustoms[idx].meal_customizations.filter((_, i) => i !== mealIdx);
                                                                                    setFormData({ ...formData, customization_options: newCustoms });
                                                                                }}
                                                                            >
                                                                                ×
                                                                            </Button>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Switch
                                                                                checked={mealCustom.required}
                                                                                onCheckedChange={(checked) => {
                                                                                    const newCustoms = [...formData.customization_options];
                                                                                    newCustoms[idx].meal_customizations[mealIdx].required = checked;
                                                                                    setFormData({ ...formData, customization_options: newCustoms });
                                                                                }}
                                                                            />
                                                                            <Label className="text-xs">Required</Label>
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label className="text-xs">Load Options:</Label>
                                                                            <div className="grid grid-cols-2 gap-1">
                                                                                <select
                                                                                    className="w-full h-9 rounded-md border px-2 text-xs"
                                                                                    onChange={(e) => {
                                                                                        if (e.target.value) {
                                                                                            const categoryItems = menuItems.filter(item => item.category === e.target.value);
                                                                                            const newOptions = categoryItems.map(item => ({ label: item.name, price: 0 }));
                                                                                            const newCustoms = [...formData.customization_options];
                                                                                            newCustoms[idx].meal_customizations[mealIdx].options = newOptions;
                                                                                            setFormData({ ...formData, customization_options: newCustoms });
                                                                                            toast.success(`Loaded ${newOptions.length} items`);
                                                                                            e.target.value = '';
                                                                                        }
                                                                                    }}
                                                                                    defaultValue=""
                                                                                >
                                                                                    <option value="">Category...</option>
                                                                                    {categories.map((cat) => (
                                                                                        <option key={cat} value={cat}>{cat}</option>
                                                                                    ))}
                                                                                </select>
                                                                                <select
                                                                                    className="w-full h-9 rounded-md border px-2 text-xs"
                                                                                    onChange={(e) => {
                                                                                        if (e.target.value) {
                                                                                            const templates = restaurant?.custom_option_templates || [];
                                                                                            const template = templates.find(t => t.name === e.target.value);
                                                                                            if (template) {
                                                                                                const newCustoms = [...formData.customization_options];
                                                                                                newCustoms[idx].meal_customizations[mealIdx].options = [...template.options];
                                                                                                setFormData({ ...formData, customization_options: newCustoms });
                                                                                                toast.success(`Loaded: ${template.name}`);
                                                                                                e.target.value = '';
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    defaultValue=""
                                                                                >
                                                                                    <option value="">Template...</option>
                                                                                    {(restaurant?.custom_option_templates || []).map((template) => (
                                                                                        <option key={template.name} value={template.name}>{template.name}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                        </div>
                                                                        {(mealCustom.options || []).map((opt, optIdx) => (
                                                                            <div key={optIdx} className="flex gap-2">
                                                                                <Input
                                                                                    placeholder="Option"
                                                                                    value={opt.label}
                                                                                    onChange={(e) => {
                                                                                        const newCustoms = [...formData.customization_options];
                                                                                        newCustoms[idx].meal_customizations[mealIdx].options[optIdx].label = e.target.value;
                                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                                    }}
                                                                                    className="flex-1 text-sm"
                                                                                />
                                                                                <Input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    placeholder="£"
                                                                                    value={opt.price}
                                                                                    onChange={(e) => {
                                                                                        const newCustoms = [...formData.customization_options];
                                                                                        newCustoms[idx].meal_customizations[mealIdx].options[optIdx].price = parseFloat(e.target.value) || 0;
                                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                                    }}
                                                                                    className="w-20 text-sm"
                                                                                />
                                                                                <Button
                                                                                    type="button"
                                                                                    size="icon"
                                                                                    variant="ghost"
                                                                                    onClick={() => {
                                                                                        const newCustoms = [...formData.customization_options];
                                                                                        newCustoms[idx].meal_customizations[mealIdx].options = newCustoms[idx].meal_customizations[mealIdx].options.filter((_, i) => i !== optIdx);
                                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                                    }}
                                                                                    className="h-9 w-9"
                                                                                >
                                                                                    <Trash2 className="h-3 w-3" />
                                                                                </Button>
                                                                            </div>
                                                                        ))}
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => {
                                                                                const newCustoms = [...formData.customization_options];
                                                                                if (!newCustoms[idx].meal_customizations[mealIdx].options) {
                                                                                    newCustoms[idx].meal_customizations[mealIdx].options = [];
                                                                                }
                                                                                newCustoms[idx].meal_customizations[mealIdx].options.push({ label: '', price: 0 });
                                                                                setFormData({ ...formData, customization_options: newCustoms });
                                                                            }}
                                                                            className="w-full text-xs"
                                                                        >
                                                                            <Plus className="h-3 w-3 mr-1" />
                                                                            Add Option
                                                                        </Button>
                                                                    </div>
                                                                </Card>
                                                            ))}
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    const newCustoms = [...formData.customization_options];
                                                                    if (!newCustoms[idx].meal_customizations) {
                                                                        newCustoms[idx].meal_customizations = [];
                                                                    }
                                                                    newCustoms[idx].meal_customizations.push({
                                                                        name: '',
                                                                        type: 'single',
                                                                        required: false,
                                                                        options: [{ label: '', price: 0 }]
                                                                    });
                                                                    setFormData({ ...formData, customization_options: newCustoms });
                                                                }}
                                                                className="w-full"
                                                            >
                                                                <Plus className="h-4 w-4 mr-2" />
                                                                Add Meal Option
                                                            </Button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        {custom.options.map((opt, optIdx) => (
                                                            <div key={optIdx} className="flex gap-2">
                                                                <Input
                                                                    placeholder="Option label"
                                                                    value={opt.label}
                                                                    onChange={(e) => {
                                                                        const newCustoms = [...formData.customization_options];
                                                                        newCustoms[idx].options[optIdx].label = e.target.value;
                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                    }}
                                                                    className="flex-1"
                                                                />
                                                                <Input
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder="Extra £"
                                                                    value={opt.price}
                                                                    onChange={(e) => {
                                                                        const newCustoms = [...formData.customization_options];
                                                                        newCustoms[idx].options[optIdx].price = parseFloat(e.target.value) || 0;
                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                    }}
                                                                    className="w-28"
                                                                />
                                                                <Button
                                                                    type="button"
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        const newCustoms = [...formData.customization_options];
                                                                        newCustoms[idx].options = newCustoms[idx].options.filter((_, i) => i !== optIdx);
                                                                        setFormData({ ...formData, customization_options: newCustoms });
                                                                    }}
                                                                    className="h-10 w-10"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ))}
                                                        <div className="flex gap-2">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    const newCustoms = [...formData.customization_options];
                                                                    newCustoms[idx].options.push({ label: '', price: 0 });
                                                                    setFormData({ ...formData, customization_options: newCustoms });
                                                                }}
                                                                className="flex-1"
                                                            >
                                                                <Plus className="h-4 w-4 mr-1" />
                                                                Add Option Row
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    const newCustoms = [...formData.customization_options];
                                                                    newCustoms[idx].options.push(
                                                                        { label: '', price: 0 },
                                                                        { label: '', price: 0 },
                                                                        { label: '', price: 0 }
                                                                    );
                                                                    setFormData({ ...formData, customization_options: newCustoms });
                                                                }}
                                                                className="whitespace-nowrap"
                                                            >
                                                                <Plus className="h-4 w-4 mr-1" />
                                                                Add 3 Rows
                                                            </Button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                    ))}
                                    </div>

                                    <div className="flex gap-3 justify-end">
                                <Button type="button" variant="outline" onClick={resetForm}>
                                    Cancel
                                </Button>
                                <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                                    {editingItem ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
                </div>
            </div>

            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={selectedItems.length === filteredMenuItems.length && filteredMenuItems.length > 0}
                                    onChange={toggleSelectAll}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                <Label className="text-sm font-medium">Select All</Label>
                            </div>
                            {selectedItems.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={handleBulkDelete}
                                    disabled={bulkDeleteMutation.isPending}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete {selectedItems.length} Items
                                </Button>
                            )}
                            <div className="flex items-center gap-2">
                                <Label className="text-sm font-medium">Category:</Label>
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                                >
                                    <option value="all">All</option>
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label className="text-sm font-medium">Availability:</Label>
                                <select
                                    value={filterAvailable}
                                    onChange={(e) => setFilterAvailable(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                                >
                                    <option value="all">All</option>
                                    <option value="available">Available</option>
                                    <option value="unavailable">Unavailable</option>
                                </select>
                            </div>
                        </div>
                        <div className="text-sm text-gray-500">
                            {selectedItems.length > 0 && `${selectedItems.length} selected • `}
                            {filteredMenuItems.length} of {menuItems.length} items
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMenuItems.map((item) => (
                    <Card key={item.id} className={`${item.is_available === false ? 'opacity-60' : ''} ${selectedItems.includes(item.id) ? 'ring-2 ring-orange-500' : ''}`}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                                <input
                                    type="checkbox"
                                    checked={selectedItems.includes(item.id)}
                                    onChange={() => toggleSelectItem(item.id)}
                                    className="h-4 w-4 rounded border-gray-300 mt-1"
                                />
                            </div>
                            {item.image_url && (
                                <img
                                    src={item.image_url}
                                    alt={item.name}
                                    className="w-full h-32 object-cover rounded-lg mb-3"
                                    loading="lazy"
                                />
                            )}
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="font-semibold">{item.name}</h3>
                                {item.is_available === false && (
                                    <Badge variant="destructive" className="text-xs">
                                        <EyeOff className="h-3 w-3 mr-1" />
                                        Unavailable
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-gray-600 mb-2 line-clamp-2">{item.description}</p>
                            <p className="text-lg font-bold text-orange-600 mb-3">£{item.price.toFixed(2)}</p>
                            {item.customization_options?.length > 0 && (
                                <p className="text-xs text-gray-500 mb-3">
                                    {item.customization_options.length} customization{item.customization_options.length > 1 ? 's' : ''}
                                </p>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => toggleAvailability(item)}
                                    className="flex-1"
                                >
                                    {item.is_available === false ? 'Mark Available' : 'Mark Unavailable'}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEdit(item)}
                                >
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        if (confirm('Delete this item?')) {
                                            deleteMutation.mutate(item.id);
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

            <Dialog open={categoryDialogOpen} onOpenChange={(open) => {
                setCategoryDialogOpen(open);
                if (!open) {
                    setNewCategoryName('');
                    setEditingCategory(null);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingCategory ? 'Edit' : 'Add'} Menu Category</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Category Name</Label>
                            <Input
                                placeholder="e.g., Starters, Mains, Desserts, Drinks"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => {
                                setCategoryDialogOpen(false);
                                setNewCategoryName('');
                                setEditingCategory(null);
                            }}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    if (newCategoryName.trim()) {
                                        if (editingCategory) {
                                            editCategoryMutation.mutate({ 
                                                oldName: editingCategory, 
                                                newName: newCategoryName.trim() 
                                            });
                                        } else {
                                            addCategoryMutation.mutate(newCategoryName.trim());
                                        }
                                    }
                                }}
                                disabled={!newCategoryName.trim() || addCategoryMutation.isPending || editCategoryMutation.isPending}
                                className="bg-orange-500 hover:bg-orange-600"
                            >
                                {editingCategory ? 'Update' : 'Add'} Category
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}