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

// Descriptions for display (not stored in shared file)
const TEMPLATE_DESCRIPTIONS = {
    fullscreen: 'Single content fills the entire display — great for video or hero imagery',
    split_lr: 'Two equal zones side by side — good for comparing products or dual messaging',
    split_tb: 'Large promo area with bottom announcement ticker',
    main_sidebar: 'Large media area with a narrower info panel on the right',
    menu_board: 'Full-screen menu display with branded header strip',
    live_orders: 'Real-time order queue display with promo sidebar',
    three_col: 'Three equal zones — ideal for showcasing multiple specials',
    weather_overlay: 'Full media background with weather widget inset',
    split_header: 'Branded header with two content zones below',
    promo_grid: 'Four-zone grid — show multiple promotions simultaneously',
    featured_sidebar: 'Wide featured media with a slim widget sidebar',
    portrait_fullscreen: 'Single full-screen zone for portrait displays — ideal for vertical video',
    portrait_menu_full: 'Full menu display optimised for portrait screens with branding header',
    portrait_menu_ticker: 'Portrait menu board with a promotional ticker at the bottom',
    portrait_orders: 'Order collection display for portrait screens with branding and live queue',
    portrait_split: 'Two stacked zones — top for media, bottom for menu or info',
    portrait_promo_stack: 'Three stacked promo zones — great for showcasing deals vertically',
    portrait_weather_menu: 'Weather & clock widgets at top with menu board below',
};

export function TemplatePreview({ template, size = 'md' }) {
    const isPortrait = template.portrait;
    const h = size === 'sm' ? 80 : 130;
    const style = isPortrait
        ? { height: h * 1.6, maxWidth: h, margin: '0 auto' }
        : { height: h };
    return (
        <div className="bg-gray-900 rounded-xl overflow-hidden relative" style={style}>
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
            data: { layout_template: { name: selectedTemplate.name, zones: selectedTemplate.zones } }
        });
    };

    const filteredTemplates = selectedCategory === 'All'
        ? LAYOUT_TEMPLATES
        : LAYOUT_TEMPLATES.filter(t => t.category === selectedCategory);

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Template Gallery</h1>
                <p className="text-gray-500 text-sm mt-1">{LAYOUT_TEMPLATES.length} professional screen layouts ready to apply</p>
            </div>

            <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                            selectedCategory === cat ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredTemplates.map(template => (
                    <div
                        key={template.id}
                        onClick={() => { setSelectedTemplate(template); setShowApplyDialog(true); }}
                        className="bg-white rounded-2xl border border-gray-200 overflow-hidden cursor-pointer hover:border-orange-400 hover:shadow-lg transition-all group"
                    >
                        <div className="relative p-4 bg-gray-950">
                            <TemplatePreview template={template} />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-2xl m-1">
                                <div className="bg-orange-500 text-white text-sm font-bold px-4 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                                    Apply Template
                                </div>
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                    <h3 className="font-bold text-gray-900">{template.name}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{TEMPLATE_DESCRIPTIONS[template.id] || ''}</p>
                                </div>
                                <Badge variant="outline" className="text-[10px] flex-shrink-0">{template.category}</Badge>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-3">
                                {template.zones.map(zone => (
                                    <span key={zone.id} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${CONTENT_TYPE_COLORS[zone.content_type] || 'bg-gray-100 text-gray-600'}`}>
                                        {zone.content_type}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

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
                                <p className="text-sm text-gray-500 mt-0.5">{TEMPLATE_DESCRIPTIONS[selectedTemplate.id]}</p>
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
                                <label className="text-sm font-bold text-gray-700 block mb-2">Apply to screen (sets default)</label>
                                {screens.length === 0 ? (
                                    <p className="text-sm text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        No screens set up yet. Add a screen in the Playlists section first.
                                    </p>
                                ) : (
                                    <Select value={targetScreen} onValueChange={setTargetScreen}>
                                        <SelectTrigger><SelectValue placeholder="Select a screen..." /></SelectTrigger>
                                        <SelectContent>
                                            {screens.map(s => (
                                                <SelectItem key={s.id} value={s.screen_name}>{s.screen_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleApply} disabled={!targetScreen || updateScreenMutation.isPending} className="flex-1 bg-orange-500 hover:bg-orange-600">
                                    <Check className="h-4 w-4 mr-2" />
                                    {updateScreenMutation.isPending ? 'Applying...' : 'Apply as Default'}
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