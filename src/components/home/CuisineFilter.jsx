import React from 'react';
import { motion } from 'framer-motion';

const cuisines = [
    { name: 'All', emoji: '🍽️' },
    { name: 'Pizza', emoji: '🍕' },
    { name: 'Burgers', emoji: '🍔' },
    { name: 'Chinese', emoji: '🥡' },
    { name: 'Indian', emoji: '🍛' },
    { name: 'Thai', emoji: '🍜' },
    { name: 'Sushi', emoji: '🍣' },
    { name: 'Mexican', emoji: '🌮' },
    { name: 'Italian', emoji: '🍝' },
    { name: 'Healthy', emoji: '🥗' },
];

export default function CuisineFilter({ selectedCuisine, setSelectedCuisine }) {
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