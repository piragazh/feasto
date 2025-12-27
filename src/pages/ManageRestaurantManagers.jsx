import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, UserCheck, Building } from 'lucide-react';
import { toast } from 'sonner';

export default function ManageRestaurantManagers() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        full_name: '',
        restaurant_ids: []
    });

    const queryClient = useQueryClient();

    const { data: managers = [], isLoading } = useQuery({
        queryKey: ['restaurant-managers'],
        queryFn: () => base44.entities.RestaurantManager.list(),
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const createManagerMutation = useMutation({
        mutationFn: async (data) => {
            // Invite user to the platform
            await base44.users.inviteUser(data.email, 'user');
            
            // Create restaurant manager entry
            return base44.entities.RestaurantManager.create({
                user_email: data.email,
                full_name: data.full_name,
                restaurant_ids: data.restaurant_ids,
                is_active: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-managers']);
            toast.success('Restaurant manager created and invited!');
            resetForm();
        },
        onError: (error) => {
            toast.error('Failed to create manager: ' + error.message);
        }
    });

    const deleteManagerMutation = useMutation({
        mutationFn: (id) => base44.entities.RestaurantManager.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-managers']);
            toast.success('Manager removed');
        },
    });

    const resetForm = () => {
        setFormData({
            email: '',
            full_name: '',
            restaurant_ids: []
        });
        setDialogOpen(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (formData.restaurant_ids.length === 0) {
            toast.error('Please select at least one restaurant');
            return;
        }
        createManagerMutation.mutate(formData);
    };

    const toggleRestaurant = (restaurantId) => {
        setFormData(prev => ({
            ...prev,
            restaurant_ids: prev.restaurant_ids.includes(restaurantId)
                ? prev.restaurant_ids.filter(id => id !== restaurantId)
                : [...prev.restaurant_ids, restaurantId]
        }));
    };

    const getRestaurantNames = (restaurantIds) => {
        return restaurantIds
            .map(id => restaurants.find(r => r.id === id)?.name)
            .filter(Boolean)
            .join(', ');
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Restaurant Managers</h1>
                        <p className="text-gray-600 mt-1">Assign users to manage specific restaurants</p>
                    </div>
                    
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-orange-500 hover:bg-orange-600">
                                <Plus className="h-5 w-5 mr-2" />
                                Add Manager
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Create Restaurant Manager</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <Label>Email Address *</Label>
                                    <Input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="manager@example.com"
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        An invitation email will be sent to this address
                                    </p>
                                </div>

                                <div>
                                    <Label>Full Name *</Label>
                                    <Input
                                        value={formData.full_name}
                                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                        placeholder="John Doe"
                                        required
                                    />
                                </div>

                                <div>
                                    <Label className="mb-3 block">Assign Restaurants *</Label>
                                    <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                                        {restaurants.map((restaurant) => (
                                            <div key={restaurant.id} className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={formData.restaurant_ids.includes(restaurant.id)}
                                                    onCheckedChange={() => toggleRestaurant(restaurant.id)}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Building className="h-4 w-4 text-gray-400" />
                                                    <span className="text-sm">{restaurant.name}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <Button type="button" variant="outline" onClick={resetForm}>
                                        Cancel
                                    </Button>
                                    <Button 
                                        type="submit" 
                                        className="bg-orange-500 hover:bg-orange-600"
                                        disabled={createManagerMutation.isPending}
                                    >
                                        Create Manager
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {isLoading ? (
                    <div className="text-center py-8">Loading managers...</div>
                ) : managers.length === 0 ? (
                    <Card>
                        <CardContent className="text-center py-12">
                            <UserCheck className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Managers Yet</h3>
                            <p className="text-gray-500 mb-4">Create restaurant managers to delegate access</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                        {managers.map((manager) => (
                            <Card key={manager.id}>
                                <CardContent className="pt-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <h3 className="font-semibold text-lg">{manager.full_name}</h3>
                                            <p className="text-sm text-gray-600">{manager.user_email}</p>
                                        </div>
                                        <Badge variant={manager.is_active ? 'default' : 'secondary'}>
                                            {manager.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </div>

                                    <div className="mb-4">
                                        <p className="text-xs text-gray-500 mb-2">Manages Restaurants:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {manager.restaurant_ids.map(id => {
                                                const restaurant = restaurants.find(r => r.id === id);
                                                return restaurant ? (
                                                    <Badge key={id} variant="outline" className="text-xs">
                                                        {restaurant.name}
                                                    </Badge>
                                                ) : null;
                                            })}
                                        </div>
                                    </div>

                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => {
                                            if (confirm('Remove this manager? They will lose access to assigned restaurants.')) {
                                                deleteManagerMutation.mutate(manager.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Remove Manager
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}