import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Palette, Type, Upload, Wand2, Loader2, Eye, Download, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function BrandingManager({ restaurantId }) {
    const [analyzingBrand, setAnalyzingBrand] = useState(false);
    const [generatingLogo, setGeneratingLogo] = useState(false);
    const [brandSuggestions, setBrandSuggestions] = useState(null);
    const [logoPrompt, setLogoPrompt] = useState('');
    const [uploadingGuidelines, setUploadingGuidelines] = useState(false);
    const queryClient = useQueryClient();

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant-branding', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
    });

    const updateRestaurantMutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-branding']);
            toast.success('Branding updated');
        },
    });

    const analyzeBranding = async () => {
        setAnalyzingBrand(true);
        try {
            const prompt = `Analyze this restaurant's branding and provide professional design recommendations.

Restaurant Name: ${restaurant.name}
Cuisine Type: ${restaurant.cuisine_type || 'Not specified'}
Description: ${restaurant.description || 'Not specified'}
Current Theme Color: ${restaurant.theme_primary_color || 'Not set'}
${restaurant.logo_url ? 'Has Logo: Yes' : 'Has Logo: No'}

Provide comprehensive branding recommendations in JSON format:
1. color_palette: Suggest 5 colors (primary, secondary, accent, background, text) with hex codes and reasoning
2. typography: Recommend font pairings (heading font, body font, accent font) with specific Google Fonts
3. logo_suggestions: 3 creative logo concepts with descriptions
4. brand_voice: Tone and messaging guidelines
5. visual_style: Design direction and aesthetic recommendations
6. improvements: Specific actions to enhance current branding

Keep each recommendation concise (1-2 sentences) and actionable.`;

            const result = await base44.integrations.Core.InvokeLLM({ 
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        color_palette: {
                            type: "object",
                            properties: {
                                primary: { type: "object", properties: { hex: { type: "string" }, name: { type: "string" }, reason: { type: "string" } } },
                                secondary: { type: "object", properties: { hex: { type: "string" }, name: { type: "string" }, reason: { type: "string" } } },
                                accent: { type: "object", properties: { hex: { type: "string" }, name: { type: "string" }, reason: { type: "string" } } },
                                background: { type: "object", properties: { hex: { type: "string" }, name: { type: "string" } } },
                                text: { type: "object", properties: { hex: { type: "string" }, name: { type: "string" } } }
                            }
                        },
                        typography: {
                            type: "object",
                            properties: {
                                heading: { type: "string" },
                                body: { type: "string" },
                                accent: { type: "string" },
                                reasoning: { type: "string" }
                            }
                        },
                        logo_suggestions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    concept: { type: "string" },
                                    description: { type: "string" }
                                }
                            }
                        },
                        brand_voice: { type: "string" },
                        visual_style: { type: "string" },
                        improvements: {
                            type: "array",
                            items: { type: "string" }
                        }
                    }
                }
            });

            setBrandSuggestions(result);
            toast.success('Brand analysis complete!');
        } catch (error) {
            toast.error('Failed to analyze branding');
            console.error(error);
        } finally {
            setAnalyzingBrand(false);
        }
    };

    const generateLogo = async (concept) => {
        setGeneratingLogo(true);
        try {
            const prompt = concept || logoPrompt || 
                `Professional, modern logo design for "${restaurant.name}", a ${restaurant.cuisine_type || 'restaurant'}. Clean, minimalist, memorable, vector style, suitable for restaurant branding, transparent background, high quality`;

            const result = await base44.integrations.Core.GenerateImage({ prompt });
            updateRestaurantMutation.mutate({ logo_url: result.url });
            toast.success('Logo generated!');
        } catch (error) {
            toast.error('Failed to generate logo');
        } finally {
            setGeneratingLogo(false);
        }
    };

    const applyColorPalette = (color) => {
        updateRestaurantMutation.mutate({ theme_primary_color: color });
    };

    const handleGuidelinesUpload = async (file) => {
        setUploadingGuidelines(true);
        try {
            const result = await base44.integrations.Core.UploadFile({ file });
            
            // Store brand guidelines URL in restaurant data
            const currentGuidelines = restaurant.brand_guidelines || [];
            updateRestaurantMutation.mutate({ 
                brand_guidelines: [...currentGuidelines, { 
                    filename: file.name, 
                    url: result.file_url,
                    uploaded_date: new Date().toISOString()
                }]
            });
            toast.success('Brand guidelines uploaded');
        } catch (error) {
            toast.error('Failed to upload guidelines');
        } finally {
            setUploadingGuidelines(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Palette className="h-5 w-5" />
                                AI Branding Manager
                            </CardTitle>
                            <p className="text-sm text-gray-500 mt-1">
                                Enhance your restaurant's visual identity with AI-powered suggestions
                            </p>
                        </div>
                        <Button
                            onClick={analyzeBranding}
                            disabled={analyzingBrand}
                            className="gap-2"
                        >
                            {analyzingBrand ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    Analyze Brand
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="current" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="current">Current Brand</TabsTrigger>
                    <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
                    <TabsTrigger value="assets">Brand Assets</TabsTrigger>
                    <TabsTrigger value="guidelines">Guidelines</TabsTrigger>
                </TabsList>

                {/* Current Brand Tab */}
                <TabsContent value="current" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Brand Preview</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <Label className="mb-2 block">Logo</Label>
                                    {restaurant?.logo_url ? (
                                        <img 
                                            src={restaurant.logo_url} 
                                            alt="Restaurant logo"
                                            className="w-32 h-32 object-contain border rounded-lg p-2"
                                        />
                                    ) : (
                                        <div className="w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                                            <p className="text-sm text-gray-400">No logo</p>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <Label className="mb-2 block">Theme Color</Label>
                                    <div className="flex items-center gap-3">
                                        <div 
                                            className="w-20 h-20 rounded-lg border shadow-sm"
                                            style={{ backgroundColor: restaurant?.theme_primary_color || '#f97316' }}
                                        />
                                        <div>
                                            <p className="font-mono text-sm">{restaurant?.theme_primary_color || '#f97316'}</p>
                                            <Input
                                                type="color"
                                                value={restaurant?.theme_primary_color || '#f97316'}
                                                onChange={(e) => applyColorPalette(e.target.value)}
                                                className="w-20 h-8 mt-2"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Label className="mb-2 block">Brand Preview Card</Label>
                                <Card 
                                    className="p-6"
                                    style={{ 
                                        borderTop: `4px solid ${restaurant?.theme_primary_color || '#f97316'}`,
                                        background: `linear-gradient(to bottom, ${restaurant?.theme_primary_color || '#f97316'}15, white)`
                                    }}
                                >
                                    <div className="flex items-center gap-4 mb-4">
                                        {restaurant?.logo_url && (
                                            <img src={restaurant.logo_url} alt="Logo" className="w-16 h-16 object-contain" />
                                        )}
                                        <div>
                                            <h3 className="text-2xl font-bold">{restaurant?.name}</h3>
                                            <p className="text-gray-600">{restaurant?.cuisine_type}</p>
                                        </div>
                                    </div>
                                    <p className="text-gray-700">{restaurant?.description}</p>
                                    <Button 
                                        className="mt-4"
                                        style={{ backgroundColor: restaurant?.theme_primary_color || '#f97316' }}
                                    >
                                        Order Now
                                    </Button>
                                </Card>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* AI Suggestions Tab */}
                <TabsContent value="suggestions" className="space-y-6">
                    {!brandSuggestions ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Sparkles className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">Click "Analyze Brand" to get AI-powered suggestions</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* Color Palette */}
                            {brandSuggestions.color_palette && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Palette className="h-5 w-5" />
                                            Suggested Color Palette
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid gap-4">
                                            {Object.entries(brandSuggestions.color_palette).map(([key, color]) => (
                                                <div key={key} className="flex items-center gap-4 p-3 border rounded-lg">
                                                    <div 
                                                        className="w-16 h-16 rounded-lg shadow-sm border"
                                                        style={{ backgroundColor: color.hex }}
                                                    />
                                                    <div className="flex-1">
                                                        <p className="font-semibold capitalize">{key}</p>
                                                        <p className="text-sm text-gray-600">{color.name}</p>
                                                        <p className="text-xs font-mono text-gray-500">{color.hex}</p>
                                                        {color.reason && (
                                                            <p className="text-xs text-gray-500 mt-1">{color.reason}</p>
                                                        )}
                                                    </div>
                                                    {key === 'primary' && (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => applyColorPalette(color.hex)}
                                                            className="gap-2"
                                                        >
                                                            <CheckCircle className="h-4 w-4" />
                                                            Apply
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Typography */}
                            {brandSuggestions.typography && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Type className="h-5 w-5" />
                                            Typography Recommendations
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-3">
                                            <div className="p-4 border rounded-lg">
                                                <Label className="text-sm text-gray-600">Heading Font</Label>
                                                <p className="text-2xl font-bold">{brandSuggestions.typography.heading}</p>
                                            </div>
                                            <div className="p-4 border rounded-lg">
                                                <Label className="text-sm text-gray-600">Body Font</Label>
                                                <p className="text-lg">{brandSuggestions.typography.body}</p>
                                            </div>
                                            <div className="p-4 border rounded-lg">
                                                <Label className="text-sm text-gray-600">Accent Font</Label>
                                                <p className="text-xl italic">{brandSuggestions.typography.accent}</p>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600">{brandSuggestions.typography.reasoning}</p>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Logo Suggestions */}
                            {brandSuggestions.logo_suggestions?.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Logo Concepts</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {brandSuggestions.logo_suggestions.map((suggestion, idx) => (
                                            <Card key={idx} className="p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold mb-1">{suggestion.concept}</h4>
                                                        <p className="text-sm text-gray-600">{suggestion.description}</p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => generateLogo(suggestion.description)}
                                                        disabled={generatingLogo}
                                                        className="gap-2"
                                                    >
                                                        <Wand2 className="h-4 w-4" />
                                                        Generate
                                                    </Button>
                                                </div>
                                            </Card>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Brand Voice & Visual Style */}
                            <div className="grid md:grid-cols-2 gap-6">
                                {brandSuggestions.brand_voice && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Brand Voice</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-gray-700">{brandSuggestions.brand_voice}</p>
                                        </CardContent>
                                    </Card>
                                )}
                                {brandSuggestions.visual_style && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Visual Style</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-gray-700">{brandSuggestions.visual_style}</p>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>

                            {/* Improvements */}
                            {brandSuggestions.improvements?.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Recommended Improvements</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-2">
                                            {brandSuggestions.improvements.map((improvement, idx) => (
                                                <li key={idx} className="flex items-start gap-2 text-gray-700">
                                                    <Badge className="mt-1">{idx + 1}</Badge>
                                                    <span>{improvement}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                </TabsContent>

                {/* Brand Assets Tab */}
                <TabsContent value="assets" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Logo Generator</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Custom Logo Prompt</Label>
                                <Textarea
                                    value={logoPrompt}
                                    onChange={(e) => setLogoPrompt(e.target.value)}
                                    placeholder="Describe your ideal logo (e.g., minimalist pizza slice icon with Italian colors)"
                                    rows={3}
                                />
                            </div>
                            <Button
                                onClick={() => generateLogo()}
                                disabled={generatingLogo}
                                className="gap-2 w-full"
                            >
                                {generatingLogo ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generating Logo...
                                    </>
                                ) : (
                                    <>
                                        <Wand2 className="h-4 w-4" />
                                        Generate Logo
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Brand Assets</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="border rounded-lg p-4">
                                    <Label className="mb-2 block">Primary Logo</Label>
                                    {restaurant?.logo_url ? (
                                        <img 
                                            src={restaurant.logo_url} 
                                            alt="Logo"
                                            className="w-full h-32 object-contain bg-gray-50 rounded"
                                        />
                                    ) : (
                                        <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center">
                                            <p className="text-sm text-gray-400">No logo uploaded</p>
                                        </div>
                                    )}
                                </div>
                                <div className="border rounded-lg p-4">
                                    <Label className="mb-2 block">Main Image</Label>
                                    {restaurant?.image_url ? (
                                        <img 
                                            src={restaurant.image_url} 
                                            alt="Restaurant"
                                            className="w-full h-32 object-cover rounded"
                                        />
                                    ) : (
                                        <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center">
                                            <p className="text-sm text-gray-400">No image uploaded</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Guidelines Tab */}
                <TabsContent value="guidelines" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Brand Guidelines</CardTitle>
                            <p className="text-sm text-gray-500">Upload brand guideline documents (PDF, images, etc.)</p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleGuidelinesUpload(file);
                                    }}
                                    disabled={uploadingGuidelines}
                                />
                                {uploadingGuidelines && (
                                    <p className="text-sm text-gray-500 mt-2">Uploading...</p>
                                )}
                            </div>

                            {restaurant?.brand_guidelines?.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Uploaded Guidelines</Label>
                                    {restaurant.brand_guidelines.map((guideline, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                                            <div>
                                                <p className="font-medium">{guideline.filename}</p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(guideline.uploaded_date).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <a
                                                href={guideline.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline text-sm"
                                            >
                                                View
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </CardContent>
            </Tabs>
        </div>
    );
}