import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Move, LayoutTemplate, CloudRain, Clock, UtensilsCrossed, Image, List, Tv, Star, AlignJustify } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const WIDGET_TYPES = [
    { value: 'media',       label: 'Media / Video',     icon: Image,          color: '#6366f1', desc: 'Image or video content' },
    { value: 'menu',        label: 'Menu Board',         icon: UtensilsCrossed, color: '#10b981', desc: 'Restaurant menu items' },
    { value: 'weather',     label: 'Weather',            icon: CloudRain,      color: '#0ea5e9', desc: 'Live weather widget' },
    { value: 'clock',       label: 'Clock & Date',       icon: Clock,          color: '#8b5cf6', desc: 'Real-time clock' },
    { value: 'live_orders', label: 'Live Orders',        icon: List,           color: '#f97316', desc: 'Order queue display' },
    { value: 'ticker',      label: 'Promo Ticker',       icon: AlignJustify,   color: '#f59e0b', desc: 'Scrolling text banner' },
    { value: 'branding',    label: 'Restaurant Brand',   icon: Star,           color: '#ec4899', desc: 'Logo & name' },
    { value: 'queue_status',label: 'Queue Status',       icon: Tv,             color: '#14b8a6', desc: 'Queue / serving numbers' },
];

const SNAP = 2; // snap to grid %

