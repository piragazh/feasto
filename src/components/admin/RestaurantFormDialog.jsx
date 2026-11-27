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
import { COUNTRY_OPTIONS, getRegion, normaliseCountry } from '@/lib/region';

export default function RestaurantFormDialog({ open, onClose, restaurant }) {
    const [formData, setFormData] = useState({
        name: '',
        cuisine_type: '',
        cuisine_types: [],
        image_url: '',
        description: '',
        address: '',
        delivery_time: '25-35 min',
        delivery_fee: '5.00',
        minimum_order: '15.00',
        is_open: true,
        country: 'GB'
    });

    const queryClient = useQueryClient();

    const { data: cuisineTypes = [] } = useQuery({
        queryKey: ['cuisine-types'],
        queryFn: () => base44.entities.CuisineType.filter({ is_active: true }),
    });

    useEffect(() => {
        if (open) {
            if (restaurant) {
                setFormData({
                    name: restaurant.name || '',
                    cuisine_type: restaurant.cuisine_type || '',
                    cuisine_types: restaurant.cuisine_types || (restaurant.cuisine_type ? [restaurant.cuisine_type] : []),
                    image_url: restaurant.image_url || '',
                    description: restaurant.description || '',
                    address: restaurant.address || '',
                    delivery_time: restaurant.delivery_time || '25-35 min',
                    delivery_fee: restaurant.delivery_fee?.toString() || '5.00',
                    minimum_order: restaurant.minimum_order?.toString() || '15.00',
                    is_open: restaurant.is_open !== false,
                    country: normaliseCountry(restaurant.country)
                });
            } else {
                setFormData({
                    name: '',
                    cuisine_type: '',
                    cuisine_types: [],
                    image_url: '',
                    description: '',
                    address: '',
                    delivery_time: '25-35 min',
                    delivery_fee: '5.00',
                    minimum_order: '15.00',
                    is_open: true,
                    country: 'GB'
                });
            }
        }
    }, [restaurant, open]);

    const toggleCuisineType = (name) => {
        const current = formData.cuisine_types || [];
        const updated = current.includes(name) ? current.filter(c => c !== name) : [...current, name];
        setFormData({ ...formData, cuisine_types: updated, cuisine_type: updated[0] || '' });
    };

    const saveMutation = useMutation({
        mutationFn: ({ country, ...data }) => {
            const payload = {
                ...data,
                cuisine_type: data.cuisine_types?.[0] || data.cuisine_type || '',
                delivery_fee: parseFloat(data.delivery_fee),
                minimum_order: parseFloat(data.minimum_order),
                rating: restaurant?.rating || 4.5,
                review_count: restaurant?.review_count || 0
            };
            // Country decides currency, clock, phone format, address lookup and
            // card payments (src/lib/region.js). Only write it, and the matching
            // clock, when it is new or changed, so saving an existing UK shop
            // writes exactly what it did before.
            const previousCountry = restaurant ? normaliseCountry(restaurant.country) : null;
            if (!restaurant || country !== previousCountry) {
                payload.country = country;
                payload.timezone = getRegion(country).timezone;
            }
            
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
                        <Label>Cuisine Types *</Label>
                        <p className="text-xs text-gray-500 mb-2">Select one or more</p>
                        <div className="flex flex-wrap gap-2">
                            {cuisineTypes.map((cuisine) => {
                                const selected = (formData.cuisine_types || []).includes(cuisine.name);
                                return (
                                    <button
                                        key={cuisine.id}
                                        type="button"
                                        onClick={() => toggleCuisineType(cuisine.name)}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                            selected
                                                ? 'bg-orange-500 text-white border-orange-500'
                                                : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'
                                        }`}
                                    >
                                        {cuisine.icon && <span className="mr-1">{cuisine.icon}</span>}
                                        {cuisine.name}
                                    </button>
                                );
                            })}
                        </div>
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

                    <div>
                        <Label>Country</Label>
                        <Select
                            value={formData.country}
                            onValueChange={(value) => setFormData({ ...formData, country: value })}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {COUNTRY_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                            Sets currency ({getRegion(formData.country).currency}), local time, phone format and address lookup.
                            {!getRegion(formData.country).cardProvider && ' Card payments are not available in this country yet: cash / pay at the shop only.'}
                        </p>
                        {restaurant && formData.country !== normaliseCountry(restaurant.country) && (
                            <p className="text-xs text-amber-700 mt-1">
                                Changing the country does not convert existing prices. Check the menu prices after saving.
                            </p>
                        )}
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
                            <Label>Delivery Fee ({getRegion(formData.country).currencySymbol})</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formData.delivery_fee}
                                onChange={(e) => setFormData({ ...formData, delivery_fee: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Min Order ({getRegion(formData.country).currencySymbol})</Label>
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