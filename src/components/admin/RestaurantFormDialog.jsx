import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from 'sonner';

export default function RestaurantFormDialog({ open, onClose, restaurant }) {
    const [formData, setFormData] = useState({
        name: '',
        cuisine_type: 'Pizza',
        image_url: '',
        description: '',
        address: '',
        delivery_time: '25-35 min',
        delivery_fee: '5.00',
        minimum_order: '15.00',
        is_open: true
    });

    const queryClient = useQueryClient();

    const { data: cuisineTypes = [] } = useQuery({
        queryKey: ['cuisine-types'],
        queryFn: () => base44.entities.CuisineType.filter({ is_active: true }),
    });

    useEffect(() => {
        if (restaurant) {
            setFormData({
                name: restaurant.name || '',
                cuisine_type: restaurant.cuisine_type || (cuisineTypes[0]?.name || ''),
                image_url: restaurant.image_url || '',
                description: restaurant.description || '',
                address: restaurant.address || '',
                delivery_time: restaurant.delivery_time || '25-35 min',
                delivery_fee: restaurant.delivery_fee?.toString() || '5.00',
                minimum_order: restaurant.minimum_order?.toString() || '15.00',
                is_open: restaurant.is_open !== false
            });
        } else {
            setFormData({
                name: '',
                cuisine_type: cuisineTypes[0]?.name || '',
                image_url: '',
                description: '',
                address: '',
                delivery_time: '25-35 min',
                delivery_fee: '5.00',
                minimum_order: '15.00',
                is_open: true
            });
        }
    }, [restaurant, open, cuisineTypes]);

    const saveMutation = useMutation({
        mutationFn: (data) => {
            const payload = {
                ...data,
                delivery_fee: parseFloat(data.delivery_fee),
                minimum_order: parseFloat(data.minimum_order),
                rating: restaurant?.rating || 4.5,
                review_count: restaurant?.review_count || 0
            };
            
            if (restaurant) {
                return base44.entities.Restaurant.update(restaurant.id, payload);
            } else {
                return base44.entities.Restaurant.create(payload);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-restaurants']);
            toast.success(restaurant ? 'Restaurant updated' : 'Restaurant created');
            onClose();
        },
        onError: (error) => {
            toast.error('Failed to save restaurant: ' + error.message);
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{restaurant ? 'Edit' : 'Add'} Restaurant</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label>Restaurant Name *</Label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>

                    <div>
                        <Label>Cuisine Type *</Label>
                        <Select
                            value={formData.cuisine_type}
                            onValueChange={(value) => setFormData({ ...formData, cuisine_type: value })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {cuisineTypes.map((cuisine) => (
                                    <SelectItem key={cuisine.id} value={cuisine.name}>
                                        {cuisine.icon && <span className="mr-2">{cuisine.icon}</span>}
                                        {cuisine.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label>Image URL</Label>
                        <Input
                            value={formData.image_url}
                            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                            placeholder="https://..."
                        />
                    </div>

                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                        />
                    </div>

                    <div>
                        <Label>Address</Label>
                        <Input
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label>Delivery Time</Label>
                            <Input
                                value={formData.delivery_time}
                                onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
                                placeholder="25-35 min"
                            />
                        </div>
                        <div>
                            <Label>Delivery Fee (£)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formData.delivery_fee}
                                onChange={(e) => setFormData({ ...formData, delivery_fee: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Min Order (£)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formData.minimum_order}
                                onChange={(e) => setFormData({ ...formData, minimum_order: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-orange-500 hover:bg-orange-600"
                            disabled={saveMutation.isPending}
                        >
                            {restaurant ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}