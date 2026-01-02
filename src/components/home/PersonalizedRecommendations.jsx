import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import RestaurantCard from './RestaurantCard';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function PersonalizedRecommendations({ restaurants }) {
    const [recommendations, setRecommendations] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const { data: user } = useQuery({
        queryKey: ['current-user'],
        queryFn: () => base44.auth.me(),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['user-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 20),
        enabled: !!user,
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['user-reviews-for-ai'],
        queryFn: async () => {
            const userEmail = (await base44.auth.me()).email;
            return base44.entities.Review.filter({ created_by: userEmail });
        },
        enabled: !!user,
    });

    useEffect(() => {
        if (user && restaurants && restaurants.length > 0 && !recommendations) {
            generateRecommendations();
        }
    }, [user, restaurants]);

    const generateRecommendations = async () => {
        setIsGenerating(true);
        try {
            // Prepare order history
            const orderHistory = (orders || []).map(o => ({
                restaurant: o.restaurant_name,
                items: o.items?.map(i => i.name).join(', '),
                total: o.total
            }));

            // Prepare review data
            const reviewData = (reviews || []).map(r => ({
                rating: r.rating,
                text: r.review_text
            }));

            const prompt = `You are a food recommendation expert. Based on the following user data, recommend 3 restaurants from the available list that would best match their preferences.

User Order History:
${orderHistory.length > 0 ? JSON.stringify(orderHistory, null, 2) : 'No previous orders'}

User Reviews:
${reviewData.length > 0 ? JSON.stringify(reviewData, null, 2) : 'No reviews yet'}

Available Restaurants:
${(restaurants || []).map(r => `- ${r.name} (${r.cuisine_type}) - Rating: ${r.rating || 'N/A'}`).join('\n')}

Provide recommendations as a JSON array with restaurant names and brief personalized reasons. Consider:
- Cuisine preferences from order history
- Highly rated restaurants
- Variety in recommendations
- User's rating patterns

Return ONLY restaurant names that exist in the available list.`;

            const result = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        recommendations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    restaurant_name: { type: "string" },
                                    reason: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            const recommended = (result.recommendations || []).map(rec => {
                const restaurant = (restaurants || []).find(r => 
                    r.name.toLowerCase() === rec.restaurant_name.toLowerCase()
                );
                return restaurant ? { ...restaurant, reason: rec.reason } : null;
            }).filter(Boolean).slice(0, 3);

            setRecommendations(recommended);
        } catch (error) {
            console.error('Error generating recommendations:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!user || !restaurants || restaurants.length === 0) return null;

    return (
        <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Recommended for You</h2>
                        <p className="text-sm text-gray-500">AI-powered suggestions based on your taste</p>
                    </div>
                </div>
                {recommendations && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={generateRecommendations}
                        disabled={isGenerating}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                )}
            </div>

            {isGenerating || !recommendations ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white rounded-2xl overflow-hidden">
                            <Skeleton className="h-48 w-full" />
                            <div className="p-4 space-y-3">
                                <Skeleton className="h-6 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : !recommendations || recommendations.length === 0 ? (
                <Card>
                    <CardContent className="text-center py-8">
                        <p className="text-gray-500">
                            Order from more restaurants to get personalized recommendations!
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendations.map((restaurant) => (
                        <div key={restaurant.id} className="relative">
                            <div className="absolute -top-2 -right-2 z-10">
                                <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg">
                                    AI Pick
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
            )}
        </div>
    );
}