function snapVal(v) { return Math.round(v / SNAP) * SNAP; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

const RESIZE_HANDLES = [
    { id: 'se', cursor: 'se-resize', style: { bottom: -5, right: -5 } },
    { id: 'sw', cursor: 'sw-resize', style: { bottom: -5, left: -5 } },
    { id: 'ne', cursor: 'ne-resize', style: { top: -5, right: -5 } },
    { id: 'nw', cursor: 'nw-resize', style: { top: -5, left: -5 } },
    { id: 'n',  cursor: 'n-resize',  style: { top: -5, left: '50%', transform: 'translateX(-50%)' } },
    { id: 's',  cursor: 's-resize',  style: { bottom: -5, left: '50%', transform: 'translateX(-50%)' } },
    { id: 'e',  cursor: 'e-resize',  style: { right: -5, top: '50%', transform: 'translateY(-50%)' } },
    { id: 'w',  cursor: 'w-resize',  style: { left: -5, top: '50%', transform: 'translateY(-50%)' } },
];

let zoneCounter = 1;

export default function LayoutDesigner({ open, onClose, onSave, initialLayout, restaurantId }) {
    const [name, setName] = useState('');
    const [zones, setZones] = useState([]);
    const [selectedId, setSelectedId] = useState(null);

    const canvasRef = useRef(null);
    const dragRef = useRef(null); // { type:'move'|'resize', zoneId, handle, startX, startY, origZone }
    const didDragRef = useRef(false); // track if a real drag happened to suppress click-deselect

    // Load widget configurations for the current restaurant
    const { data: widgetConfigs = [] } = useQuery({
        queryKey: ['widgetConfigs', restaurantId],
        queryFn: () => restaurantId ? base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId, is_active: true }) : [],
        enabled: !!restaurantId && open,
    });

    // Init from initialLayout
    useEffect(() => {
        if (!open) return;
        if (initialLayout) {
            setName(initialLayout.name || '');
            // Normalize zones from either schema
            const rawZones = initialLayout.zones || [];
            setZones(rawZones.map((z, i) => ({
                id: z.id || `zone_${i}`,
                label: z.label || z.type || 'Zone',
                content_type: z.content_type || z.type || 'media',
                x: z.x ?? z.position?.x ?? 10,
                y: z.y ?? z.position?.y ?? 10,
                width: z.width ?? z.position?.width ?? 30,
                height: z.height ?? z.position?.height ?? 30,
                widget_config_id: z.widget_config_id || '',
            })));
        } else {
            setName('');
            setZones([]);
            setSelectedId(null);
        }
    }, [open, initialLayout]);

    const addZone = (type) => {
        const zone = {
            id: `zone_${Date.now()}_${zoneCounter++}`,
            label: WIDGET_TYPES.find(w => w.value === type)?.label || type,
            content_type: type,
            x: 10, y: 10, width: 35, height: 25,
            widget_config_id: '',
        };
        setZones(prev => [...prev, zone]);
        setSelectedId(zone.id);
    };

    const removeZone = (id) => {
        setZones(prev => prev.filter(z => z.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const updateZone = (id, patch) => {
        setZones(prev => prev.map(z => z.id === id ? { ...z, ...patch } : z));
    };

    // ── Mouse drag / resize ─────────────────────────────────────────────────
    const getPct = (clientX, clientY) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { px: 0, py: 0 };
        return {
            px: ((clientX - rect.left) / rect.width) * 100,
            py: ((clientY - rect.top) / rect.height) * 100,
        };
    };

    const onZoneMouseDown = (e, zoneId, handle = null) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedId(zoneId);
        didDragRef.current = false;
        const zone = zones.find(z => z.id === zoneId);
        dragRef.current = {
            type: handle ? 'resize' : 'move',
            zoneId,
            handle,
            startX: e.clientX,
            startY: e.clientY,
            origZone: { ...zone },
        };
    };

    const onMouseMove = useCallback((e) => {
        if (!dragRef.current) return;
        const { type, zoneId, handle, startX, startY, origZone } = dragRef.current;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const dx = ((e.clientX - startX) / rect.width) * 100;
        const dy = ((e.clientY - startY) / rect.height) * 100;

        if (type === 'move') {
            const nx = clamp(snapVal(origZone.x + dx), 0, 100 - origZone.width);
            const ny = clamp(snapVal(origZone.y + dy), 0, 100 - origZone.height);
            setZones(prev => prev.map(z => z.id === zoneId ? { ...z, x: nx, y: ny } : z));
        } else {
            let { x, y, width, height } = origZone;
            if (handle.includes('e')) width = clamp(snapVal(origZone.width + dx), 5, 100 - x);
            if (handle.includes('s')) height = clamp(snapVal(origZone.height + dy), 5, 100 - y);
            if (handle.includes('w')) {
                const newX = clamp(snapVal(origZone.x + dx), 0, origZone.x + origZone.width - 5);
                width = origZone.x + origZone.width - newX;
                x = newX;
            }
            if (handle.includes('n')) {
                const newY = clamp(snapVal(origZone.y + dy), 0, origZone.y + origZone.height - 5);
                height = origZone.y + origZone.height - newY;
                y = newY;
            }
            setZones(prev => prev.map(z => z.id === zoneId ? { ...z, x, y, width, height } : z));
        }
    }, []);

    const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    // ── Save ────────────────────────────────────────────────────────────────
    const handleSave = () => {
        if (!name.trim()) { toast.error('Enter a layout name'); return; }
        if (zones.length === 0) { toast.error('Add at least one zone'); return; }
        onSave({ name: name.trim(), zones });
        // onClose is called by parent's onSuccess handler after the mutation completes
    };

    const selectedZone = zones.find(z => z.id === selectedId);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-[96vw] w-full max-h-[96vh] h-full flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <LayoutTemplate className="h-5 w-5 text-orange-500" />
                        Custom Layout Designer
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* ── LEFT: Widget palette ────────────────────────── */}
                    <div className="w-44 flex-shrink-0 border-r bg-gray-50 overflow-y-auto p-3 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-gray-400 mb-2">Add Widget</p>
                        {WIDGET_TYPES.map(wt => {
                            const Icon = wt.icon;
                            return (
                                <button
                                    key={wt.value}
                                    onClick={() => addZone(wt.value)}
                                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200 group"
                                >
                                    <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: wt.color + '22' }}>
                                        <Icon className="h-3.5 w-3.5" style={{ color: wt.color }} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-gray-700 leading-tight">{wt.label}</p>
                                        <p className="text-[10px] text-gray-400 leading-tight">{wt.desc}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* ── CENTER: Canvas ──────────────────────────────── */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-900 p-4">
                        {/* Name */}
                        <div className="flex items-center gap-3 mb-3 flex-shrink-0">
                            <Input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Layout name (e.g. Menu Board)"
                                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 h-8 text-sm max-w-xs"
                            />
                            <span className="text-gray-400 text-xs">{zones.length} zone{zones.length !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Canvas */}
                        <div className="flex-1 flex items-center justify-center overflow-hidden">
                            <div
                                ref={canvasRef}
                                className="relative rounded-lg overflow-hidden select-none"
                                style={{
                                    aspectRatio: '16/9',
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    width: '100%',
                                    background: 'repeating-linear-gradient(0deg,transparent,transparent 39px,#374151 39px,#374151 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,#374151 39px,#374151 40px), #1f2937',
                                    cursor: 'default',
                                }}
                                onClick={() => setSelectedId(null)}
                            >
                                {zones.length === 0 && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none">
                                        <Plus className="h-8 w-8 mb-2 opacity-30" />
                                        <p className="text-sm opacity-50">Click a widget on the left to add it</p>
                                    </div>
                                )}

                                {zones.map(zone => {
                                    const wt = WIDGET_TYPES.find(w => w.value === zone.content_type);
                                    const Icon = wt?.icon || Image;
                                    const color = wt?.color || '#6366f1';
                                    const isSelected = selectedId === zone.id;

                                    return (
                                        <div
                                            key={zone.id}
                                            className={`absolute flex flex-col items-center justify-center transition-shadow ${isSelected ? 'shadow-[0_0_0_2px_white,0_0_0_4px_#f97316]' : 'shadow-[0_0_0_1px_rgba(255,255,255,0.2)]'}`}
                                            style={{
                                                left: `${zone.x}%`,
                                                top: `${zone.y}%`,
                                                width: `${zone.width}%`,
                                                height: `${zone.height}%`,
                                                backgroundColor: color + (isSelected ? '44' : '22'),
                                                borderRadius: 4,
                                                cursor: 'move',
                                            }}
                                            onMouseDown={e => onZoneMouseDown(e, zone.id)}
                                        >
                                            <Icon className="h-5 w-5 opacity-70" style={{ color }} />
                                            <span className="text-[10px] font-semibold mt-1 text-white/70 truncate px-1 max-w-full text-center leading-tight">{zone.label}</span>
                                            <span className="text-[9px] text-white/40 truncate px-1 max-w-full text-center">{Math.round(zone.width)}×{Math.round(zone.height)}%</span>

                                            {/* Resize handles */}
                                            {isSelected && RESIZE_HANDLES.map(h => (
                                                <div
                                                    key={h.id}
                                                    className="absolute w-2.5 h-2.5 bg-orange-500 rounded-sm border border-white"
                                                    style={{ ...h.style, cursor: h.cursor, position: 'absolute', zIndex: 10 }}
                                                    onMouseDown={e => onZoneMouseDown(e, zone.id, h.id)}
                                                />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT: Zone Properties ──────────────────────── */}
                    <div className="w-56 flex-shrink-0 border-l bg-white overflow-y-auto p-3">
                        {selectedZone ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold uppercase text-gray-500">Zone Settings</p>
                                    <button onClick={() => removeZone(selectedZone.id)} className="text-red-400 hover:text-red-600">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>

                                <div>
                                    <Label className="text-[10px] text-gray-500">Label</Label>
                                    <Input value={selectedZone.label} onChange={e => updateZone(selectedZone.id, { label: e.target.value })} className="h-7 text-xs mt-1" />
                                </div>

                                <div>
                                    <Label className="text-[10px] text-gray-500">Widget Type</Label>
                                    <Select value={selectedZone.content_type} onValueChange={v => updateZone(selectedZone.id, { content_type: v, label: WIDGET_TYPES.find(w => w.value === v)?.label || v })}>
                                        <SelectTrigger className="h-7 text-xs mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {WIDGET_TYPES.map(wt => <SelectItem key={wt.value} value={wt.value}>{wt.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Widget config selector for applicable types */}
                                {['weather', 'clock', 'menu', 'live_orders', 'queue_status'].includes(selectedZone.content_type) && widgetConfigs.filter(c => c.widget_type === selectedZone.content_type || c.widget_type === 'menu_widget' && selectedZone.content_type === 'menu').length > 0 && (
                                    <div>
                                        <Label className="text-[10px] text-gray-500">Widget Config</Label>
                                        <Select value={selectedZone.widget_config_id || 'default'} onValueChange={v => updateZone(selectedZone.id, { widget_config_id: v === 'default' ? '' : v })}>
                                            <SelectTrigger className="h-7 text-xs mt-1">
                                                <SelectValue placeholder="Default" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="default">Default</SelectItem>
                                                {widgetConfigs
                                                    .filter(c => c.widget_type === selectedZone.content_type || (c.widget_type === 'menu_widget' && selectedZone.content_type === 'menu'))
                                                    .map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                                                }
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {/* Position / size */}
                                <div>
                                    <Label className="text-[10px] text-gray-500 mb-1 block">Position & Size (%)</Label>
                                    <div className="grid grid-cols-2 gap-1">
                                        {['x','y','width','height'].map(field => (
                                            <div key={field}>
                                                <Label className="text-[9px] text-gray-400">{field.toUpperCase()}</Label>
                                                <Input
                                                    type="number"
                                                    value={Math.round(selectedZone[field])}
                                                    onChange={e => {
                                                        const v = parseInt(e.target.value) || 0;
                                                        updateZone(selectedZone.id, { [field]: clamp(v, field === 'width' || field === 'height' ? 5 : 0, 100) });
                                                    }}
                                                    className="h-6 text-xs p-1"
                                                    min={field === 'width' || field === 'height' ? 5 : 0}
                                                    max={100}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Zone color preview */}
                                <div className="rounded-lg border p-2 flex items-center gap-2">
                                    {(() => { const wt = WIDGET_TYPES.find(w => w.value === selectedZone.content_type); const Icon = wt?.icon || Image; return <Icon className="h-4 w-4" style={{ color: wt?.color }} />; })()}
                                    <div>
                                        <p className="text-xs font-medium">{selectedZone.label}</p>
                                        <p className="text-[10px] text-gray-400">{Math.round(selectedZone.width)}% × {Math.round(selectedZone.height)}%</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center py-8">
                                <Move className="h-8 w-8 text-gray-300 mb-2" />
                                <p className="text-xs text-gray-400">Click a zone to edit its properties</p>
                            </div>
                        )}

                        {/* Zone list */}
                        {zones.length > 0 && (
                            <div className="mt-4 space-y-1">
                                <p className="text-[10px] font-bold uppercase text-gray-400 mb-2">All Zones</p>
                                {zones.map(zone => {
                                    const wt = WIDGET_TYPES.find(w => w.value === zone.content_type);
                                    const Icon = wt?.icon || Image;
                                    return (
                                        <button
                                            key={zone.id}
                                            onClick={() => setSelectedId(zone.id)}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${selectedId === zone.id ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50'}`}
                                        >
                                            <Icon className="h-3 w-3 flex-shrink-0" style={{ color: wt?.color }} />
                                            <span className="truncate text-gray-700">{zone.label}</span>
                                            <button
                                                onClick={e => { e.stopPropagation(); removeZone(zone.id); }}
                                                className="ml-auto text-gray-300 hover:text-red-400 flex-shrink-0"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────────────── */}
                <div className="px-4 py-3 border-t flex-shrink-0 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-2">
                        {zones.map(zone => {
                            const wt = WIDGET_TYPES.find(w => w.value === zone.content_type);
                            return (
                                <Badge key={zone.id} variant="outline" className="text-[10px] gap-1 py-0" style={{ borderColor: wt?.color + '66', color: wt?.color }}>
                                    {zone.label}
                                </Badge>
                            );
                        })}
                        {zones.length === 0 && <span className="text-xs text-gray-400">No zones yet — add widgets from the left panel</span>}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} className="bg-orange-500 hover:bg-orange-600 text-white">
                            Save Layout
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}