import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Search, MapPin, Filter, Star, Clock, DollarSign } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import HeroSection from '@/components/home/HeroSection';
import CuisineFilter from '@/components/home/CuisineFilter';
import PersonalizedRecommendations from '@/components/home/PersonalizedRecommendations';
import FeaturedRestaurants from '@/components/home/FeaturedRestaurants';
import RestaurantCardWrapper from '@/components/home/RestaurantCardWrapper';
import EnhancedSearchBar from '@/components/home/EnhancedSearchBar';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';

export default function Home() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCuisine, setSelectedCuisine] = useState('');
    const [sortBy, setSortBy] = useState('rating');
    const [userLocation, setUserLocation] = useState(null);

    // Fetch restaurants with optimized caching
    const { data: restaurants = [], isLoading, refetch } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
        staleTime: 10 * 60 * 1000, // Cache for 10 minutes
        gcTime: 30 * 60 * 1000, // Keep in memory for 30 minutes
    });

    useEffect(() => {
        getUserLocation();
    }, []);

    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                () => {
                    // Default to London if geolocation fails
                    setUserLocation({ lat: 51.5074, lng: -0.1278 });
                }
            );
        } else {
            setUserLocation({ lat: 51.5074, lng: -0.1278 });
        }
    };

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 3959; // Earth's radius in miles
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const toRad = (value) => {
        return (value * Math.PI) / 180;
    };

    const handleSearch = (searchData) => {
        if (searchData.type === 'cuisine') {
            setSelectedCuisine(searchData.value);
            setSearchQuery('');
        } else {
            setSearchQuery(searchData.value);
        }
    };

    const filteredRestaurants = useMemo(() => (restaurants || [])
        .filter(r => {
            const allCuisines = r.cuisine_types?.length ? r.cuisine_types : r.cuisine_type ? [r.cuisine_type] : [];
            const matchesSearch = !searchQuery || 
                r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                allCuisines.some(c => c.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesCuisine = !selectedCuisine || allCuisines.includes(selectedCuisine);
            return matchesSearch && matchesCuisine;
        })
        .map(r => {
            if (userLocation && r.latitude && r.longitude) {
                return {
                    ...r,
                    distance: calculateDistance(userLocation.lat, userLocation.lng, r.latitude, r.longitude)
                };
            }
            return { ...r, distance: null };
        })
        .sort((a, b) => {
            if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
            if (sortBy === 'delivery_fee') return (a.delivery_fee || 0) - (b.delivery_fee || 0);
            if (sortBy === 'distance' && a.distance && b.distance) return a.distance - b.distance;
            return 0;
        }), [restaurants, searchQuery, selectedCuisine, sortBy, userLocation]);


    return (
        <PullToRefresh onRefresh={() => refetch()}>
        <div className="w-full min-h-screen bg-gradient-to-br from-orange-50 to-gray-50 dark:from-gray-900 dark:to-gray-800">
            <div className="md:block hidden">
                <HeroSection />
            </div>

            <div className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-8">
                {/* Search and Filters */}
                <div className="mb-6 md:mb-8 space-y-3 md:space-y-4">
                    <div className="flex gap-2 md:gap-4">
                        <EnhancedSearchBar
                            onSearch={handleSearch}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                        />
                        <label htmlFor="sort-by" className="sr-only">Sort restaurants by</label>
                        <select
                            id="sort-by"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="px-3 md:px-4 h-11 md:h-12 border rounded-xl bg-white text-sm md:text-base"
                        >
                            <option value="rating">⭐ Rating</option>
                            <option value="delivery_fee">💰 Fee</option>
                            <option value="distance">📍 Distance</option>
                        </select>
                    </div>

                    <CuisineFilter
                        selectedCuisine={selectedCuisine}
                        setSelectedCuisine={setSelectedCuisine}
                    />
                </div>

                <PersonalizedRecommendations />

                {/* Featured Restaurants */}
                {!selectedCuisine && !searchQuery && (
                    <FeaturedRestaurants restaurants={restaurants} />
                )}

                {/* Restaurants List */}
                <div className="mb-4 md:mb-6">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900">
                        {selectedCuisine || searchQuery ? 'Search Results' : 'All Restaurants'}
                    </h2>
                    <p className="text-sm md:text-base text-gray-600">
                        {filteredRestaurants.length} restaurant{filteredRestaurants.length !== 1 ? 's' : ''} found
                    </p>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                            <Card key={n} className="animate-pulse rounded-2xl">
                                <CardContent className="p-0">
                                    <div className="h-40 md:h-48 bg-gray-200"></div>
                                    <div className="p-3 md:p-4 space-y-2 md:space-y-3">
                                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : filteredRestaurants.length === 0 ? (
                    <Card className="rounded-2xl">
                        <CardContent className="py-8 md:py-12 text-center">
                            <Search className="h-12 w-12 md:h-16 md:w-16 text-gray-300 mx-auto mb-3 md:mb-4" />
                            <h3 className="text-lg md:text-xl font-semibold text-gray-700 mb-2">No Restaurants Found</h3>
                            <p className="text-sm md:text-base text-gray-500">Try adjusting your search or filters</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {filteredRestaurants.map((restaurant) => (
                            <RestaurantCardWrapper key={restaurant.id} restaurant={restaurant} distance={restaurant.distance} />
                        ))}
                    </div>
                )}
            </div>
        </div>
        </PullToRefresh>
    );
}