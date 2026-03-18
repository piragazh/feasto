import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Plus, Trash2, Edit, Cloud, Clock, ShoppingBag,
    TrendingUp, Users, Timer, Check, Eye, Zap, UtensilsCrossed
} from 'lucide-react';
import { toast } from 'sonner';
import WidgetRenderer from './WidgetRenderer';

function MenuCategorySelect({ restaurantId, value, onChange }) {
    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items-categories', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });
    const categories = ['all', ...new Set(menuItems.map(i => i.category).filter(Boolean))];
    return (
        <div>
            <Label>Category Filter</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                    {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

const WIDGET_TYPES = [
    { id: 'weather', label: 'Weather', icon: Cloud, desc: 'Real-time localized weather conditions', color: 'from-sky-500 to-blue-600' },
    { id: 'clock', label: 'Clock', icon: Clock, desc: 'Live time & date display', color: 'from-violet-500 to-purple-600' },
    { id: 'orders', label: 'Live Orders', icon: ShoppingBag, desc: 'Real-time order status board', color: 'from-amber-500 to-orange-600' },
    { id: 'stock_ticker', label: 'Stock Ticker', icon: TrendingUp, desc: 'Live market price scrolling ticker', color: 'from-emerald-500 to-green-600' },
    { id: 'queue_status', label: 'Queue Status', icon: Users, desc: 'Customer queue & wait times', color: 'from-orange-500 to-red-500' },
    { id: 'countdown_timer', label: 'Countdown Timer', icon: Timer, desc: 'Promotional countdown to an event', color: 'from-pink-500 to-rose-600' },
    { id: 'menu_widget', label: 'Menu Board', icon: UtensilsCrossed, desc: 'Live menu items — auto-syncs prices & availability', color: 'from-teal-500 to-cyan-600' },
];

const DEFAULT_SETTINGS = {
    weather: { location: 'London, UK', units: 'metric', show_forecast: false, theme: 'dark' },
    clock: { format: '24h', show_seconds: true, show_date: true, timezone: '', theme: 'dark' },
    orders: { display_mode: 'preparing', max_orders: 5, show_customer_name: false, auto_refresh_interval: 30 },
    stock_ticker: { symbols: ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN'], refresh_interval: 60, show_change: true, scroll_speed: 'medium', theme: 'dark' },
    queue_status: { queue_label: 'Now Serving', max_display: 6, show_wait_time: true, avg_wait_minutes: 10, status_filter: 'preparing', theme: 'dark' },
    countdown_timer: { target_date: '', title: 'Offer Ends In', subtitle: '', message_after: '🎉 Offer Ended!', theme: 'dark', show_seconds: true },
    menu_widget: { title: 'Our Menu', category_filter: 'all', max_items: 12, columns: 2, show_prices: true, show_images: true, show_unavailable: false, theme: 'dark', refresh_interval: 60 },
};

export default function StudioWidgets({ restaurantId }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [previewWidget, setPreviewWidget] = useState(null);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', widget_type: 'weather', settings: DEFAULT_SETTINGS.weather });

    const { data: configs = [] } = useQuery({
        queryKey: ['widget-configurations', restaurantId],
        queryFn: () => base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const createMutation = useMutation({
        mutationFn: (d) => base44.entities.WidgetConfiguration.create(d),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['widget-configurations', restaurantId] }); toast.success('Widget created'); closeDialog(); }
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.WidgetConfiguration.update(id, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['widget-configurations', restaurantId] }); toast.success('Widget updated'); closeDialog(); }
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.WidgetConfiguration.delete(id),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['widget-configurations', restaurantId] }); toast.success('Widget deleted'); }
    });

    const closeDialog = () => { setShowDialog(false); setEditing(null); setForm({ name: '', widget_type: 'weather', settings: DEFAULT_SETTINGS.weather }); };

    const openNew = (type) => {
        setEditing(null);
        setForm({ name: '', widget_type: type, settings: { ...DEFAULT_SETTINGS[type] } });
        setShowDialog(true);
    };

    const openEdit = (config) => {
        setEditing(config);
        setForm({
            name: config.name,
            widget_type: config.widget_type,
            settings: { ...(DEFAULT_SETTINGS[config.widget_type] || {}), ...(config.settings?.[config.widget_type] || {}) }
        });
        setShowDialog(true);
    };

    const handleSave = () => {
        if (!form.name.trim()) { toast.error('Please enter a name'); return; }
        const data = {
            restaurant_id: restaurantId,
            name: form.name,
            widget_type: form.widget_type,
            settings: { [form.widget_type]: form.settings },
            is_active: true
        };
        if (editing) updateMutation.mutate({ id: editing.id, data });
        else createMutation.mutate(data);
    };

    const updateSetting = (key, value) => setForm(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }));

    const widgetTypeInfo = WIDGET_TYPES.find(w => w.id === form.widget_type);
    const getConfigsByType = (type) => configs.filter(c => c.widget_type === type);

    return (
        <div className="p-6 space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Live Data Widgets</h1>
                <p className="text-gray-500 text-sm mt-1">Configure real-time overlays to embed into your screen layouts</p>
            </div>

            {/* Widget type cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {WIDGET_TYPES.map(type => {
                    const Icon = type.icon;
                    const typeConfigs = getConfigsByType(type.id);
                    return (
                        <div key={type.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            {/* Header */}
                            <div className={`bg-gradient-to-br ${type.color} p-5`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                            <Icon className="h-5 w-5 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white">{type.label}</h3>
                                            <p className="text-white/70 text-xs">{type.desc}</p>
                                        </div>
                                    </div>
                                    <Button size="sm" variant="ghost" onClick={() => openNew(type.id)} className="h-8 w-8 p-0 text-white hover:bg-white/20 rounded-full">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Configured instances */}
                            <div className="p-4">
                                {typeConfigs.length === 0 ? (
                                    <button
                                        onClick={() => openNew(type.id)}
                                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors font-medium"
                                    >
                                        + Add {type.label} Widget
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        {typeConfigs.map(cfg => (
                                            <div key={cfg.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 truncate">{cfg.name}</p>
                                                    <p className="text-[11px] text-gray-400">
                                                        {cfg.widget_type === 'stock_ticker' && (cfg.settings?.stock_ticker?.symbols || []).slice(0, 3).join(', ')}
                                                        {cfg.widget_type === 'weather' && cfg.settings?.weather?.location}
                                                        {cfg.widget_type === 'countdown_timer' && cfg.settings?.countdown_timer?.title}
                                                        {cfg.widget_type === 'queue_status' && cfg.settings?.queue_status?.queue_label}
                                                        {cfg.widget_type === 'clock' && cfg.settings?.clock?.format + ' format'}
                                                        {cfg.widget_type === 'orders' && cfg.settings?.orders?.display_mode}
                                                                                        {cfg.widget_type === 'menu_widget' && (cfg.settings?.menu_widget?.category_filter === 'all' ? 'All categories' : cfg.settings?.menu_widget?.category_filter)}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button size="sm" variant="ghost" onClick={() => setPreviewWidget(cfg)} className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600" title="Preview">
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => openEdit(cfg)} className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700">
                                                        <Edit className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(cfg.id)} className="h-7 w-7 p-0 text-gray-400 hover:text-red-600">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                        <button onClick={() => openNew(type.id)} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium">
                                            + Add another
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-5 w-5 text-white" />
                </div>
                <div>
                    <p className="font-bold text-blue-900 text-sm">How to use widgets</p>
                    <p className="text-blue-700 text-xs mt-1 leading-relaxed">
                        Create a widget configuration above, then apply a <strong>Layout Template</strong> to your screen that includes widget zones (e.g. "Weather Overlay", "Featured + Slim Sidebar"). The widget will be rendered live based on the zone's content type.
                    </p>
                </div>
            </div>

            {/* Edit/Create Dialog */}
            <Dialog open={showDialog} onOpenChange={(o) => !o && closeDialog()}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {widgetTypeInfo && React.createElement(widgetTypeInfo.icon, { className: 'h-5 w-5 text-orange-500' })}
                            {editing ? 'Edit' : 'New'} {widgetTypeInfo?.label} Widget
                        </DialogTitle>
                        <DialogDescription>Configure the settings for this widget.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                        <div>
                            <Label className="text-sm font-semibold">Widget Name</Label>
                            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={`e.g., ${widgetTypeInfo?.label} — Main Screen`} className="mt-1.5" />
                        </div>

                        <div className="border-t pt-5">
                            <p className="text-sm font-bold text-gray-700 mb-4">Settings</p>

                            {/* WEATHER */}
                            {form.widget_type === 'weather' && (
                                <div className="space-y-4">
                                    <div><Label>Location</Label>
                                        <Input value={form.settings.location || ''} onChange={e => updateSetting('location', e.target.value)} placeholder="e.g., London, UK" className="mt-1.5" /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label>Units</Label>
                                            <Select value={form.settings.units || 'metric'} onValueChange={v => updateSetting('units', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="metric">Metric (°C)</SelectItem>
                                                    <SelectItem value="imperial">Imperial (°F)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div><Label>Theme</Label>
                                            <Select value={form.settings.theme || 'dark'} onValueChange={v => updateSetting('theme', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="dark">Dark</SelectItem>
                                                    <SelectItem value="light">Light</SelectItem>
                                                    <SelectItem value="transparent">Transparent</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Switch checked={!!form.settings.show_forecast} onCheckedChange={v => updateSetting('show_forecast', v)} />
                                        <Label>Show Forecast</Label>
                                    </div>
                                </div>
                            )}

                            {/* CLOCK */}
                            {form.widget_type === 'clock' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label>Format</Label>
                                            <Select value={form.settings.format || '24h'} onValueChange={v => updateSetting('format', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="24h">24-hour</SelectItem>
                                                    <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div><Label>Theme</Label>
                                            <Select value={form.settings.theme || 'dark'} onValueChange={v => updateSetting('theme', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="dark">Dark</SelectItem>
                                                    <SelectItem value="light">Light</SelectItem>
                                                    <SelectItem value="transparent">Transparent</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div><Label>Timezone (optional)</Label>
                                        <Input value={form.settings.timezone || ''} onChange={e => updateSetting('timezone', e.target.value)} placeholder="e.g., Europe/London" className="mt-1.5" /></div>
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-3"><Switch checked={form.settings.show_seconds !== false} onCheckedChange={v => updateSetting('show_seconds', v)} /><Label>Show Seconds</Label></div>
                                        <div className="flex items-center gap-3"><Switch checked={form.settings.show_date !== false} onCheckedChange={v => updateSetting('show_date', v)} /><Label>Show Date</Label></div>
                                    </div>
                                </div>
                            )}

                            {/* ORDERS */}
                            {form.widget_type === 'orders' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label>Display Mode</Label>
                                            <Select value={form.settings.display_mode || 'preparing'} onValueChange={v => updateSetting('display_mode', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="preparing">Preparing</SelectItem>
                                                    <SelectItem value="pending">Pending</SelectItem>
                                                    <SelectItem value="recent">Recent</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div><Label>Max Orders</Label>
                                            <Input type="number" min={1} max={20} value={form.settings.max_orders || 5} onChange={e => updateSetting('max_orders', parseInt(e.target.value)||5)} className="mt-1.5" /></div>
                                    </div>
                                    <div><Label>Refresh Interval (seconds)</Label>
                                        <Input type="number" min={5} value={form.settings.auto_refresh_interval || 30} onChange={e => updateSetting('auto_refresh_interval', parseInt(e.target.value)||30)} className="mt-1.5" /></div>
                                    <div className="flex items-center gap-3"><Switch checked={!!form.settings.show_customer_name} onCheckedChange={v => updateSetting('show_customer_name', v)} /><Label>Show Customer Names</Label></div>
                                </div>
                            )}

                            {/* STOCK TICKER */}
                            {form.widget_type === 'stock_ticker' && (
                                <div className="space-y-4">
                                    <div><Label>Stock Symbols (comma separated)</Label>
                                        <Input
                                            value={(form.settings.symbols || []).join(', ')}
                                            onChange={e => updateSetting('symbols', e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))}
                                            placeholder="AAPL, MSFT, GOOGL, TSLA, AMZN"
                                            className="mt-1.5 font-mono"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">Use Yahoo Finance ticker symbols. e.g. AAPL, MSFT, GOOGL, BTC-USD, GBP=X</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div><Label>Refresh (seconds)</Label>
                                            <Input type="number" min={30} value={form.settings.refresh_interval || 60} onChange={e => updateSetting('refresh_interval', parseInt(e.target.value)||60)} className="mt-1.5" /></div>
                                        <div><Label>Scroll Speed</Label>
                                            <Select value={form.settings.scroll_speed || 'medium'} onValueChange={v => updateSetting('scroll_speed', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="slow">Slow</SelectItem>
                                                    <SelectItem value="medium">Medium</SelectItem>
                                                    <SelectItem value="fast">Fast</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div><Label>Theme</Label>
                                            <Select value={form.settings.theme || 'dark'} onValueChange={v => updateSetting('theme', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="dark">Dark</SelectItem>
                                                    <SelectItem value="light">Light</SelectItem>
                                                    <SelectItem value="finance">Finance</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3"><Switch checked={form.settings.show_change !== false} onCheckedChange={v => updateSetting('show_change', v)} /><Label>Show Price Change %</Label></div>
                                </div>
                            )}

                            {/* QUEUE STATUS */}
                            {form.widget_type === 'queue_status' && (
                                <div className="space-y-4">
                                    <div><Label>Queue Label</Label>
                                        <Input value={form.settings.queue_label || ''} onChange={e => updateSetting('queue_label', e.target.value)} placeholder="e.g., Now Serving" className="mt-1.5" /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label>Max Entries Shown</Label>
                                            <Input type="number" min={1} max={20} value={form.settings.max_display || 6} onChange={e => updateSetting('max_display', parseInt(e.target.value)||6)} className="mt-1.5" /></div>
                                        <div><Label>Avg Wait (minutes)</Label>
                                            <Input type="number" min={1} value={form.settings.avg_wait_minutes || 10} onChange={e => updateSetting('avg_wait_minutes', parseInt(e.target.value)||10)} className="mt-1.5" /></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label>Order Status Filter</Label>
                                            <Select value={form.settings.status_filter || 'preparing'} onValueChange={v => updateSetting('status_filter', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="preparing">Preparing</SelectItem>
                                                    <SelectItem value="ready">Ready for Collection</SelectItem>
                                                    <SelectItem value="all_active">All Active</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div><Label>Theme</Label>
                                            <Select value={form.settings.theme || 'dark'} onValueChange={v => updateSetting('theme', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="dark">Dark</SelectItem>
                                                    <SelectItem value="light">Light</SelectItem>
                                                    <SelectItem value="branded">Branded (Orange)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3"><Switch checked={form.settings.show_wait_time !== false} onCheckedChange={v => updateSetting('show_wait_time', v)} /><Label>Show Estimated Wait Times</Label></div>
                                </div>
                            )}

                            {/* MENU WIDGET */}
                                    {form.widget_type === 'menu_widget' && (
                                        <div className="space-y-4">
                                            <div><Label>Display Title</Label>
                                                <Input value={form.settings.title || ''} onChange={e => updateSetting('title', e.target.value)} placeholder="e.g., Our Menu" className="mt-1.5" /></div>
                                            <MenuCategorySelect
                                                restaurantId={restaurantId}
                                                value={form.settings.category_filter || 'all'}
                                                onChange={v => updateSetting('category_filter', v)}
                                            />
                                            <div className="grid grid-cols-3 gap-4">
                                                <div><Label>Max Items</Label>
                                                    <Input type="number" min={1} max={50} value={form.settings.max_items || 12} onChange={e => updateSetting('max_items', parseInt(e.target.value)||12)} className="mt-1.5" /></div>
                                                <div><Label>Columns</Label>
                                                    <Select value={String(form.settings.columns || 2)} onValueChange={v => updateSetting('columns', parseInt(v))}>
                                                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="1">1 Column</SelectItem>
                                                            <SelectItem value="2">2 Columns</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div><Label>Theme</Label>
                                                    <Select value={form.settings.theme || 'dark'} onValueChange={v => updateSetting('theme', v)}>
                                                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="dark">Dark</SelectItem>
                                                            <SelectItem value="light">Light</SelectItem>
                                                            <SelectItem value="branded">Branded</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                            <div><Label>Auto-refresh interval (seconds)</Label>
                                                <Input type="number" min={10} value={form.settings.refresh_interval || 60} onChange={e => updateSetting('refresh_interval', parseInt(e.target.value)||60)} className="mt-1.5" /></div>
                                            <div className="flex flex-wrap gap-6">
                                                <div className="flex items-center gap-3"><Switch checked={form.settings.show_prices !== false} onCheckedChange={v => updateSetting('show_prices', v)} /><Label>Show Prices</Label></div>
                                                <div className="flex items-center gap-3"><Switch checked={form.settings.show_images !== false} onCheckedChange={v => updateSetting('show_images', v)} /><Label>Show Images</Label></div>
                                                <div className="flex items-center gap-3"><Switch checked={!!form.settings.show_unavailable} onCheckedChange={v => updateSetting('show_unavailable', v)} /><Label>Show Unavailable Items</Label></div>
                                            </div>
                                        </div>
                                    )}

                             {/* COUNTDOWN TIMER */}
                            {form.widget_type === 'countdown_timer' && (
                                <div className="space-y-4">
                                    <div><Label>Title</Label>
                                        <Input value={form.settings.title || ''} onChange={e => updateSetting('title', e.target.value)} placeholder="e.g., Happy Hour Ends In" className="mt-1.5" /></div>
                                    <div><Label>Target Date & Time</Label>
                                        <Input type="datetime-local" value={form.settings.target_date ? form.settings.target_date.slice(0, 16) : ''} onChange={e => updateSetting('target_date', e.target.value ? new Date(e.target.value).toISOString() : '')} className="mt-1.5" /></div>
                                    <div><Label>Subtitle (optional)</Label>
                                        <Input value={form.settings.subtitle || ''} onChange={e => updateSetting('subtitle', e.target.value)} placeholder="e.g., 50% off all drinks" className="mt-1.5" /></div>
                                    <div><Label>Message After Countdown</Label>
                                        <Input value={form.settings.message_after || ''} onChange={e => updateSetting('message_after', e.target.value)} placeholder="e.g., 🎉 Offer Ended!" className="mt-1.5" /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label>Theme</Label>
                                            <Select value={form.settings.theme || 'dark'} onValueChange={v => updateSetting('theme', v)}>
                                                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="dark">Dark</SelectItem>
                                                    <SelectItem value="light">Light</SelectItem>
                                                    <SelectItem value="fire">Fire 🔥</SelectItem>
                                                    <SelectItem value="celebration">Celebration 🎉</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3"><Switch checked={form.settings.show_seconds !== false} onCheckedChange={v => updateSetting('show_seconds', v)} /><Label>Show Seconds</Label></div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-2 border-t">
                            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 bg-orange-500 hover:bg-orange-600">
                                <Check className="h-4 w-4 mr-2" />
                                {editing ? 'Save Changes' : 'Create Widget'}
                            </Button>
                            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={!!previewWidget} onOpenChange={(o) => !o && setPreviewWidget(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Widget Preview — {previewWidget?.name}</DialogTitle>
                    </DialogHeader>
                    {previewWidget && (
                        <div className="rounded-2xl overflow-hidden" style={{ height: previewWidget.widget_type === 'stock_ticker' ? 64 : 320 }}>
                            <WidgetRenderer
                                widgetType={previewWidget.widget_type}
                                config={previewWidget.settings?.[previewWidget.widget_type] || {}}
                                restaurantId={restaurantId}
                                className="h-full w-full"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}