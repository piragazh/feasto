import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function CustomOptionTemplates({ restaurantId }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        options: [{ label: '', price: 0 }]
    });

    const queryClient = useQueryClient();

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
    });

    const templates = restaurant?.custom_option_templates || [];

    const updateItemsMutation = useMutation({
        mutationFn: async (template_name) => {
            const response = await base44.functions.invoke('updateMenuItemsFromTemplate', {
                restaurant_id: restaurantId,
                template_name
            });
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success(`Updated ${data.updated_count} menu items`);
        },
        onError: () => {
            toast.error('Failed to update menu items');
        }
    });

    const saveMutation = useMutation({
        mutationFn: (newTemplates) => {
            return base44.entities.Restaurant.update(restaurantId, {
                custom_option_templates: newTemplates
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant']);
            toast.success(editingTemplate ? 'Template updated' : 'Template created');
            resetForm();
        },
    });

    const resetForm = () => {
        setFormData({
            name: '',
            options: [{ label: '', price: 0 }]
        });
        setEditingTemplate(null);
        setDialogOpen(false);
    };

    const handleEdit = (template, index) => {
        setEditingTemplate(index);
        setFormData({
            name: template.name,
            options: [...template.options]
        });
        setDialogOpen(true);
    };

    const handleDelete = (index) => {
        if (confirm('Delete this template?')) {
            const newTemplates = templates.filter((_, i) => i !== index);
            saveMutation.mutate(newTemplates);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!formData.name.trim()) {
            toast.error('Please enter a template name');
            return;
        }

        const validOptions = formData.options.filter(opt => opt.label.trim());
        if (validOptions.length === 0) {
            toast.error('Please add at least one option');
            return;
        }

        const newTemplate = {
            name: formData.name.trim(),
            options: validOptions
        };

        let newTemplates;
        if (editingTemplate !== null) {
            newTemplates = [...templates];
            newTemplates[editingTemplate] = newTemplate;
        } else {
            newTemplates = [...templates, newTemplate];
        }

        saveMutation.mutate(newTemplates);
    };

    const addOptionRow = () => {
        setFormData({
            ...formData,
            options: [...formData.options, { label: '', price: 0 }]
        });
    };

    const removeOptionRow = (index) => {
        setFormData({
            ...formData,
            options: formData.options.filter((_, i) => i !== index)
        });
    };

    const updateOption = (index, field, value) => {
        const newOptions = [...formData.options];
        newOptions[index][field] = field === 'price' ? parseFloat(value) || 0 : value;
        setFormData({ ...formData, options: newOptions });
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Custom Option Templates</CardTitle>
                        <p className="text-sm text-gray-500 mt-1">Create reusable option lists (e.g., Pizza Toppings, Burger Extras)</p>
                    </div>
                    <Dialog open={dialogOpen} onOpenChange={(open) => {
                        setDialogOpen(open);
                        if (!open) resetForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-orange-500 hover:bg-orange-600">
                                <Plus className="h-4 w-4 mr-2" />
                                New Template
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>{editingTemplate !== null ? 'Edit' : 'Create'} Option Template</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <Label>Template Name *</Label>
                                    <Input
                                        placeholder="e.g., Pizza Toppings, Burger Extras, Drink Sizes"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Give this template a descriptive name</p>
                                </div>

                                <div>
                                    <Label className="mb-2 block">Options</Label>
                                    <div className="space-y-2">
                                        {formData.options.map((opt, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                <Input
                                                    placeholder="Option name (e.g., Extra Cheese, Bacon)"
                                                    value={opt.label}
                                                    onChange={(e) => updateOption(idx, 'label', e.target.value)}
                                                    className="flex-1"
                                                />
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="£"
                                                    value={opt.price}
                                                    onChange={(e) => updateOption(idx, 'price', e.target.value)}
                                                    className="w-24"
                                                />
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => removeOptionRow(idx)}
                                                    disabled={formData.options.length === 1}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={addOptionRow}
                                            className="flex-1"
                                        >
                                            <Plus className="h-4 w-4 mr-1" />
                                            Add Option
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setFormData({
                                                    ...formData,
                                                    options: [
                                                        ...formData.options,
                                                        { label: '', price: 0 },
                                                        { label: '', price: 0 },
                                                        { label: '', price: 0 }
                                                    ]
                                                });
                                            }}
                                        >
                                            <Plus className="h-4 w-4 mr-1" />
                                            Add 3 Rows
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-4">
                                    <Button type="button" variant="outline" onClick={resetForm}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                                        {editingTemplate !== null ? 'Update' : 'Create'} Template
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                {templates.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <p className="mb-2">No templates yet</p>
                        <p className="text-sm">Create reusable option lists to speed up menu item creation</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {templates.map((template, idx) => (
                            <Card key={idx} className="bg-gray-50">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h4 className="font-semibold text-lg">{template.name}</h4>
                                            <p className="text-sm text-gray-500">{template.options.length} options</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => updateItemsMutation.mutate(template.name)}
                                                disabled={updateItemsMutation.isPending}
                                                title="Update all menu items using this template"
                                            >
                                                <RefreshCw className={`h-4 w-4 ${updateItemsMutation.isPending ? 'animate-spin' : ''}`} />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleEdit(template, idx)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(idx)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {template.options.slice(0, 5).map((opt, optIdx) => (
                                            <span key={optIdx} className="text-xs bg-white px-2 py-1 rounded border">
                                                {opt.label} {opt.price > 0 && `+£${opt.price.toFixed(2)}`}
                                            </span>
                                        ))}
                                        {template.options.length > 5 && (
                                            <span className="text-xs text-gray-500 px-2 py-1">
                                                +{template.options.length - 5} more
                                            </span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}