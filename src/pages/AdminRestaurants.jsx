import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Building, User, Search, LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';
import RestaurantFormDialog from '@/components/admin/RestaurantFormDialog';
import AssignOwnerDialog from '@/components/admin/AssignOwnerDialog';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function AdminRestaurants() {
    const navigate = useNavigate();
    const [isChecking, setIsChecking] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingRestaurant, setEditingRestaurant] = useState(null);
    const [assigningRestaurant, setAssigningRestaurant] = useState(null);
    const [formDialogOpen, setFormDialogOpen] = useState(false);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);

    const queryClient = useQueryClient();

    const { data: restaurants = [], isLoading } = useQuery({
        queryKey: ['admin-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
        enabled: !isChecking,
    });

    const { data: users = [] } = useQuery({
        queryKey: ['all-users'],
        queryFn: () => base44.entities.User.list(),
        enabled: !isChecking,
    });

    const deleteRestaurantMutation = useMutation({
        mutationFn: (id) => base44.entities.Restaurant.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-restaurants']);
            toast.success('Restaurant deleted');
        },
    });

    const toggleStatusMutation = useMutation({
        mutationFn: ({ id, is_open }) => base44.entities.Restaurant.update(id, { is_open }),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-restaurants']);
            toast.success('Status updated');
        },
    });

    // Check authentication and admin role
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const user = await base44.auth.me();
                if (!user || user.role !== 'admin') {
                    base44.auth.redirectToLogin(window.location.pathname);
                    return;
                }
                setIsChecking(false);
            } catch (e) {
                base44.auth.redirectToLogin(window.location.pathname);
            }
        };
        checkAuth();
    }, []);

    if (isChecking) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Checking access...</p>
                </div>
            </div>
        );
    }

    const filteredRestaurants = restaurants.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.cuisine_type?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const { data: managers = [] } = useQuery({
        queryKey: ['restaurant-managers'],
        queryFn: () => base44.entities.RestaurantManager.list(),
        enabled: !isChecking,
    });

    const getOwnerName = (restaurantId) => {
        const manager = managers.find(m => m.restaurant_ids?.includes(restaurantId));
        return manager ? manager.full_name || manager.user_email : 'Unassigned';
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Restaurant Management</h1>
                        <p className="text-sm sm:text-base text-gray-600 mt-1">Manage all restaurants and their owners</p>
                    </div>
                    <Button 
                        onClick={() => {
                            setEditingRestaurant(null);
                            setFormDialogOpen(true);
                        }}
                        className="bg-orange-500 hover:bg-orange-600 w-full sm:w-auto"
                    >
                        <Plus className="h-5 w-5 mr-2" />
                        Add Restaurant
                    </Button>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                            placeholder="Search restaurants..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>

                {/* Restaurants List */}
                {isLoading ? (
                    <div className="text-center py-8">Loading restaurants...</div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredRestaurants.map((restaurant) => (
                            <Card key={restaurant.id}>
                                <CardContent className="pt-6">
                                    {restaurant.image_url && (
                                        <img
                                            src={restaurant.image_url}
                                            alt={restaurant.name}
                                            className="w-full h-40 object-cover rounded-lg mb-4"
                                        />
                                    )}
                                    
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-lg mb-1">{restaurant.name}</h3>
                                            <Badge variant="outline" className="text-xs mb-2">
                                                {restaurant.cuisine_type}
                                            </Badge>
                                            <p className="text-xs text-gray-500">ID: {restaurant.id}</p>
                                        </div>
                                        <Badge variant={restaurant.is_open ? 'default' : 'secondary'}>
                                            {restaurant.is_open ? 'Open' : 'Closed'}
                                        </Badge>
                                    </div>

                                    <div className="space-y-2 mb-4 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Owner:</span>
                                            <span className="font-medium">{getOwnerName(restaurant.id)}</span>
                                        </div>
                                        {restaurant.rating && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-600">Rating:</span>
                                                <span className="font-medium">⭐ {restaurant.rating.toFixed(1)}</span>
                                            </div>
                                        )}
                                        {restaurant.delivery_time && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-600">Delivery:</span>
                                                <span className="font-medium">{restaurant.delivery_time}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => navigate(createPageUrl('RestaurantDashboard') + `?restaurantId=${restaurant.id}`)}
                                            className="w-full bg-orange-50 hover:bg-orange-100 border-orange-300"
                                        >
                                            <LayoutDashboard className="h-4 w-4 mr-2" />
                                            Open Dashboard
                                        </Button>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditingRestaurant(restaurant);
                                                    setFormDialogOpen(true);
                                                }}
                                                className="flex-1"
                                            >
                                                <Edit className="h-4 w-4 sm:mr-1" />
                                                <span className="hidden sm:inline">Edit</span>
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setAssigningRestaurant(restaurant);
                                                    setAssignDialogOpen(true);
                                                }}
                                                className="flex-1"
                                            >
                                                <User className="h-4 w-4 sm:mr-1" />
                                                <span className="hidden sm:inline">Assign</span>
                                            </Button>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => 
                                                    toggleStatusMutation.mutate({ 
                                                        id: restaurant.id, 
                                                        is_open: !restaurant.is_open 
                                                    })
                                                }
                                                className="flex-1"
                                            >
                                                {restaurant.is_open ? 'Close' : 'Open'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => {
                                                    if (confirm('Delete this restaurant? This cannot be undone.')) {
                                                        deleteRestaurantMutation.mutate(restaurant.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                <RestaurantFormDialog
                    open={formDialogOpen}
                    onClose={() => {
                        setFormDialogOpen(false);
                        setEditingRestaurant(null);
                    }}
                    restaurant={editingRestaurant}
                />

                <AssignOwnerDialog
                    open={assignDialogOpen}
                    onClose={() => {
                        setAssignDialogOpen(false);
                        setAssigningRestaurant(null);
                    }}
                    restaurant={assigningRestaurant}
                    users={users}
                />
            </div>
        </div>
    );
}