import React from 'react';
import RestaurantCard from './RestaurantCard';
import { Star } from 'lucide-react';

export default function FeaturedRestaurants({ restaurants }) {
    // Get top rated restaurants (rating >= 4.5) or top 6 by rating
    const featured = restaurants
        .filter(r => r.rating >= 4.5 || r.is_open)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 6);

    if (featured.length === 0) return null;

    return (
        <div className="mb-12">
            <div className="flex items-center gap-2 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center">
                    <Star className="h-5 w-5 text-white fill-white" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Featured Restaurants</h2>
                    <p className="text-sm text-gray-600">Top-rated spots loved by our customers</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {featured.map((restaurant) => (
                    <RestaurantCard key={restaurant.id} restaurant={restaurant} />
                ))}
            </div>
        </div>
    );
}