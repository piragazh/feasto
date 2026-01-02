import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';

export default function CuisineFilter({ selectedCuisine, setSelectedCuisine }) {
    const { data: cuisineTypes = [] } = useQuery({
        queryKey: ['cuisine-types'],
        queryFn: () => base44.entities.CuisineType.filter({ is_active: true }),
    });

    const cuisines = [
        { name: 'All', emoji: '🍽️' },
        ...(cuisineTypes || []).map(ct => ({ name: ct.name, emoji: ct.icon || '🍽️' }))
    ];
    return (
        <div className="py-4 md:py-8">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 md:mb-6">What are you craving?</h2>
            <div className="flex gap-2 md:gap-3 overflow-x-auto pb-3 md:pb-4 scrollbar-hide -mx-3 md:mx-0 px-3 md:px-0">
                {cuisines.map((cuisine) => (
                    <motion.button
                        key={cuisine.name}
                        onClick={() => setSelectedCuisine(cuisine.name === 'All' ? null : cuisine.name)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`flex flex-col items-center gap-1.5 md:gap-2 min-w-[70px] md:min-w-[80px] px-3 md:px-4 py-2.5 md:py-3 rounded-2xl transition-all ${
                            (cuisine.name === 'All' && !selectedCuisine) || selectedCuisine === cuisine.name
                                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                                : 'bg-white text-gray-700 active:bg-gray-100 border border-gray-100'
                        }`}
                    >
                        <span className="text-xl md:text-2xl">{cuisine.emoji}</span>
                        <span className="text-xs md:text-sm font-medium whitespace-nowrap">{cuisine.name}</span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
}