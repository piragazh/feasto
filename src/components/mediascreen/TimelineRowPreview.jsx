import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';

const TYPE_META = {
    menu:          { label: 'Menu',        bg: 'bg-blue-900',    icon: '🍽️' },
    video:         { label: 'Video',       bg: 'bg-gray-950',    icon: '🎬' },
    span_video:    { label: 'Span Video',  bg: 'bg-gray-950',    icon: '🎬' },
    span_menu:     { label: 'Span Menu',   bg: 'bg-blue-900',    icon: '🍽️' },
    widget_time:   { label: 'Clock',       bg: 'bg-slate-900',   icon: '🕐' },
    widget_weather:{ label: 'Weather',     bg: 'bg-sky-900',     icon: '🌤️' },
    widget_orders: { label: 'Live Orders', bg: 'bg-emerald-900', icon: '📦' },
};

// ── Widget mock renderers ─────────────────────────────────────────────────────
function ClockWidget({ slot }) {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const is12h = slot?.clock_format === '12h';
    const timeStr = is12h ? format(now, 'hh:mm') : format(now, 'HH:mm');
    const ampm = is12h ? format(now, 'a') : null;
    const secs = format(now, 'ss');

    const dateStr = (() => {
        switch (slot?.date_format) {
            case 'none':    return null;
            case 'short':   return format(now, 'd MMM yyyy');
            case 'numeric': return format(now, 'dd/MM/yyyy');
            default:        return format(now, 'EEEE, d MMMM yyyy');
        }
    })();

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white select-none">
            <div className="flex items-end gap-2">
                <div className="text-5xl font-bold tabular-nums tracking-tight">{timeStr}</div>
                {ampm && <div className="text-xl font-semibold opacity-70 pb-1">{ampm}</div>}
            </div>
            <div className="text-lg opacity-60 mt-1">{secs}s</div>
            {dateStr && <div className="text-sm opacity-50 mt-2">{dateStr}</div>}
        </div>
    );
}

function WeatherWidget({ slot }) {
    const location = slot?.weather_location || 'Restaurant location';
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-800 to-sky-500 text-white select-none">
            <div className="text-5xl mb-2">🌤️</div>
            <div className="text-4xl font-bold">14°C</div>
            <div className="text-sm opacity-80 mt-1">Partly Cloudy</div>
            <div className="text-xs opacity-60 mt-2 bg-black/20 px-3 py-1 rounded-full">📍 {location}</div>
        </div>
    );
}

