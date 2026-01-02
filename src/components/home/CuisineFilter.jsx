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
        <div className="py-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">What are you craving?</h2>
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                {cuisines.map((cuisine) => (
                    <motion.button
                        key={cuisine.name}
                        onClick={() => setSelectedCuisine(cuisine.name === 'All' ? null : cuisine.name)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`flex flex-col items-center gap-2 min-w-[80px] px-4 py-3 rounded-2xl transition-all ${
                            (cuisine.name === 'All' && !selectedCuisine) || selectedCuisine === cuisine.name
                                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-100'
                        }`}
                    >
                        <span className="text-2xl">{cuisine.emoji}</span>
                        <span className="text-sm font-medium whitespace-nowrap">{cuisine.name}</span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
}