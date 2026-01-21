import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function MenuItemManagement({ restaurantId }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: menuItems = [], isLoading } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
    });

    const categories = [...new Set(menuItems.map(item => item.category))];
    const filteredItems = menuItems.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.MenuItem.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['menu-items', restaurantId] });
            setIsAddDialogOpen(false);
            toast.success('Menu item added successfully');
        },
        onError: () => toast.error('Failed to add menu item'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MenuItem.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['menu-items', restaurantId] });
            setIsEditDialogOpen(false);
            setEditingItem(null);
            toast.success('Menu item updated successfully');
        },
        onError: () => toast.error('Failed to update menu item'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.MenuItem.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['menu-items', restaurantId] });
            toast.success('Menu item deleted');
        },
        onError: () => toast.error('Failed to delete menu item'),
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Menu Items</h2>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Menu Item</DialogTitle>
                        </DialogHeader>
                        <ItemForm
                            restaurantId={restaurantId}
                            categories={categories}
                            onSubmit={(data) => createMutation.mutate(data)}
                            isLoading={createMutation.isPending}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-4 py-2 border rounded-lg bg-white"
                    >
                        <option value="all">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-8 text-gray-500">Loading menu items...</div>
            ) : filteredItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No menu items found</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredItems.map(item => (
                        <Card key={item.id} className={item.is_available ? '' : 'opacity-60 border-red-300'}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1">
                                        <CardTitle className="text-lg">{item.name}</CardTitle>
                                        <Badge variant="outline" className="mt-2">
                                            {item.category}
                                        </Badge>
                                    </div>
                                    {!item.is_available && (
                                        <Badge className="bg-red-500 text-white">Out of Stock</Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    {item.description && (
                                        <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                                    )}
                                    <p className="text-xl font-bold text-orange-500">£{item.price.toFixed(2)}</p>
                                </div>

                                <div className="flex gap-2">
                                    <Dialog open={isEditDialogOpen && editingItem?.id === item.id} onOpenChange={(open) => {
                                        if (!open) {
                                            setEditingItem(null);
                                            setIsEditDialogOpen(false);
                                        }
                                    }}>
                                        <DialogTrigger asChild>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditingItem(item);
                                                    setIsEditDialogOpen(true);
                                                }}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Edit Menu Item</DialogTitle>
                                            </DialogHeader>
                                            {editingItem && (
                                                <ItemForm
                                                    restaurantId={restaurantId}
                                                    initialData={editingItem}
                                                    categories={categories}
                                                    onSubmit={(data) => updateMutation.mutate({ id: editingItem.id, data })}
                                                    isLoading={updateMutation.isPending}
                                                />
                                            )}
                                        </DialogContent>
                                    </Dialog>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => deleteMutation.mutate(item.id)}
                                        disabled={deleteMutation.isPending}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

function ItemForm({ restaurantId, initialData, categories, onSubmit, isLoading }) {
    const [formData, setFormData] = useState({
        restaurant_id: restaurantId,
        name: initialData?.name || '',
        description: initialData?.description || '',
        price: initialData?.price || '',
        category: initialData?.category || categories[0] || 'Mains',
        is_available: initialData?.is_available !== false,
        is_vegetarian: initialData?.is_vegetarian || false,
        is_spicy: initialData?.is_spicy || false,
    });

    const [newCategory, setNewCategory] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.price || !formData.category) {
            toast.error('Please fill in all required fields');
            return;
        }
        onSubmit({
            ...formData,
            price: parseFloat(formData.price),
            category: newCategory || formData.category,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input
                placeholder="Item Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
            />

            <textarea
                placeholder="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                rows="3"
            />

            <Input
                type="number"
                placeholder="Price *"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                required
            />

            <div className="space-y-2">
                <label className="text-sm font-medium">Category *</label>
                <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                >
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>

                <Input
                    placeholder="Or create new category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                />
            </div>

            <div className="space-y-2">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={formData.is_available}
                        onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                        className="rounded"
                    />
                    <span className="text-sm">Available</span>
                </label>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={formData.is_vegetarian}
                        onChange={(e) => setFormData({ ...formData, is_vegetarian: e.target.checked })}
                        className="rounded"
                    />
                    <span className="text-sm">Vegetarian</span>
                </label>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={formData.is_spicy}
                        onChange={(e) => setFormData({ ...formData, is_spicy: e.target.checked })}
                        className="rounded"
                    />
                    <span className="text-sm">Spicy</span>
                </label>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full bg-orange-500 hover:bg-orange-600">
                {isLoading ? 'Saving...' : 'Save Item'}
            </Button>
        </form>
    );
}