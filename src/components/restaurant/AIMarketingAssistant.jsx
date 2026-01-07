import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Mail, Bell, Clock, TrendingUp, Users, Target, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AIMarketingAssistant({ restaurantId }) {
    const [loading, setLoading] = useState(false);
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [emailContent, setEmailContent] = useState(null);
    const [pushContent, setPushContent] = useState(null);
    const [timingSuggestions, setTimingSuggestions] = useState(null);

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['orders-analysis', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 100),
    });

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant-details', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
    });

    const generateCampaignIdeas = async () => {
        setLoading(true);
        try {
            const customerSegments = analyzeCustomerSegments();
            const popularItems = getPopularItems();
            const averageOrderValue = orders.reduce((sum, o) => sum + o.total, 0) / orders.length || 0;

            const prompt = `You are a restaurant marketing expert. Generate 5 creative promotional campaign ideas for "${restaurant?.name || 'this restaurant'}".

Restaurant Details:
- Cuisine: ${restaurant?.cuisine_type || 'Various'}
- Popular Items: ${popularItems.slice(0, 5).map(i => i.name).join(', ')}
- Average Order Value: £${averageOrderValue.toFixed(2)}
- Total Customers: ${customerSegments.totalCustomers}
- New Customers: ${customerSegments.newCustomers}
- Repeat Customers: ${customerSegments.repeatCustomers}

For each campaign, provide:
1. Campaign Name (creative and catchy)
2. Target Audience (be specific)
3. Campaign Description (2-3 sentences)
4. Expected Impact (revenue, engagement, retention)
5. Recommended Promotion Type (discount %, BOGO, free item, etc)

Make them actionable, data-driven, and tailored to the restaurant's strengths.`;

            const response = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        campaigns: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    target_audience: { type: "string" },
                                    description: { type: "string" },
                                    expected_impact: { type: "string" },
                                    promotion_type: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            setCampaigns(response.campaigns || []);
            toast.success('Campaign ideas generated!');
        } catch (error) {
            toast.error('Failed to generate campaigns');
        } finally {
            setLoading(false);
        }
    };

    const generatePersonalizedContent = async (campaign, contentType) => {
        setLoading(true);
        try {
            const prompt = `Create ${contentType === 'email' ? 'email marketing' : 'push notification'} content for this campaign:

Campaign: ${campaign.name}
Target: ${campaign.target_audience}
Description: ${campaign.description}
Promotion: ${campaign.promotion_type}

${contentType === 'email' 
    ? 'Create a complete email with: Subject line (compelling, under 60 chars), Preview text (under 100 chars), Email body (warm, persuasive, includes clear CTA), and Footer text.'
    : 'Create push notification with: Title (under 50 chars, attention-grabbing), Body (under 150 chars, urgent but friendly), and Action button text (under 20 chars).'
}

Make it personalized, action-oriented, and conversion-focused.`;

            const response = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: contentType === 'email' ? {
                        subject: { type: "string" },
                        preview: { type: "string" },
                        body: { type: "string" },
                        footer: { type: "string" }
                    } : {
                        title: { type: "string" },
                        body: { type: "string" },
                        action: { type: "string" }
                    }
                }
            });

            if (contentType === 'email') {
                setEmailContent(response);
            } else {
                setPushContent(response);
            }
            toast.success(`${contentType === 'email' ? 'Email' : 'Push notification'} content generated!`);
        } catch (error) {
            toast.error('Failed to generate content');
        } finally {
            setLoading(false);
        }
    };

    const generateTimingSuggestions = async (campaign) => {
        setLoading(true);
        try {
            const orderTimes = orders.map(o => new Date(o.created_date).getHours());
            const peakHours = getMostFrequent(orderTimes);

            const prompt = `As a marketing timing expert, suggest optimal timing for this campaign:

Campaign: ${campaign.name}
Target: ${campaign.target_audience}
Restaurant Peak Hours: ${peakHours.join(', ')}

Provide:
1. Best Days of Week (and why)
2. Optimal Time of Day (specific hour, in 24h format)
3. Campaign Duration (how many days/weeks)
4. Frequency (how often to send)
5. Recommended Channels (Email, Push, SMS, Social Media - rank by priority)

Consider customer behavior, competition, and conversion psychology.`;

            const response = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        best_days: { type: "string" },
                        optimal_time: { type: "string" },
                        duration: { type: "string" },
                        frequency: { type: "string" },
                        channels: { type: "string" }
                    }
                }
            });

            setTimingSuggestions(response);
            toast.success('Timing suggestions generated!');
        } catch (error) {
            toast.error('Failed to generate timing suggestions');
        } finally {
            setLoading(false);
        }
    };

    const analyzeCustomerSegments = () => {
        const uniqueCustomers = new Set(orders.map(o => o.created_by || o.guest_email).filter(Boolean));
        const customerOrderCounts = {};
        orders.forEach(o => {
            const customer = o.created_by || o.guest_email;
            if (customer) {
                customerOrderCounts[customer] = (customerOrderCounts[customer] || 0) + 1;
            }
        });

        return {
            totalCustomers: uniqueCustomers.size,
            newCustomers: Object.values(customerOrderCounts).filter(count => count === 1).length,
            repeatCustomers: Object.values(customerOrderCounts).filter(count => count > 1).length
        };
    };

    const getPopularItems = () => {
        const itemCounts = {};
        orders.forEach(order => {
            order.items?.forEach(item => {
                itemCounts[item.menu_item_id] = (itemCounts[item.menu_item_id] || 0) + item.quantity;
            });
        });

        return menuItems
            .map(item => ({
                ...item,
                orderCount: itemCounts[item.id] || 0
            }))
            .sort((a, b) => b.orderCount - a.orderCount);
    };

    const getMostFrequent = (arr) => {
        const counts = {};
        arr.forEach(val => counts[val] = (counts[val] || 0) + 1);
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([hour]) => `${hour}:00`);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    return (
        <div className="space-y-6">
            <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-purple-500" />
                        AI Marketing Assistant
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                        Generate data-driven campaign ideas, personalized content, and optimal timing strategies
                    </p>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={generateCampaignIdeas}
                        disabled={loading || menuItems.length === 0}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Generate Campaign Ideas
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {campaigns.length > 0 && (
                <div className="grid gap-4">
                    {campaigns.map((campaign, index) => (
                        <Card key={index} className={selectedCampaign === campaign ? 'border-2 border-purple-500' : ''}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <CardTitle className="flex items-center gap-2 text-xl">
                                            <TrendingUp className="h-5 w-5 text-purple-600" />
                                            {campaign.name}
                                        </CardTitle>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge variant="outline" className="bg-blue-50">
                                                <Users className="h-3 w-3 mr-1" />
                                                {campaign.target_audience}
                                            </Badge>
                                            <Badge variant="outline" className="bg-green-50">
                                                <Target className="h-3 w-3 mr-1" />
                                                {campaign.promotion_type}
                                            </Badge>
                                        </div>
                                    </div>
                                    <Button
                                        variant={selectedCampaign === campaign ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSelectedCampaign(campaign === selectedCampaign ? null : campaign)}
                                    >
                                        {selectedCampaign === campaign ? 'Selected' : 'Select'}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-gray-700">{campaign.description}</p>
                                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                                    <p className="text-sm font-semibold text-yellow-900 mb-1">Expected Impact</p>
                                    <p className="text-sm text-yellow-800">{campaign.expected_impact}</p>
                                </div>

                                {selectedCampaign === campaign && (
                                    <Tabs defaultValue="email" className="mt-4">
                                        <TabsList className="grid w-full grid-cols-3">
                                            <TabsTrigger value="email">
                                                <Mail className="h-4 w-4 mr-2" />
                                                Email
                                            </TabsTrigger>
                                            <TabsTrigger value="push">
                                                <Bell className="h-4 w-4 mr-2" />
                                                Push
                                            </TabsTrigger>
                                            <TabsTrigger value="timing">
                                                <Clock className="h-4 w-4 mr-2" />
                                                Timing
                                            </TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="email" className="space-y-4">
                                            {!emailContent ? (
                                                <Button
                                                    onClick={() => generatePersonalizedContent(campaign, 'email')}
                                                    disabled={loading}
                                                    className="w-full"
                                                >
                                                    {loading ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            Generating...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Mail className="h-4 w-4 mr-2" />
                                                            Generate Email Content
                                                        </>
                                                    )}
                                                </Button>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="bg-white p-4 rounded-lg border">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-xs font-semibold text-gray-500">SUBJECT LINE</p>
                                                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(emailContent.subject)}>
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                        <p className="font-semibold text-gray-900">{emailContent.subject}</p>
                                                    </div>
                                                    <div className="bg-white p-4 rounded-lg border">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-xs font-semibold text-gray-500">PREVIEW TEXT</p>
                                                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(emailContent.preview)}>
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                        <p className="text-sm text-gray-700">{emailContent.preview}</p>
                                                    </div>
                                                    <div className="bg-white p-4 rounded-lg border">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-xs font-semibold text-gray-500">EMAIL BODY</p>
                                                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(emailContent.body)}>
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{emailContent.body}</p>
                                                    </div>
                                                    <div className="bg-gray-50 p-3 rounded-lg border">
                                                        <p className="text-xs text-gray-600">{emailContent.footer}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </TabsContent>

                                        <TabsContent value="push" className="space-y-4">
                                            {!pushContent ? (
                                                <Button
                                                    onClick={() => generatePersonalizedContent(campaign, 'push')}
                                                    disabled={loading}
                                                    className="w-full"
                                                >
                                                    {loading ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            Generating...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Bell className="h-4 w-4 mr-2" />
                                                            Generate Push Notification
                                                        </>
                                                    )}
                                                </Button>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <p className="text-xs font-semibold text-gray-500">NOTIFICATION PREVIEW</p>
                                                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${pushContent.title}\n${pushContent.body}`)}>
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="font-bold text-gray-900">{pushContent.title}</p>
                                                            <p className="text-sm text-gray-700">{pushContent.body}</p>
                                                            <Button size="sm" className="mt-2 w-full bg-blue-600 hover:bg-blue-700">
                                                                {pushContent.action}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </TabsContent>

                                        <TabsContent value="timing" className="space-y-4">
                                            {!timingSuggestions ? (
                                                <Button
                                                    onClick={() => generateTimingSuggestions(campaign)}
                                                    disabled={loading}
                                                    className="w-full"
                                                >
                                                    {loading ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            Analyzing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock className="h-4 w-4 mr-2" />
                                                            Get Timing Recommendations
                                                        </>
                                                    )}
                                                </Button>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="bg-white p-4 rounded-lg border">
                                                        <p className="text-xs font-semibold text-gray-500 mb-2">BEST DAYS</p>
                                                        <p className="text-sm text-gray-700">{timingSuggestions.best_days}</p>
                                                    </div>
                                                    <div className="bg-white p-4 rounded-lg border">
                                                        <p className="text-xs font-semibold text-gray-500 mb-2">OPTIMAL TIME</p>
                                                        <p className="text-sm text-gray-700">{timingSuggestions.optimal_time}</p>
                                                    </div>
                                                    <div className="bg-white p-4 rounded-lg border">
                                                        <p className="text-xs font-semibold text-gray-500 mb-2">DURATION</p>
                                                        <p className="text-sm text-gray-700">{timingSuggestions.duration}</p>
                                                    </div>
                                                    <div className="bg-white p-4 rounded-lg border">
                                                        <p className="text-xs font-semibold text-gray-500 mb-2">FREQUENCY</p>
                                                        <p className="text-sm text-gray-700">{timingSuggestions.frequency}</p>
                                                    </div>
                                                    <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
                                                        <p className="text-xs font-semibold text-purple-900 mb-2">RECOMMENDED CHANNELS</p>
                                                        <p className="text-sm text-purple-800">{timingSuggestions.channels}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </TabsContent>
                                    </Tabs>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}