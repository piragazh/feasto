import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Lightbulb, Loader2, TrendingUp, Calendar, Target } from 'lucide-react';
import { toast } from 'sonner';

export default function AIContentAssistant({ restaurant, onUseIdea }) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [contentIdeas, setContentIdeas] = useState(null);
    const [userInput, setUserInput] = useState('');

    const handleGenerateIdeas = async (type = 'general') => {
        setIsGenerating(true);
        setContentIdeas(null);

        try {
            const restaurantContext = `
                Restaurant: ${restaurant?.name || 'Restaurant'}
                Cuisine: ${restaurant?.cuisine_type || 'Various'}
                About: ${restaurant?.about_us || 'Great food'}
            `;

            let prompt = '';
            if (type === 'seasonal') {
                const currentMonth = new Date().toLocaleString('default', { month: 'long' });
                prompt = `Generate 5 seasonal promotional content ideas for ${currentMonth} for this restaurant:
                ${restaurantContext}
                
                Focus on seasonal events, holidays, weather-appropriate offerings, and timely promotions.`;
            } else if (type === 'trending') {
                prompt = `Generate 5 trending promotional content ideas based on current food industry trends for this restaurant:
                ${restaurantContext}
                
                Focus on popular social media trends, viral food concepts, and current customer preferences.`;
            } else if (type === 'custom') {
                if (!userInput.trim()) {
                    toast.error('Please describe what you want to promote');
                    setIsGenerating(false);
                    return;
                }
                prompt = `Generate 5 creative promotional content ideas for "${userInput}" for this restaurant:
                ${restaurantContext}
                
                Make them engaging and tailored to the restaurant's brand.`;
            } else {
                prompt = `Generate 5 diverse promotional content ideas for this restaurant:
                ${restaurantContext}
                
                Include ideas for: new menu items, special offers, customer engagement, brand storytelling, and seasonal campaigns.`;
            }

            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `${prompt}
                
                For each idea, provide:
                1. A catchy title
                2. A brief description (1-2 sentences)
                3. Suggested visual elements to include
                4. Target audience
                5. Best time to post
                
                Return JSON with format:
                {
                    "ideas": [
                        {
                            "title": "...",
                            "description": "...",
                            "visualSuggestions": "...",
                            "targetAudience": "...",
                            "bestTime": "...",
                            "category": "menu|offer|engagement|brand|seasonal"
                        }
                    ]
                }`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        ideas: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    visualSuggestions: { type: "string" },
                                    targetAudience: { type: "string" },
                                    bestTime: { type: "string" },
                                    category: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            setContentIdeas(response.ideas);
            toast.success('Content ideas generated!');
        } catch (error) {
            toast.error('Failed to generate ideas');
            console.error(error);
        } finally {
            setIsGenerating(false);
        }
    };

    const categoryColors = {
        menu: 'bg-orange-100 text-orange-800 border-orange-200',
        offer: 'bg-green-100 text-green-800 border-green-200',
        engagement: 'bg-blue-100 text-blue-800 border-blue-200',
        brand: 'bg-purple-100 text-purple-800 border-purple-200',
        seasonal: 'bg-pink-100 text-pink-800 border-pink-200'
    };

    const categoryIcons = {
        menu: '🍽️',
        offer: '💰',
        engagement: '❤️',
        brand: '✨',
        seasonal: '🎉'
    };

    return (
        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-600" />
                    AI Content Assistant
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                    Get personalized content ideas and suggestions based on your restaurant
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Button
                        onClick={() => handleGenerateIdeas('general')}
                        variant="outline"
                        className="bg-white"
                        disabled={isGenerating}
                    >
                        <Lightbulb className="h-4 w-4 mr-2" />
                        General Ideas
                    </Button>
                    <Button
                        onClick={() => handleGenerateIdeas('seasonal')}
                        variant="outline"
                        className="bg-white"
                        disabled={isGenerating}
                    >
                        <Calendar className="h-4 w-4 mr-2" />
                        Seasonal
                    </Button>
                    <Button
                        onClick={() => handleGenerateIdeas('trending')}
                        variant="outline"
                        className="bg-white"
                        disabled={isGenerating}
                    >
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Trending
                    </Button>
                    <Button
                        onClick={() => handleGenerateIdeas('custom')}
                        variant="outline"
                        className="bg-white"
                        disabled={isGenerating}
                    >
                        <Target className="h-4 w-4 mr-2" />
                        Custom
                    </Button>
                </div>

                <div>
                    <Label className="text-sm">Custom Prompt (Optional)</Label>
                    <Input
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="e.g., new burger menu, happy hour promotion..."
                        className="mt-2 bg-white"
                    />
                </div>

                {isGenerating && (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-3" />
                            <p className="text-sm text-gray-600">Generating creative ideas...</p>
                        </div>
                    </div>
                )}

                {contentIdeas && !isGenerating && (
                    <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm">Content Ideas</h3>
                            <Badge className="bg-purple-100 text-purple-800">
                                {contentIdeas.length} ideas
                            </Badge>
                        </div>
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                            {contentIdeas.map((idea, index) => (
                                <Card key={index} className="bg-white border-gray-200 hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                        <div className="space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-lg">{categoryIcons[idea.category] || '💡'}</span>
                                                        <h4 className="font-semibold text-sm">{idea.title}</h4>
                                                        <Badge variant="outline" className={categoryColors[idea.category] || 'bg-gray-100'}>
                                                            {idea.category}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-gray-700 mb-3">{idea.description}</p>
                                                    
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div>
                                                            <span className="text-gray-500 font-medium">Visual:</span>
                                                            <p className="text-gray-700 mt-1">{idea.visualSuggestions}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 font-medium">Audience:</span>
                                                            <p className="text-gray-700 mt-1">{idea.targetAudience}</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 text-xs">
                                                        <span className="text-gray-500 font-medium">Best Time:</span>
                                                        <span className="text-gray-700 ml-1">{idea.bestTime}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <Button
                                                size="sm"
                                                onClick={() => onUseIdea(idea)}
                                                className="w-full bg-purple-600 hover:bg-purple-700"
                                            >
                                                <Sparkles className="h-3.5 w-3.5 mr-2" />
                                                Create Content from This
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {!contentIdeas && !isGenerating && (
                    <div className="text-center py-8 text-gray-500">
                        <Lightbulb className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">
                            Click a button above to generate content ideas
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}