import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Star, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function FavoritesList({ user, onUpdate }) {
    const queryClient = useQueryClient();

    const { data: favoriteRestaurants = [] } = useQuery({
        queryKey: ['favorite-restaurants', user.favorite_restaurants],
        queryFn: async () => {
            if (!user.favorite_restaurants?.length) return [];
            const allRestaurants = await base44.entities.Restaurant.list();
            return allRestaurants.filter(r => user.favorite_restaurants.includes(r.id));
        },
    });

    const { data: favoriteMenuItems = [] } = useQuery({
        queryKey: ['favorite-menu-items', user.favorite_menu_items],
        queryFn: async () => {
            if (!user.favorite_menu_items?.length) return [];
            const allItems = await base44.entities.MenuItem.list();
            return allItems.filter(i => user.favorite_menu_items.includes(i.id));
        },
    });

    const removeFavoriteMutation = useMutation({
        mutationFn: async ({ type, id }) => {
            const field = type === 'restaurant' ? 'favorite_restaurants' : 'favorite_menu_items';
            const current = user[field] || [];
            await base44.auth.updateMe({
                [field]: current.filter(fId => fId !== id)
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['favorite-restaurants']);
            queryClient.invalidateQueries(['favorite-menu-items']);
            onUpdate();
            toast.success('Removed from favorites');
        },
    });

    return (
        <Tabs defaultValue="restaurants">
            <TabsList className="bg-white mb-6">
                <TabsTrigger value="restaurants">
                    Restaurants ({favoriteRestaurants.length})
                </TabsTrigger>
                <TabsTrigger value="dishes">
                    Dishes ({favoriteMenuItems.length})
                </TabsTrigger>
            </TabsList>

            <TabsContent value="restaurants">
                {favoriteRestaurants.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Favorite Restaurants</h3>
                            <p className="text-gray-500 mb-6">Save your favorite restaurants for quick access!</p>
                            <Link to={createPageUrl('Home')}>
                                <Button className="bg-orange-500 hover:bg-orange-600">Browse Restaurants</Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                        {favoriteRestaurants.map((restaurant) => (
                            <Card key={restaurant.id} className="hover:shadow-lg transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex gap-4">
                                        {restaurant.image_url && (
                                            <img
                                                src={restaurant.image_url}
                                                alt={restaurant.name}
                                                className="w-24 h-24 rounded-lg object-cover"
                                            />
                                        )}
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-lg mb-1">{restaurant.name}</h3>
                                            <p className="text-sm text-gray-600 mb-2">{restaurant.cuisine_type}</p>
                                            <div className="flex items-center gap-1 text-yellow-500 mb-3">
                                                <Star className="h-4 w-4 fill-current" />
                                                <span className="text-sm font-medium">{restaurant.rating}</span>
                                                <span className="text-xs text-gray-500">({restaurant.review_count})</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <Link to={createPageUrl('Restaurant') + `?id=${restaurant.id}`} className="flex-1">
                                                    <Button size="sm" className="w-full bg-orange-500 hover:bg-orange-600">
                                                        Order Now
                                                    </Button>
                                                </Link>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => removeFavoriteMutation.mutate({ type: 'restaurant', id: restaurant.id })}
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
                )}
            </TabsContent>

            <TabsContent value="dishes">
                {favoriteMenuItems.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Favorite Dishes</h3>
                            <p className="text-gray-500 mb-6">Save your favorite dishes for easy reordering!</p>
                            <Link to={createPageUrl('Home')}>
                                <Button className="bg-orange-500 hover:bg-orange-600">Browse Menus</Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {favoriteMenuItems.map((item) => (
                            <Card key={item.id}>
                                <CardContent className="p-4">
                                    {item.image_url && (
                                        <img
                                            src={item.image_url}
                                            alt={item.name}
                                            className="w-full h-32 rounded-lg object-cover mb-3"
                                        />
                                    )}
                                    <h3 className="font-semibold mb-1">{item.name}</h3>
                                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">{item.description}</p>
                                    <div className="flex items-center justify-between">
                                        <p className="text-lg font-bold text-orange-600">£{item.price.toFixed(2)}</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => removeFavoriteMutation.mutate({ type: 'menu_item', id: item.id })}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </TabsContent>
        </Tabs>
    );
}