import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Palette, Wand2, Loader2, CheckCircle, Eye, RotateCcw, Zap } from 'lucide-react';
import { toast } from 'sonner';

// ─── Font map: name → Google Fonts import + CSS font-family value ────────────
const FONT_STYLES = {
    modern: {
        label: 'Modern',
        desc: 'Clean, contemporary sans-serif',
        heading: 'Inter, system-ui, sans-serif',
        body: 'Inter, system-ui, sans-serif',
        googleFont: 'Inter:wght@400;600;700;800',
        preview: 'Aa Bb Cc 123'
    },
    classic: {
        label: 'Classic',
        desc: 'Traditional and trustworthy serif',
        heading: '"Playfair Display", Georgia, serif',
        body: 'Lora, Georgia, serif',
        googleFont: 'Playfair+Display:wght@400;700;800&family=Lora:wght@400;600',
        preview: 'Aa Bb Cc 123'
    },
    playful: {
        label: 'Playful',
        desc: 'Fun, energetic and casual',
        heading: '"Nunito", "Quicksand", sans-serif',
        body: '"Nunito", sans-serif',
        googleFont: 'Nunito:wght@400;600;700;800',
        preview: 'Aa Bb Cc 123'
    },
    elegant: {
        label: 'Elegant',
        desc: 'Refined and upscale feel',
        heading: '"Cormorant Garamond", serif',
        body: '"Raleway", sans-serif',
        googleFont: 'Cormorant+Garamond:wght@400;600;700&family=Raleway:wght@400;500;600',
        preview: 'Aa Bb Cc 123'
    }
};

// ─── Button style map ─────────────────────────────────────────────────────────
const BUTTON_STYLES = {
    rounded: { label: 'Rounded', desc: 'Soft corners (8px)', radius: '8px' },
    pill: { label: 'Pill', desc: 'Fully rounded pill', radius: '9999px' },
    sharp: { label: 'Sharp', desc: 'Square corners', radius: '2px' }
};

// ─── AI palette presets ───────────────────────────────────────────────────────
const PRESET_PALETTES = [
    { name: 'Flame Orange', primary: '#f97316', secondary: '#fed7aa', background: '#fff7ed', nav: '#ffffff' },
    { name: 'Midnight Blue', primary: '#1e40af', secondary: '#bfdbfe', background: '#eff6ff', nav: '#ffffff' },
    { name: 'Forest Green', primary: '#15803d', secondary: '#bbf7d0', background: '#f0fdf4', nav: '#ffffff' },
    { name: 'Rose Gold', primary: '#e11d48', secondary: '#fecdd3', background: '#fff1f2', nav: '#ffffff' },
    { name: 'Royal Purple', primary: '#7c3aed', secondary: '#ddd6fe', background: '#faf5ff', nav: '#ffffff' },
    { name: 'Charcoal', primary: '#374151', secondary: '#d1d5db', background: '#f9fafb', nav: '#ffffff' }
];

const DEFAULT_CONFIG = {
    enabled: false,
    primary_color: '#f97316',
    secondary_color: '#fed7aa',
    background_color: '#f9fafb',
    button_style: 'rounded',
    button_text_color: '#ffffff',
    font_style: 'modern',
    hero_overlay_opacity: 0.55,
    card_background: '#ffffff',
    nav_background: '#ffffff',
    ai_palette_name: ''
};

