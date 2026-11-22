import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RestaurantCard from './RestaurantCard';
import { Sparkles } from 'lucide-react';

/**
 * Picks up to 3 restaurants from the customer's own history, worked out in the
 * browser. This used to ask the AI (InvokeLLM) on every Home page visit, which
 * spent integration credits for every signed-in customer; these rules cost nothing
 * and show instantly.
 *
 *   - places they order from again and again come first
 *   - then well-rated places in the cuisines they order most
 *   - places they reviewed 1-2 stars are never suggested
 *   - if all three would be places they already use, the last slot goes to an
 *     untried place in their favourite cuisine (when there is one)
 */
function pickRecommendations(restaurants, orders, reviews) {
    const list = restaurants || [];
    const byId = new Map(list.map(r => [r.id, r]));
    const timesOrdered = {};
    const cuisineCount = {};
    for (const o of orders || []) {
        if (!o?.restaurant_id) continue;
        timesOrdered[o.restaurant_id] = (timesOrdered[o.restaurant_id] || 0) + 1;
        const cuisine = byId.get(o.restaurant_id)?.cuisine_type;
        if (cuisine) cuisineCount[cuisine] = (cuisineCount[cuisine] || 0) + 1;
    }
    const disliked = new Set((reviews || []).filter(r => Number(r.rating) <= 2).map(r => r.restaurant_id));
    const topCuisine = Object.entries(cuisineCount).sort((a, b) => b[1] - a[1])[0]?.[0];

    const scored = list
        .filter(r => r?.id && !disliked.has(r.id))
        .map(r => {
            const count = timesOrdered[r.id] || 0;
            const rating = Number(r.rating) || 0;
            const cuisineHits = cuisineCount[r.cuisine_type] || 0;
            let reason = null;
            if (count >= 2) reason = `You've ordered here ${count} times`;
            else if (count === 1) reason = 'You ordered here before';
            else if (cuisineHits && r.cuisine_type) reason = `You often order ${r.cuisine_type}${rating ? ` — rated ${rating.toFixed(1)}★` : ''}`;
            else if (rating >= 4) reason = `Highly rated (${rating.toFixed(1)}★)`;
            return {
                restaurant: { ...r, reason },
                score: count * 3 + cuisineHits * 2 + rating,
                tried: count > 0,
                freshFavourite: !count && !!topCuisine && r.cuisine_type === topCuisine,
            };
        })
        .sort((a, b) => b.score - a.score);

    const picks = scored.slice(0, 3);
    if (picks.length === 3 && picks.every(p => p.tried)) {
        const fresh = scored.find(s => s.freshFavourite);
        if (fresh) picks[2] = fresh;
    }
    return picks.map(p => p.restaurant);
}

export default function PersonalizedRecommendations({ restaurants }) {
    const { data: user = null } = useQuery({
        queryKey: ['current-user'],
        queryFn: async () => {
            const authenticated = await base44.auth.isAuthenticated();
            if (!authenticated) return null;
            return base44.auth.me();
        },
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['user-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 20),
        enabled: !!user,
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['user-reviews-for-ai', user?.email],
        queryFn: async () => {
            if (!user?.email) return [];
            return base44.entities.Review.filter({ created_by: user.email });
        },
        enabled: !!user?.email,
    });

    const recommendations = useMemo(
        () => (user ? pickRecommendations(restaurants, orders, reviews) : []),
        [user, restaurants, orders, reviews]
    );

    if (!user || !restaurants || restaurants.length === 0 || recommendations.length === 0) return null;

    return (
        <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Recommended for You</h2>
                    <p className="text-sm text-gray-500">Picked from your orders and favourite cuisines</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recommendations.map((restaurant) => (
                    <div key={restaurant.id} className="relative">
                        <div className="absolute -top-2 -right-2 z-10">
                            <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg">
                                For you
                            </div>
                        </div>
                        <RestaurantCard restaurant={restaurant} />
                        {restaurant.reason && (
                            <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                <p className="text-xs text-purple-800">
                                    <span className="font-semibold">Why: </span>
                                    {restaurant.reason}
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
