import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, ArrowLeft } from 'lucide-react';
import RestaurantCard from '@/components/home/RestaurantCard';

export default function Favorites() {
    const [user, setUser] = useState(null);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
        } catch (e) {
            base44.auth.redirectToLogin();
        }
    };

    const { data: favorites = [], isLoading: favoritesLoading } = useQuery({
        queryKey: ['favorites', user?.email],
        queryFn: () => base44.entities.Favorite.filter({ user_email: user.email }),
        enabled: !!user,
        refetchInterval: 5000,
    });

    const { data: allRestaurants = [], isLoading: restaurantsLoading } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const favoriteRestaurants = allRestaurants.filter(r => 
        favorites.some(f => f.restaurant_id === r.id)
    );

    const isLoading = favoritesLoading || restaurantsLoading;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <Link to={createPageUrl('Home')}>
                            <Button size="icon" variant="ghost" className="rounded-full">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div className="flex items-center gap-2">
                            <Heart className="h-6 w-6 text-red-500 fill-red-500" />
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">My Favorites</h1>
                                <p className="text-sm text-gray-500">Your saved restaurants</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-8">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                            <Skeleton key={n} className="h-64 rounded-2xl" />
                        ))}
                    </div>
                ) : favoriteRestaurants.length === 0 ? (
                    <Card className="rounded-2xl">
                        <CardContent className="py-12 text-center">
                            <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Favorites Yet</h3>
                            <p className="text-gray-500 mb-6">Start adding restaurants to your favorites for quick access</p>
                            <Link to={createPageUrl('Home')}>
                                <Button className="bg-orange-500 hover:bg-orange-600">
                                    Browse Restaurants
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {favoriteRestaurants.map((restaurant) => (
                            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}