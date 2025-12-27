import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function AIMealDealSuggestions({ restaurantId }) {
    const [suggestions, setSuggestions] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const queryClient = useQueryClient();

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['restaurant-orders-analysis', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 100),
    });

    const createDealMutation = useMutation({
        mutationFn: (data) => base44.entities.MealDeal.create({ ...data, restaurant_id: restaurantId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['meal-deals']);
            toast.success('Meal deal created from AI suggestion');
        },
    });

    const generateSuggestions = async () => {
        if (menuItems.length < 3) {
            toast.error('Add at least 3 menu items to get AI suggestions');
            return;
        }

        setIsGenerating(true);
        try {
            // Analyze popular items from orders
            const itemPopularity = {};
            orders.forEach(order => {
                order.items?.forEach(item => {
                    itemPopularity[item.name] = (itemPopularity[item.name] || 0) + item.quantity;
                });
            });

            const prompt = `You are a restaurant business consultant specializing in creating profitable meal deals. Based on the following data, suggest 3 compelling meal deal combinations.

Restaurant Menu Items:
${menuItems.map(item => `- ${item.name} ($${item.price}) - ${item.category || 'Main'} ${item.is_popular ? '(Popular)' : ''}`).join('\n')}

Item Popularity from Recent Orders:
${Object.entries(itemPopularity).length > 0 
    ? Object.entries(itemPopularity).map(([name, count]) => `${name}: ordered ${count} times`).join('\n')
    : 'Limited order history'}

Create meal deals that:
1. Combine complementary items (e.g., main + side + drink)
2. Offer 15-25% discount from individual prices
3. Include at least one popular item
4. Appeal to different customer segments
5. Have catchy names

For each deal, calculate the original price (sum of individual items) and suggest a deal price.`;

            const result = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        deals: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    description: { type: "string" },
                                    items: {
                                        type: "array",
                                        items: { type: "string" }
                                    },
                                    original_price: { type: "number" },
                                    deal_price: { type: "number" },
                                    reasoning: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            setSuggestions(result.deals || []);
            if (result.deals?.length === 0) {
                toast.info('No suggestions available at this time');
            }
        } catch (error) {
            console.error('Error generating suggestions:', error);
            toast.error('Failed to generate suggestions');
        } finally {
            setIsGenerating(false);
        }
    };

    const createDealFromSuggestion = (suggestion) => {
        createDealMutation.mutate({
            name: suggestion.name,
            description: suggestion.description,
            original_price: suggestion.original_price,
            deal_price: suggestion.deal_price,
            items: suggestion.items.map(itemName => ({
                name: itemName,
                quantity: 1
            })),
            is_active: true
        });
    };

    return (
        <Card className="mb-6 border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-600" />
                        <CardTitle>AI Meal Deal Suggestions</CardTitle>
                    </div>
                    <Button
                        onClick={generateSuggestions}
                        disabled={isGenerating}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Generate Ideas
                            </>
                        )}
                    </Button>
                </div>
            </CardHeader>
            {suggestions.length > 0 && (
                <CardContent className="space-y-4">
                    {suggestions.map((suggestion, idx) => (
                        <div key={idx} className="bg-white rounded-lg p-4 border border-purple-200">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                    <h4 className="font-semibold text-lg text-gray-900">{suggestion.name}</h4>
                                    <p className="text-sm text-gray-600 mb-2">{suggestion.description}</p>
                                    <div className="text-xs text-gray-500 mb-2">
                                        <strong>Items:</strong> {suggestion.items.join(', ')}
                                    </div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-sm text-gray-400 line-through">
                                            ${suggestion.original_price.toFixed(2)}
                                        </span>
                                        <span className="text-lg font-bold text-purple-600">
                                            ${suggestion.deal_price.toFixed(2)}
                                        </span>
                                        <span className="text-xs text-green-600 font-semibold">
                                            Save {Math.round(((suggestion.original_price - suggestion.deal_price) / suggestion.original_price) * 100)}%
                                        </span>
                                    </div>
                                    <p className="text-xs text-purple-700 italic">
                                        💡 {suggestion.reasoning}
                                    </p>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => createDealFromSuggestion(suggestion)}
                                disabled={createDealMutation.isPending}
                                className="w-full bg-purple-600 hover:bg-purple-700"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Create This Deal
                            </Button>
                        </div>
                    ))}
                </CardContent>
            )}
        </Card>
    );
}