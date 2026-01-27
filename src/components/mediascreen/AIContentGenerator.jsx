import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Wand2, Image, Video, Film, Copy, Share2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function AIContentGenerator({ open, onClose, onContentGenerated, restaurantName, existingContent, initialPrompt = '' }) {
    const [contentType, setContentType] = useState('image');
    const [prompt, setPrompt] = useState(initialPrompt);
    const [style, setStyle] = useState('vibrant');
    const [duration, setDuration] = useState(10);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedUrl, setGeneratedUrl] = useState(null);
    const [activeTab, setActiveTab] = useState('create');
    const [keywords, setKeywords] = useState('');
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizedSuggestions, setOptimizedSuggestions] = useState(null);
    const [socialSnippets, setSocialSnippets] = useState(null);
    const [variations, setVariations] = useState([]);

    React.useEffect(() => {
        if (initialPrompt) {
            setPrompt(initialPrompt);
        }
    }, [initialPrompt]);

    const contentTypes = [
        { value: 'image', label: 'Static Image', icon: Image, description: 'High-quality promotional image' },
        { value: 'animated', label: 'Animated Content', icon: Film, description: 'Eye-catching animated visuals' },
        { value: 'video', label: 'Video Content', icon: Video, description: 'Short promotional video' }
    ];

    const stylePresets = [
        { value: 'vibrant', label: 'Vibrant & Colorful', prompt: 'vibrant, colorful, eye-catching, high contrast' },
        { value: 'elegant', label: 'Elegant & Minimal', prompt: 'elegant, minimal, sophisticated, clean design' },
        { value: 'modern', label: 'Modern & Bold', prompt: 'modern, bold, dynamic, contemporary' },
        { value: 'playful', label: 'Playful & Fun', prompt: 'playful, fun, energetic, youthful' },
        { value: 'professional', label: 'Professional', prompt: 'professional, sleek, corporate, polished' }
    ];

    const promptTemplates = [
        { label: 'New Menu Item', prompt: `Promotional image for new ${restaurantName} menu item, delicious food photography, appetizing presentation` },
        { label: 'Special Offer', prompt: `Special offer banner for ${restaurantName}, attractive discount promotion, bold text overlay` },
        { label: 'Seasonal Campaign', prompt: `Seasonal campaign for ${restaurantName}, themed decorations, festive atmosphere` },
        { label: 'Happy Hour', prompt: `Happy hour promotion for ${restaurantName}, drinks and appetizers, lively atmosphere` },
        { label: 'Brand Showcase', prompt: `Brand showcase for ${restaurantName}, restaurant ambiance, premium quality` }
    ];

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            toast.error('Please enter a description');
            return;
        }

        setIsGenerating(true);
        setGeneratedUrl(null);

        try {
            const stylePrompt = stylePresets.find(s => s.value === style)?.prompt || '';
            const fullPrompt = contentType === 'animated' 
                ? `${prompt}, ${stylePrompt}, animated, dynamic motion, smooth transitions, looping animation`
                : contentType === 'video'
                ? `${prompt}, ${stylePrompt}, cinematic, professional video production, engaging narrative`
                : `${prompt}, ${stylePrompt}, professional photography, high resolution, 4K quality`;

            const { url } = await base44.integrations.Core.GenerateImage({ 
                prompt: fullPrompt 
            });
            
            setGeneratedUrl(url);
            toast.success('Content generated successfully!');
        } catch (error) {
            toast.error('Failed to generate content. Please try again.');
            console.error(error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUseContent = () => {
        if (!generatedUrl) return;

        const mediaType = contentType === 'animated' ? 'gif' : 
                         contentType === 'video' ? 'video' : 'image';

        onContentGenerated({
            media_url: generatedUrl,
            media_type: mediaType,
            duration: duration,
            ai_generated: true,
            ai_prompt: prompt,
            title: prompt.slice(0, 50)
        });

        handleReset();
    };

    const handleReset = () => {
        setPrompt('');
        setGeneratedUrl(null);
        setContentType('image');
        setStyle('vibrant');
        onClose();
    };

    const useTemplate = (template) => {
        setPrompt(template);
    };

    const handleGenerateVariations = async () => {
        if (!existingContent?.ai_prompt && !prompt.trim()) {
            toast.error('Please provide content to generate variations from');
            return;
        }

        setIsGenerating(true);
        setVariations([]);

        try {
            const basePrompt = existingContent?.ai_prompt || prompt;
            const variationPrompts = [
                `${basePrompt}, alternative composition, different angle`,
                `${basePrompt}, different color scheme, fresh perspective`,
                `${basePrompt}, unique style variation, creative twist`
            ];

            const generatedVariations = [];
            for (const varPrompt of variationPrompts) {
                const { url } = await base44.integrations.Core.GenerateImage({ prompt: varPrompt });
                generatedVariations.push({ url, prompt: varPrompt });
            }

            setVariations(generatedVariations);
            toast.success('Variations generated successfully!');
        } catch (error) {
            toast.error('Failed to generate variations');
            console.error(error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleOptimizeContent = async () => {
        if (!keywords.trim()) {
            toast.error('Please enter keywords');
            return;
        }

        setIsOptimizing(true);
        setOptimizedSuggestions(null);

        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Generate 5 optimized titles and descriptions for restaurant promotional content based on these keywords: "${keywords}". 
                Context: This is for ${restaurantName}.
                Make them engaging, concise, and action-oriented.
                Return JSON with format: {
                    "suggestions": [
                        {"title": "...", "description": "..."}
                    ]
                }`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        suggestions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            setOptimizedSuggestions(response.suggestions);
            toast.success('Suggestions generated!');
        } catch (error) {
            toast.error('Failed to optimize content');
            console.error(error);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleGenerateSocialSnippets = async () => {
        const contentText = prompt || existingContent?.title || '';
        if (!contentText.trim()) {
            toast.error('Please provide content description');
            return;
        }

        setIsGenerating(true);
        setSocialSnippets(null);

        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Create social media snippets for this promotional content: "${contentText}"
                Context: ${restaurantName}
                Generate posts for Instagram, Facebook, and Twitter. Keep them engaging and platform-appropriate.
                Return JSON with format: {
                    "instagram": "...",
                    "facebook": "...",
                    "twitter": "..."
                }`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        instagram: { type: "string" },
                        facebook: { type: "string" },
                        twitter: { type: "string" }
                    }
                }
            });

            setSocialSnippets(response);
            toast.success('Social media snippets generated!');
        } catch (error) {
            toast.error('Failed to generate social snippets');
            console.error(error);
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    const useSuggestion = (suggestion) => {
        setPrompt(suggestion.title + '. ' + suggestion.description);
        setActiveTab('create');
    };

    const useVariation = (variation) => {
        setGeneratedUrl(variation.url);
        setPrompt(variation.prompt);
        setActiveTab('create');
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-purple-500" />
                        AI Content Generator
                    </DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="create">Create</TabsTrigger>
                        <TabsTrigger value="variations">Variations</TabsTrigger>
                        <TabsTrigger value="optimize">Optimize</TabsTrigger>
                        <TabsTrigger value="social">Social</TabsTrigger>
                    </TabsList>

                    <TabsContent value="create" className="space-y-6 mt-6">
                    {/* Content Type Selection */}
                    <div>
                        <Label className="text-base font-semibold mb-3 block">Content Type</Label>
                        <div className="grid grid-cols-3 gap-3">
                            {contentTypes.map((type) => {
                                const Icon = type.icon;
                                return (
                                    <Card
                                        key={type.value}
                                        className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                                            contentType === type.value 
                                                ? 'border-purple-500 bg-purple-50' 
                                                : 'border-gray-200'
                                        }`}
                                        onClick={() => setContentType(type.value)}
                                    >
                                        <div className="text-center">
                                            <Icon className={`h-8 w-8 mx-auto mb-2 ${
                                                contentType === type.value ? 'text-purple-500' : 'text-gray-400'
                                            }`} />
                                            <p className="font-semibold text-sm">{type.label}</p>
                                            <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>

                    {/* Quick Templates */}
                    <div>
                        <Label className="text-base font-semibold mb-3 block">Quick Start Templates</Label>
                        <div className="flex flex-wrap gap-2">
                            {promptTemplates.map((template) => (
                                <Button
                                    key={template.label}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => useTemplate(template.prompt)}
                                    className="text-xs"
                                >
                                    {template.label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Prompt Input */}
                    <div>
                        <Label>Describe Your Content</Label>
                        <Textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="E.g., A mouthwatering burger with melted cheese, fresh lettuce, and crispy bacon, with flames in the background..."
                            rows={4}
                            className="mt-2"
                        />
                    </div>

                    {/* Style Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Visual Style</Label>
                            <Select value={style} onValueChange={setStyle}>
                                <SelectTrigger className="mt-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {stylePresets.map((preset) => (
                                        <SelectItem key={preset.value} value={preset.value}>
                                            {preset.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {contentType !== 'video' && (
                            <div>
                                <Label>Display Duration (seconds)</Label>
                                <Input
                                    type="number"
                                    value={duration}
                                    onChange={(e) => setDuration(parseInt(e.target.value) || 10)}
                                    min="3"
                                    max="60"
                                    className="mt-2"
                                />
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    {generatedUrl && (
                        <div>
                            <Label className="text-base font-semibold mb-3 block">Preview</Label>
                            <div className="bg-gray-100 rounded-lg p-4 flex items-center justify-center min-h-[300px]">
                                <img 
                                    src={generatedUrl} 
                                    alt="Generated content"
                                    className="max-h-[400px] max-w-full object-contain rounded-lg shadow-lg"
                                />
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        {!generatedUrl ? (
                            <>
                                <Button 
                                    onClick={handleGenerate} 
                                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                                    disabled={isGenerating || !prompt.trim()}
                                >
                                    {isGenerating ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4 mr-2" />
                                            Generate Content
                                        </>
                                    )}
                                </Button>
                                <Button onClick={handleReset} variant="outline">
                                    Cancel
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button 
                                    onClick={handleUseContent} 
                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                >
                                    Use This Content
                                </Button>
                                <Button 
                                    onClick={() => setGeneratedUrl(null)} 
                                    variant="outline"
                                >
                                    Generate Again
                                </Button>
                                <Button onClick={handleReset} variant="outline">
                                    Cancel
                                </Button>
                            </>
                        )}
                    </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-800">
                                <strong>💡 Tips:</strong> Be specific and descriptive. Include details about colors, mood, 
                                composition, and any text or branding elements you want to feature.
                            </p>
                        </div>
                    </TabsContent>

                    <TabsContent value="variations" className="space-y-6 mt-6">
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                            <p className="text-sm text-purple-800">
                                <strong>🔄 Generate Variations:</strong> Create alternative versions of your content with different styles and compositions.
                            </p>
                        </div>

                        <div>
                            <Label>Base Content Description</Label>
                            <Textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Enter description or edit existing content prompt..."
                                rows={3}
                                className="mt-2"
                            />
                            {existingContent?.ai_prompt && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Using prompt from existing content
                                </p>
                            )}
                        </div>

                        <Button 
                            onClick={handleGenerateVariations}
                            className="w-full bg-purple-600 hover:bg-purple-700"
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating Variations...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Generate 3 Variations
                                </>
                            )}
                        </Button>

                        {variations.length > 0 && (
                            <div className="grid grid-cols-3 gap-4">
                                {variations.map((variation, index) => (
                                    <Card key={index} className="p-2 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => useVariation(variation)}>
                                        <img 
                                            src={variation.url} 
                                            alt={`Variation ${index + 1}`}
                                            className="w-full h-32 object-cover rounded"
                                        />
                                        <Button size="sm" className="w-full mt-2" variant="outline">
                                            Use This
                                        </Button>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="optimize" className="space-y-6 mt-6">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <p className="text-sm text-green-800">
                                <strong>✨ Content Optimization:</strong> Get AI-powered title and description suggestions based on your keywords.
                            </p>
                        </div>

                        <div>
                            <Label>Keywords</Label>
                            <Input
                                value={keywords}
                                onChange={(e) => setKeywords(e.target.value)}
                                placeholder="e.g., burger, special offer, weekend deal"
                                className="mt-2"
                            />
                        </div>

                        <Button 
                            onClick={handleOptimizeContent}
                            className="w-full bg-green-600 hover:bg-green-700"
                            disabled={isOptimizing}
                        >
                            {isOptimizing ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Optimizing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Generate Optimized Suggestions
                                </>
                            )}
                        </Button>

                        {optimizedSuggestions && (
                            <div className="space-y-3">
                                {optimizedSuggestions.map((suggestion, index) => (
                                    <Card key={index} className="p-4 hover:shadow-md transition-shadow">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-sm mb-1">{suggestion.title}</h4>
                                                <p className="text-xs text-gray-600">{suggestion.description}</p>
                                            </div>
                                            <Button size="sm" variant="outline" onClick={() => useSuggestion(suggestion)}>
                                                Use
                                            </Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="social" className="space-y-6 mt-6">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-800">
                                <strong>📱 Social Media:</strong> Generate platform-optimized snippets for Instagram, Facebook, and Twitter.
                            </p>
                        </div>

                        <div>
                            <Label>Content Description</Label>
                            <Textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe your promotional content..."
                                rows={3}
                                className="mt-2"
                            />
                        </div>

                        <Button 
                            onClick={handleGenerateSocialSnippets}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Share2 className="h-4 w-4 mr-2" />
                                    Generate Social Snippets
                                </>
                            )}
                        </Button>

                        {socialSnippets && (
                            <div className="space-y-4">
                                {Object.entries(socialSnippets).map(([platform, text]) => (
                                    <Card key={platform} className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-sm mb-2 capitalize">{platform}</h4>
                                                <p className="text-sm text-gray-700">{text}</p>
                                            </div>
                                            <Button 
                                                size="sm" 
                                                variant="outline"
                                                onClick={() => copyToClipboard(text)}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}