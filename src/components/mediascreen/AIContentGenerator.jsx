import React, { useState, useEffect } from 'react';
import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Copy, Share2, RefreshCw, Monitor, Smartphone, Zap, Image, Eye, CheckCircle, Library, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import CanvasEditor from './CanvasEditor';

export default function AIContentGenerator({ onClose, onContentGenerated, restaurantName, restaurantId, restaurantColor = '#f97316', websiteUrl = '', existingContent, initialPrompt = '' }) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('screen');
    const [orientation, setOrientation] = useState('landscape'); // landscape | portrait
    const [selectedCategory, setSelectedCategory] = useState('');
    const [customCategory, setCustomCategory] = useState(''); // free-text custom category
    const [outputType, setOutputType] = useState('image'); // image | gif
    const [promoOffer, setPromoOffer] = useState('');
    const [customPrompt, setCustomPrompt] = useState(initialPrompt);
    const [style, setStyle] = useState('cinematic');
    const [duration, setDuration] = useState(10);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingContent, setIsGeneratingContent] = useState(false);
    const [generatedUrl, setGeneratedUrl] = useState(null);
    const [screenPlan, setScreenPlan] = useState(null);
    const [variations, setVariations] = useState([]);
    const [socialSnippets, setSocialSnippets] = useState(null);
    const [keywords, setKeywords] = useState('');
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizedSuggestions, setOptimizedSuggestions] = useState(null);
    const [showCanvasEditor, setShowCanvasEditor] = useState(false);

    useEffect(() => {
        if (initialPrompt) setCustomPrompt(initialPrompt);
    }, [initialPrompt]);

    // Fetch menu items
    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items-ai', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const categories = [...new Set(menuItems.map(i => i.category).filter(Boolean))];

    const itemsForCategory = selectedCategory
        ? menuItems.filter(i => i.category === selectedCategory && i.is_available !== false)
        : menuItems.filter(i => i.is_available !== false).slice(0, 20);

    const stylePresets = [
        { value: 'cinematic', label: 'Cinematic Fast-Food', desc: 'Dark + brand glow, fire tones, bold type' },
        { value: 'vibrant', label: 'Vibrant & Bold', desc: 'High contrast, colorful, eye-catching' },
        { value: 'elegant', label: 'Elegant Premium', desc: 'Minimal, dark, sophisticated' },
        { value: 'neon', label: 'Neon Night', desc: 'Dark background, neon accents, modern' },
    ];

    const effectiveCategory = customCategory.trim() || selectedCategory;

    const buildScreenAdPrompt = () => {
        const items = itemsForCategory.slice(0, 8);
        const heroItems = items.filter(i => i.is_popular).slice(0, 2).length > 0
            ? items.filter(i => i.is_popular).slice(0, 2)
            : items.slice(0, 2);

        const itemList = items.map(i => `${i.name} £${i.price}`).join(', ');
        const heroList = heroItems.map(i => `${i.name} £${i.price}${i.description ? ' - ' + i.description.slice(0, 40) : ''}`).join('; ');
        const orientationDesc = orientation === 'portrait'
            ? 'vertical portrait format (9:16), tall screen, mobile/totem display'
            : 'horizontal landscape format (16:9), wide LED screen, window display';
        const styleMap = {
            cinematic: 'cinematic fast-food advertising style like McDonald\'s or KFC, dark background with orange fire glow gradient, bold dramatic typography',
            vibrant: 'vibrant colorful high-contrast promotional style, bold colors, eye-catching composition',
            elegant: 'elegant premium dark restaurant branding, minimal layout, sophisticated typography',
            neon: 'neon night-club restaurant style, dark background with glowing neon accents, futuristic typography'
        };
        const gifNote = outputType === 'gif' ? 'Design as a looping animated GIF frame — motion blur, glowing effects, dynamic energy implied in single frame.' : '';

        return `Create a ${orientationDesc} LED promotional screen ad for "${restaurantName}".
${effectiveCategory ? `Category focus: ${effectiveCategory}` : ''}
Style: ${styleMap[style]}
Brand color: ${restaurantColor}
${gifNote}

HERO ITEMS (large, dominant): ${heroList || effectiveCategory || restaurantName}
ALL MENU ITEMS on screen: ${itemList || effectiveCategory}
${promoOffer ? `PROMO: ${promoOffer} - make this DOMINANT with urgency (LIMITED TIME / TODAY ONLY)` : ''}
${websiteUrl ? `CTA: ORDER NOW - ${websiteUrl}` : 'CTA: ORDER NOW / SKIP THE QUEUE'}

DESIGN RULES:
- Readable from 5 meters away — massive bold text
- Dark background with brand color (${restaurantColor}) glow/gradient
- Hero item takes up 40% of screen with appetite-appeal close-up
- Prices in large visible text with currency symbol
- Use power words: CRISPY, LOADED, JUICY, FIERY, MELTED
- NO paragraphs — only short punchy labels
- ${orientation === 'portrait' ? 'Stack content vertically: header → hero → item grid → offer → CTA' : 'Left: hero item + price. Right: item grid. Bottom: offer + CTA bar'}
- Professional food photography lighting, 4K quality
- ${promoOffer ? 'Promo badge/banner must be impossible to miss' : 'Strong visual hierarchy'}`;
    };

    const handleGenerateScreenAd = async () => {
        if (itemsForCategory.length === 0 && !customPrompt.trim()) {
            toast.error('Please select a category or enter a custom prompt');
            return;
        }
        setIsGenerating(true);
        setGeneratedUrl(null);
        setScreenPlan(null);

        try {
            const imagePrompt = itemsForCategory.length > 0 ? buildScreenAdPrompt() : customPrompt;

            // Generate the AI screen plan + image in parallel
            const [imageResult, planResult] = await Promise.all([
                base44.integrations.Core.GenerateImage({ prompt: imagePrompt }),
                itemsForCategory.length > 0 ? base44.integrations.Core.InvokeLLM({
                    prompt: `You are a digital signage content strategist. Generate a structured screen ad plan for "${restaurantName}".

Category: ${selectedCategory || 'All Menu'}
Items: ${itemsForCategory.slice(0, 10).map(i => `${i.name} £${i.price} (popular: ${i.is_popular ? 'yes' : 'no'})`).join(', ')}
Brand color: ${restaurantColor}
Orientation: ${orientation}
Offer: ${promoOffer || 'none'}
Website: ${websiteUrl || 'none'}

Return a JSON screen ad plan with this exact structure:
{
  "header": { "category_title": "...", "hook": "..." },
  "hero_items": [{ "name": "...", "price": "...", "punch_line": "..." }],
  "secondary_items": [{ "name": "...", "price": "..." }],
  "offer_section": { "text": "...", "urgency": "..." },
  "cta": { "primary": "...", "secondary": "...", "website": "..." },
  "style": { "primary_color": "...", "background": "...", "font_weight": "bold" },
  "animation": { "hero_effect": "...", "text_transition": "...", "loop_seconds": 10 }
}`,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            header: { type: "object", properties: { category_title: { type: "string" }, hook: { type: "string" } } },
                            hero_items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, price: { type: "string" }, punch_line: { type: "string" } } } },
                            secondary_items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, price: { type: "string" } } } },
                            offer_section: { type: "object", properties: { text: { type: "string" }, urgency: { type: "string" } } },
                            cta: { type: "object", properties: { primary: { type: "string" }, secondary: { type: "string" }, website: { type: "string" } } },
                            style: { type: "object", properties: { primary_color: { type: "string" }, background: { type: "string" }, font_weight: { type: "string" } } },
                            animation: { type: "object", properties: { hero_effect: { type: "string" }, text_transition: { type: "string" }, loop_seconds: { type: "number" } } }
                        }
                    }
                }) : Promise.resolve(null)
            ]);

            setGeneratedUrl(imageResult.url);
            if (planResult) setScreenPlan(planResult);
            toast.success('Screen ad generated!');
        } catch (error) {
            toast.error('Generation failed. Please try again.');
            console.error(error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAddToLibrary = async () => {
        if (!generatedUrl) return;
        const title = screenPlan?.header?.category_title || effectiveCategory || customPrompt.slice(0, 50) || `${restaurantName} Screen Ad`;
        try {
            await base44.entities.MediaFile.create({
                restaurant_id: restaurantId,
                file_url: generatedUrl,
                file_name: `${title}.${outputType}`,
                file_type: outputType === 'gif' ? 'image/gif' : 'image/png',
                file_size: 0,
            });
            queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
            toast.success('Added to Media Library!');
        } catch (error) {
            toast.error('Failed to add to library');
        }
    };

    const handleUseContent = () => {
        if (!generatedUrl) return;
        onContentGenerated({
            media_url: generatedUrl,
            media_type: outputType === 'gif' ? 'gif' : 'image',
            duration,
            ai_generated: true,
            ai_prompt: buildScreenAdPrompt(),
            title: screenPlan?.header?.category_title || customPrompt.slice(0, 50) || `${restaurantName} Screen Ad`,
        });
        onClose?.();
    };

    const handleGenerateVariations = async () => {
        if (itemsForCategory.length === 0 && !customPrompt.trim()) {
            toast.error('Select a category or enter a prompt first');
            return;
        }
        setIsGeneratingContent(true);
        setVariations([]);
        try {
            const base = buildScreenAdPrompt();
            const variationPrompts = [
                base + ', alternative composition, different angle, warm tones',
                base + ', close-up hero shot, dramatic lighting',
                base + ', wide grid layout, multiple items showcase',
            ];
            const results = await Promise.all(variationPrompts.map(p => base44.integrations.Core.GenerateImage({ prompt: p })));
            setVariations(results.map((r, i) => ({ url: r.url, label: ['Alt Composition', 'Close-up Hero', 'Grid Showcase'][i] })));
            toast.success('Variations generated!');
        } catch (error) {
            toast.error('Failed to generate variations');
        } finally {
            setIsGeneratingContent(false);
        }
    };

    const handleOptimizeContent = async () => {
        if (!keywords.trim()) { toast.error('Enter keywords first'); return; }
        setIsOptimizing(true);
        setOptimizedSuggestions(null);
        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Generate 5 aggressive, high-conversion screen ad titles and hooks for a restaurant LED display. Keywords: "${keywords}". Restaurant: ${restaurantName}. Style: cinematic fast-food advertising. Use power words (CRISPY, LOADED, JUICY, FIERY). Max 6 words per hook. Return JSON: { "suggestions": [{ "title": "...", "hook": "...", "cta": "..." }] }`,
                response_json_schema: { type: "object", properties: { suggestions: { type: "array", items: { type: "object", properties: { title: { type: "string" }, hook: { type: "string" }, cta: { type: "string" } } } } } }
            });
            setOptimizedSuggestions(response?.suggestions || []);
            toast.success('Suggestions generated!');
        } catch (error) {
            toast.error('Failed to generate suggestions');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleGenerateSocialSnippets = async () => {
        const text = screenPlan?.header?.hook || customPrompt || '';
        if (!text.trim()) { toast.error('Generate a screen ad first or enter a prompt'); return; }
        setIsGeneratingContent(true);
        setSocialSnippets(null);
        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Create aggressive, high-conversion social media posts for "${restaurantName}" based on: "${text}". Instagram, Facebook, Twitter. Emojis. Short punchy. Return JSON: { "instagram": "...", "facebook": "...", "twitter": "..." }`,
                response_json_schema: { type: "object", properties: { instagram: { type: "string" }, facebook: { type: "string" }, twitter: { type: "string" } } }
            });
            setSocialSnippets(response);
            toast.success('Social snippets generated!');
        } catch (error) {
            toast.error('Failed to generate snippets');
        } finally {
            setIsGeneratingContent(false);
        }
    };

    const copyToClipboard = (text) => { navigator.clipboard.writeText(text); toast.success('Copied!'); };

    const handleCanvasUse = (url) => {
        setGeneratedUrl(url);
        setShowCanvasEditor(false);
        toast.success('Canvas exported — ready to use or add to library');
    };

    return (
        <React.Fragment>
        <CanvasEditor
            open={showCanvasEditor}
            onClose={() => setShowCanvasEditor(false)}
            backgroundUrl={generatedUrl}
            restaurantId={restaurantId}
            menuItems={menuItems}
            onUse={handleCanvasUse}
        />
        <div className="w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="screen" className="flex items-center gap-1.5 text-xs"><Monitor className="h-3.5 w-3.5" />Screen Ad</TabsTrigger>
                    <TabsTrigger value="variations" className="flex items-center gap-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" />Variations</TabsTrigger>
                    <TabsTrigger value="optimize" className="flex items-center gap-1.5 text-xs"><Zap className="h-3.5 w-3.5" />Optimize</TabsTrigger>
                    <TabsTrigger value="social" className="flex items-center gap-1.5 text-xs"><Share2 className="h-3.5 w-3.5" />Social</TabsTrigger>
                </TabsList>

                {/* ── SCREEN AD TAB ── */}
                <TabsContent value="screen" className="mt-6 space-y-6">
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-4">
                        <p className="text-sm font-semibold text-orange-900 flex items-center gap-2">
                            <Sparkles className="h-4 w-4" /> Goal: Increase walk-ins & upsell high-margin items
                        </p>
                        <p className="text-xs text-orange-700 mt-1">Cinematic LED screen ads designed to convert from 5 meters away</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* LEFT: Inputs */}
                        <div className="space-y-4">
                            {/* Orientation */}
                            <div>
                                <Label className="text-sm font-semibold">Screen Orientation</Label>
                                <div className="flex gap-3 mt-2">
                                    <button
                                        onClick={() => setOrientation('landscape')}
                                        className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${orientation === 'landscape' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}
                                    >
                                        <Monitor className={`h-8 w-12 ${orientation === 'landscape' ? 'text-orange-500' : 'text-gray-400'}`} />
                                        <span className="text-xs font-medium">Landscape 16:9</span>
                                        <span className="text-[10px] text-gray-500">Window / Wall display</span>
                                    </button>
                                    <button
                                        onClick={() => setOrientation('portrait')}
                                        className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${orientation === 'portrait' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}
                                    >
                                        <Smartphone className={`h-8 w-5 ${orientation === 'portrait' ? 'text-orange-500' : 'text-gray-400'}`} />
                                        <span className="text-xs font-medium">Portrait 9:16</span>
                                        <span className="text-[10px] text-gray-500">Totem / tall screen</span>
                                    </button>
                                </div>
                            </div>

                            {/* Category */}
                            <div>
                                <Label className="text-sm font-semibold">Menu Category</Label>
                                <Select value={selectedCategory} onValueChange={v => { setSelectedCategory(v); setCustomCategory(''); }}>
                                    <SelectTrigger className="mt-2">
                                        <SelectValue placeholder="All categories" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={null}>All Categories</SelectItem>
                                        {categories.map(c => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {itemsForCategory.length > 0 && !customCategory && (
                                    <p className="text-xs text-gray-500 mt-1">{itemsForCategory.length} items — {itemsForCategory.filter(i => i.is_popular).length} popular</p>
                                )}
                                <Input
                                    value={customCategory}
                                    onChange={e => { setCustomCategory(e.target.value); if (e.target.value) setSelectedCategory(''); }}
                                    placeholder="Or type a custom category (e.g. Summer Specials)"
                                    className="mt-2 text-sm"
                                />
                            </div>

                            {/* Output Type */}
                            <div>
                                <Label className="text-sm font-semibold">Output Type</Label>
                                <div className="flex gap-3 mt-2">
                                    <button
                                        onClick={() => setOutputType('image')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${outputType === 'image' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                                    >
                                        <Image className="h-4 w-4" /> Image
                                    </button>
                                    <button
                                        onClick={() => setOutputType('gif')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${outputType === 'gif' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                                    >
                                        <Zap className="h-4 w-4" /> GIF Style
                                    </button>
                                </div>
                                {outputType === 'gif' && (
                                    <p className="text-[11px] text-amber-600 mt-1.5 bg-amber-50 rounded px-2 py-1">Generates a dynamic motion-style image saved as GIF. For true animation, upload a real GIF in Media Library.</p>
                                )}
                            </div>

                            {/* Style */}
                            <div>
                                <Label className="text-sm font-semibold">Visual Style</Label>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {stylePresets.map(s => (
                                        <button
                                            key={s.value}
                                            onClick={() => setStyle(s.value)}
                                            className={`p-2.5 rounded-lg border-2 text-left transition-all ${style === s.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}
                                        >
                                            <p className="text-xs font-semibold">{s.label}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{s.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Offer */}
                            <div>
                                <Label className="text-sm font-semibold">Promo / Offer <span className="text-gray-400 font-normal">(optional)</span></Label>
                                <Input
                                    value={promoOffer}
                                    onChange={e => setPromoOffer(e.target.value)}
                                    placeholder="e.g. 15% OFF – USE CODE WEB15"
                                    className="mt-2"
                                />
                            </div>

                            {/* Custom Prompt Override */}
                            <div>
                                <Label className="text-sm font-semibold">Custom Prompt Override <span className="text-gray-400 font-normal">(optional)</span></Label>
                                <Textarea
                                    value={customPrompt}
                                    onChange={e => setCustomPrompt(e.target.value)}
                                    placeholder="Leave blank to auto-generate from menu. Or write your own description..."
                                    rows={2}
                                    className="mt-2 text-sm"
                                />
                            </div>

                            {/* Duration */}
                            <div>
                                <Label className="text-sm font-semibold">Display Duration: {duration}s</Label>
                                <input
                                    type="range" min="5" max="30" value={duration}
                                    onChange={e => setDuration(parseInt(e.target.value))}
                                    className="w-full mt-2 accent-orange-500"
                                />
                                <div className="flex justify-between text-[10px] text-gray-400"><span>5s</span><span>30s</span></div>
                            </div>
                        </div>

                        {/* RIGHT: Preview */}
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold flex items-center gap-2"><Eye className="h-4 w-4" />Preview</Label>

                            {/* Image Preview */}
                            <div className={`bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center border-2 border-gray-700 ${orientation === 'portrait' ? 'aspect-[9/16] max-h-[500px]' : 'aspect-video'}`}>
                                {isGenerating ? (
                                    <div className="text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-2" />
                                        <p className="text-xs text-gray-400">Generating cinematic ad...</p>
                                    </div>
                                ) : generatedUrl ? (
                                    <img src={generatedUrl} alt="Generated screen ad" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center px-6">
                                        <Monitor className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                                        <p className="text-xs text-gray-500">Your screen ad will appear here</p>
                                        <p className="text-[10px] text-gray-600 mt-1">{orientation === 'portrait' ? '9:16 Portrait' : '16:9 Landscape'} format</p>
                                    </div>
                                )}
                            </div>

                            {/* Screen Plan Preview */}
                            {screenPlan && (
                                <div className="bg-gray-900 rounded-xl p-4 text-white space-y-3">
                                    <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">Generated Screen Plan</p>
                                    <div>
                                        <p className="text-lg font-black">{screenPlan.header?.category_title}</p>
                                        <p className="text-orange-400 font-bold text-sm">{screenPlan.header?.hook}</p>
                                    </div>
                                    {screenPlan.hero_items?.length > 0 && (
                                        <div className="space-y-1">
                                            {screenPlan.hero_items.map((item, i) => (
                                                <div key={i} className="flex items-center justify-between bg-orange-500/20 rounded px-2 py-1">
                                                    <div>
                                                        <span className="text-sm font-bold">{item.name}</span>
                                                        <span className="text-xs text-gray-300 ml-2">{item.punch_line}</span>
                                                    </div>
                                                    <span className="text-orange-400 font-black">{item.price}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {screenPlan.secondary_items?.length > 0 && (
                                        <div className="grid grid-cols-3 gap-1">
                                            {screenPlan.secondary_items.slice(0, 6).map((item, i) => (
                                                <div key={i} className="bg-white/5 rounded px-1.5 py-1 text-center">
                                                    <p className="text-[10px] font-semibold truncate">{item.name}</p>
                                                    <p className="text-[10px] text-orange-400 font-bold">{item.price}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {screenPlan.offer_section?.text && (
                                        <div className="bg-orange-500 rounded px-3 py-2 text-center">
                                            <p className="text-sm font-black">{screenPlan.offer_section.text}</p>
                                            <p className="text-xs font-bold opacity-80">{screenPlan.offer_section.urgency}</p>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-xs text-gray-400 border-t border-white/10 pt-2">
                                        <span className="font-bold text-white">{screenPlan.cta?.primary}</span>
                                        {screenPlan.cta?.website && <span>{screenPlan.cta.website}</span>}
                                    </div>
                                    {screenPlan.animation && (
                                        <div className="text-[10px] text-gray-500 space-y-0.5">
                                            <p>🎬 {screenPlan.animation.hero_effect}</p>
                                            <p>✨ {screenPlan.animation.text_transition}</p>
                                            <p>🔄 Loop: {screenPlan.animation.loop_seconds}s</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Copy JSON button */}
                            {screenPlan && (
                                <Button variant="outline" size="sm" className="w-full" onClick={() => copyToClipboard(JSON.stringify(screenPlan, null, 2))}>
                                    <Copy className="h-3.5 w-3.5 mr-2" />Copy Screen Plan JSON
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3 pt-2 border-t">
                        {!generatedUrl ? (
                            <Button
                                onClick={handleGenerateScreenAd}
                                className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold"
                                disabled={isGenerating}
                            >
                                {isGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating Cinematic Ad...</> : <><Sparkles className="h-4 w-4 mr-2" />Generate Screen Ad</>}
                            </Button>
                        ) : (
                            <>
                                <Button onClick={() => setShowCanvasEditor(true)} className="flex-1 bg-purple-600 hover:bg-purple-700">
                                    <PenLine className="h-4 w-4 mr-2" />Edit in Canvas
                                </Button>
                                <Button onClick={handleAddToLibrary} className="flex-1 bg-blue-600 hover:bg-blue-700">
                                    <Library className="h-4 w-4 mr-2" />Add to Library
                                </Button>
                                <Button onClick={handleUseContent} className="flex-1 bg-green-600 hover:bg-green-700">
                                    <CheckCircle className="h-4 w-4 mr-2" />Use in Playlist
                                </Button>
                                <Button onClick={() => { setGeneratedUrl(null); setScreenPlan(null); }} variant="outline">
                                    Regenerate
                                </Button>
                            </>
                        )}
                        {onClose && (
                            <Button onClick={onClose} variant="outline">Cancel</Button>
                        )}
                    </div>
                </TabsContent>

                {/* ── VARIATIONS TAB ── */}
                <TabsContent value="variations" className="mt-6 space-y-5">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <p className="text-sm text-purple-800"><strong>🔄 Generate 3 variations</strong> — different compositions of the same screen ad</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Category</Label>
                            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger className="mt-2"><SelectValue placeholder="All categories" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>All</SelectItem>
                                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Orientation</Label>
                            <Select value={orientation} onValueChange={setOrientation}>
                                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="landscape">Landscape 16:9</SelectItem>
                                    <SelectItem value="portrait">Portrait 9:16</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Button onClick={handleGenerateVariations} className="w-full bg-purple-600 hover:bg-purple-700" disabled={isGeneratingContent}>
                        {isGeneratingContent ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><RefreshCw className="h-4 w-4 mr-2" />Generate 3 Variations</>}
                    </Button>
                    {variations.length > 0 && (
                        <div className="grid grid-cols-3 gap-4">
                            {variations.map((v, i) => (
                                <Card key={i} className="overflow-hidden hover:shadow-lg transition-shadow">
                                    <div className={`${orientation === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'} bg-gray-900 cursor-pointer`} onClick={() => { setGeneratedUrl(v.url); setActiveTab('screen'); }}>
                                        <img src={v.url} alt={v.label} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="p-2 space-y-1">
                                        <p className="text-xs font-semibold text-center">{v.label}</p>
                                        <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={async () => {
                                            await base44.entities.MediaFile.create({ restaurant_id: restaurantId, file_url: v.url, file_name: `${v.label}.png`, file_type: 'image/png', file_size: 0 });
                                            queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
                                            toast.success('Added to Library!');
                                        }}>
                                            <Library className="h-3 w-3 mr-1" />Library
                                        </Button>
                                        <Button size="sm" className="w-full" variant="outline" onClick={() => { setGeneratedUrl(v.url); setActiveTab('screen'); }}>Use</Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* ── OPTIMIZE TAB ── */}
                <TabsContent value="optimize" className="mt-6 space-y-5">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <p className="text-sm text-green-800"><strong>⚡ AI Copy Optimizer</strong> — Generate aggressive, high-conversion headlines & hooks for your screen ads</p>
                    </div>
                    <div>
                        <Label>Keywords / Items to promote</Label>
                        <Input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. loaded burger, weekend special, crispy wings" className="mt-2" />
                    </div>
                    <Button onClick={handleOptimizeContent} className="w-full bg-green-600 hover:bg-green-700" disabled={isOptimizing}>
                        {isOptimizing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><Sparkles className="h-4 w-4 mr-2" />Generate High-Conversion Copy</>}
                    </Button>
                    {optimizedSuggestions?.length > 0 && (
                        <div className="space-y-3">
                            {optimizedSuggestions.map((s, i) => (
                                <Card key={i} className="p-4 hover:shadow-md transition-shadow border-l-4 border-l-orange-400">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <p className="font-black text-sm">{s.title}</p>
                                            <p className="text-orange-600 font-bold text-xs mt-0.5">{s.hook}</p>
                                            <Badge variant="outline" className="text-[10px] mt-1">{s.cta}</Badge>
                                        </div>
                                        <Button size="sm" variant="outline" onClick={() => { setCustomPrompt(s.title + ' ' + s.hook); setActiveTab('screen'); }}>Use</Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* ── SOCIAL TAB ── */}
                <TabsContent value="social" className="mt-6 space-y-5">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-800"><strong>📱 Social Media Copy</strong> — Repurpose your screen ad content for Instagram, Facebook & Twitter</p>
                    </div>
                    <div>
                        <Label>Content to repurpose</Label>
                        <Textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder="Describe your promotion or generate a screen ad first..." rows={3} className="mt-2" />
                    </div>
                    <Button onClick={handleGenerateSocialSnippets} className="w-full bg-blue-600 hover:bg-blue-700" disabled={isGeneratingContent}>
                        {isGeneratingContent ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><Share2 className="h-4 w-4 mr-2" />Generate Social Posts</>}
                    </Button>
                    {socialSnippets && (
                        <div className="space-y-3">
                            {Object.entries(socialSnippets).map(([platform, text]) => (
                                <Card key={platform} className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <p className="font-bold text-sm capitalize mb-1">{platform === 'twitter' ? 'X / Twitter' : platform}</p>
                                            <p className="text-sm text-gray-700">{text}</p>
                                        </div>
                                        <Button size="sm" variant="outline" onClick={() => copyToClipboard(text)}><Copy className="h-4 w-4" /></Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
        </React.Fragment>
    );
}