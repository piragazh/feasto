import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, X, Check, Tag } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = { name: '', price: '', category: '' };

export default function CustomItemsManager({ restaurantId }) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingIdx, setEditingIdx] = useState(null);
    const [editForm, setEditForm] = useState(EMPTY_FORM);
    const queryClient = useQueryClient();

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant-custom-items', restaurantId],
        queryFn: async () => {
            const r = await base44.entities.Restaurant.filter({ id: restaurantId });
            return r[0];
        },
        enabled: !!restaurantId,
        staleTime: 0,
    });

    const customItems = restaurant?.custom_pos_items || [];

    // Derive unique categories for display
    const categories = [...new Set(customItems.map(i => i.category).filter(Boolean))];

    const saveMutation = useMutation({
        mutationFn: async (newItems) => {
            await base44.entities.Restaurant.update(restaurantId, { custom_pos_items: newItems });
            return newItems;
        },
        onSuccess: (newItems) => {
            queryClient.setQueryData(['restaurant-custom-items', restaurantId], (old) => old ? { ...old, custom_pos_items: newItems } : old);
            queryClient.invalidateQueries({ queryKey: ['restaurant-custom-items', restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
            toast.success('Custom items updated');
        },
        onError: (err) => toast.error('Failed to update: ' + err.message),
    });

    const handleAdd = () => {
        if (!form.name.trim() || !form.price || parseFloat(form.price) < 0) {
            toast.error('Please enter a valid name and price');
            return;
        }
        const newItems = [
            ...customItems,
            { name: form.name.trim(), price: parseFloat(form.price), category: form.category.trim() }
        ];
        saveMutation.mutate(newItems);
        setForm(EMPTY_FORM);
    };

    const handleDelete = (idx) => {
        saveMutation.mutate(customItems.filter((_, i) => i !== idx));
    };

    const startEdit = (idx) => {
        setEditingIdx(idx);
        setEditForm({ name: customItems[idx].name, price: String(customItems[idx].price), category: customItems[idx].category || '' });
    };

    const saveEdit = (idx) => {
        if (!editForm.name.trim() || !editForm.price || parseFloat(editForm.price) < 0) {
            toast.error('Please enter a valid name and price');
            return;
        }
        const latest = queryClient.getQueryData(['restaurant-custom-items', restaurantId]);
        const current = (latest?.custom_pos_items || customItems).map((item, i) =>
            i === idx
                ? { name: editForm.name.trim(), price: parseFloat(editForm.price), category: editForm.category.trim() }
                : item
        );
        setEditingIdx(null);
        saveMutation.mutate(current);
    };

    // Group items by category for display
    const grouped = customItems.reduce((acc, item, idx) => {
        const cat = item.category || 'Uncategorised';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push({ ...item, _idx: idx });
        return acc;
    }, {});

    return (
        <div className="space-y-5">
            {/* Add form */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="font-semibold text-sm text-gray-700">Add New Custom Item</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <Label className="text-xs">Item Name *</Label>
                        <Input
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Delivery Charge"
                            className="mt-1"
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Price (£) *</Label>
                        <Input
                            type="number" step="0.01" min="0"
                            value={form.price}
                            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                            placeholder="0.00"
                            className="mt-1"
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                    </div>
                    <div>
                        <Label className="text-xs flex items-center gap-1"><Tag className="h-3 w-3" /> Category (optional)</Label>
                        <Input
                            value={form.category}
                            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                            placeholder="e.g. Extras, Charges"
                            className="mt-1"
                            list="existing-categories"
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <datalist id="existing-categories">
                            {categories.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                </div>
                <Button onClick={handleAdd} disabled={saveMutation.isPending} className="bg-orange-500 hover:bg-orange-600 w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-2" /> Add Item
                </Button>
            </div>

            {/* Items list grouped by category */}
            {customItems.length === 0 ? (
                <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <Tag className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No custom items yet.</p>
                    <p className="text-xs mt-1">Add items like Delivery Charge, Bag Fee, etc. They'll appear as quick-add buttons in the POS.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat}>
                            <div className="flex items-center gap-2 mb-2">
                                <Tag className="h-3.5 w-3.5 text-orange-500" />
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{cat}</span>
                                <Badge className="bg-orange-100 text-orange-700 text-xs">{items.length}</Badge>
                            </div>
                            <div className="space-y-2">
                                {items.map(item => (
                                    <div key={item._idx} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
                                        {editingIdx === item._idx ? (
                                            <>
                                                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="flex-1 h-8 text-sm" />
                                                <Input type="number" step="0.01" min="0" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} className="w-24 h-8 text-sm" />
                                                <Input value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} placeholder="Category" className="w-28 h-8 text-sm" list="existing-categories" />
                                                <Button size="sm" onClick={() => saveEdit(item._idx)} className="bg-green-600 hover:bg-green-700 h-8 w-8 p-0"><Check className="h-3.5 w-3.5" /></Button>
                                                <Button size="sm" variant="outline" onClick={() => setEditingIdx(null)} className="h-8 w-8 p-0"><X className="h-3.5 w-3.5" /></Button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="font-semibold text-sm flex-1">{item.name}</p>
                                                <p className="text-orange-600 font-bold text-sm w-16 text-right">£{item.price.toFixed(2)}</p>
                                                <Button size="sm" variant="outline" onClick={() => startEdit(item._idx)} className="h-8 w-8 p-0"><Edit2 className="h-3.5 w-3.5" /></Button>
                                                <Button size="sm" variant="destructive" onClick={() => handleDelete(item._idx)} className="h-8 w-8 p-0"><Trash2 className="h-3.5 w-3.5" /></Button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {customItems.length > 0 && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Items grouped by category will appear as separate button groups in the POS function bar.
                </p>
            )}
        </div>
    );
}