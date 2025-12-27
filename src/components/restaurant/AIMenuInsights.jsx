import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, TrendingUp, DollarSign, Users, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function AIMenuInsights({ restaurantId }) {
    const [insights, setInsights] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const queryClient = useQueryClient();

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['orders-for-insights', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: 'delivered'
        }, '-created_date', 500),
    });

    const updatePriceMutation = useMutation({
        mutationFn: ({ itemId, newPrice }) => 
            base44.entities.MenuItem.update(itemId, { price: newPrice }),
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success('Price updated successfully');
        },
    });

    const generateInsights = async () => {
        if (menuItems.length === 0) {
            toast.error('No menu items to analyze');
            return;
        }

        setIsGenerating(true);
        try {
            // Prepare sales data
            const itemSales = {};
            let totalRevenue = 0;

            orders.forEach(order => {
                order.items?.forEach(item => {
                    if (!itemSales[item.name]) {
                        itemSales[item.name] = {
                            name: item.name,
                            quantity: 0,
                            revenue: 0,
                            price: item.price
                        };
                    }
                    itemSales[item.name].quantity += item.quantity;
                    itemSales[item.name].revenue += item.price * item.quantity;
                    totalRevenue += item.price * item.quantity;
                });
            });

            const salesData = Object.values(itemSales);

            // Generate AI insights
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Analyze this restaurant menu and sales data to provide actionable insights:

Menu Items: ${JSON.stringify(menuItems.map(item => ({
    name: item.name,
    price: item.price,
    category: item.category,
    is_popular: item.is_popular
})))}

Sales Data (last ${orders.length} orders):
${JSON.stringify(salesData)}

Total Revenue: $${totalRevenue.toFixed(2)}

Provide:
1. Top 3 best-performing items with reasons
2. Top 3 underperforming items that need attention
3. Price adjustment recommendations (be specific with item names and suggested prices)
4. Menu item combinations for potential meal deals (3-4 combos with estimated value)

Be specific, data-driven, and actionable.`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        best_performers: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    reason: { type: "string" },
                                    revenue: { type: "number" },
                                    quantity_sold: { type: "number" }
                                }
                            }
                        },
                        underperformers: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    issue: { type: "string" },
                                    recommendation: { type: "string" }
                                }
                            }
                        },
                        pricing_recommendations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    item_name: { type: "string" },
                                    current_price: { type: "number" },
                                    suggested_price: { type: "number" },
                                    reasoning: { type: "string" }
                                }
                            }
                        },
                        meal_deal_combos: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    items: { 
                                        type: "array",
                                        items: { type: "string" }
                                    },
                                    individual_price: { type: "number" },
                                    suggested_deal_price: { type: "number" },
                                    reasoning: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            setInsights(response);
            toast.success('AI insights generated!');
        } catch (error) {
            console.error('Insights generation error:', error);
            toast.error('Failed to generate insights');
        } finally {
            setIsGenerating(false);
        }
    };

    const applyPriceChange = (itemName, newPrice) => {
        const item = menuItems.find(m => m.name === itemName);
        if (item) {
            updatePriceMutation.mutate({ itemId: item.id, newPrice });
        }
    };

    const createMealDeal = async (combo) => {
        const items = combo.items.map(itemName => {
            const menuItem = menuItems.find(m => m.name === itemName);
            return menuItem ? {
                menu_item_id: menuItem.id,
                name: menuItem.name,
                quantity: 1
            } : null;
        }).filter(Boolean);

        if (items.length > 0) {
            await base44.entities.MealDeal.create({
                restaurant_id: restaurantId,
                name: combo.name,
                description: combo.reasoning,
                original_price: combo.individual_price,
                deal_price: combo.suggested_deal_price,
                items: items,
                is_active: true
            });
            queryClient.invalidateQueries(['meal-deals']);
            toast.success('Meal deal created!');
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    AI Menu Insights
                </CardTitle>
            </CardHeader>
            <CardContent>
                {!insights ? (
                    <div className="text-center py-8">
                        <Sparkles className="h-16 w-16 text-purple-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Get AI-Powered Menu Recommendations</h3>
                        <p className="text-gray-600 mb-6 max-w-md mx-auto">
                            Analyze your sales data to discover best sellers, optimize pricing, and identify profitable meal deal opportunities.
                        </p>
                        <Button 
                            onClick={generateInsights}
                            disabled={isGenerating}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Generate Insights
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <Tabs defaultValue="performers">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="performers">Performance</TabsTrigger>
                            <TabsTrigger value="pricing">Pricing</TabsTrigger>
                            <TabsTrigger value="combos">Meal Deals</TabsTrigger>
                            <TabsTrigger value="refresh">
                                <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={generateInsights}
                                    disabled={isGenerating}
                                >
                                    {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
                                </Button>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="performers" className="space-y-6">
                            {/* Best Performers */}
                            <div>
                                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-green-500" />
                                    Top Performers
                                </h3>
                                <div className="space-y-3">
                                    {insights.best_performers?.map((item, idx) => (
                                        <Card key={idx} className="bg-green-50 border-green-200">
                                            <CardContent className="pt-4">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Badge className="bg-green-600">{idx + 1}</Badge>
                                                            <h4 className="font-semibold">{item.name}</h4>
                                                        </div>
                                                        <p className="text-sm text-gray-700 mb-2">{item.reason}</p>
                                                        <div className="flex gap-4 text-sm">
                                                            <span className="text-gray-600">
                                                                <strong>{item.quantity_sold}</strong> sold
                                                            </span>
                                                            <span className="text-green-700">
                                                                <strong>${item.revenue?.toFixed(2)}</strong> revenue
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>

                            {/* Underperformers */}
                            <div>
                                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                    <Users className="h-5 w-5 text-orange-500" />
                                    Needs Attention
                                </h3>
                                <div className="space-y-3">
                                    {insights.underperformers?.map((item, idx) => (
                                        <Card key={idx} className="bg-orange-50 border-orange-200">
                                            <CardContent className="pt-4">
                                                <h4 className="font-semibold mb-1">{item.name}</h4>
                                                <p className="text-sm text-gray-700 mb-2">
                                                    <strong>Issue:</strong> {item.issue}
                                                </p>
                                                <p className="text-sm text-orange-800">
                                                    <strong>Recommendation:</strong> {item.recommendation}
                                                </p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="pricing" className="space-y-3">
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold flex items-center gap-2">
                                    <DollarSign className="h-5 w-5 text-blue-500" />
                                    Pricing Recommendations
                                </h3>
                                <p className="text-sm text-gray-600">AI-suggested price adjustments to optimize revenue</p>
                            </div>
                            {insights.pricing_recommendations?.map((rec, idx) => (
                                <Card key={idx}>
                                    <CardContent className="pt-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h4 className="font-semibold mb-2">{rec.item_name}</h4>
                                                <div className="flex items-center gap-4 mb-2">
                                                    <div>
                                                        <span className="text-xs text-gray-500">Current</span>
                                                        <p className="text-lg font-semibold text-gray-700">
                                                            ${rec.current_price?.toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <span className="text-2xl text-gray-300">→</span>
                                                    <div>
                                                        <span className="text-xs text-gray-500">Suggested</span>
                                                        <p className="text-lg font-semibold text-blue-600">
                                                            ${rec.suggested_price?.toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <Badge variant={rec.suggested_price > rec.current_price ? 'default' : 'secondary'}>
                                                        {((rec.suggested_price - rec.current_price) / rec.current_price * 100).toFixed(0)}%
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-gray-600 mb-3">{rec.reasoning}</p>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => applyPriceChange(rec.item_name, rec.suggested_price)}
                                                className="ml-4"
                                            >
                                                <CheckCircle className="h-4 w-4 mr-1" />
                                                Apply
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </TabsContent>

                        <TabsContent value="combos" className="space-y-3">
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-purple-500" />
                                    Suggested Meal Deal Combinations
                                </h3>
                                <p className="text-sm text-gray-600">Popular item combinations based on order patterns</p>
                            </div>
                            {insights.meal_deal_combos?.map((combo, idx) => (
                                <Card key={idx} className="bg-purple-50 border-purple-200">
                                    <CardContent className="pt-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h4 className="font-semibold mb-2">{combo.name}</h4>
                                                <div className="space-y-1 mb-3">
                                                    {combo.items?.map((item, i) => (
                                                        <div key={i} className="text-sm text-gray-700">
                                                            • {item}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-4 mb-2">
                                                    <div>
                                                        <span className="text-xs text-gray-500">Individual Price</span>
                                                        <p className="text-lg font-semibold line-through text-gray-500">
                                                            ${combo.individual_price?.toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-xs text-gray-500">Deal Price</span>
                                                        <p className="text-lg font-semibold text-purple-600">
                                                            ${combo.suggested_deal_price?.toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <Badge className="bg-purple-600">
                                                        Save ${(combo.individual_price - combo.suggested_deal_price)?.toFixed(2)}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-gray-600">{combo.reasoning}</p>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => createMealDeal(combo)}
                                                className="ml-4 bg-purple-600 hover:bg-purple-700"
                                            >
                                                <CheckCircle className="h-4 w-4 mr-1" />
                                                Create Deal
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}