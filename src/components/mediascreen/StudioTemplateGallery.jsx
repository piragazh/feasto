import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { LAYOUT_TEMPLATES } from './layoutTemplates';

const _TEMPLATES_INLINE = [
    {
        id: 'fullscreen',
        name: 'Full Screen',
        category: 'Simple',
        description: 'Single content fills the entire display — great for video or hero imagery',
        zones: [{ id: 'main', x: 0, y: 0, width: 100, height: 100, content_type: 'media', label: 'Main Content' }],
        preview: [{ x: 0, y: 0, w: 100, h: 100, color: '#6366f1' }]
    },
    {
        id: 'split_lr',
        name: 'Split Horizontal',
        category: 'Split',
        description: 'Two equal zones side by side — good for comparing products or dual messaging',
        zones: [
            { id: 'left', x: 0, y: 0, width: 50, height: 100, content_type: 'media', label: 'Left' },
            { id: 'right', x: 50, y: 0, width: 50, height: 100, content_type: 'media', label: 'Right' }
        ],
        preview: [
            { x: 0, y: 0, w: 49, h: 100, color: '#6366f1' },
            { x: 51, y: 0, w: 49, h: 100, color: '#8b5cf6' }
        ]
    },
    {
        id: 'split_tb',
        name: 'Main + Ticker',
        category: 'Promo',
        description: 'Large promo area with bottom announcement ticker',
        zones: [
            { id: 'top', x: 0, y: 0, width: 100, height: 80, content_type: 'media', label: 'Main Display' },
            { id: 'bottom', x: 0, y: 80, width: 100, height: 20, content_type: 'ticker', label: 'Ticker Bar' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 79, color: '#6366f1' },
            { x: 0, y: 81, w: 100, h: 19, color: '#f59e0b' }
        ]
    },
    {
        id: 'main_sidebar',
        name: 'Main + Info Sidebar',
        category: 'Dashboard',
        description: 'Large media area with a narrower info panel on the right',
        zones: [
            { id: 'main', x: 0, y: 0, width: 70, height: 100, content_type: 'media', label: 'Main Display' },
            { id: 'sidebar', x: 70, y: 0, width: 30, height: 100, content_type: 'menu', label: 'Info Sidebar' }
        ],
        preview: [
            { x: 0, y: 0, w: 69, h: 100, color: '#6366f1' },
            { x: 71, y: 0, w: 29, h: 100, color: '#10b981' }
        ]
    },
    {
        id: 'menu_board',
        name: 'Menu Board',
        category: 'Restaurant',
        description: 'Full-screen menu display with branded header strip',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 15, content_type: 'branding', label: 'Header / Branding' },
            { id: 'menu', x: 0, y: 15, width: 100, height: 85, content_type: 'menu', label: 'Menu Items' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 14, color: '#f97316' },
            { x: 0, y: 16, w: 100, h: 84, color: '#1e293b' }
        ]
    },
    {
        id: 'live_orders',
        name: 'Live Orders',
        category: 'Restaurant',
        description: 'Real-time order queue display with promo sidebar',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 15, content_type: 'branding', label: 'Restaurant Name' },
            { id: 'orders', x: 0, y: 15, width: 65, height: 85, content_type: 'live_orders', label: 'Order Queue' },
            { id: 'promo', x: 65, y: 15, width: 35, height: 85, content_type: 'media', label: 'Promotions' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 14, color: '#f97316' },
            { x: 0, y: 16, w: 64, h: 84, color: '#0f172a' },
            { x: 66, y: 16, w: 34, h: 84, color: '#6366f1' }
        ]
    },
    {
        id: 'three_col',
        name: 'Three Columns',
        category: 'Split',
        description: 'Three equal zones — ideal for showcasing multiple specials',
        zones: [
            { id: 'col1', x: 0, y: 0, width: 33, height: 100, content_type: 'media', label: 'Column 1' },
            { id: 'col2', x: 33, y: 0, width: 34, height: 100, content_type: 'media', label: 'Column 2' },
            { id: 'col3', x: 67, y: 0, width: 33, height: 100, content_type: 'media', label: 'Column 3' }
        ],
        preview: [
            { x: 0, y: 0, w: 32, h: 100, color: '#6366f1' },
            { x: 34, y: 0, w: 32, h: 100, color: '#8b5cf6' },
            { x: 68, y: 0, w: 32, h: 100, color: '#a78bfa' }
        ]
    },
    {
        id: 'weather_overlay',
        name: 'Weather Overlay',
        category: 'Dashboard',
        description: 'Full media background with weather widget inset',
        zones: [
            { id: 'main', x: 0, y: 0, width: 100, height: 100, content_type: 'media', label: 'Background Media' },
            { id: 'weather', x: 68, y: 2, width: 30, height: 28, content_type: 'weather', label: 'Weather Widget' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 100, color: '#0ea5e9' },
            { x: 69, y: 3, w: 28, h: 26, color: '#ffffff', opacity: 0.9 }
        ]
    },
    {
        id: 'split_header',
        name: 'Header + Two Zones',
        category: 'Dashboard',
        description: 'Branded header with two content zones below',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 15, content_type: 'branding', label: 'Header' },
            { id: 'left', x: 0, y: 15, width: 50, height: 85, content_type: 'media', label: 'Left Content' },
            { id: 'right', x: 50, y: 15, width: 50, height: 85, content_type: 'menu', label: 'Right Content' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 14, color: '#f97316' },
            { x: 0, y: 16, w: 49, h: 84, color: '#6366f1' },
            { x: 51, y: 16, w: 49, h: 84, color: '#10b981' }
        ]
    },
    {
        id: 'portrait_menu',
        name: 'Portrait Menu',
        category: 'Restaurant',
        description: 'Optimised for portrait screens — stacked header, menu, footer',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 20, content_type: 'branding', label: 'Branding' },
            { id: 'menu', x: 0, y: 20, width: 100, height: 65, content_type: 'menu', label: 'Menu' },
            { id: 'footer', x: 0, y: 85, width: 100, height: 15, content_type: 'ticker', label: 'Footer Promo' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 19, color: '#f97316' },
            { x: 0, y: 21, w: 100, h: 63, color: '#1e293b' },
            { x: 0, y: 86, w: 100, h: 14, color: '#ef4444' }
        ]
    },
    {
        id: 'promo_grid',
        name: 'Promo Grid',
        category: 'Promo',
        description: 'Four-zone grid — show multiple promotions simultaneously',
        zones: [
            { id: 'tl', x: 0, y: 0, width: 50, height: 50, content_type: 'media', label: 'Top Left' },
            { id: 'tr', x: 50, y: 0, width: 50, height: 50, content_type: 'media', label: 'Top Right' },
            { id: 'bl', x: 0, y: 50, width: 50, height: 50, content_type: 'media', label: 'Bottom Left' },
            { id: 'br', x: 50, y: 50, width: 50, height: 50, content_type: 'media', label: 'Bottom Right' }
        ],
        preview: [
            { x: 0, y: 0, w: 49, h: 49, color: '#6366f1' },
            { x: 51, y: 0, w: 49, h: 49, color: '#8b5cf6' },
            { x: 0, y: 51, w: 49, h: 49, color: '#a78bfa' },
            { x: 51, y: 51, w: 49, h: 49, color: '#c4b5fd' }
        ]
    },
    {
        id: 'featured_sidebar',
        name: 'Featured + Slim Sidebar',
        category: 'Promo',
        description: 'Wide featured media with a slim widget sidebar',
        zones: [
            { id: 'main', x: 0, y: 0, width: 80, height: 100, content_type: 'media', label: 'Featured Content' },
            { id: 'side_top', x: 80, y: 0, width: 20, height: 50, content_type: 'weather', label: 'Weather' },
            { id: 'side_bot', x: 80, y: 50, width: 20, height: 50, content_type: 'clock', label: 'Clock' }
        ],
        preview: [
            { x: 0, y: 0, w: 79, h: 100, color: '#6366f1' },
            { x: 81, y: 0, w: 19, h: 49, color: '#0ea5e9' },
            { x: 81, y: 51, w: 19, h: 49, color: '#10b981' }
        ]
    },
    // ─── Portrait Templates ───────────────────────────────────────────
    {
        id: 'portrait_fullscreen',
        name: 'Portrait Full Screen',
        category: 'Portrait',
        portrait: true,
        description: 'Single full-screen zone for portrait displays — ideal for vertical video or imagery',
        zones: [{ id: 'main', x: 0, y: 0, width: 100, height: 100, content_type: 'media', label: 'Main Content' }],
        preview: [{ x: 0, y: 0, w: 100, h: 100, color: '#6366f1' }]
    },
    {
        id: 'portrait_menu_full',
        name: 'Portrait Menu Board',
        category: 'Portrait',
        portrait: true,
        description: 'Full menu display optimised for portrait screens with branding header',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 15, content_type: 'branding', label: 'Branding' },
            { id: 'menu', x: 0, y: 15, width: 100, height: 85, content_type: 'menu', label: 'Menu Items' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 14, color: '#f97316' },
            { x: 0, y: 16, w: 100, h: 84, color: '#1e293b' }
        ]
    },
    {
        id: 'portrait_menu_ticker',
        name: 'Portrait Menu + Ticker',
        category: 'Portrait',
        portrait: true,
        description: 'Portrait menu board with a promotional ticker at the bottom',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 12, content_type: 'branding', label: 'Branding' },
            { id: 'menu', x: 0, y: 12, width: 100, height: 73, content_type: 'menu', label: 'Menu Items' },
            { id: 'ticker', x: 0, y: 85, width: 100, height: 15, content_type: 'ticker', label: 'Promo Ticker' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 11, color: '#f97316' },
            { x: 0, y: 13, w: 100, h: 71, color: '#1e293b' },
            { x: 0, y: 86, w: 100, h: 14, color: '#f59e0b' }
        ]
    },
    {
        id: 'portrait_orders',
        name: 'Portrait Order Queue',
        category: 'Portrait',
        portrait: true,
        description: 'Order collection display for portrait screens with branding and live queue',
        zones: [
            { id: 'header', x: 0, y: 0, width: 100, height: 18, content_type: 'branding', label: 'Branding' },
            { id: 'orders', x: 0, y: 18, width: 100, height: 82, content_type: 'live_orders', label: 'Order Queue' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 17, color: '#f97316' },
            { x: 0, y: 19, w: 100, h: 81, color: '#0f172a' }
        ]
    },
    {
        id: 'portrait_split',
        name: 'Portrait Split',
        category: 'Portrait',
        portrait: true,
        description: 'Two stacked zones — top for media, bottom for menu or info',
        zones: [
            { id: 'top', x: 0, y: 0, width: 100, height: 50, content_type: 'media', label: 'Top Media' },
            { id: 'bottom', x: 0, y: 50, width: 100, height: 50, content_type: 'menu', label: 'Bottom Content' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 49, color: '#6366f1' },
            { x: 0, y: 51, w: 100, h: 49, color: '#10b981' }
        ]
    },
    {
        id: 'portrait_promo_stack',
        name: 'Portrait Promo Stack',
        category: 'Portrait',
        portrait: true,
        description: 'Three stacked promo zones — great for showcasing deals in a vertical layout',
        zones: [
            { id: 'top', x: 0, y: 0, width: 100, height: 33, content_type: 'media', label: 'Promo 1' },
            { id: 'mid', x: 0, y: 33, width: 100, height: 34, content_type: 'media', label: 'Promo 2' },
            { id: 'bot', x: 0, y: 67, width: 100, height: 33, content_type: 'media', label: 'Promo 3' }
        ],
        preview: [
            { x: 0, y: 0, w: 100, h: 32, color: '#6366f1' },
            { x: 0, y: 34, w: 100, h: 32, color: '#8b5cf6' },
            { x: 0, y: 68, w: 100, h: 32, color: '#a78bfa' }
        ]
    },
    {
        id: 'portrait_weather_menu',
        name: 'Portrait Widget + Menu',
        category: 'Portrait',
        portrait: true,
        description: 'Weather & clock widgets at top with menu board below for portrait kiosks',
        zones: [
            { id: 'weather', x: 0, y: 0, width: 50, height: 20, content_type: 'weather', label: 'Weather' },
            { id: 'clock', x: 50, y: 0, width: 50, height: 20, content_type: 'clock', label: 'Clock' },
            { id: 'menu', x: 0, y: 20, width: 100, height: 80, content_type: 'menu', label: 'Menu Items' }
        ],
        preview: [
            { x: 0, y: 0, w: 49, h: 19, color: '#0ea5e9' },
            { x: 51, y: 0, w: 49, h: 19, color: '#10b981' },
            { x: 0, y: 21, w: 100, h: 79, color: '#1e293b' }
        ]
    },
];