export default function BrandingManager({ restaurantId }) {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [analyzingBrand, setAnalyzingBrand] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState(null);
    const queryClient = useQueryClient();

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant-branding', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0] || null;
        },
        enabled: !!restaurantId
    });

    // Sync local state from DB when restaurant loads
    useEffect(() => {
        if (restaurant) {
            const bc = restaurant.branding_config;
            if (bc && typeof bc === 'object') {
                setConfig({ ...DEFAULT_CONFIG, ...bc });
            } else {
                // Pre-fill primary_color from existing theme_primary_color
                setConfig(prev => ({
                    ...DEFAULT_CONFIG,
                    primary_color: restaurant.theme_primary_color || DEFAULT_CONFIG.primary_color
                }));
            }
        }
    }, [restaurant]);

    const saveMutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant-branding', restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
            toast.success(config.enabled ? 'Brand settings saved and live!' : 'Brand settings saved (branding is off — enable to go live).');
        },
        onError: (err) => toast.error('Failed to save brand settings: ' + (err?.message || 'unknown error'))
    });

    const handleSave = () => {
        // Always keep theme_primary_color in sync with branding primary color
        saveMutation.mutate({
            branding_config: config,
            theme_primary_color: config.primary_color
        });
    };

    const applyPreset = (preset) => {
        setConfig(prev => ({
            ...prev,
            primary_color: preset.primary,
            secondary_color: preset.secondary,
            background_color: preset.background,
            nav_background: preset.nav,
            ai_palette_name: preset.name
        }));
        toast.success(`"${preset.name}" palette applied — click Save to go live`);
    };

    const resetToDefaults = () => {
        setConfig({
            ...DEFAULT_CONFIG,
            primary_color: restaurant?.theme_primary_color || DEFAULT_CONFIG.primary_color
        });
        toast.info('Reset to defaults');
    };

    // ── AI brand analysis ─────────────────────────────────────────────────────
    const analyzeBranding = async () => {
        if (!restaurant) return;
        setAnalyzingBrand(true);
        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `You are a professional restaurant branding consultant. Analyze this restaurant and suggest 4 distinct brand palette options, each suited to different personalities.

Restaurant Name: ${restaurant.name}
Cuisine: ${restaurant.cuisine_type || 'Not specified'}
Description: ${restaurant.description || 'No description'}
Current Color: ${restaurant.theme_primary_color || 'Default orange'}

Return 4 palette suggestions. Each must have: a creative name, primary hex, secondary hex (lighter tint of primary), background hex (very light, near-white), a button_style recommendation, a font_style recommendation, and 1-sentence rationale.

Make the palettes diverse: e.g. one warm/energetic, one cool/professional, one dark/premium, one natural/earthy.`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        palettes: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    primary: { type: "string" },
                                    secondary: { type: "string" },
                                    background: { type: "string" },
                                    button_style: { type: "string" },
                                    font_style: { type: "string" },
                                    rationale: { type: "string" }
                                }
                            }
                        },
                        brand_summary: { type: "string" },
                        top_improvements: { type: "array", items: { type: "string" } }
                    }
                }
            });
            setAiSuggestions(result);
            toast.success('AI analysis complete! See suggestions below.');
        } catch (e) {
            toast.error('AI analysis failed. Please try again.');
            console.error(e);
        } finally {
            setAnalyzingBrand(false);
        }
    };

    // ── Mini live preview ─────────────────────────────────────────────────────
    const buttonRadiusMap = { rounded: '8px', pill: '9999px', sharp: '2px' };
    const fontHeading = FONT_STYLES[config.font_style]?.heading || FONT_STYLES.modern.heading;

    if (isLoading) {
        return <div className="text-center py-12 text-gray-500">Loading brand settings...</div>;
    }

    if (!restaurant) {
        return <div className="text-center py-12 text-gray-500">Restaurant not found</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
                <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Palette className="h-5 w-5 text-purple-500" />
                                Brand Studio
                            </h2>
                            <p className="text-sm text-gray-600 mt-1">
                                Customise your restaurant's look and feel. Enable the toggle below to make your custom branding live.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={config.enabled}
                                    onCheckedChange={(v) => setConfig(prev => ({ ...prev, enabled: v }))}
                                />
                                <span className="text-sm font-medium">
                                    {config.enabled ? (
                                        <Badge className="bg-green-500 text-white">Live</Badge>
                                    ) : (
                                        <Badge variant="outline">Off</Badge>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                    {!config.enabled && (
                        <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
                            ⚠️ Custom branding is <strong>off</strong> — your restaurant uses default platform styles. Enable the toggle above and Save to go live.
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* ── Left: Controls ── */}
                <div className="space-y-5">

                    {/* Colours */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Palette className="h-4 w-4 text-purple-500" />
                                Colours
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {[
                                { key: 'primary_color', label: 'Primary (buttons, highlights)', hint: 'Main brand colour' },
                                { key: 'secondary_color', label: 'Secondary (badges, accents)', hint: 'Lighter complementary colour' },
                                { key: 'background_color', label: 'Page Background', hint: 'Main page background' },
                                { key: 'nav_background', label: 'Navigation Background', hint: 'Top nav & category bar' },
                                { key: 'card_background', label: 'Menu Card Background', hint: 'Individual menu item cards' },
                                { key: 'button_text_color', label: 'Button Text Colour', hint: 'Text on primary buttons' }
                            ].map(({ key, label, hint }) => (
                                <div key={key}>
                                    <Label className="text-sm font-medium">{label}</Label>
                                    <p className="text-xs text-gray-400 mb-1">{hint}</p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={config[key] || '#ffffff'}
                                            onChange={(e) => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
                                        />
                                        <Input
                                            value={config[key] || ''}
                                            onChange={(e) => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
                                            placeholder="#f97316"
                                            className="font-mono text-sm h-10"
                                        />
                                        <div
                                            className="w-10 h-10 rounded-lg border border-gray-200 flex-shrink-0"
                                            style={{ backgroundColor: config[key] || '#ffffff' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Button Style */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Button Style</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 gap-3">
                                {Object.entries(BUTTON_STYLES).map(([key, style]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setConfig(prev => ({ ...prev, button_style: key }))}
                                        className={`p-3 border-2 transition-all text-center ${
                                            config.button_style === key
                                                ? 'border-purple-500 bg-purple-50'
                                                : 'border-gray-200 bg-white hover:border-gray-300'
                                        }`}
                                        style={{ borderRadius: style.radius }}
                                    >
                                        <div
                                            className="text-xs font-semibold mb-2 text-white py-1 px-2 text-center"
                                            style={{
                                                backgroundColor: config.primary_color || '#f97316',
                                                borderRadius: style.radius
                                            }}
                                        >
                                            Order
                                        </div>
                                        <p className="text-xs font-semibold text-gray-800">{style.label}</p>
                                        <p className="text-xs text-gray-400">{style.desc}</p>
                                        {config.button_style === key && (
                                            <p className="text-xs text-purple-600 font-medium mt-1">✓ Selected</p>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Font Style */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Font Style</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-3">
                                {Object.entries(FONT_STYLES).map(([key, font]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setConfig(prev => ({ ...prev, font_style: key }))}
                                        className={`p-3 border-2 text-left transition-all ${
                                            config.font_style === key
                                                ? 'border-purple-500 bg-purple-50'
                                                : 'border-gray-200 bg-white hover:border-gray-300'
                                        } rounded-lg`}
                                    >
                                        <p
                                            className="text-lg mb-1"
                                            style={{ fontFamily: font.heading }}
                                        >
                                            {font.preview}
                                        </p>
                                        <p className="text-sm font-semibold text-gray-800">{font.label}</p>
                                        <p className="text-xs text-gray-400">{font.desc}</p>
                                        {config.font_style === key && (
                                            <p className="text-xs text-purple-600 font-medium mt-1">✓ Selected</p>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Hero Overlay */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Hero Image Overlay</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Label className="text-sm">Overlay Darkness: {Math.round((config.hero_overlay_opacity || 0.55) * 100)}%</Label>
                            <p className="text-xs text-gray-400 mb-2">Controls how dark the gradient over your hero image is</p>
                            <input
                                type="range"
                                min="0.2"
                                max="0.9"
                                step="0.05"
                                value={config.hero_overlay_opacity || 0.55}
                                onChange={(e) => setConfig(prev => ({ ...prev, hero_overlay_opacity: parseFloat(e.target.value) }))}
                                className="w-full h-2 accent-purple-500 cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>Light</span>
                                <span>Dark</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ── Right: Preview + AI + Presets ── */}
                <div className="space-y-5">

                    {/* Live Preview */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Eye className="h-4 w-4 text-blue-500" />
                                Live Preview
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {/* Mini restaurant page mockup */}
                            <div
                                className="rounded-xl overflow-hidden border shadow-sm"
                                style={{ backgroundColor: config.background_color || '#f9fafb', fontFamily: fontHeading }}
                            >
                                {/* Hero */}
                                <div className="relative h-28 overflow-hidden">
                                    <img
                                        src={restaurant.image_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600'}
                                        alt="preview"
                                        className="w-full h-full object-cover"
                                    />
                                    <div
                                        className="absolute inset-0"
                                        style={{
                                            background: `linear-gradient(to top, rgba(0,0,0,${config.hero_overlay_opacity || 0.55}), rgba(0,0,0,0.1))`
                                        }}
                                    />
                                    <div className="absolute bottom-2 left-3">
                                        <p className="text-white font-bold text-lg leading-tight" style={{ fontFamily: fontHeading }}>
                                            {restaurant.name}
                                        </p>
                                        <p className="text-white/70 text-xs">{restaurant.cuisine_type}</p>
                                    </div>
                                </div>

                                {/* Nav bar */}
                                <div
                                    className="px-3 py-2 border-b flex gap-2"
                                    style={{ backgroundColor: config.nav_background || '#ffffff' }}
                                >
                                    {['Starters', 'Mains', 'Desserts'].map((cat, i) => (
                                        <span
                                            key={cat}
                                            className="px-2 py-1 text-xs font-medium rounded"
                                            style={i === 0 ? {
                                                backgroundColor: config.primary_color || '#f97316',
                                                color: config.button_text_color || '#ffffff',
                                                borderRadius: buttonRadiusMap[config.button_style] || '8px'
                                            } : {
                                                backgroundColor: config.secondary_color || '#fed7aa',
                                                color: '#374151',
                                                borderRadius: buttonRadiusMap[config.button_style] || '8px'
                                            }}
                                        >
                                            {cat}
                                        </span>
                                    ))}
                                </div>

                                {/* Menu card sample */}
                                <div className="p-3 space-y-2">
                                    {['Grilled Chicken', 'Margherita Pizza'].map((item, i) => (
                                        <div
                                            key={item}
                                            className="flex items-center justify-between p-2 rounded-lg border"
                                            style={{ backgroundColor: config.card_background || '#ffffff' }}
                                        >
                                            <div>
                                                <p className="text-xs font-semibold text-gray-800" style={{ fontFamily: fontHeading }}>{item}</p>
                                                <p className="text-xs text-gray-400">£{(8.99 + i * 2).toFixed(2)}</p>
                                            </div>
                                            <button
                                                className="text-xs font-bold px-3 py-1"
                                                style={{
                                                    backgroundColor: config.primary_color || '#f97316',
                                                    color: config.button_text_color || '#ffffff',
                                                    borderRadius: buttonRadiusMap[config.button_style] || '8px'
                                                }}
                                            >
                                                +
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Cart bar */}
                                <div className="p-3">
                                    <button
                                        className="w-full py-2 text-sm font-bold"
                                        style={{
                                            backgroundColor: config.primary_color || '#f97316',
                                            color: config.button_text_color || '#ffffff',
                                            borderRadius: buttonRadiusMap[config.button_style] || '8px'
                                        }}
                                    >
                                        View Cart — £12.99
                                    </button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Preset Palettes */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Zap className="h-4 w-4 text-yellow-500" />
                                Quick Palettes
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 gap-2">
                                {PRESET_PALETTES.map((preset) => (
                                    <button
                                        key={preset.name}
                                        type="button"
                                        onClick={() => applyPreset(preset)}
                                        className={`p-2 rounded-lg border-2 text-left transition-all hover:border-gray-400 ${
                                            config.ai_palette_name === preset.name
                                                ? 'border-purple-500 bg-purple-50'
                                                : 'border-gray-200'
                                        }`}
                                    >
                                        <div className="flex gap-1 mb-1.5">
                                            <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: preset.primary }} />
                                            <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: preset.secondary }} />
                                            <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: preset.background }} />
                                        </div>
                                        <p className="text-xs font-medium text-gray-700 leading-tight">{preset.name}</p>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* AI Analyser */}
                    <Card className="border-purple-200">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-purple-500" />
                                AI Brand Analyser
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-gray-500">
                                Let AI suggest 4 custom palettes based on your restaurant's name, cuisine, and description.
                            </p>
                            <Button
                                onClick={analyzeBranding}
                                disabled={analyzingBrand}
                                className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                            >
                                {analyzingBrand ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Analysing your brand...
                                    </>
                                ) : (
                                    <>
                                        <Wand2 className="h-4 w-4" />
                                        Analyse & Suggest Palettes
                                    </>
                                )}
                            </Button>

                            {aiSuggestions && (
                                <div className="space-y-3 pt-2">
                                    {aiSuggestions.brand_summary && (
                                        <div className="text-xs text-gray-600 bg-purple-50 border border-purple-100 rounded-lg p-3 italic">
                                            "{aiSuggestions.brand_summary}"
                                        </div>
                                    )}

                                    {aiSuggestions.palettes?.map((palette, idx) => {
                                        // Validate hex values from AI before rendering
                                        const isValidHex = (h) => /^#[0-9a-fA-F]{3,6}$/.test(h);
                                        const primary = isValidHex(palette.primary) ? palette.primary : '#f97316';
                                        const secondary = isValidHex(palette.secondary) ? palette.secondary : '#fed7aa';
                                        const background = isValidHex(palette.background) ? palette.background : '#f9fafb';

                                        return (
                                            <div key={idx} className="border rounded-lg p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-800">{palette.name}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">{palette.rationale}</p>
                                                    </div>
                                                    <div className="flex gap-1 flex-shrink-0">
                                                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: primary }} />
                                                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: secondary }} />
                                                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: background }} />
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full gap-1 text-xs"
                                                    onClick={() => {
                                                        const validBtnStyle = ['rounded', 'pill', 'sharp'].includes(palette.button_style)
                                                            ? palette.button_style : 'rounded';
                                                        const validFontStyle = ['modern', 'classic', 'playful', 'elegant'].includes(palette.font_style)
                                                            ? palette.font_style : 'modern';
                                                        setConfig(prev => ({
                                                            ...prev,
                                                            primary_color: primary,
                                                            secondary_color: secondary,
                                                            background_color: background,
                                                            button_style: validBtnStyle,
                                                            font_style: validFontStyle,
                                                            ai_palette_name: palette.name
                                                        }));
                                                        toast.success(`Applied "${palette.name}" — click Save to go live`);
                                                    }}
                                                >
                                                    <CheckCircle className="h-3 w-3" />
                                                    Apply this palette
                                                </Button>
                                            </div>
                                        );
                                    })}

                                    {aiSuggestions.top_improvements?.length > 0 && (
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                                            <p className="text-xs font-semibold text-blue-800 mb-2">💡 Top Improvements</p>
                                            <ul className="space-y-1">
                                                {aiSuggestions.top_improvements.slice(0, 3).map((tip, i) => (
                                                    <li key={i} className="text-xs text-blue-700 flex gap-1.5">
                                                        <span className="flex-shrink-0">{i + 1}.</span>
                                                        <span>{tip}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Save / Reset row */}
            <div className="flex gap-3 pt-2">
                <Button
                    variant="outline"
                    onClick={resetToDefaults}
                    className="gap-2"
                >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700"
                >
                    {saveMutation.isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="h-4 w-4" />
                            Save Brand Settings
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}