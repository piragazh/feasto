import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutTemplate, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// ── Professional design templates ──────────────────────────────────────────────
// Each template sets a full coherent branding_config snapshot.
// The `accent` field is the colour shown in the gradient banner — purely decorative.
export const DESIGN_TEMPLATES = [
    {
        id: 'urban_street',
        name: 'Urban Street',
        tagline: 'Bold, modern & energetic',
        category: 'Fast Food · Street Food',
        accent: 'from-orange-500 to-red-500',
        preview: {
            primary: '#ea580c',
            secondary: '#fed7aa',
            background: '#fff7ed',
            nav: '#ffffff',
            card: '#ffffff',
        },
        config: {
            primary_color: '#ea580c',
            secondary_color: '#fed7aa',
            background_color: '#fff7ed',
            button_style: 'rounded',
            button_text_color: '#ffffff',
            font_style: 'modern',
            hero_overlay_opacity: 0.65,
            card_background: '#ffffff',
            nav_background: '#ffffff',
            ai_palette_name: 'Urban Street',
        }
    },
    {
        id: 'fine_dining',
        name: 'Fine Dining',
        tagline: 'Elegant, premium & refined',
        category: 'Fine Dining · Upscale',
        accent: 'from-stone-700 to-stone-900',
        preview: {
            primary: '#292524',
            secondary: '#d6d3d1',
            background: '#fafaf9',
            nav: '#292524',
            card: '#ffffff',
        },
        config: {
            primary_color: '#292524',
            secondary_color: '#d6d3d1',
            background_color: '#fafaf9',
            button_style: 'sharp',
            button_text_color: '#ffffff',
            font_style: 'elegant',
            hero_overlay_opacity: 0.7,
            card_background: '#ffffff',
            nav_background: '#292524',
            ai_palette_name: 'Fine Dining',
        }
    },
    {
        id: 'fresh_garden',
        name: 'Fresh Garden',
        tagline: 'Natural, healthy & vibrant',
        category: 'Healthy · Vegetarian · Cafe',
        accent: 'from-green-500 to-emerald-600',
        preview: {
            primary: '#16a34a',
            secondary: '#bbf7d0',
            background: '#f0fdf4',
            nav: '#ffffff',
            card: '#ffffff',
        },
        config: {
            primary_color: '#16a34a',
            secondary_color: '#bbf7d0',
            background_color: '#f0fdf4',
            button_style: 'pill',
            button_text_color: '#ffffff',
            font_style: 'playful',
            hero_overlay_opacity: 0.5,
            card_background: '#ffffff',
            nav_background: '#ffffff',
            ai_palette_name: 'Fresh Garden',
        }
    },
    {
        id: 'midnight_brasserie',
        name: 'Midnight Brasserie',
        tagline: 'Dark, moody & sophisticated',
        category: 'Bar · Brasserie · Late Night',
        accent: 'from-indigo-700 to-purple-900',
        preview: {
            primary: '#7c3aed',
            secondary: '#ddd6fe',
            background: '#1e1b4b',
            nav: '#312e81',
            card: '#2e1065',
        },
        config: {
            primary_color: '#7c3aed',
            secondary_color: '#ddd6fe',
            background_color: '#1e1b4b',
            button_style: 'pill',
            button_text_color: '#ffffff',
            font_style: 'classic',
            hero_overlay_opacity: 0.75,
            card_background: '#2e1065',
            nav_background: '#312e81',
            ai_palette_name: 'Midnight Brasserie',
        }
    },
    {
        id: 'coastal_breeze',
        name: 'Coastal Breeze',
        tagline: 'Fresh, airy & Mediterranean',
        category: 'Seafood · Mediterranean · Cafe',
        accent: 'from-sky-400 to-blue-600',
        preview: {
            primary: '#0284c7',
            secondary: '#bae6fd',
            background: '#f0f9ff',
            nav: '#ffffff',
            card: '#ffffff',
        },
        config: {
            primary_color: '#0284c7',
            secondary_color: '#bae6fd',
            background_color: '#f0f9ff',
            button_style: 'rounded',
            button_text_color: '#ffffff',
            font_style: 'modern',
            hero_overlay_opacity: 0.45,
            card_background: '#ffffff',
            nav_background: '#ffffff',
            ai_palette_name: 'Coastal Breeze',
        }
    },
    {
        id: 'spice_route',
        name: 'Spice Route',
        tagline: 'Warm, exotic & aromatic',
        category: 'Indian · Middle Eastern · Asian',
        accent: 'from-amber-500 to-rose-600',
        preview: {
            primary: '#dc2626',
            secondary: '#fecaca',
            background: '#fff5f5',
            nav: '#ffffff',
            card: '#fff9f9',
        },
        config: {
            primary_color: '#dc2626',
            secondary_color: '#fecaca',
            background_color: '#fff5f5',
            button_style: 'rounded',
            button_text_color: '#ffffff',
            font_style: 'classic',
            hero_overlay_opacity: 0.6,
            card_background: '#fff9f9',
            nav_background: '#ffffff',
            ai_palette_name: 'Spice Route',
        }
    },
];

export default function DesignTemplates({ currentTemplateName, onApply }) {
    return (
        <Card className="border-2 border-blue-100">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <LayoutTemplate className="h-4 w-4 text-blue-500" />
                    Professional Templates
                    <Badge variant="outline" className="text-xs ml-1">New</Badge>
                </CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                    One-click full design templates — colours, fonts and button style all set together.
                </p>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {DESIGN_TEMPLATES.map((tpl) => {
                        const isActive = currentTemplateName === tpl.name;
                        return (
                            <button
                                key={tpl.id}
                                type="button"
                                onClick={() => {
                                    onApply(tpl);
                                    toast.success(`"${tpl.name}" template applied — click Save to go live`);
                                }}
                                className={`group relative rounded-xl border-2 text-left overflow-hidden transition-all hover:shadow-md ${
                                    isActive
                                        ? 'border-blue-500 shadow-md'
                                        : 'border-gray-200 hover:border-blue-300'
                                }`}
                            >
                                {/* Gradient banner */}
                                <div className={`bg-gradient-to-r ${tpl.accent} h-16 relative`}>
                                    {/* Colour dots */}
                                    <div className="absolute bottom-2 left-3 flex gap-1.5">
                                        {Object.values(tpl.preview).map((color, i) => (
                                            <div
                                                key={i}
                                                className="w-4 h-4 rounded-full border-2 border-white/60 shadow"
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                    {/* Active check */}
                                    {isActive && (
                                        <div className="absolute top-2 right-2">
                                            <CheckCircle2 className="h-5 w-5 text-white drop-shadow" />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="p-3 bg-white">
                                    <div className="flex items-start justify-between gap-1">
                                        <p className="text-sm font-semibold text-gray-900 leading-tight">{tpl.name}</p>
                                        {isActive && (
                                            <Badge className="bg-blue-500 text-white text-xs flex-shrink-0">Active</Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">{tpl.tagline}</p>
                                    <p className="text-xs text-gray-400 mt-1 truncate">{tpl.category}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}