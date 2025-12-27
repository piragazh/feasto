import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import HeroSection from '@/components/home/HeroSection';
import CuisineFilter from '@/components/home/CuisineFilter';
import RestaurantCard from '@/components/home/RestaurantCard';
import PersonalizedRecommendations from '@/components/home/PersonalizedRecommendations';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { motion } from 'framer-motion';

export default function Home() {
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [selectedCuisine, setSelectedCuisine] = useState(null);
    const [sortBy, setSortBy] = useState('recommended'); // 'recommended', 'distance', 'rating'

    const { data: restaurants = [], isLoading } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const handleLocationChange = (locationData) => {
        setUserLocation(locationData);
        // Store for checkout
        if (locationData.address) {
            localStorage.setItem('userAddress', locationData.address);
        }
        if (locationData.coordinates) {
            localStorage.setItem('userCoordinates', JSON.stringify(locationData.coordinates));
        }
    };

    const restaurantsWithDistance = React.useMemo(() => {
        if (!userLocation?.coordinates) return restaurants.map(r => ({ ...r, distance: null }));
        
        return restaurants.map(restaurant => {
            if (!restaurant.latitude || !restaurant.longitude) {
                return { ...restaurant, distance: null };
            }
            
            // Calculate distance using Haversine formula
            const distance = calculateDistance(
                userLocation.coordinates.lat,
                userLocation.coordinates.lng,
                restaurant.latitude,
                restaurant.longitude
            );
            return { ...restaurant, distance };
        });
    }, [restaurants, userLocation]);

    const filteredRestaurants = restaurantsWithDistance.filter(restaurant => {
        const matchesSearch = !searchQuery || 
            restaurant.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            restaurant.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCuisine = !selectedCuisine || restaurant.cuisine_type === selectedCuisine;
        return matchesSearch && matchesCuisine;
    }).sort((a, b) => {
        if (sortBy === 'distance' && a.distance !== null && b.distance !== null) {
            return a.distance - b.distance;
        }
        if (sortBy === 'rating') {
            return (b.rating || 0) - (a.rating || 0);
        }
        return 0; // recommended (default order)
    });

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function toRad(degrees) {
        return degrees * (Math.PI / 180);
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <HeroSection
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onLocationChange={handleLocationChange}
            />
            
            <div className="max-w-6xl mx-auto px-4">
                <CuisineFilter
                    selectedCuisine={selectedCuisine}
                    setSelectedCuisine={setSelectedCuisine}
                />

                <PersonalizedRecommendations restaurants={filteredRestaurants} />
                
                <div className="pb-12">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">
                                {selectedCuisine ? `${selectedCuisine} Restaurants` : 'All Restaurants'}
                            </h2>
                            <span className="text-gray-500 text-sm">{filteredRestaurants.length} places</span>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant={sortBy === 'recommended' ? 'default' : 'outline'}
                                onClick={() => setSortBy('recommended')}
                                size="sm"
                            >
                                Recommended
                            </Button>
                            {userLocation?.coordinates && (
                                <Button
                                    variant={sortBy === 'distance' ? 'default' : 'outline'}
                                    onClick={() => setSortBy('distance')}
                                    size="sm"
                                >
                                    Nearest
                                </Button>
                            )}
                            <Button
                                variant={sortBy === 'rating' ? 'default' : 'outline'}
                                onClick={() => setSortBy('rating')}
                                size="sm"
                            >
                                Top Rated
                            </Button>
                        </div>
                    </div>
                    
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="bg-white rounded-2xl overflow-hidden">
                                    <Skeleton className="h-48 w-full" />
                                    <div className="p-4 space-y-3">
                                        <Skeleton className="h-6 w-3/4" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredRestaurants.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-4xl">🍽️</span>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">No restaurants found</h3>
                            <p className="text-gray-500">Try adjusting your search or filters</p>
                        </div>
                    ) : (
                        <motion.div
                            initial="hidden"
                            animate="visible"
                            variants={{
                                visible: { transition: { staggerChildren: 0.05 } }
                            }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                            {filteredRestaurants.map((restaurant) => (
                                <motion.div
                                    key={restaurant.id}
                                    variants={{
                                        hidden: { opacity: 0, y: 20 },
                                        visible: { opacity: 1, y: 0 }
                                    }}
                                >
                                    <RestaurantCard restaurant={restaurant} distance={restaurant.distance} />
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}