const CATEGORIES = ['All', 'Simple', 'Split', 'Dashboard', 'Restaurant', 'Promo', 'Portrait'];

const CONTENT_TYPE_COLORS = {
    media: 'bg-indigo-100 text-indigo-700',
    menu: 'bg-emerald-100 text-emerald-700',
    branding: 'bg-orange-100 text-orange-700',
    ticker: 'bg-amber-100 text-amber-700',
    live_orders: 'bg-gray-100 text-gray-700',
    weather: 'bg-sky-100 text-sky-700',
    clock: 'bg-teal-100 text-teal-700',
};

function TemplatePreview({ template, size = 'md' }) {
    const isPortrait = template.portrait;
    const h = size === 'sm' ? 80 : 130;
    // Portrait: use fixed height with narrower width to show portrait aspect
    const style = isPortrait
        ? { height: h * 1.6, maxWidth: h, margin: '0 auto' }
        : { height: h };
    return (
        <div
            className="bg-gray-900 rounded-xl overflow-hidden relative"
            style={style}
        >
            <div className="absolute inset-0 p-2">
                {template.preview.map((zone, i) => (
                    <div
                        key={i}
                        className="absolute rounded"
                        style={{
                            left: `${zone.x + (i > 0 ? 0.5 : 0)}%`,
                            top: `${zone.y + (i > 0 ? 0.5 : 0)}%`,
                            width: `${zone.w}%`,
                            height: `${zone.h}%`,
                            backgroundColor: zone.color,
                            opacity: zone.opacity || 1,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

export default function StudioTemplateGallery({ restaurantId }) {
    const queryClient = useQueryClient();
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [showApplyDialog, setShowApplyDialog] = useState(false);
    const [targetScreen, setTargetScreen] = useState('');

    const { data: screens = [] } = useQuery({
        queryKey: ['screens', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const updateScreenMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Screen.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['screens', restaurantId] });
            toast.success(`Template "${selectedTemplate?.name}" applied!`);
            setShowApplyDialog(false);
            setSelectedTemplate(null);
            setTargetScreen('');
        }
    });

    const handleApply = async () => {
        if (!targetScreen || !selectedTemplate) return;
        const screen = screens.find(s => s.screen_name === targetScreen);
        if (!screen) return;
        await updateScreenMutation.mutateAsync({
            id: screen.id,
            data: {
                layout_template: {
                    name: selectedTemplate.name,
                    zones: selectedTemplate.zones
                }
            }
        });
    };

    const filteredTemplates = selectedCategory === 'All'
        ? TEMPLATES
        : TEMPLATES.filter(t => t.category === selectedCategory);

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Template Gallery</h1>
                <p className="text-gray-500 text-sm mt-1">{TEMPLATES.length} professional screen layouts ready to apply</p>
            </div>

            {/* Category pills */}
            <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                            selectedCategory === cat
                                ? 'bg-gray-900 text-white shadow-md'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Template grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredTemplates.map(template => (
                    <div
                        key={template.id}
                        onClick={() => { setSelectedTemplate(template); setShowApplyDialog(true); }}
                        className="bg-white rounded-2xl border border-gray-200 overflow-hidden cursor-pointer hover:border-orange-400 hover:shadow-lg transition-all group"
                    >
                        {/* Preview */}
                        <div className="relative p-4 bg-gray-950">
                            <TemplatePreview template={template} />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-2xl m-1">
                                <div className="bg-orange-500 text-white text-sm font-bold px-4 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                                    Apply Template
                                </div>
                            </div>
                        </div>

                        {/* Info */}
                        <div className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                    <h3 className="font-bold text-gray-900">{template.name}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{template.description}</p>
                                </div>
                                <Badge variant="outline" className="text-[10px] flex-shrink-0">{template.category}</Badge>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-3">
                                {template.zones.map(zone => (
                                    <span
                                        key={zone.id}
                                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${CONTENT_TYPE_COLORS[zone.content_type] || 'bg-gray-100 text-gray-600'}`}
                                    >
                                        {zone.content_type}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Apply Dialog */}
            <Dialog open={showApplyDialog} onOpenChange={(open) => { setShowApplyDialog(open); if (!open) { setSelectedTemplate(null); setTargetScreen(''); } }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-orange-500" />
                            Apply Layout Template
                        </DialogTitle>
                    </DialogHeader>
                    {selectedTemplate && (
                        <div className="space-y-5">
                            <TemplatePreview template={selectedTemplate} />

                            <div>
                                <p className="font-bold text-gray-900">{selectedTemplate.name}</p>
                                <p className="text-sm text-gray-500 mt-0.5">{selectedTemplate.description}</p>
                            </div>

                            <div className="bg-gray-50 rounded-xl p-3">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Zones in this template</p>
                                <div className="space-y-1.5">
                                    {selectedTemplate.zones.map(zone => (
                                        <div key={zone.id} className="flex items-center justify-between text-sm">
                                            <span className="text-gray-700 font-medium">{zone.label}</span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CONTENT_TYPE_COLORS[zone.content_type] || 'bg-gray-100 text-gray-600'}`}>
                                                {zone.content_type}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-bold text-gray-700 block mb-2">Apply to screen</label>
                                {screens.length === 0 ? (
                                    <p className="text-sm text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        No screens set up yet. Add a screen in the Playlists section first.
                                    </p>
                                ) : (
                                    <Select value={targetScreen} onValueChange={setTargetScreen}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a screen..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {screens.map(s => (
                                                <SelectItem key={s.id} value={s.screen_name}>{s.screen_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    onClick={handleApply}
                                    disabled={!targetScreen || updateScreenMutation.isPending}
                                    className="flex-1 bg-orange-500 hover:bg-orange-600"
                                >
                                    <Check className="h-4 w-4 mr-2" />
                                    {updateScreenMutation.isPending ? 'Applying...' : 'Apply Template'}
                                </Button>
                                <Button variant="outline" onClick={() => { setShowApplyDialog(false); setSelectedTemplate(null); setTargetScreen(''); }}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}