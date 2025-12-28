import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChefHat } from 'lucide-react';
import { toast } from 'sonner';

export default function CuisineTypeManagement() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingCuisine, setEditingCuisine] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        icon: '',
        is_active: true
    });

    const queryClient = useQueryClient();

    const { data: cuisineTypes = [], isLoading } = useQuery({
        queryKey: ['cuisine-types'],
        queryFn: () => base44.entities.CuisineType.list(),
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.CuisineType.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['cuisine-types']);
            toast.success('Cuisine type created successfully');
            handleCloseDialog();
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.CuisineType.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['cuisine-types']);
            toast.success('Cuisine type updated successfully');
            handleCloseDialog();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.CuisineType.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['cuisine-types']);
            toast.success('Cuisine type deleted successfully');
        },
    });

    const handleOpenDialog = (cuisine = null) => {
        if (cuisine) {
            setEditingCuisine(cuisine);
            setFormData({
                name: cuisine.name || '',
                description: cuisine.description || '',
                icon: cuisine.icon || '',
                is_active: cuisine.is_active !== false
            });
        } else {
            setEditingCuisine(null);
            setFormData({
                name: '',
                description: '',
                icon: '',
                is_active: true
            });
        }
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingCuisine(null);
        setFormData({
            name: '',
            description: '',
            icon: '',
            is_active: true
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!formData.name.trim()) {
            toast.error('Please enter a cuisine type name');
            return;
        }

        if (editingCuisine) {
            updateMutation.mutate({ id: editingCuisine.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const handleDelete = (id) => {
        if (window.confirm('Are you sure you want to delete this cuisine type?')) {
            deleteMutation.mutate(id);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <ChefHat className="h-5 w-5 text-orange-500" />
                                Cuisine Type Management
                            </CardTitle>
                            <p className="text-sm text-gray-500 mt-1">
                                Manage available cuisine types for restaurants
                            </p>
                        </div>
                        <Button onClick={() => handleOpenDialog()} className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Cuisine Type
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : cuisineTypes.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No cuisine types yet. Add your first one!
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {cuisineTypes.map((cuisine) => (
                                <Card key={cuisine.id} className="overflow-hidden">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="text-3xl">
                                                    {cuisine.icon || '🍽️'}
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-lg">{cuisine.name}</h3>
                                                    {cuisine.description && (
                                                        <p className="text-sm text-gray-500 mt-1">
                                                            {cuisine.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <Badge variant={cuisine.is_active ? 'default' : 'secondary'}>
                                                {cuisine.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleOpenDialog(cuisine)}
                                                className="flex-1"
                                            >
                                                <Pencil className="h-3 w-3 mr-1" />
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleDelete(cuisine.id)}
                                                className="text-red-600 hover:bg-red-50"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingCuisine ? 'Edit Cuisine Type' : 'Add New Cuisine Type'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div>
                                <Label>Cuisine Type Name *</Label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Pizza, Burgers, Chinese"
                                    required
                                />
                            </div>
                            <div>
                                <Label>Icon (Emoji or Image URL)</Label>
                                <Input
                                    value={formData.icon}
                                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                                    placeholder="🍕"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Use an emoji or paste an image URL
                                </p>
                            </div>
                            <div>
                                <Label>Description</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Optional description"
                                    rows={3}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="rounded"
                                />
                                <Label htmlFor="is_active" className="cursor-pointer">
                                    Active
                                </Label>
                            </div>
                        </div>
                        <DialogFooter className="mt-6">
                            <Button type="button" variant="outline" onClick={handleCloseDialog}>
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className="bg-orange-500 hover:bg-orange-600"
                                disabled={createMutation.isPending || updateMutation.isPending}
                            >
                                {editingCuisine ? 'Update' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}