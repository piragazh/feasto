import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, Target, Lightbulb, BarChart3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AIMenuPerformanceAnalytics({ restaurantId }) {
    const [analyzing, setAnalyzing] = useState(false);
    const [insights, setInsights] = useState(null);

    const { data: orders = [] } = useQuery({
        queryKey: ['orders-analytics', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }),
    });

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items-analytics', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const { data: promotions = [] } = useQuery({
        queryKey: ['promotions-analytics', restaurantId],
        queryFn: () => base44.entities.Promotion.filter({ restaurant_id: restaurantId }),
    });

    const analyzePerformance = async () => {
        if (orders.length === 0 || menuItems.length === 0) {
            toast.error('Need order history and menu items to analyze');
            return;
        }

        setAnalyzing(true);
        try {
            // Prepare data for AI analysis
            const itemSales = {};
            orders.forEach(order => {
                if (order.status === 'delivered' || order.status === 'collected') {
                    order.items?.forEach(item => {
                        if (!itemSales[item.name]) {
                            itemSales[item.name] = { quantity: 0, revenue: 0, orders: 0 };
                        }
                        itemSales[item.name].quantity += item.quantity || 1;
                        itemSales[item.name].revenue += (item.price * (item.quantity || 1));
                        itemSales[item.name].orders += 1;
                    });
                }
            });

            const salesSummary = Object.entries(itemSales)
                .map(([name, data]) => `${name}: ${data.quantity} sold, £${data.revenue.toFixed(2)} revenue, ${data.orders} orders`)
                .join('\n');

            const menuSummary = menuItems.map(item => 
                `${item.name} (${item.category}) - £${item.price} ${item.is_popular ? '[Popular]' : ''} ${item.is_available === false ? '[Unavailable]' : ''}`
            ).join('\n');

            const promotionSummary = promotions.filter(p => p.is_active).map(p =>
                `${p.name}: ${p.promotion_type}, used ${p.usage_count || 0} times, £${(p.total_revenue_generated || 0).toFixed(2)} revenue`
            ).join('\n');

            const prompt = `Analyze this restaurant menu performance data and provide actionable insights.

SALES DATA:
${salesSummary}

MENU ITEMS:
${menuSummary}

ACTIVE PROMOTIONS:
${promotionSummary || 'No active promotions'}

TOTAL COMPLETED ORDERS: ${orders.filter(o => o.status === 'delivered' || o.status === 'collected').length}

Provide a comprehensive analysis in JSON format with these sections:
1. best_sellers: Array of top 5 performing items with brief reason for success
2. underperformers: Array of 3-5 worst performing items with suggested actions
3. promotion_impact: Analysis of how promotions are affecting sales (if any)
4. demand_predictions: Predictions for upcoming trends or seasonal opportunities
5. menu_recommendations: Specific suggestions for menu adjustments, pricing, or new items
6. quick_wins: 3 immediate actions the restaurant can take to improve performance

Make recommendations specific, actionable, and data-driven. Keep each point concise (1-2 sentences).`;

            const result = await base44.integrations.Core.InvokeLLM({ 
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        best_sellers: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    reason: { type: "string" }
                                }
                            }
                        },
                        underperformers: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    action: { type: "string" }
                                }
                            }
                        },
                        promotion_impact: { type: "string" },
                        demand_predictions: {
                            type: "array",
                            items: { type: "string" }
                        },
                        menu_recommendations: {
                            type: "array",
                            items: { type: "string" }
                        },
                        quick_wins: {
                            type: "array",
                            items: { type: "string" }
                        }
                    }
                }
            });

            setInsights(result);
            toast.success('Analysis complete!');
        } catch (error) {
            toast.error('Failed to analyze performance');
            console.error(error);
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            AI Menu Performance Analytics
                        </CardTitle>
                        <p className="text-sm text-gray-500 mt-1">
                            AI-powered insights on sales, trends, and menu optimization
                        </p>
                    </div>
                    <Button
                        onClick={analyzePerformance}
                        disabled={analyzing || orders.length === 0}
                        className="gap-2"
                    >
                        {analyzing ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4" />
                                Analyze Performance
                            </>
                        )}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {orders.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>Need order history to generate insights</p>
                    </div>
                )}

                {insights && (
                    <>
                        {/* Best Sellers */}
                        {insights.best_sellers?.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                                    <TrendingUp className="h-5 w-5 text-green-600" />
                                    Top Performers
                                </h3>
                                <div className="space-y-2">
                                    {insights.best_sellers.map((item, idx) => (
                                        <Card key={idx} className="bg-green-50 border-green-200">
                                            <CardContent className="p-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1">
                                                        <p className="font-medium text-green-900">{item.name}</p>
                                                        <p className="text-sm text-green-700">{item.reason}</p>
                                                    </div>
                                                    <Badge className="bg-green-600">#{idx + 1}</Badge>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Underperformers */}
                        {insights.underperformers?.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                                    <TrendingDown className="h-5 w-5 text-orange-600" />
                                    Needs Attention
                                </h3>
                                <div className="space-y-2">
                                    {insights.underperformers.map((item, idx) => (
                                        <Card key={idx} className="bg-orange-50 border-orange-200">
                                            <CardContent className="p-3">
                                                <p className="font-medium text-orange-900 mb-1">{item.name}</p>
                                                <p className="text-sm text-orange-700">💡 {item.action}</p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Promotion Impact */}
                        {insights.promotion_impact && (
                            <div>
                                <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                                    <Target className="h-5 w-5 text-purple-600" />
                                    Promotion Impact
                                </h3>
                                <Card className="bg-purple-50 border-purple-200">
                                    <CardContent className="p-4">
                                        <p className="text-purple-900">{insights.promotion_impact}</p>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Demand Predictions */}
                        {insights.demand_predictions?.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                                    <Sparkles className="h-5 w-5 text-blue-600" />
                                    Demand Predictions
                                </h3>
                                <div className="space-y-2">
                                    {insights.demand_predictions.map((prediction, idx) => (
                                        <Card key={idx} className="bg-blue-50 border-blue-200">
                                            <CardContent className="p-3">
                                                <p className="text-blue-900">{prediction}</p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Menu Recommendations */}
                        {insights.menu_recommendations?.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                                    <Lightbulb className="h-5 w-5 text-yellow-600" />
                                    Menu Recommendations
                                </h3>
                                <div className="space-y-2">
                                    {insights.menu_recommendations.map((rec, idx) => (
                                        <Card key={idx} className="bg-yellow-50 border-yellow-200">
                                            <CardContent className="p-3">
                                                <p className="text-yellow-900">{rec}</p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quick Wins */}
                        {insights.quick_wins?.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                                    <Target className="h-5 w-5 text-indigo-600" />
                                    Quick Wins - Take Action Now
                                </h3>
                                <div className="space-y-2">
                                    {insights.quick_wins.map((win, idx) => (
                                        <Card key={idx} className="bg-indigo-50 border-indigo-200">
                                            <CardContent className="p-3 flex items-start gap-3">
                                                <Badge className="bg-indigo-600 mt-0.5">{idx + 1}</Badge>
                                                <p className="text-indigo-900 flex-1">{win}</p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}