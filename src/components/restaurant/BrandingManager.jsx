import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Palette, Wand2, Loader2, CheckCircle, Eye, RotateCcw, Zap, ImageIcon, Upload } from 'lucide-react';
import { toast } from 'sonner';
import DesignTemplates from './DesignTemplates';
import {
    isValidHex, invalidColorFields, readableTextOn, buttonTextOn, completePalette, contrastIssues,
} from '@/lib/branding';

// ─── Hero image uploader sub-component ───────────────────────────────────────
function HeroImageUploader({ onUploaded }) {
    const [uploading, setUploading] = useState(false);
    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            onUploaded(file_url);
            toast.success('Hero image uploaded!');
        } catch (err) {
            toast.error('Upload failed: ' + (err?.message || 'unknown error'));
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };
    return (
        <label className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm font-medium ${uploading ? 'border-gray-200 text-gray-400 bg-gray-50' : 'border-purple-300 text-purple-600 bg-purple-50 hover:bg-purple-100'}`}>
            {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4" /> Upload Hero Image</>}
            <input type="file" accept="image/*" className="sr-only" onChange={handleFile} disabled={uploading} />
        </label>
    );
}

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
    { name: 'Flame Orange', primary: '#c2410c', secondary: '#fed7aa', background: '#fff7ed', nav: '#ffffff' },
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
    add_to_cart_color: '#f97316',
    heading_color: '#111827',
    font_style: 'modern',
    hero_overlay_opacity: 0.55,
    hero_image_url: '',
    card_background: '#ffffff',
    nav_background: '#ffffff',
    ai_palette_name: ''
};

// Editor state from the stored record. theme_primary_color is the restaurant's brand
// colour (always live), so it is the source for primary_color.
function seedConfig(restaurant) {
    const bc = restaurant.branding_config;
    const hasBc = bc && typeof bc === 'object' && !Array.isArray(bc);
    const seeded = hasBc ? { ...DEFAULT_CONFIG, ...bc } : { ...DEFAULT_CONFIG };
    if (isValidHex(restaurant.theme_primary_color)) {
        seeded.primary_color = restaurant.theme_primary_color.toLowerCase();
        if (!hasBc) seeded.add_to_cart_color = seeded.primary_color;
    }
    return seeded;
}

// What the storefront shows when custom styling is off: the standard layout in the brand colour.
function offStateConfig(config) {
    return {
        ...config,
        secondary_color: '#f3f4f6',
        background_color: '#f9fafb',
        nav_background: '#ffffff',
        card_background: '#ffffff',
        heading_color: '#111827',
        button_text_color: '#ffffff',
        add_to_cart_color: config.primary_color,
        button_style: 'rounded',
        font_style: 'modern',
        hero_overlay_opacity: 0.55,
        hero_image_url: '',
    };
}

export default function BrandingManager({ restaurantId }) {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    // Last saved state, for spotting unsaved edits.
    const [baseline, setBaseline] = useState(null);
    const isDirty = baseline !== null && JSON.stringify(config) !== JSON.stringify(baseline);
    const dirtyRef = useRef(false);
    dirtyRef.current = isDirty;
    const [analyzingBrand, setAnalyzingBrand] = useState(false);
    // Short pause between AI runs, so repeated clicks don't spend credits.
    const [aiCooling, setAiCooling] = useState(false);
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

    // Load the stored settings whenever fresh data arrives — but never over unsaved edits.
    useEffect(() => {
        if (!restaurant || dirtyRef.current) return;
        const seeded = seedConfig(restaurant);
        setConfig(seeded);
        setBaseline(seeded);
    }, [restaurant]);

    const saveMutation = useMutation({
        // Saved through the server so the request is permission-checked, validated and audited.
        mutationFn: async (data) => {
            let res;
            try {
                res = await base44.functions.invoke('updateRestaurantSettings', {
                    restaurant_id: restaurantId,
                    updates: data,
                });
            } catch (err) {
                throw new Error(err?.response?.data?.error || err?.message || 'Save failed');
            }
            if (!res?.data?.success) throw new Error(res?.data?.error || 'Save failed');
            return res.data;
        },
        onSuccess: (_, variables) => {
            // Mark as saved so the refetch below can reload the server's normalised values.
            setBaseline(variables?.branding_config ?? null);
            dirtyRef.current = false;
            queryClient.invalidateQueries({ queryKey: ['restaurant-branding', restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
            // Read enabled from the saved data, not from stale closure state
            const savedEnabled = variables?.branding_config?.enabled === true;
            toast.success(savedEnabled
                ? 'Brand settings saved and live!'
                : 'Brand colour saved and live. Custom styling is off.');
        },
        onError: (err) => toast.error(err?.message || 'Failed to save brand settings')
    });

    const handleSave = () => {
        if (saveMutation.isPending) return;
        const bad = invalidColorFields(config);
        if (bad.length) {
            toast.error('Fix the highlighted colours before saving — use the format #1a2b3c.');
            return;
        }
        // theme_primary_color is kept in step by the server, and only while branding is live.
        saveMutation.mutate({ branding_config: config });
    };

    const applyTemplate = (tpl) => {
        setConfig(prev => ({ ...prev, ...tpl.config }));
    };

    // Palettes set every colour, so nothing is left over from a previous palette.
    const applyPreset = (preset) => {
        setConfig(prev => ({
            ...prev,
            ...completePalette({
                primary: preset.primary,
                secondary: preset.secondary,
                background: preset.background,
                nav: preset.nav,
            }),
            ai_palette_name: preset.name
        }));
        toast.success(`"${preset.name}" palette applied — click Save to go live`);
    };

    // Resets styling only: keeps the brand colour and whether custom styling is on.
    const resetToDefaults = () => {
        setConfig(prev => ({
            ...DEFAULT_CONFIG,
            enabled: prev.enabled,
            primary_color: prev.primary_color,
            add_to_cart_color: prev.primary_color,
        }));
        toast.info('Styling reset to defaults — click Save to apply');
    };

    // ── AI brand analysis ─────────────────────────────────────────────────────
    const analyzeBranding = async () => {
        if (!restaurant || analyzingBrand || aiCooling) return;
        setAnalyzingBrand(true);
        setAiSuggestions(null);
        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `You are a professional restaurant branding consultant. Analyze this restaurant and suggest 4 distinct brand palette options, each suited to different personalities.

Restaurant Name: ${restaurant.name}
Cuisine: ${(restaurant.cuisine_types?.length ? restaurant.cuisine_types.join(', ') : restaurant.cuisine_type) || 'Not specified'}
Description: ${restaurant.description || 'No description'}
Current Color: ${restaurant.theme_primary_color || 'Default orange'}

Return 4 palette suggestions. Each must have: a creative name, primary hex, secondary hex (lighter tint of primary), background hex, a button_style recommendation (rounded, pill or sharp), a font_style recommendation (modern, classic, playful or elegant), and 1-sentence rationale.

Readability rules: white text on the primary colour must have a contrast ratio of at least 4.5:1, so choose a deep primary rather than a bright one. Backgrounds should be very light (near-white), except the dark/premium option, which may use a very dark background.

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
            setAiCooling(true);
            setTimeout(() => setAiCooling(false), 30000);
        }
    };

    // ── Mini live preview ─────────────────────────────────────────────────────
    const buttonRadiusMap = { rounded: '8px', pill: '9999px', sharp: '2px' };
    // The preview shows what customers will actually see after saving.
    const pv = config.enabled ? config : offStateConfig(config);
    const fontHeading = FONT_STYLES[pv.font_style]?.heading || FONT_STYLES.modern.heading;

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
                                Your brand colour is always live. Turn on custom styling to also apply your fonts, backgrounds, button style and hero image.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="custom-styling" className="text-sm font-medium text-gray-700">Custom styling</Label>
                                <Switch
                                    id="custom-styling"
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
                            Custom styling is <strong>off</strong> — your storefront uses the standard MealDrop look in your brand colour. Switch it on and save to apply everything else.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Design Templates */}
            <DesignTemplates
                currentTemplateName={config.ai_palette_name}
                onApply={applyTemplate}
            />

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
                                { key: 'primary_color', label: 'Brand colour (always live)', hint: 'Buttons and highlights on your storefront, plus media screens and app icon — even with custom styling off' },
                                { key: 'secondary_color', label: 'Secondary (badges, accents)', hint: 'Lighter complementary colour' },
                                { key: 'background_color', label: 'Page Background', hint: 'Main page background' },
                                { key: 'nav_background', label: 'Navigation Background', hint: 'Top nav & category bar' },
                                { key: 'card_background', label: 'Menu Card Background', hint: 'Individual menu item cards' },
                                { key: 'button_text_color', label: 'Button Text Colour', hint: 'Text on primary buttons' },
                                { key: 'add_to_cart_color', label: 'Add to Cart Button', hint: 'The + button on menu item cards' },
                                { key: 'heading_color', label: 'Category Heading Colour', hint: 'Category section titles on the menu page' }
                            ].map(({ key, label, hint }) => (
                                <div key={key}>
                                    <Label className="text-sm font-medium">{label}</Label>
                                    <p className="text-xs text-gray-400 mb-1">{hint}</p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            aria-label={`${label} colour picker`}
                                            value={isValidHex(config[key]) ? config[key].toLowerCase() : '#ffffff'}
                                            onChange={(e) => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
                                        />
                                        <Input
                                            value={config[key] || ''}
                                            onChange={(e) => setConfig(prev => ({ ...prev, [key]: e.target.value.trim() }))}
                                            placeholder="#f97316"
                                            maxLength={7}
                                            aria-label={`${label} hex value`}
                                            aria-invalid={!!config[key] && !isValidHex(config[key])}
                                            className={`font-mono text-sm h-10 ${config[key] && !isValidHex(config[key]) ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
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

                    {/* Readability check */}
                    {(() => {
                        const issues = contrastIssues(config);
                        return (
                            <Card className={issues.length ? 'border-amber-300' : 'border-green-200'}>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Readability check</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3" aria-live="polite">
                                    {issues.length === 0 ? (
                                        <p className="text-sm text-green-700 flex items-center gap-2">
                                            <CheckCircle className="h-4 w-4" />
                                            All colour pairs are easy to read.
                                        </p>
                                    ) : issues.map((issue) => (
                                        <div key={issue.id} className="flex items-start justify-between gap-3 text-sm">
                                            <div>
                                                <p className="font-medium text-gray-800">{issue.label}</p>
                                                <p className="text-xs text-gray-500">
                                                    Contrast {issue.ratio.toFixed(1)}:1 — needs {issue.min}:1. {issue.note}
                                                </p>
                                            </div>
                                            {issue.fix && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="flex-shrink-0"
                                                    onClick={() => setConfig(prev => ({ ...prev, ...issue.fix }))}
                                                >
                                                    Fix
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        );
                    })()}

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

                    {/* Hero Image */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <ImageIcon className="h-4 w-4 text-blue-500" />
                                Hero Image
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-xs text-gray-400">Upload a custom hero/banner image for your storefront. Overrides the default restaurant image when branding is enabled.</p>
                            {config.hero_image_url ? (
                                <div className="relative rounded-xl overflow-hidden border">
                                    <img
                                        src={config.hero_image_url}
                                        alt="Hero preview"
                                        className="w-full h-32 object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setConfig(prev => ({ ...prev, hero_image_url: '' }))}
                                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-red-600"
                                    >✕</button>
                                </div>
                            ) : (
                                <div className="border-2 border-dashed border-gray-200 rounded-xl h-24 flex items-center justify-center text-gray-400">
                                    <span className="text-sm">No custom hero image set</span>
                                </div>
                            )}
                            <HeroImageUploader
                                onUploaded={(url) => setConfig(prev => ({ ...prev, hero_image_url: url }))}
                            />
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
                            <p className="text-xs text-gray-500">
                                {config.enabled
                                    ? 'How your storefront looks with custom styling'
                                    : 'How your storefront looks now — custom styling is off'}
                            </p>
                        </CardHeader>
                        <CardContent>
                            {/* Mini restaurant page mockup */}
                            <div
                                className="rounded-xl overflow-hidden border shadow-sm"
                                style={{ backgroundColor: pv.background_color || '#f9fafb', fontFamily: fontHeading }}
                            >
                                {/* Hero */}
                                <div className="relative h-28 overflow-hidden">
                                    <img
                                        src={pv.hero_image_url || restaurant.image_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600'}
                                        alt="preview"
                                        className="w-full h-full object-cover"
                                    />
                                    <div
                                        className="absolute inset-0"
                                        style={{
                                            background: `linear-gradient(to top, rgba(0,0,0,${pv.hero_overlay_opacity || 0.55}), rgba(0,0,0,0.1))`
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
                                    style={{ backgroundColor: pv.nav_background || '#ffffff' }}
                                >
                                    {['Starters', 'Mains', 'Desserts'].map((cat, i) => (
                                        <span
                                            key={cat}
                                            className="px-2 py-1 text-xs font-medium rounded"
                                            style={i === 0 ? {
                                                backgroundColor: pv.primary_color || '#f97316',
                                                color: buttonTextOn(pv.primary_color, pv.button_text_color),
                                                borderRadius: buttonRadiusMap[pv.button_style] || '8px'
                                            } : {
                                                backgroundColor: pv.secondary_color || '#fed7aa',
                                                color: readableTextOn(pv.secondary_color).text,
                                                borderRadius: buttonRadiusMap[pv.button_style] || '8px'
                                            }}
                                        >
                                            {cat}
                                        </span>
                                    ))}
                                </div>

                                {/* Menu card sample */}
                                <div className="px-3 pt-2 pb-1">
                                    <p className="text-xs font-bold uppercase tracking-wide border-b pb-1 mb-2" style={{ color: pv.heading_color || '#111827', borderColor: (pv.heading_color || '#111827') + '30', fontFamily: fontHeading }}>
                                        Mains
                                    </p>
                                    <div className="space-y-2">
                                        {['Grilled Chicken', 'Margherita Pizza'].map((item, i) => (
                                            <div
                                                key={item}
                                                className="flex items-center justify-between p-2 rounded-lg border"
                                                style={{ backgroundColor: pv.card_background || '#ffffff' }}
                                            >
                                                <div>
                                                    <p className="text-xs font-semibold" style={{ fontFamily: fontHeading, color: readableTextOn(pv.card_background).text }}>{item}</p>
                                                    <p className="text-xs" style={{ color: readableTextOn(pv.card_background).muted }}>£{(8.99 + i * 2).toFixed(2)}</p>
                                                </div>
                                                <button
                                                    className="text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full"
                                                    style={{
                                                        backgroundColor: pv.add_to_cart_color || pv.primary_color || '#f97316',
                                                        color: buttonTextOn(pv.add_to_cart_color || pv.primary_color, pv.button_text_color),
                                                    }}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Cart bar */}
                                <div className="p-3">
                                    <button
                                        className="w-full py-2 text-sm font-bold"
                                        style={{
                                            backgroundColor: pv.primary_color || '#f97316',
                                            color: buttonTextOn(pv.primary_color, pv.button_text_color),
                                            borderRadius: buttonRadiusMap[pv.button_style] || '8px'
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
                                disabled={analyzingBrand || aiCooling}
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
                                        {aiCooling ? 'Ready again in a moment…' : 'Analyse & Suggest Palettes'}
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
                                                            ...completePalette({ primary, secondary, background }),
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
                {isDirty && (
                    <span className="self-center text-sm text-amber-700" role="status">Unsaved changes</span>
                )}
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