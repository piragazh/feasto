import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Save, Grid3x3, LayoutGrid, Info, ChevronRight, QrCode } from 'lucide-react';
import { Dialog as QRDialog, DialogContent as QRDialogContent, DialogHeader as QRDialogHeader, DialogTitle as QRDialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const GRID_SIZE = 20; // snap to 20px grid
const TABLE_W = 90;
const TABLE_H = 90;

function snapToGrid(v) {
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

const SHAPES = [
    { key: 'square', label: 'Square' },
    { key: 'round', label: 'Round' },
    { key: 'rect', label: 'Rectangle' },
];

export default function TableManagement({ restaurantId }) {
    const [view, setView] = useState('floorplan'); // 'floorplan' | 'list'
    const [addOpen, setAddOpen] = useState(false);
    const [editTable, setEditTable] = useState(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [qrTable, setQrTable] = useState(null);
    const [isDragging, setIsDragging] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);
    const queryClient = useQueryClient();

    const { data: tables = [], isLoading } = useQuery({
        queryKey: ['restaurant-tables', restaurantId],
        queryFn: () => base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId }),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.RestaurantTable.update(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restaurant-tables', restaurantId] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.RestaurantTable.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant-tables', restaurantId] });
            toast.success('Table deleted');
        },
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.RestaurantTable.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant-tables', restaurantId] });
            setAddOpen(false);
            toast.success('Table added');
        },
    });

    // ─── Drag handlers ─────────────────────────────────────────────────────────
    const onMouseDown = useCallback((e, table) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        setIsDragging(table.id);
        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, []);

    const onMouseMove = useCallback((e) => {
        if (!isDragging || !containerRef.current) return;
        const cr = containerRef.current.getBoundingClientRect();
        const x = snapToGrid(Math.max(0, Math.min(e.clientX - cr.left - dragOffset.x, cr.width - TABLE_W)));
        const y = snapToGrid(Math.max(0, Math.min(e.clientY - cr.top - dragOffset.y, cr.height - TABLE_H)));
        const el = document.getElementById(`design-table-${isDragging}`);
        if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
    }, [isDragging, dragOffset]);

    const onMouseUp = useCallback(async (e) => {
        if (!isDragging || !containerRef.current) return;
        const cr = containerRef.current.getBoundingClientRect();
        const x = snapToGrid(Math.max(0, Math.min(e.clientX - cr.left - dragOffset.x, cr.width - TABLE_W)));
        const y = snapToGrid(Math.max(0, Math.min(e.clientY - cr.top - dragOffset.y, cr.height - TABLE_H)));
        await updateMutation.mutateAsync({ id: isDragging, data: { position: { x, y } } });
        setIsDragging(null);
    }, [isDragging, dragOffset, updateMutation]);

    // ─── Touch handlers ────────────────────────────────────────────────────────
    const onTouchStart = useCallback((e, table) => {
        if (e.target.closest('button')) return;
        const touch = e.touches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        setIsDragging(table.id);
        setDragOffset({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
    }, []);

    const onTouchMove = useCallback((e) => {
        if (!isDragging || !containerRef.current) return;
        e.preventDefault();
        const touch = e.touches[0];
        const cr = containerRef.current.getBoundingClientRect();
        const x = snapToGrid(Math.max(0, Math.min(touch.clientX - cr.left - dragOffset.x, cr.width - TABLE_W)));
        const y = snapToGrid(Math.max(0, Math.min(touch.clientY - cr.top - dragOffset.y, cr.height - TABLE_H)));
        const el = document.getElementById(`design-table-${isDragging}`);
        if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
    }, [isDragging, dragOffset]);

    const onTouchEnd = useCallback(async (e) => {
        if (!isDragging || !containerRef.current) return;
        const touch = e.changedTouches[0];
        const cr = containerRef.current.getBoundingClientRect();
        const x = snapToGrid(Math.max(0, Math.min(touch.clientX - cr.left - dragOffset.x, cr.width - TABLE_W)));
        const y = snapToGrid(Math.max(0, Math.min(touch.clientY - cr.top - dragOffset.y, cr.height - TABLE_H)));
        await updateMutation.mutateAsync({ id: isDragging, data: { position: { x, y } } });
        setIsDragging(null);
    }, [isDragging, dragOffset, updateMutation]);

    const statusColors = {
        available: 'border-green-500 bg-green-50',
        occupied: 'border-orange-500 bg-orange-50',
        reserved: 'border-blue-500 bg-blue-50',
        needs_cleaning: 'border-yellow-500 bg-yellow-50',
        maintenance: 'border-red-500 bg-red-50',
    };

    const shapeClass = (shape) => shape === 'round' ? 'rounded-full' : shape === 'rect' ? 'rounded-lg' : 'rounded-xl';

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-2xl font-bold text-gray-900">Table Layout Designer</h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setView(view === 'floorplan' ? 'list' : 'floorplan')}>
                        {view === 'floorplan' ? <><Grid3x3 className="h-4 w-4 mr-1.5" />List View</> : <><LayoutGrid className="h-4 w-4 mr-1.5" />Floor Plan</>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                        <LayoutGrid className="h-4 w-4 mr-1.5" /> Bulk Add
                    </Button>
                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" /> Add Table
                    </Button>
                </div>
            </div>

            {/* Legend */}
            {view === 'floorplan' && (
                <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Available</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Occupied</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Reserved</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Needs Cleaning</span>
                    <span className="flex items-center gap-1 ml-auto"><Info className="h-3.5 w-3.5" /> Drag tables to position them</span>
                </div>
            )}

            {isLoading && <div className="py-12 text-center text-gray-500">Loading tables...</div>}

            {/* ── Floor Plan Designer ── */}
            {!isLoading && view === 'floorplan' && (
                <div
                    ref={containerRef}
                    id="table-designer-container"
                    className="relative w-full bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden"
                    style={{ height: '600px', backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px` }}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={() => setIsDragging(null)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    {tables.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none">
                            <LayoutGrid className="h-16 w-16 mb-3 opacity-30" />
                            <p className="text-lg font-medium">No tables yet</p>
                            <p className="text-sm">Click "Add Table" to place your first table</p>
                        </div>
                    )}

                    {tables.map((table, idx) => {
                        const pos = table.position || { x: (idx % 6) * 110 + 20, y: Math.floor(idx / 6) * 110 + 20 };
                        const shape = table.shape || 'square';
                        const w = shape === 'rect' ? 130 : TABLE_W;
                        const h = TABLE_H;

                        return (
                            <div
                                key={table.id}
                                id={`design-table-${table.id}`}
                                className={`absolute flex flex-col items-center justify-center border-2 cursor-move select-none transition-shadow ${shapeClass(shape)} ${statusColors[table.status] || 'border-gray-400 bg-gray-100'} ${isDragging === table.id ? 'shadow-2xl z-10 scale-105' : 'shadow-sm hover:shadow-md'}`}
                                style={{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${w}px`, height: `${h}px` }}
                                onMouseDown={(e) => onMouseDown(e, table)}
                                onTouchStart={(e) => onTouchStart(e, table)}
                            >
                                <span className="font-bold text-gray-800 text-sm text-center leading-tight px-1">{table.table_number}</span>
                                <span className="text-gray-500 text-xs mt-0.5">{table.capacity} seats</span>
                                {table.location && <span className="text-gray-400 text-[10px] truncate max-w-full px-1">{table.location}</span>}

                                <div className="absolute top-1 right-1 flex gap-0.5">
                                    <button
                                        className="w-5 h-5 bg-purple-500 rounded-full text-white text-[10px] flex items-center justify-center hover:bg-purple-600"
                                        onClick={(e) => { e.stopPropagation(); setQrTable(table); }}
                                        title="QR Code"
                                    >Q</button>
                                    <button
                                        className="w-5 h-5 bg-blue-500 rounded-full text-white text-[10px] flex items-center justify-center hover:bg-blue-600"
                                        onClick={(e) => { e.stopPropagation(); setEditTable(table); }}
                                        title="Edit"
                                    >✎</button>
                                    <button
                                        className="w-5 h-5 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center hover:bg-red-600"
                                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(table.id); }}
                                        title="Delete"
                                    >×</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── List View ── */}
            {!isLoading && view === 'list' && (
                <div className="space-y-2">
                    {tables.length === 0 && (
                        <div className="text-center py-12 text-gray-400">No tables yet. Click "Add Table" to create one.</div>
                    )}
                    {tables.map(table => (
                        <div key={table.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 flex items-center justify-center border-2 font-bold text-sm ${shapeClass(table.shape || 'square')} ${statusColors[table.status] || 'border-gray-400 bg-gray-100'}`}>
                                    {table.capacity}
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900">{table.table_number}</p>
                                    <p className="text-xs text-gray-500">{table.capacity} seats · {table.location || 'No location'} · {(table.shape || 'square')}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge className={`text-white text-xs ${
                                    table.status === 'available' ? 'bg-green-500' :
                                    table.status === 'occupied' ? 'bg-orange-500' :
                                    table.status === 'reserved' ? 'bg-blue-500' :
                                    'bg-yellow-500'
                                }`}>{table.status?.replace('_', ' ')}</Badge>
                                <Button size="sm" variant="outline" className="text-purple-600 hover:text-purple-800" onClick={() => setQrTable(table)} title="QR Code"><QrCode className="h-4 w-4" /></Button>
                                <Button size="sm" variant="outline" onClick={() => setEditTable(table)}><ChevronRight className="h-4 w-4" /></Button>
                                <Button size="sm" variant="outline" className="text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate(table.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Add Table Dialog ── */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add Table</DialogTitle></DialogHeader>
                    <TableForm
                        restaurantId={restaurantId}
                        tableCount={tables.length}
                        onSubmit={(data) => createMutation.mutate(data)}
                        isLoading={createMutation.isPending}
                    />
                </DialogContent>
            </Dialog>

            {/* ── Edit Table Dialog ── */}
            <Dialog open={!!editTable} onOpenChange={(o) => !o && setEditTable(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Edit Table</DialogTitle></DialogHeader>
                    {editTable && (
                        <TableForm
                            restaurantId={restaurantId}
                            initialData={editTable}
                            tableCount={tables.length}
                            onSubmit={async (data) => {
                                await updateMutation.mutateAsync({ id: editTable.id, data });
                                setEditTable(null);
                                toast.success('Table updated');
                            }}
                            isLoading={updateMutation.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* ── QR Code Dialog ── */}
            <QRDialog open={!!qrTable} onOpenChange={(o) => !o && setQrTable(null)}>
                <QRDialogContent>
                    <QRDialogHeader>
                        <QRDialogTitle>QR Code – {qrTable?.table_number}</QRDialogTitle>
                    </QRDialogHeader>
                    {qrTable && <TableQRCode table={qrTable} restaurantId={restaurantId} />}
                </QRDialogContent>
            </QRDialog>

            {/* ── Bulk Add Dialog ── */}
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Bulk Generate Tables</DialogTitle></DialogHeader>
                    <BulkAddForm
                        restaurantId={restaurantId}
                        existingCount={tables.length}
                        onCreate={async (tables) => {
                            for (const t of tables) await createMutation.mutateAsync(t);
                            setBulkOpen(false);
                            toast.success(`${tables.length} tables created`);
                        }}
                        isLoading={createMutation.isPending}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Table Form ────────────────────────────────────────────────────────────────
function TableForm({ restaurantId, initialData, tableCount, onSubmit, isLoading }) {
    const [form, setForm] = useState({
        restaurant_id: restaurantId,
        table_number: initialData?.table_number || `Table ${tableCount + 1}`,
        capacity: initialData?.capacity || 4,
        location: initialData?.location || '',
        shape: initialData?.shape || 'square',
        status: initialData?.status || 'available',
        is_active: initialData?.is_active !== false,
        position: initialData?.position || null,
    });

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    return (
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-3">
            <div>
                <label className="text-sm font-medium block mb-1">Table Name / Number *</label>
                <Input value={form.table_number} onChange={e => set('table_number', e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-sm font-medium block mb-1">Capacity (seats) *</label>
                    <Input type="number" min="1" max="50" value={form.capacity} onChange={e => set('capacity', parseInt(e.target.value))} required />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Shape</label>
                    <select value={form.shape} onChange={e => set('shape', e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm">
                        {SHAPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className="text-sm font-medium block mb-1">Location / Area</label>
                <Input placeholder="e.g. Window, Bar, Terrace" value={form.location} onChange={e => set('location', e.target.value)} />
            </div>
            <div>
                <label className="text-sm font-medium block mb-1">Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm">
                    <option value="available">Available</option>
                    <option value="occupied">Occupied</option>
                    <option value="reserved">Reserved</option>
                    <option value="needs_cleaning">Needs Cleaning</option>
                    <option value="maintenance">Maintenance</option>
                </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
                Active (visible in POS)
            </label>
            <Button type="submit" disabled={isLoading} className="w-full bg-orange-500 hover:bg-orange-600">
                {isLoading ? 'Saving...' : 'Save Table'}
            </Button>
        </form>
    );
}

// ─── Table QR Code ─────────────────────────────────────────────────────────────
function TableQRCode({ table, restaurantId }) {
    const qrUrl = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}#/TableOrder?restaurant_id=${restaurantId}&table_id=${table.id}`;
    // Use a free QR API to generate the code
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl)}`;

    const handlePrint = () => {
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>QR – ${table.table_number}</title>
            <style>body{font-family:sans-serif;text-align:center;padding:40px;}h2{margin-bottom:8px;}p{color:#666;font-size:14px;}</style>
            </head><body>
            <h2>${table.table_number}</h2>
            <p>Scan to order</p>
            <img src="${qrApiUrl}" width="220" height="220" />
            <p style="margin-top:12px;font-size:12px;word-break:break-all;color:#aaa;">${qrUrl}</p>
            <script>window.onload=()=>{window.print();}<\/script>
            </body></html>`);
        win.document.close();
    };

    return (
        <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-sm text-gray-500 text-center">Customers scan this to view the menu and order from their table.</p>
            <img src={qrApiUrl} alt="QR Code" className="w-56 h-56 border rounded-xl" />
            <p className="text-xs text-gray-400 break-all text-center max-w-xs">{qrUrl}</p>
            <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => navigator.clipboard.writeText(qrUrl).then(() => alert('Link copied!'))}>
                    Copy Link
                </Button>
                <Button className="flex-1 bg-orange-500 hover:bg-orange-600" onClick={handlePrint}>
                    Print QR
                </Button>
            </div>
        </div>
    );
}

// ─── Bulk Add Form ─────────────────────────────────────────────────────────────
function BulkAddForm({ restaurantId, existingCount, onCreate, isLoading }) {
    const [count, setCount] = useState(5);
    const [prefix, setPrefix] = useState('Table');
    const [startNum, setStartNum] = useState(existingCount + 1);
    const [capacity, setCapacity] = useState(4);
    const [shape, setShape] = useState('square');

    const handleCreate = () => {
        const tables = Array.from({ length: count }, (_, i) => ({
            restaurant_id: restaurantId,
            table_number: `${prefix} ${startNum + i}`,
            capacity: parseInt(capacity),
            shape,
            status: 'available',
            is_active: true,
            position: {
                x: ((existingCount + i) % 6) * 110 + 20,
                y: Math.floor((existingCount + i) / 6) * 110 + 20,
            }
        }));
        onCreate(tables);
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-sm font-medium block mb-1">Name Prefix</label>
                    <Input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Table" />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Start Number</label>
                    <Input type="number" min="1" value={startNum} onChange={e => setStartNum(parseInt(e.target.value))} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-sm font-medium block mb-1">Number of Tables</label>
                    <Input type="number" min="1" max="50" value={count} onChange={e => setCount(parseInt(e.target.value))} />
                </div>
                <div>
                    <label className="text-sm font-medium block mb-1">Seats per Table</label>
                    <Input type="number" min="1" max="20" value={capacity} onChange={e => setCapacity(e.target.value)} />
                </div>
            </div>
            <div>
                <label className="text-sm font-medium block mb-1">Shape</label>
                <select value={shape} onChange={e => setShape(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm">
                    {SHAPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
            </div>
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Will create: <strong>{prefix} {startNum}</strong> → <strong>{prefix} {startNum + count - 1}</strong> ({count} tables, {capacity} seats each)
            </p>
            <Button onClick={handleCreate} disabled={isLoading} className="w-full bg-orange-500 hover:bg-orange-600">
                {isLoading ? 'Creating...' : `Create ${count} Tables`}
            </Button>
        </div>
    );
}