import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import HeroSection from '@/components/home/HeroSection';
import CuisineFilter from '@/components/home/CuisineFilter';
import RestaurantCard from '@/components/home/RestaurantCard';
import PersonalizedRecommendations from '@/components/home/PersonalizedRecommendations';
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from 'framer-motion';

export default function Home() {
    const [searchQuery, setSearchQuery] = useState('');
    const [location, setLocation] = useState('');
    const [selectedCuisine, setSelectedCuisine] = useState(null);

    const { data: restaurants = [], isLoading } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const filteredRestaurants = restaurants.filter(restaurant => {
        const matchesSearch = !searchQuery || 
            restaurant.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            restaurant.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCuisine = !selectedCuisine || restaurant.cuisine_type === selectedCuisine;
        return matchesSearch && matchesCuisine;
    });

    return (
        <div className="min-h-screen bg-gray-50">
            <HeroSection
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                location={location}
                setLocation={setLocation}
            />
            
            <div className="max-w-6xl mx-auto px-4">
                <CuisineFilter
                    selectedCuisine={selectedCuisine}
                    setSelectedCuisine={setSelectedCuisine}
                />

                <PersonalizedRecommendations restaurants={filteredRestaurants} />
                
                <div className="pb-12">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">
                            {selectedCuisine ? `${selectedCuisine} Restaurants` : 'All Restaurants'}
                        </h2>
                        <span className="text-gray-500">{filteredRestaurants.length} places</span>
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
                                    <RestaurantCard restaurant={restaurant} />
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}