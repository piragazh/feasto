import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Type, Trash2, Download, Save, Move, Layers, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

const FONTS = ['Impact', 'Arial', 'Georgia', 'Verdana', 'Courier New'];
const COLORS = ['#FFFFFF', '#FFD700', '#FF4500', '#FF1493', '#00FF88', '#00BFFF', '#000000', '#FF6B35'];

export default function CanvasEditor({ open, onClose, backgroundUrl, restaurantId, menuItems = [], onUse }) {
    const queryClient = useQueryClient();
    const canvasRef = useRef(null);
    const [elements, setElements] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Reset on open
    useEffect(() => {
        if (open) { setElements([]); setSelectedId(null); }
    }, [open]);

    const addText = () => {
        const id = Date.now().toString();
        setElements(prev => [...prev, {
            id, type: 'text',
            content: 'YOUR TEXT HERE',
            x: 10, y: 10,
            fontSize: 48, color: '#FFFFFF',
            fontWeight: 'bold', fontFamily: 'Impact',
            textShadow: '2px 2px 6px rgba(0,0,0,0.9)',
            background: '', padding: '', borderRadius: '',
        }]);
        setSelectedId(id);
    };

    const addMenuImage = (item) => {
        if (!item.image_url) { toast.error('This item has no image'); return; }
        const id = Date.now().toString();
        setElements(prev => [...prev, {
            id, type: 'image',
            src: item.image_url, label: item.name,
            price: `£${item.price?.toFixed(2)}`,
            x: 20, y: 20,
            size: 120,
            showLabel: true, showPrice: true,
            border: '',
        }]);
        setSelectedId(id);
    };

    const update = (id, patch) => setElements(prev => prev.map(el => el.id === id ? { ...el, ...patch } : el));
    const deleteEl = () => { if (!selectedId) return; setElements(prev => prev.filter(el => el.id !== selectedId)); setSelectedId(null); };

    // Mouse drag
    const onMouseDown = (e, id) => {
        e.preventDefault(); e.stopPropagation();
        setSelectedId(id);
        const el = elements.find(el => el.id === id);
        setDragging({ id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y });
    };

    const onMouseMove = useCallback((e) => {
        if (!dragging || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = (e.clientX - dragging.startX) / rect.width * 100;
        const dy = (e.clientY - dragging.startY) / rect.height * 100;
        update(dragging.id, { x: Math.max(0, Math.min(88, dragging.origX + dx)), y: Math.max(0, Math.min(88, dragging.origY + dy)) });
    }, [dragging]);

    const onMouseUp = useCallback(() => setDragging(null), []);

    useEffect(() => {
        if (!dragging) return;
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
    }, [dragging]);

    // Touch drag
    const onTouchStart = (e, id) => {
        const t = e.touches[0];
        setSelectedId(id);
        const el = elements.find(el => el.id === id);
        setDragging({ id, startX: t.clientX, startY: t.clientY, origX: el.x, origY: el.y });
    };

    const onTouchMove = (e) => {
        if (!dragging || !canvasRef.current) return;
        e.preventDefault();
        const t = e.touches[0];
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = (t.clientX - dragging.startX) / rect.width * 100;
        const dy = (t.clientY - dragging.startY) / rect.height * 100;
        update(dragging.id, { x: Math.max(0, Math.min(88, dragging.origX + dx)), y: Math.max(0, Math.min(88, dragging.origY + dy)) });
    };

    const handleExport = async (saveToLibrary) => {
        if (!canvasRef.current) return;
        setIsSaving(true);
        try {
            const canvas = await html2canvas(canvasRef.current, { useCORS: true, allowTaint: true, scale: 2, logging: false });
            const dataUrl = canvas.toDataURL('image/png');
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], `canvas-${Date.now()}.png`, { type: 'image/png' });
            const { file_url } = await base44.integrations.Core.UploadFile({ file });

            if (saveToLibrary) {
                await base44.entities.MediaFile.create({ restaurant_id: restaurantId, file_url, file_name: file.name, file_type: 'image/png', file_size: blob.size });
                queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
                toast.success('Saved to Media Library!');
            } else {
                onUse?.(file_url);
                onClose?.();
            }
        } catch (err) {
            toast.error('Export failed: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const selected = elements.find(el => el.id === selectedId);
    const menuWithImages = menuItems.filter(i => i.image_url);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl w-full p-0 gap-0 overflow-hidden" style={{ height: '92vh' }}>
                <DialogHeader className="px-5 py-3 border-b flex-shrink-0 bg-white">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Layers className="h-5 w-5 text-orange-500" />
                        Canvas Editor
                        <span className="text-xs font-normal text-gray-400 ml-1">— drag elements to reposition</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(92vh - 57px)' }}>
                    {/* LEFT PANEL */}
                    <div className="w-60 border-r bg-gray-50 flex flex-col flex-shrink-0 overflow-y-auto">

                        {/* Add Elements */}
                        <div className="p-3 border-b">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Add Elements</p>
                            <Button size="sm" variant="outline" className="w-full mb-2 justify-start" onClick={addText}>
                                <Type className="h-3.5 w-3.5 mr-2 text-blue-500" /> Add Text
                            </Button>
                            {menuWithImages.length > 0 && (
                                <>
                                    <p className="text-[10px] text-gray-400 mb-1.5 mt-2">Menu Items</p>
                                    <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                                        {menuWithImages.map(item => (
                                            <button key={item.id} onClick={() => addMenuImage(item)}
                                                className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-all text-left group">
                                                <img src={item.image_url} alt={item.name} className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium truncate">{item.name}</p>
                                                    <p className="text-[10px] text-orange-500 font-bold">£{item.price?.toFixed(2)}</p>
                                                </div>
                                                <ImageIcon className="h-3 w-3 text-gray-300 group-hover:text-orange-400 flex-shrink-0" />
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Properties Panel */}
                        {selected ? (
                            <div className="p-3 flex-1">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Properties</p>
                                    <button onClick={deleteEl} className="text-red-400 hover:text-red-600 transition-colors">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>

                                {selected.type === 'text' && (
                                    <div className="space-y-3">
                                        <div>
                                            <Label className="text-[10px] text-gray-500 uppercase">Text</Label>
                                            <textarea value={selected.content}
                                                onChange={e => update(selected.id, { content: e.target.value })}
                                                className="w-full mt-1 text-sm border rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
                                                rows={3} />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-gray-500 uppercase">Size: {selected.fontSize}px</Label>
                                            <input type="range" min="10" max="120" value={selected.fontSize}
                                                onChange={e => update(selected.id, { fontSize: +e.target.value })}
                                                className="w-full accent-orange-500 mt-1" />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-gray-500 uppercase">Font</Label>
                                            <select value={selected.fontFamily}
                                                onChange={e => update(selected.id, { fontFamily: e.target.value })}
                                                className="w-full mt-1 text-sm border rounded-md p-1.5 focus:outline-none">
                                                {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-gray-500 uppercase">Color</Label>
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                {COLORS.map(c => (
                                                    <button key={c} onClick={() => update(selected.id, { color: c })}
                                                        className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${selected.color === c ? 'border-orange-500 scale-110' : 'border-white shadow'}`}
                                                        style={{ backgroundColor: c }} />
                                                ))}
                                                <input type="color" value={selected.color}
                                                    onChange={e => update(selected.id, { color: e.target.value })}
                                                    className="w-6 h-6 rounded cursor-pointer border shadow" title="Custom" />
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => update(selected.id, { fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold' })}
                                                className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${selected.fontWeight === 'bold' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 hover:border-gray-300'}`}>
                                                Bold
                                            </button>
                                            <button onClick={() => update(selected.id, { textShadow: selected.textShadow ? '' : '2px 2px 8px rgba(0,0,0,0.9)' })}
                                                className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${selected.textShadow ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 hover:border-gray-300'}`}>
                                                Shadow
                                            </button>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-gray-500 uppercase">Background</Label>
                                            <div className="flex gap-1 mt-1">
                                                {[
                                                    { label: 'None', bg: '', active: !selected.background },
                                                    { label: 'Dark', bg: 'rgba(0,0,0,0.6)', active: selected.background?.startsWith('rgba(0') },
                                                    { label: 'Orange', bg: 'rgba(255,69,0,0.85)', active: selected.background?.startsWith('rgba(255') },
                                                ].map(opt => (
                                                    <button key={opt.label} onClick={() => update(selected.id, { background: opt.bg, padding: opt.bg ? '3px 8px' : '', borderRadius: opt.bg ? '4px' : '' })}
                                                        className={`flex-1 py-1 rounded text-[10px] border transition-colors ${opt.active ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 hover:border-gray-300'}`}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selected.type === 'image' && (
                                    <div className="space-y-3">
                                        <div>
                                            <Label className="text-[10px] text-gray-500 uppercase">Size: {selected.size}px</Label>
                                            <input type="range" min="50" max="280" value={selected.size}
                                                onChange={e => update(selected.id, { size: +e.target.value })}
                                                className="w-full accent-orange-500 mt-1" />
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => update(selected.id, { showLabel: !selected.showLabel })}
                                                className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${selected.showLabel ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200'}`}>
                                                Name
                                            </button>
                                            <button onClick={() => update(selected.id, { showPrice: !selected.showPrice })}
                                                className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${selected.showPrice ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200'}`}>
                                                Price
                                            </button>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-gray-500 uppercase">Border</Label>
                                            <div className="flex gap-1 mt-1">
                                                {[
                                                    { label: 'None', val: '', active: !selected.border },
                                                    { label: 'White', val: '3px solid white', active: selected.border?.includes('white') },
                                                    { label: 'Orange', val: '3px solid #FF4500', active: selected.border?.includes('#FF4') },
                                                ].map(opt => (
                                                    <button key={opt.label} onClick={() => update(selected.id, { border: opt.val })}
                                                        className={`flex-1 py-1 rounded text-[10px] border transition-colors ${opt.active ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200'}`}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-gray-500 uppercase">Shape</Label>
                                            <div className="flex gap-1 mt-1">
                                                {[
                                                    { label: 'Circle', val: '50%' },
                                                    { label: 'Rounded', val: '16px' },
                                                    { label: 'Square', val: '0' },
                                                ].map(opt => (
                                                    <button key={opt.label} onClick={() => update(selected.id, { borderRadius: opt.val })}
                                                        className={`flex-1 py-1 rounded text-[10px] border transition-colors ${(selected.borderRadius || '50%') === opt.val ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200'}`}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-4 flex-1 flex flex-col items-center justify-center text-center gap-2">
                                <Move className="h-8 w-8 text-gray-200" />
                                <p className="text-xs text-gray-400">Click an element on the canvas to edit its properties</p>
                            </div>
                        )}
                    </div>

                    {/* CANVAS AREA */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-gray-800">
                        <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                            <div
                                ref={canvasRef}
                                className="relative overflow-hidden shadow-2xl"
                                style={{
                                    backgroundImage: `url(${backgroundUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    width: '100%',
                                    maxWidth: '760px',
                                    aspectRatio: '16/9',
                                    cursor: 'default',
                                }}
                                onClick={() => setSelectedId(null)}
                            >
                                {elements.map(el => (
                                    <div
                                        key={el.id}
                                        style={{
                                            position: 'absolute',
                                            left: `${el.x}%`,
                                            top: `${el.y}%`,
                                            cursor: dragging?.id === el.id ? 'grabbing' : 'grab',
                                            userSelect: 'none',
                                            outline: selectedId === el.id ? '2px dashed rgba(255,165,0,0.9)' : '2px dashed transparent',
                                            outlineOffset: '4px',
                                            zIndex: selectedId === el.id ? 20 : 1,
                                            transition: dragging?.id === el.id ? 'none' : 'outline 0.1s',
                                        }}
                                        onMouseDown={e => onMouseDown(e, el.id)}
                                        onTouchStart={e => { e.preventDefault(); onTouchStart(e, el.id); }}
                                        onTouchMove={e => { e.preventDefault(); onTouchMove(e); }}
                                        onTouchEnd={() => setDragging(null)}
                                        onClick={e => { e.stopPropagation(); setSelectedId(el.id); }}
                                    >
                                        {el.type === 'text' ? (
                                            <p style={{
                                                fontSize: `${el.fontSize}px`,
                                                color: el.color,
                                                fontWeight: el.fontWeight,
                                                fontFamily: el.fontFamily,
                                                textShadow: el.textShadow || 'none',
                                                background: el.background || 'transparent',
                                                padding: el.padding || '0',
                                                borderRadius: el.borderRadius || '0',
                                                whiteSpace: 'pre-wrap',
                                                lineHeight: 1.15,
                                                pointerEvents: 'none',
                                                margin: 0,
                                            }}>{el.content}</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none', gap: '2px' }}>
                                                <img
                                                    src={el.src} alt={el.label} crossOrigin="anonymous"
                                                    style={{
                                                        width: `${el.size}px`, height: `${el.size}px`,
                                                        objectFit: 'cover',
                                                        borderRadius: el.borderRadius ?? '50%',
                                                        border: el.border || 'none',
                                                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                                        display: 'block',
                                                    }}
                                                />
                                                {el.showLabel && <p style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold', textShadow: '1px 1px 3px black', margin: 0 }}>{el.label}</p>}
                                                {el.showPrice && <p style={{ color: '#FFD700', fontSize: '15px', fontWeight: '900', textShadow: '1px 1px 3px black', margin: 0 }}>{el.price}</p>}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {elements.length === 0 && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="text-center bg-black/40 rounded-xl px-6 py-4">
                                            <Type className="h-8 w-8 text-white/40 mx-auto mb-2" />
                                            <p className="text-white/60 text-sm">Use the left panel to add text or menu item images</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom bar */}
                        <div className="bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <p className="text-xs text-gray-400">{elements.length} element{elements.length !== 1 ? 's' : ''}</p>
                                {elements.length > 0 && (
                                    <button onClick={() => { setElements([]); setSelectedId(null); }}
                                        className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                                        <RotateCcw className="h-3 w-3" /> Clear all
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={onClose} size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white">
                                    Cancel
                                </Button>
                                <Button size="sm" onClick={() => handleExport(true)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
                                    {isSaving ? 'Saving…' : <><Save className="h-3.5 w-3.5 mr-1.5" />Save to Library</>}
                                </Button>
                                <Button size="sm" onClick={() => handleExport(false)} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                                    {isSaving ? 'Exporting…' : <><Download className="h-3.5 w-3.5 mr-1.5" />Use in Playlist</>}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}