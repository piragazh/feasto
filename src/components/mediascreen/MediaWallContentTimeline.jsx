import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit2, GripVertical, Save, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Timeline grid that mirrors the design in the reference image:
 *   - Left column: row duration + transition label
 *   - N columns: one per physical screen
 *   - Content blocks can span multiple columns (like "Span video 1")
 *   - Each row = one time-slot in the playback sequence
 */
export default function MediaWallContentTimeline({ restaurantId, wallName, wallConfig }) {
    const queryClient = useQueryClient();
    const numScreens = wallConfig ? wallConfig.cols || 4 : 4;

    // ── State ────────────────────────────────────────────────────────────────
    // rows: array of { id, duration, transition, slots: [ {screenStart, span, title, type} | null ] }
    const [rows, setRows] = useState([]);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [addingToRow, setAddingToRow] = useState(null); // row index
    const [addingSlotStart, setAddingSlotStart] = useState(0); // which screen column
    const [editingRow, setEditingRow] = useState(null); // row index for duration edit
    const [slotForm, setSlotForm] = useState({
        title: '',
        type: 'menu', // menu | video | span_video | span_menu
        span: 1,
        media_url: '',
    });
    const [rowForm, setRowForm] = useState({ duration: 30, transition: 'fade' });

    // ── Helpers ───────────────────────────────────────────────────────────────
    const addRow = () => {
        const newRow = {
            id: Date.now(),
            duration: 30,
            transition: 'fade',
            // slots array: one entry per screen; null = empty; object = content
            // An object with span > 1 occupies that many consecutive screen columns
            slots: Array(numScreens).fill(null),
        };
        setRows(prev => [...prev, newRow]);
    };

    const deleteRow = (rowIdx) => {
        setRows(prev => prev.filter((_, i) => i !== rowIdx));
    };

    const updateRowMeta = (rowIdx, field, value) => {
        setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r));
    };

    const openAddSlot = (rowIdx, screenIdx) => {
        setAddingToRow(rowIdx);
        setAddingSlotStart(screenIdx);
        setSlotForm({ title: '', type: 'menu', span: 1, media_url: '' });
        setShowAddDialog(true);
    };

    const handleAddSlot = () => {
        if (!slotForm.title.trim()) { toast.error('Title is required'); return; }
        const span = Math.min(slotForm.span, numScreens - addingSlotStart);

        setRows(prev => prev.map((row, i) => {
            if (i !== addingToRow) return row;
            const newSlots = [...row.slots];
            // Place the content block starting at addingSlotStart
            newSlots[addingSlotStart] = { title: slotForm.title, type: slotForm.type, span, screenStart: addingSlotStart };
            // Null out spanned columns so we skip rendering them
            for (let s = addingSlotStart + 1; s < addingSlotStart + span; s++) {
                newSlots[s] = '__spanned__';
            }
            return { ...row, slots: newSlots };
        }));
        setShowAddDialog(false);
        toast.success('Content added');
    };

    const removeSlot = (rowIdx, screenIdx) => {
        setRows(prev => prev.map((row, i) => {
            if (i !== rowIdx) return row;
            const newSlots = [...row.slots];
            const slot = newSlots[screenIdx];
            if (slot && slot !== '__spanned__') {
                const span = slot.span || 1;
                for (let s = screenIdx; s < screenIdx + span; s++) {
                    newSlots[s] = null;
                }
            }
            return { ...row, slots: newSlots };
        }));
    };

    const TRANSITION_OPTIONS = ['fade', 'cut', 'slide', 'zoom'];
    const TYPE_COLORS = {
        menu: 'bg-[#1e4d7b] hover:bg-[#1e4d7b]',
        span_video: 'bg-[#1e4d7b] hover:bg-[#1e4d7b]',
        span_menu: 'bg-[#1e4d7b] hover:bg-[#1e4d7b]',
        video: 'bg-[#1e4d7b] hover:bg-[#1e4d7b]',
    };

    return (
        <div className="space-y-3">
            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                    Configure what each screen shows at each time slot in the sequence.
                </p>
                <Button size="sm" onClick={addRow} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Add Row
                </Button>
            </div>

            {/* ── Table ── */}
            {rows.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl py-16 text-center text-gray-400">
                    <p className="text-sm font-medium">No timeline rows yet</p>
                    <p className="text-xs mt-1 mb-4">Add rows to build your content schedule</p>
                    <Button size="sm" variant="outline" onClick={addRow}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add First Row
                    </Button>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                {/* Drag handle + Time column */}
                                <th className="w-6 border-r border-gray-200" />
                                <th className="w-28 text-left px-3 py-2.5 text-xs font-semibold text-gray-500 border-r border-gray-200">
                                    Time
                                </th>
                                {Array.from({ length: numScreens }, (_, i) => (
                                    <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200 last:border-r-0">
                                        Screen {i + 1}
                                    </th>
                                ))}
                                <th className="w-8 border-l border-gray-200" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIdx) => {
                                // Build rendered columns, skipping __spanned__ entries
                                const renderedCols = [];
                                let screenIdx = 0;
                                while (screenIdx < numScreens) {
                                    const slot = row.slots[screenIdx];
                                    if (slot === '__spanned__') {
                                        screenIdx++;
                                        continue;
                                    }
                                    if (slot && typeof slot === 'object') {
                                        const span = slot.span || 1;
                                        renderedCols.push({ screenIdx, slot, colSpan: span });
                                        screenIdx += span;
                                    } else {
                                        renderedCols.push({ screenIdx, slot: null, colSpan: 1 });
                                        screenIdx++;
                                    }
                                }

                                return (
                                    <tr key={row.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/50 align-top">
                                        {/* Drag handle */}
                                        <td className="border-r border-gray-200 text-center py-3">
                                            <GripVertical className="h-4 w-4 text-gray-300 mx-auto" />
                                        </td>

                                        {/* Time/Duration column */}
                                        <td className="border-r border-gray-200 px-3 py-3 align-middle">
                                            {editingRow === rowIdx ? (
                                                <div className="space-y-1.5">
                                                    <Input
                                                        type="number"
                                                        value={rowForm.duration}
                                                        onChange={e => setRowForm(p => ({ ...p, duration: parseInt(e.target.value) || 0 }))}
                                                        className="h-7 text-xs px-2"
                                                        min={1}
                                                    />
                                                    <select
                                                        value={rowForm.transition}
                                                        onChange={e => setRowForm(p => ({ ...p, transition: e.target.value }))}
                                                        className="w-full h-7 text-xs border rounded px-1"
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
                                                        >
                                                            <Save className="h-2.5 w-2.5 inline" />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingRow(null)}
                                                            className="flex-1 h-6 bg-gray-100 text-gray-600 rounded text-[10px]"
                                                        >
                                                            <X className="h-2.5 w-2.5 inline" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => { setRowForm({ duration: row.duration, transition: row.transition }); setEditingRow(rowIdx); }}
                                                    className="text-left group"
                                                >
                                                    <div className="text-orange-600 font-semibold text-sm">
                                                        {row.duration}sec
                                                        {row.transition && row.transition !== 'cut' && (
                                                            <span className="text-gray-400 font-normal"> / {row.transition}</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 group-hover:text-blue-500 transition-colors">click to edit</div>
                                                </button>
                                            )}
                                        </td>

                                        {/* Screen content columns */}
                                        {renderedCols.map(({ screenIdx: sIdx, slot, colSpan }) => (
                                            <td
                                                key={sIdx}
                                                colSpan={colSpan}
                                                className="border-r border-gray-200 last:border-r-0 p-2 align-middle"
                                                style={{ minWidth: 120 }}
                                            >
                                                {slot ? (
                                                    <div className={`rounded-lg px-3 py-2.5 text-white text-sm font-medium flex items-center justify-between gap-2 ${TYPE_COLORS[slot.type] || 'bg-[#1e4d7b]'}`}>
                                                        <span className="truncate">{slot.title}</span>
                                                        <button
                                                            onClick={() => removeSlot(rowIdx, sIdx)}
                                                            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => openAddSlot(rowIdx, sIdx)}
                                                        className="w-full h-12 border-2 border-dashed border-gray-200 rounded-lg text-gray-300 hover:border-blue-400 hover:text-blue-400 transition-colors flex items-center justify-center"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        ))}

                                        {/* Delete row */}
                                        <td className="border-l border-gray-200 px-1 py-2 align-middle text-center">
                                            <button
                                                onClick={() => deleteRow(rowIdx)}
                                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Add Row button at bottom ── */}
            {rows.length > 0 && (
                <button
                    onClick={addRow}
                    className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm flex items-center justify-center gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add Row
                </button>
            )}

            {/* ── Add Slot Dialog ── */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Add Content Block</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Title</Label>
                            <Input
                                value={slotForm.title}
                                onChange={e => setSlotForm(p => ({ ...p, title: e.target.value }))}
                                placeholder="e.g. Menu 1, Span video 1"
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>Type</Label>
                            <Select value={slotForm.type} onValueChange={v => setSlotForm(p => ({ ...p, type: v }))}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="menu">Menu</SelectItem>
                                    <SelectItem value="video">Video</SelectItem>
                                    <SelectItem value="span_video">Span Video (multi-screen)</SelectItem>
                                    <SelectItem value="span_menu">Span Menu (multi-screen)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

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
                                        <SelectItem key={n} value={String(n)}>
                                            {n} screen{n > 1 ? 's' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {slotForm.span > 1 && (
                                <p className="text-xs text-blue-600 mt-1">
                                    Will span Screen {addingSlotStart + 1} → Screen {addingSlotStart + slotForm.span}
                                </p>
                            )}
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button onClick={handleAddSlot} className="flex-1">Add</Button>
                            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}