const STATUS_STYLE = {
    confirmed:            { label: 'Confirmed',       color: 'text-blue-300',   bg: 'bg-blue-500/20',   border: 'border-blue-500/30' },
    preparing:            { label: 'Preparing',       color: 'text-yellow-300', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30' },
    ready_for_collection: { label: 'Ready ✓',         color: 'text-green-300',  bg: 'bg-green-500/20',  border: 'border-green-500/30' },
    out_for_delivery:     { label: 'Out for Delivery', color: 'text-purple-300', bg: 'bg-purple-500/20', border: 'border-purple-500/30' },
};

const MOCK_ORDERS = {
    confirmed:            ['#A1048', '#A1049'],
    preparing:            ['#A1042', '#A1043', '#A1044'],
    ready_for_collection: ['#A1039', '#A1040'],
    out_for_delivery:     ['#A1035'],
};

function OrdersWidget({ slot }) {
    const statuses = slot?.order_statuses?.length ? slot.order_statuses : ['preparing', 'ready_for_collection'];
    const cols = statuses.length <= 2 ? statuses.length : 2;
    return (
        <div className="w-full h-full flex flex-col bg-gray-950 text-white p-4 select-none overflow-hidden">
            <h3 className="text-sm font-bold uppercase tracking-widest opacity-50 mb-3">Collection Orders</h3>
            <div className={`grid gap-3 flex-1 overflow-hidden`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {statuses.map(s => {
                    const style = STATUS_STYLE[s] || STATUS_STYLE.preparing;
                    const orders = MOCK_ORDERS[s] || [];
                    return (
                        <div key={s}>
                            <div className={`text-xs font-semibold mb-2 uppercase tracking-wide ${style.color}`}>{style.label}</div>
                            <div className="space-y-1.5">
                                {orders.map(n => (
                                    <div key={n} className={`${style.bg} border ${style.border} rounded-lg px-3 py-2 ${style.color} font-mono text-sm font-bold`}>{n}</div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const ALL_MOCK_ITEMS = [
    { name: 'Classic Burger', price: '£10.99', cat: 'Burgers', img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=80&h=80&fit=crop' },
    { name: 'Chicken Wrap',   price: '£8.99',  cat: 'Wraps',   img: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=80&h=80&fit=crop' },
    { name: 'Loaded Fries',   price: '£4.99',  cat: 'Sides',   img: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=80&h=80&fit=crop' },
    { name: 'Milkshake',      price: '£3.99',  cat: 'Drinks',  img: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=80&h=80&fit=crop' },
    { name: 'Veggie Burger',  price: '£9.99',  cat: 'Burgers', img: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=80&h=80&fit=crop' },
    { name: 'Onion Rings',    price: '£3.49',  cat: 'Sides',   img: 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=80&h=80&fit=crop' },
    { name: 'Fish Tacos',     price: '£11.49', cat: 'Mains',   img: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=80&h=80&fit=crop' },
    { name: 'Lemonade',       price: '£2.99',  cat: 'Drinks',  img: 'https://images.unsplash.com/photo-1523677011781-c91d1bbe2f9e?w=80&h=80&fit=crop' },
];

function MenuWidget({ slot }) {
    const selectedCats = slot?.menu_categories || [];
    const showImages = slot?.menu_display_images || false;
    const items = selectedCats.length > 0
        ? ALL_MOCK_ITEMS.filter(i => selectedCats.includes(i.cat))
        : ALL_MOCK_ITEMS;

    // Group by category
    const grouped = items.reduce((acc, item) => {
        if (!acc[item.cat]) acc[item.cat] = [];
        acc[item.cat].push(item);
        return acc;
    }, {});

    return (
        <div className="w-full h-full flex flex-col bg-gray-950 text-white overflow-hidden select-none">
            <div className="bg-orange-500 px-4 py-2 flex items-center justify-between flex-shrink-0">
                <span className="font-bold text-sm tracking-wide">MENU</span>
                <span className="text-xs opacity-80">
                    {selectedCats.length > 0 ? selectedCats.join(', ') : 'All Categories'}
                </span>
            </div>
            <div className="flex-1 overflow-hidden p-2">
                {Object.entries(grouped).map(([cat, catItems]) => (
                    <div key={cat} className="mb-2">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-orange-400 opacity-70 mb-1 px-1">{cat}</div>
                        <div className={`grid gap-1.5 ${showImages ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            {catItems.map((item, i) => (
                                <div key={i} className="bg-white/5 rounded-lg flex items-center gap-2 overflow-hidden">
                                    {showImages && (
                                        <img src={item.img} alt={item.name} className="h-10 w-10 object-cover flex-shrink-0" />
                                    )}
                                    <div className="flex-1 px-2 py-1.5 flex justify-between items-center min-w-0">
                                        <p className="text-[10px] font-semibold truncate">{item.name}</p>
                                        <p className="text-orange-400 font-bold text-[10px] ml-2 flex-shrink-0">{item.price}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="text-center text-[10px] opacity-30 pb-1">Preview — real menu shown on screen</div>
        </div>
    );
}

function VideoWidget({ mediaUrl }) {
    if (!mediaUrl) return (
        <div className="w-full h-full flex items-center justify-center bg-gray-950 text-white flex-col gap-2">
            <span className="text-4xl">🎬</span>
            <span className="text-xs opacity-50">No file selected</span>
        </div>
    );
    const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(mediaUrl) || mediaUrl.includes('video');
    return isVideo
        ? <video src={mediaUrl} autoPlay loop muted className="w-full h-full object-cover" />
        : <img src={mediaUrl} alt="media" className="w-full h-full object-cover" />;
}

function SlotContent({ slot }) {
    if (!slot) return null;
    switch (slot.type) {
        case 'widget_time':    return <ClockWidget slot={slot} />;
        case 'widget_weather': return <WeatherWidget slot={slot} />;
        case 'widget_orders':  return <OrdersWidget slot={slot} />;
        case 'menu':
        case 'span_menu':      return <MenuWidget slot={slot} />;
        case 'video':
        case 'span_video':     return <VideoWidget mediaUrl={slot.media_url} />;
        default:               return <MenuWidget />;
    }
}

// ── Main preview component ─────────────────────────────────────────────────────
export default function TimelineRowPreview({ open, onClose, row, numScreens, rowIndex }) {
    if (!row) return null;

    // Build renderable slots (collapse __spanned__ entries)
    const rendered = [];
    let si = 0;
    while (si < numScreens) {
        const slot = row.slots[si];
        if (slot === '__spanned__') { si++; continue; }
        if (slot && typeof slot === 'object') {
            rendered.push({ si, slot, colSpan: slot.span || 1 });
            si += slot.span || 1;
        } else {
            rendered.push({ si, slot: null, colSpan: 1 });
            si++;
        }
    }

    const totalWeight = rendered.reduce((s, c) => s + c.colSpan, 0);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl p-0 overflow-hidden rounded-2xl">
                <DialogHeader className="px-5 pt-4 pb-3 border-b bg-gray-50">
                    <DialogTitle className="flex items-center gap-3 text-base">
                        <span>Row {rowIndex + 1} Preview</span>
                        <Badge variant="outline" className="text-xs font-normal">
                            {row.duration > 0 ? `${row.duration}s` : '∞'} · {row.transition}
                        </Badge>
                        <span className="text-xs text-gray-400 font-normal ml-auto">
                            {numScreens} screen{numScreens !== 1 ? 's' : ''} · 16:9
                        </span>
                    </DialogTitle>
                </DialogHeader>

                {/* Wall preview */}
                <div className="p-4 bg-gray-100">
                    {/* Simulated "wall" - 16:9 aspect per screen panel */}
                    <div className="flex gap-1 w-full rounded-xl overflow-hidden shadow-2xl border border-gray-800" style={{ aspectRatio: `${numScreens * 16} / 9` }}>
                        {rendered.map(({ si: sIdx, slot, colSpan }) => {
                            const meta = TYPE_META[slot?.type] || TYPE_META.menu;
                            const widthPct = (colSpan / totalWeight) * 100;
                            return (
                                <div
                                    key={sIdx}
                                    className="relative overflow-hidden flex-shrink-0"
                                    style={{ width: `${widthPct}%` }}
                                >
                                    {/* Bezel separator (except first) */}
                                    {sIdx > 0 && (
                                        <div className="absolute inset-y-0 left-0 w-0.5 bg-black z-10" />
                                    )}

                                    {/* Screen label overlay */}
                                    <div className="absolute top-1.5 left-1.5 z-20 flex gap-1">
                                        {Array.from({ length: colSpan }, (_, k) => (
                                            <span key={k} className="text-[9px] bg-black/50 text-white px-1 py-0.5 rounded font-mono">
                                                S{sIdx + k + 1}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Content */}
                                    <div className="w-full h-full">
                                        {slot ? (
                                            <SlotContent slot={slot} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-600">
                                                <span className="text-xs">Empty</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-2 mt-3">
                        {rendered.filter(r => r.slot).map(({ si: sIdx, slot, colSpan }) => (
                            <div key={sIdx} className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 shadow-sm border text-xs">
                                <span>{TYPE_META[slot.type]?.icon}</span>
                                <span className="font-medium">{slot.title}</span>
                                <Badge variant="outline" className="text-[10px] font-normal px-1">
                                    {colSpan > 1 ? `Screens ${sIdx + 1}–${sIdx + colSpan}` : `Screen ${sIdx + 1}`}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] font-normal px-1 text-gray-400">
                                    {TYPE_META[slot.type]?.label}
                                </Badge>
                            </div>
                        ))}
                        {rendered.filter(r => !r.slot).length > 0 && (
                            <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 shadow-sm border text-xs text-gray-400">
                                {rendered.filter(r => !r.slot).length} empty slot{rendered.filter(r => !r.slot).length > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}