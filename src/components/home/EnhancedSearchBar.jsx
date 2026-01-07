import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Search, X, TrendingUp, Utensils, MapPin } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function EnhancedSearchBar({ onSearch, searchQuery, setSearchQuery }) {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const searchRef = useRef(null);
    const navigate = useNavigate();

    // Fetch restaurants and menu items for suggestions
    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
        staleTime: 300000,
    });

    const { data: menuItems = [] } = useQuery({
        queryKey: ['allMenuItems'],
        queryFn: () => base44.entities.MenuItem.list(),
        staleTime: 300000,
    });

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Close suggestions on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Generate suggestions based on query
    const suggestions = React.useMemo(() => {
        if (!debouncedQuery || debouncedQuery.length < 2) return { restaurants: [], cuisines: [], items: [] };

        const query = debouncedQuery.toLowerCase();

        // Restaurant suggestions
        const restaurantMatches = restaurants
            .filter(r => r.name.toLowerCase().includes(query))
            .slice(0, 3)
            .map(r => ({ type: 'restaurant', data: r }));

        // Cuisine suggestions
        const cuisineMatches = [...new Set(restaurants.map(r => r.cuisine_type))]
            .filter(c => c && c.toLowerCase().includes(query))
            .slice(0, 3)
            .map(c => ({ type: 'cuisine', data: c }));

        // Menu item suggestions
        const itemMatches = menuItems
            .filter(item => 
                item.name.toLowerCase().includes(query) || 
                item.description?.toLowerCase().includes(query)
            )
            .slice(0, 4)
            .map(item => {
                const restaurant = restaurants.find(r => r.id === item.restaurant_id);
                return { type: 'item', data: { ...item, restaurantName: restaurant?.name } };
            });

        return {
            restaurants: restaurantMatches,
            cuisines: cuisineMatches,
            items: itemMatches
        };
    }, [debouncedQuery, restaurants, menuItems]);

    const handleSuggestionClick = (suggestion) => {
        if (suggestion.type === 'restaurant') {
            navigate(createPageUrl('Restaurant') + `?id=${suggestion.data.id}`);
        } else if (suggestion.type === 'cuisine') {
            setSearchQuery('');
            onSearch({ type: 'cuisine', value: suggestion.data });
        } else if (suggestion.type === 'item') {
            navigate(createPageUrl('Restaurant') + `?id=${suggestion.data.restaurant_id}`);
        }
        setShowSuggestions(false);
    };

    const hasSuggestions = suggestions.restaurants.length > 0 || 
                          suggestions.cuisines.length > 0 || 
                          suggestions.items.length > 0;

    return (
        <div ref={searchRef} className="relative flex-1">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                <Input
                    placeholder="Search restaurants, cuisines, or dishes..."
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowSuggestions(true);
                        if (onSearch) onSearch({ type: 'text', value: e.target.value });
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="pl-9 md:pl-10 pr-10 h-11 md:h-12 text-sm md:text-base rounded-xl"
                />
                {searchQuery && (
                    <button
                        onClick={() => {
                            setSearchQuery('');
                            if (onSearch) onSearch({ type: 'text', value: '' });
                            setShowSuggestions(false);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <AnimatePresence>
                {showSuggestions && debouncedQuery.length >= 2 && hasSuggestions && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50"
                    >
                        {/* Restaurant Suggestions */}
                        {suggestions.restaurants.length > 0 && (
                            <div>
                                <div className="px-4 py-2 bg-gray-50 border-b">
                                    <p className="text-xs font-semibold text-gray-500 uppercase">Restaurants</p>
                                </div>
                                {suggestions.restaurants.map((suggestion, idx) => (
                                    <button
                                        key={`restaurant-${idx}`}
                                        onClick={() => handleSuggestionClick(suggestion)}
                                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                                            <Utensils className="h-5 w-5 text-orange-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{suggestion.data.name}</p>
                                            <p className="text-xs text-gray-500">{suggestion.data.cuisine_type}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Cuisine Suggestions */}
                        {suggestions.cuisines.length > 0 && (
                            <div>
                                <div className="px-4 py-2 bg-gray-50 border-b">
                                    <p className="text-xs font-semibold text-gray-500 uppercase">Cuisines</p>
                                </div>
                                {suggestions.cuisines.map((suggestion, idx) => (
                                    <button
                                        key={`cuisine-${idx}`}
                                        onClick={() => handleSuggestionClick(suggestion)}
                                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                            <TrendingUp className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <p className="font-medium text-gray-900">{suggestion.data}</p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Menu Item Suggestions */}
                        {suggestions.items.length > 0 && (
                            <div>
                                <div className="px-4 py-2 bg-gray-50 border-b">
                                    <p className="text-xs font-semibold text-gray-500 uppercase">Menu Items</p>
                                </div>
                                {suggestions.items.map((suggestion, idx) => (
                                    <button
                                        key={`item-${idx}`}
                                        onClick={() => handleSuggestionClick(suggestion)}
                                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                                    >
                                        {suggestion.data.image_url ? (
                                            <img
                                                src={suggestion.data.image_url}
                                                alt={suggestion.data.name}
                                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                                <Utensils className="h-5 w-5 text-gray-400" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{suggestion.data.name}</p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {suggestion.data.restaurantName} • £{suggestion.data.price.toFixed(2)}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}