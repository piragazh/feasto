import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, Save, X, FolderOpen, Upload, Zap, Clock, Cloud, Package, Utensils, Video, Eye } from 'lucide-react';
import { toast } from 'sonner';
import FileManager from './FileManager';
import TimelineRowPreview from './TimelineRowPreview';

// ── Template definitions ──────────────────────────────────────────────────────
const TEMPLATES = [
    {
        id: 'menu_full',
        label: 'Full Menu',
        description: 'All screens show menu',
        icon: <Utensils className="h-5 w-5" />,
        build: (numScreens) => ({
            duration: 30, transition: 'fade',
            slots: Array(numScreens).fill(null).map(() => ({ title: 'Menu', type: 'menu', span: 1 }))
        })
    },
    {
        id: 'half_menu_orders',
        label: '½ Menu + Live Orders',
        description: 'Left half menu, right half POS live orders',
        icon: <Package className="h-5 w-5" />,
        build: (numScreens) => {
            const half = Math.floor(numScreens / 2) || 1;
            const slots = Array(numScreens).fill(null);
            slots[0] = { title: 'Menu', type: 'menu', span: half, screenStart: 0 };
            for (let i = 1; i < half; i++) slots[i] = '__spanned__';
            slots[half] = { title: 'Live Orders', type: 'widget_orders', span: numScreens - half, screenStart: half };
            for (let i = half + 1; i < numScreens; i++) slots[i] = '__spanned__';
            return { duration: 60, transition: 'fade', slots };
        }
    },
    {
        id: 'menu_clock_weather',
        label: 'Menu + Clock + Weather',
        description: 'Menu, clock and weather side by side',
        icon: <Clock className="h-5 w-5" />,
        build: (numScreens) => {
            const slots = Array(numScreens).fill(null);
            if (numScreens >= 3) {
                const menuSpan = numScreens - 2;
                slots[0] = { title: 'Menu', type: 'menu', span: menuSpan, screenStart: 0 };
                for (let i = 1; i < menuSpan; i++) slots[i] = '__spanned__';
                slots[menuSpan] = { title: 'Clock', type: 'widget_time', span: 1, screenStart: menuSpan };
                slots[menuSpan + 1] = { title: 'Weather', type: 'widget_weather', span: 1, screenStart: menuSpan + 1 };
            } else if (numScreens === 2) {
                slots[0] = { title: 'Menu', type: 'menu', span: 1, screenStart: 0 };
                slots[1] = { title: 'Clock', type: 'widget_time', span: 1, screenStart: 1 };
            } else {
                slots[0] = { title: 'Menu', type: 'menu', span: 1, screenStart: 0 };
            }
            return { duration: 0, transition: 'fade', slots };
        }
    },
    {
        id: 'span_video',
        label: 'Full-Wall Video',
        description: 'One video spans all screens',
        icon: <Video className="h-5 w-5" />,
        build: (numScreens) => {
            const slots = Array(numScreens).fill('__spanned__');
            slots[0] = { title: 'Span Video', type: 'span_video', span: numScreens, screenStart: 0 };
            return { duration: 30, transition: 'cut', slots };
        }
    },
];

// ── Type colour + label ───────────────────────────────────────────────────────
const TYPE_META = {
    menu:          { color: 'bg-blue-700',   label: 'Menu',        icon: '🍽️' },
    video:         { color: 'bg-indigo-700', label: 'Video',       icon: '🎬' },
    span_video:    { color: 'bg-violet-700', label: 'Span Video',  icon: '🎬' },
    span_menu:     { color: 'bg-blue-800',   label: 'Span Menu',   icon: '🍽️' },
    widget_time:   { color: 'bg-teal-700',   label: 'Clock',       icon: '🕐' },
    widget_weather:{ color: 'bg-sky-700',    label: 'Weather',     icon: '🌤️' },
    widget_orders: { color: 'bg-emerald-700',label: 'Live Orders', icon: '📦' },
};

const TRANSITION_OPTIONS = ['fade', 'cut', 'slide', 'zoom'];

// ── Serialise / deserialise rows to MediaWallContent records ──────────────────
function rowsToRecords(rows, restaurantId, wallName) {
    return rows.map((row, idx) => ({
        restaurant_id: restaurantId,
        wall_name: wallName,
        title: `Row ${idx + 1}`,
        description: JSON.stringify({ slots: row.slots }),  // slots stored in description
        media_url: 'timeline',
        media_type: 'timeline_row',
        duration: row.duration,
        display_order: idx,
        priority: 1,
        is_active: true,
        widget_config: {
            transition: row.transition,
            slots: row.slots,
        }
    }));
}

function recordsToRows(records) {
    return records
        .sort((a, b) => a.display_order - b.display_order)
        .map(r => ({
            id: r.id,
            duration: r.duration || 30,
            transition: r.widget_config?.transition || 'fade',
            slots: r.widget_config?.slots || [],
        }));
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MediaWallContentTimeline({ restaurantId, wallName, wallConfig }) {
    const queryClient = useQueryClient();
    const numScreens = wallConfig?.cols || 4;

    // ── Fetch existing rows from DB ──────────────────────────────────────────
    const { data: savedRecords = [], isLoading } = useQuery({
        queryKey: ['timeline-rows', restaurantId, wallName],
        queryFn: () => base44.entities.MediaWallContent.filter({
            restaurant_id: restaurantId,
            wall_name: wallName,
            media_type: 'timeline_row'
        }),
        enabled: !!restaurantId && !!wallName,
    });

    const [rows, setRows] = useState([]);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    // ── Fetch menu categories for menu widget config ──────────────────────────
    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items-cats', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });
    const menuCategories = [...new Set(menuItems.map(m => m.category).filter(Boolean))].sort();

    // Sync loaded records into state once
    useEffect(() => {
        if (!isLoading && savedRecords.length > 0 && rows.length === 0) {
            setRows(recordsToRows(savedRecords));
        }
    }, [isLoading, savedRecords]);

    // ── Dialog state ─────────────────────────────────────────────────────────
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [addingToRow, setAddingToRow] = useState(null);
    const [addingSlotStart, setAddingSlotStart] = useState(0);
    const [editingRow, setEditingRow] = useState(null);
    const [rowForm, setRowForm] = useState({ duration: 30, transition: 'fade' });
    const [showFileManager, setShowFileManager] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [previewRow, setPreviewRow] = useState(null); // { row, rowIndex }

    const DEFAULT_SLOT_FORM = {
        title: '',
        type: 'menu',
        span: 1,
        media_url: '',
        // menu config
        menu_categories: [],
        menu_display_images: false,
        // widget_orders config
        order_statuses: ['preparing', 'ready_for_collection'],
        order_types: [],              // empty = all types
        // widget_weather config
        weather_location: '',
        weather_units: 'celsius',     // 'celsius' | 'fahrenheit'
        weather_mode: 'current',      // 'current' | 'forecast'
        // widget_time config
        clock_format: '24h',
        date_format: 'full',
        clock_show_seconds: false,
        clock_font_size: 'large',     // 'small' | 'medium' | 'large'
        clock_color: 'white',         // 'white' | 'orange' | 'teal' | 'yellow'
    };
    const [slotForm, setSlotForm] = useState(DEFAULT_SLOT_FORM);

    // ── Mutations ─────────────────────────────────────────────────────────────
    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.MediaWallContent.delete(id),
    });

    // ── Save all rows to DB ───────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        try {
            // Delete old timeline rows
            const deletePromises = savedRecords.map(r => deleteMutation.mutateAsync(r.id));
            await Promise.all(deletePromises);

            // Re-create
            const records = rowsToRecords(rows, restaurantId, wallName);
            for (const rec of records) {
                await base44.entities.MediaWallContent.create(rec);
            }

            queryClient.invalidateQueries(['timeline-rows', restaurantId, wallName]);
            setDirty(false);
            toast.success('Timeline saved!');
        } catch (e) {
            toast.error('Save failed');
        } finally {
            setSaving(false);
        }
    };

    // ── Row operations ────────────────────────────────────────────────────────
    const mark = (fn) => { fn(); setDirty(true); };

    const addRow = () => mark(() => setRows(prev => [
        ...prev,
        { id: Date.now(), duration: 30, transition: 'fade', slots: Array(numScreens).fill(null) }
    ]));

    const deleteRow = (idx) => mark(() => setRows(prev => prev.filter((_, i) => i !== idx)));

    const updateRowMeta = (idx, field, value) => mark(() =>
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
    );

    const applyTemplate = (tpl) => {
        const built = tpl.build(numScreens);
        mark(() => setRows(prev => [...prev, { id: Date.now(), ...built }]));
        setShowTemplates(false);
        toast.success(`Template "${tpl.label}" added as a new row`);
    };

    // ── Slot operations ───────────────────────────────────────────────────────
    const openAddSlot = (rowIdx, screenIdx) => {
        setAddingToRow(rowIdx);
        setAddingSlotStart(screenIdx);
        setSlotForm(DEFAULT_SLOT_FORM);
        setShowAddDialog(true);
    };

    const handleAddSlot = () => {
        if (!slotForm.title.trim()) { toast.error('Title is required'); return; }
        const span = Math.min(slotForm.span, numScreens - addingSlotStart);
        mark(() => setRows(prev => prev.map((row, i) => {
            if (i !== addingToRow) return row;
            const newSlots = [...row.slots];
            newSlots[addingSlotStart] = {
                title: slotForm.title,
                type: slotForm.type,
                span,
                screenStart: addingSlotStart,
                media_url: slotForm.media_url || null,
                // widget-specific & menu config
                ...(['menu', 'span_menu'].includes(slotForm.type) && {
                    menu_categories: slotForm.menu_categories,
                    menu_display_images: slotForm.menu_display_images,
                }),
                ...(slotForm.type === 'widget_orders' && {
                    order_statuses: slotForm.order_statuses,
                    order_types: slotForm.order_types,
                }),
                ...(slotForm.type === 'widget_weather' && {
                    weather_location: slotForm.weather_location,
                    weather_units: slotForm.weather_units,
                    weather_mode: slotForm.weather_mode,
                }),
                ...(slotForm.type === 'widget_time' && {
                    clock_format: slotForm.clock_format,
                    date_format: slotForm.date_format,
                    clock_show_seconds: slotForm.clock_show_seconds,
                    clock_font_size: slotForm.clock_font_size,
                    clock_color: slotForm.clock_color,
                }),
            };
            for (let s = addingSlotStart + 1; s < addingSlotStart + span; s++) {
                newSlots[s] = '__spanned__';
            }
            return { ...row, slots: newSlots };
        })));
        setShowAddDialog(false);
    };

    const removeSlot = (rowIdx, screenIdx) => {
        mark(() => setRows(prev => prev.map((row, i) => {
            if (i !== rowIdx) return row;
            const newSlots = [...row.slots];
            const slot = newSlots[screenIdx];
            if (slot && slot !== '__spanned__') {
                for (let s = screenIdx; s < screenIdx + (slot.span || 1); s++) newSlots[s] = null;
            }
            return { ...row, slots: newSlots };
        })));
    };

    // ── Render ────────────────────────────────────────────────────────────────
    if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Loading timeline...</div>;

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-gray-500">Each row is a layout — screens cycle through them in order.</p>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)} className="gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-indigo-500" />
                        Quick Start
                    </Button>
                    <Button size="sm" variant="outline" onClick={addRow} className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Add Row
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!dirty || saving}
                        className={`gap-1.5 ${dirty ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400'}`}
                    >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
                    </Button>
                </div>
            </div>

            {/* Table */}
            {rows.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl py-16 text-center text-gray-400">
                    <p className="text-sm font-medium">No timeline rows yet</p>
                    <p className="text-xs mt-1 mb-4">Add a row manually or pick a template to get started</p>
                    <div className="flex gap-2 justify-center">
                        <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)}>
                            <Zap className="h-3.5 w-3.5 mr-1.5 text-indigo-500" />
                            Templates
                        </Button>
                        <Button size="sm" variant="outline" onClick={addRow}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Blank Row
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="w-5 border-r border-gray-200" />
                                <th className="w-28 text-left px-3 py-2.5 text-xs font-semibold text-gray-500 border-r border-gray-200 whitespace-nowrap">
                                    Time / FX
                                </th>
                                {Array.from({ length: numScreens }, (_, i) => (
                                    <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200 last:border-r-0 whitespace-nowrap">
                                        Screen {i + 1}
                                    </th>
                                ))}
                                <th className="w-8 border-l border-gray-200" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIdx) => {
                                // Build rendered cols, skipping __spanned__
                                const renderedCols = [];
                                let si = 0;
                                while (si < numScreens) {
                                    const slot = row.slots[si];
                                    if (slot === '__spanned__') { si++; continue; }
                                    if (slot && typeof slot === 'object') {
                                        renderedCols.push({ si, slot, colSpan: slot.span || 1 });
                                        si += slot.span || 1;
                                    } else {
                                        renderedCols.push({ si, slot: null, colSpan: 1 });
                                        si++;
                                    }
                                }

                                return (
                                    <tr key={row.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/50 align-top">
                                        {/* grip */}
                                        <td className="border-r border-gray-200 text-center py-3">
                                            <GripVertical className="h-4 w-4 text-gray-300 mx-auto" />
                                        </td>

                                        {/* time / transition */}
                                        <td className="border-r border-gray-200 px-3 py-3 align-middle">
                                            {editingRow === rowIdx ? (
                                                <div className="space-y-1.5 min-w-[100px]">
                                                    <Input
                                                        type="number"
                                                        value={rowForm.duration}
                                                        onChange={e => setRowForm(p => ({ ...p, duration: parseInt(e.target.value) || 0 }))}
                                                        className="h-7 text-xs px-2"
                                                        min={0}
                                                        placeholder="sec (0=∞)"
                                                    />
                                                    <select
                                                        value={rowForm.transition}
                                                        onChange={e => setRowForm(p => ({ ...p, transition: e.target.value }))}
                                                        className="w-full h-7 text-xs border rounded px-1 bg-white"
                                                    >
                                                        {TRANSITION_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => {
                                                                updateRowMeta(rowIdx, 'duration', rowForm.duration);
                                                                updateRowMeta(rowIdx, 'transition', rowForm.transition);
                                                                setEditingRow(null);
                                                            }}
                                                            className="flex-1 h-6 bg-blue-600 text-white rounded text-[10px] font-medium"
                                                        >✓</button>
                                                        <button onClick={() => setEditingRow(null)} className="flex-1 h-6 bg-gray-100 text-gray-600 rounded text-[10px]">✕</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button onClick={() => { setRowForm({ duration: row.duration, transition: row.transition }); setEditingRow(rowIdx); }} className="text-left group">
                                                    <div className="text-orange-600 font-semibold text-sm">
                                                        {row.duration > 0 ? `${row.duration}s` : '∞'}
                                                        {row.transition && row.transition !== 'cut' && (
                                                            <span className="text-gray-400 font-normal"> / {row.transition}</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 group-hover:text-blue-500 transition-colors">tap to edit</div>
                                                </button>
                                            )}
                                        </td>

                                        {/* screen cells */}
                                        {renderedCols.map(({ si: sIdx, slot, colSpan }) => (
                                            <td
                                                key={sIdx}
                                                colSpan={colSpan}
                                                className="border-r border-gray-200 last:border-r-0 p-2 align-middle"
                                                style={{ minWidth: 110 }}
                                            >
                                                {slot ? (
                                                    <div className={`rounded-lg px-3 py-2 text-white text-xs font-semibold flex items-center justify-between gap-1 ${TYPE_META[slot.type]?.color || 'bg-blue-700'}`}>
                                                        <span className="truncate">
                                                            {TYPE_META[slot.type]?.icon} {slot.title}
                                                            {slot.span > 1 && <span className="opacity-60 ml-1 font-normal">×{slot.span}</span>}
                                                        </span>
                                                        <button onClick={() => removeSlot(rowIdx, sIdx)} className="flex-shrink-0 opacity-60 hover:opacity-100">
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => openAddSlot(rowIdx, sIdx)}
                                                        className="w-full h-10 border-2 border-dashed border-gray-200 rounded-lg text-gray-300 hover:border-blue-400 hover:text-blue-400 transition-colors flex items-center justify-center"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        ))}

                                        {/* preview + delete row */}
                                        <td className="border-l border-gray-200 px-1 py-2 align-middle text-center">
                                            <div className="flex flex-col gap-1 items-center">
                                                <button
                                                    onClick={() => setPreviewRow({ row, rowIndex: rowIdx })}
                                                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-50 text-gray-300 hover:text-blue-500 transition-colors"
                                                    title="Preview row"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => deleteRow(rowIdx)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {rows.length > 0 && (
                <button onClick={addRow} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm flex items-center justify-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Row
                </button>
            )}

            {/* ── Templates dialog ── */}
            <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-indigo-500" />
                            Quick Start Templates
                        </DialogTitle>
                        <p className="text-sm text-gray-500 mt-1">Not sure where to start? Pick one of these ready-made layouts and customise from there.</p>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        {TEMPLATES.map(tpl => (
                            <button
                                key={tpl.id}
                                onClick={() => applyTemplate(tpl)}
                                className="flex flex-col items-start gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all text-left group"
                            >
                                <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                    {tpl.icon}
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{tpl.label}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Add slot dialog ── */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>What should this screen show?</DialogTitle>
                        <p className="text-sm text-gray-500">Choose a content type and configure it below</p>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Content type picker */}
                        <div>
                            <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Content Type</Label>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                {[
                                    { value: 'menu', icon: '🍽️', label: 'Menu', desc: 'Show your food menu' },
                                    { value: 'widget_orders', icon: '📦', label: 'Live Orders', desc: 'Orders from your POS' },
                                    { value: 'widget_time', icon: '🕐', label: 'Clock', desc: 'Current time & date' },
                                    { value: 'widget_weather', icon: '🌤️', label: 'Weather', desc: 'Local weather forecast' },
                                    { value: 'video', icon: '🎬', label: 'Video / Image', desc: 'Play media file' },
                                    { value: 'span_video', icon: '🖥️', label: 'Span Video', desc: 'Stretch across all screens' },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setSlotForm(p => ({ ...p, type: opt.value, title: p.title || opt.label }))}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${slotForm.type === opt.value ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-200'}`}
                                    >
                                        <span className="text-xl">{opt.icon}</span>
                                        <div>
                                            <div className="text-xs font-semibold text-gray-900">{opt.label}</div>
                                            <div className="text-[10px] text-gray-400 leading-tight">{opt.desc}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Label (for your reference)</Label>
                            <Input
                                value={slotForm.title}
                                onChange={e => setSlotForm(p => ({ ...p, title: e.target.value }))}
                                placeholder="e.g. Main Menu, Drinks Board"
                                className="mt-1"
                            />
                        </div>

                        {/* ── Menu config ── */}
                        {(slotForm.type === 'menu' || slotForm.type === 'span_menu') && (
                            <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                                <div>
                                    <Label className="text-xs font-semibold text-blue-800">Categories to display</Label>
                                    <p className="text-[10px] text-gray-400 mb-2">Leave all unselected to show every category</p>
                                    {menuCategories.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">No categories found — all items will be shown</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                            {menuCategories.map(cat => {
                                                const active = slotForm.menu_categories.includes(cat);
                                                return (
                                                    <button
                                                        key={cat}
                                                        type="button"
                                                        onClick={() => setSlotForm(p => ({
                                                            ...p,
                                                            menu_categories: active
                                                                ? p.menu_categories.filter(c => c !== cat)
                                                                : [...p.menu_categories, cat]
                                                        }))}
                                                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                                                    >
                                                        {cat}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {slotForm.menu_categories.length > 0 && (
                                        <button type="button" onClick={() => setSlotForm(p => ({ ...p, menu_categories: [] }))} className="text-[10px] text-blue-500 hover:underline mt-1">Clear selection (show all)</button>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSlotForm(p => ({ ...p, menu_display_images: !p.menu_display_images }))}
                                        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-colors ${slotForm.menu_display_images ? 'bg-blue-600 border-blue-600' : 'bg-gray-200 border-gray-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${slotForm.menu_display_images ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                    <Label className="text-xs cursor-pointer" onClick={() => setSlotForm(p => ({ ...p, menu_display_images: !p.menu_display_images }))}>
                                        Show item images on screen
                                    </Label>
                                </div>
                            </div>
                        )}

                        {/* Media picker for video types */}
                        {(slotForm.type === 'video' || slotForm.type === 'span_video') && (
                            <div>
                                <Label>Video / Image File</Label>
                                <div className="flex gap-2 mt-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => { setShowAddDialog(false); setShowFileManager(true); }}
                                        className="flex-1"
                                    >
                                        <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                                        Browse Library
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => document.getElementById('timeline-upload').click()}
                                        className="flex-1"
                                    >
                                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                                        Upload
                                    </Button>
                                    <input
                                        id="timeline-upload"
                                        type="file"
                                        accept="image/*,video/*"
                                        className="hidden"
                                        onChange={async e => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            toast.loading('Uploading…');
                                            const { file_url } = await base44.integrations.Core.UploadFile({ file });
                                            toast.dismiss();
                                            setSlotForm(p => ({ ...p, media_url: file_url }));
                                            toast.success('Uploaded');
                                        }}
                                    />
                                </div>
                                {slotForm.media_url && (
                                    <p className="text-xs text-green-600 mt-1">✓ File selected</p>
                                )}
                            </div>
                        )}

                        {/* ── Live Orders config ── */}
                        {slotForm.type === 'widget_orders' && (
                            <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                                {/* Statuses */}
                                <div>
                                    <Label className="text-xs font-semibold text-emerald-800">Show order statuses</Label>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {[
                                            { value: 'confirmed',            label: 'Confirmed' },
                                            { value: 'preparing',            label: 'Preparing' },
                                            { value: 'ready_for_collection', label: 'Ready ✓' },
                                            { value: 'out_for_delivery',     label: 'Out for Delivery' },
                                        ].map(s => {
                                            const active = slotForm.order_statuses.includes(s.value);
                                            return (
                                                <button key={s.value} type="button"
                                                    onClick={() => setSlotForm(p => ({
                                                        ...p,
                                                        order_statuses: active
                                                            ? p.order_statuses.filter(x => x !== s.value)
                                                            : [...p.order_statuses, s.value]
                                                    }))}
                                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'}`}
                                                >{s.label}</button>
                                            );
                                        })}
                                    </div>
                                    {slotForm.order_statuses.length === 0 && (
                                        <p className="text-xs text-red-500 mt-1">Select at least one status</p>
                                    )}
                                </div>
                                {/* Order types */}
                                <div>
                                    <Label className="text-xs font-semibold text-emerald-800">Filter by order type</Label>
                                    <p className="text-[10px] text-gray-400 mb-1.5">Leave all unselected to show every type</p>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { value: 'delivery',   label: '🚗 Delivery' },
                                            { value: 'collection', label: '🏃 Collection' },
                                            { value: 'dine_in',    label: '🍽️ Dine-in' },
                                            { value: 'takeaway',   label: '📦 Takeaway' },
                                        ].map(t => {
                                            const active = slotForm.order_types.includes(t.value);
                                            return (
                                                <button key={t.value} type="button"
                                                    onClick={() => setSlotForm(p => ({
                                                        ...p,
                                                        order_types: active
                                                            ? p.order_types.filter(x => x !== t.value)
                                                            : [...p.order_types, t.value]
                                                    }))}
                                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'}`}
                                                >{t.label}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Weather config ── */}
                        {slotForm.type === 'widget_weather' && (
                            <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                                <div>
                                    <Label className="text-xs font-semibold text-sky-800">Location (city or postcode)</Label>
                                    <Input
                                        value={slotForm.weather_location}
                                        onChange={e => setSlotForm(p => ({ ...p, weather_location: e.target.value }))}
                                        placeholder="e.g. London, Manchester, SW1A 1AA"
                                        className="mt-1"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Leave blank to use the restaurant's location</p>
                                </div>
                                {/* Units */}
                                <div>
                                    <Label className="text-xs font-semibold text-sky-800">Units</Label>
                                    <div className="flex gap-2 mt-1.5">
                                        {[{ value: 'celsius', label: '°C  Celsius' }, { value: 'fahrenheit', label: '°F  Fahrenheit' }].map(opt => (
                                            <button key={opt.value} type="button"
                                                onClick={() => setSlotForm(p => ({ ...p, weather_units: opt.value }))}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${slotForm.weather_units === opt.value ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-300 hover:border-sky-400'}`}
                                            >{opt.label}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Mode */}
                                <div>
                                    <Label className="text-xs font-semibold text-sky-800">Display mode</Label>
                                    <div className="flex gap-2 mt-1.5">
                                        {[{ value: 'current', label: '🌡️ Current' }, { value: 'forecast', label: '📅 3-Day Forecast' }].map(opt => (
                                            <button key={opt.value} type="button"
                                                onClick={() => setSlotForm(p => ({ ...p, weather_mode: opt.value }))}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${slotForm.weather_mode === opt.value ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-300 hover:border-sky-400'}`}
                                            >{opt.label}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Clock config ── */}
                        {slotForm.type === 'widget_time' && (
                            <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/50 p-3">
                                {/* Time format */}
                                <div>
                                    <Label className="text-xs font-semibold text-teal-800">Time format</Label>
                                    <div className="flex gap-2 mt-1.5">
                                        {[{ value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour' }].map(opt => (
                                            <button key={opt.value} type="button"
                                                onClick={() => setSlotForm(p => ({ ...p, clock_format: opt.value }))}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${slotForm.clock_format === opt.value ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'}`}
                                            >{opt.label}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Show seconds */}
                                <div className="flex items-center gap-2">
                                    <button type="button"
                                        onClick={() => setSlotForm(p => ({ ...p, clock_show_seconds: !p.clock_show_seconds }))}
                                        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-colors ${slotForm.clock_show_seconds ? 'bg-teal-600 border-teal-600' : 'bg-gray-200 border-gray-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${slotForm.clock_show_seconds ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                    <Label className="text-xs cursor-pointer" onClick={() => setSlotForm(p => ({ ...p, clock_show_seconds: !p.clock_show_seconds }))}>Show seconds</Label>
                                </div>
                                {/* Font size */}
                                <div>
                                    <Label className="text-xs font-semibold text-teal-800">Font size</Label>
                                    <div className="flex gap-2 mt-1.5">
                                        {[{ value: 'small', label: 'S' }, { value: 'medium', label: 'M' }, { value: 'large', label: 'L' }].map(opt => (
                                            <button key={opt.value} type="button"
                                                onClick={() => setSlotForm(p => ({ ...p, clock_font_size: opt.value }))}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${slotForm.clock_font_size === opt.value ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'}`}
                                            >{opt.label}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Color */}
                                <div>
                                    <Label className="text-xs font-semibold text-teal-800">Colour</Label>
                                    <div className="flex gap-2 mt-1.5">
                                        {[
                                            { value: 'white',  bg: 'bg-white border-gray-300', ring: 'ring-gray-400' },
                                            { value: 'orange', bg: 'bg-orange-400 border-orange-400', ring: 'ring-orange-400' },
                                            { value: 'teal',   bg: 'bg-teal-400 border-teal-400', ring: 'ring-teal-400' },
                                            { value: 'yellow', bg: 'bg-yellow-300 border-yellow-300', ring: 'ring-yellow-400' },
                                        ].map(opt => (
                                            <button key={opt.value} type="button"
                                                onClick={() => setSlotForm(p => ({ ...p, clock_color: opt.value }))}
                                                className={`w-7 h-7 rounded-full border-2 ${opt.bg} ${slotForm.clock_color === opt.value ? `ring-2 ring-offset-1 ${opt.ring}` : ''}`}
                                                title={opt.value}
                                            />
                                        ))}
                                    </div>
                                </div>
                                {/* Date format */}
                                <div>
                                    <Label className="text-xs font-semibold text-teal-800">Date format</Label>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {[
                                            { value: 'full', label: 'Full' },
                                            { value: 'short', label: 'Short' },
                                            { value: 'numeric', label: 'Numeric' },
                                            { value: 'none', label: 'None' },
                                        ].map(opt => (
                                            <button key={opt.value} type="button"
                                                onClick={() => setSlotForm(p => ({ ...p, date_format: opt.value }))}
                                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${slotForm.date_format === opt.value ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'}`}
                                            >{opt.label}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <Label>Span (number of screens)</Label>
                            <Select
                                value={String(slotForm.span)}
                                onValueChange={v => setSlotForm(p => ({ ...p, span: parseInt(v) }))}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: numScreens - addingSlotStart }, (_, i) => i + 1).map(n => (
                                        <SelectItem key={n} value={String(n)}>{n} screen{n > 1 ? 's' : ''}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {slotForm.span > 1 && (
                                <p className="text-xs text-blue-600 mt-1">
                                    Spans Screen {addingSlotStart + 1} → {addingSlotStart + slotForm.span}
                                </p>
                            )}
                        </div>

                        <div className="flex gap-2 pt-1">
                            <Button onClick={handleAddSlot} className="flex-1">Add</Button>
                            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Row preview */}
            <TimelineRowPreview
                open={!!previewRow}
                onClose={() => setPreviewRow(null)}
                row={previewRow?.row}
                rowIndex={previewRow?.rowIndex}
                numScreens={numScreens}
            />

            {/* File manager */}
            <FileManager
                restaurantId={restaurantId}
                open={showFileManager}
                onClose={() => { setShowFileManager(false); setShowAddDialog(true); }}
                onSelectFile={(url, type) => {
                    setSlotForm(p => ({ ...p, media_url: url }));
                    setShowFileManager(false);
                    setShowAddDialog(true);
                    toast.success('File selected');
                }}
            />
        </div>
    );
}