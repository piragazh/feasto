import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Zap, Plus, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';

const MAX_QUICK_SALE = 4;

/**
 * Quick-sale button configuration.
 *
 * These are for low-value counter sales where the full ordering flow is
 * overkill - a bag of wings, a can of drink, someone handing over exact change.
 *
 * Capped at four: the bottom bar also holds Item #, Custom Item, Hold and Held
 * Orders, and past four the row wraps and the buttons become small enough to
 * mis-tap. A mis-tap here rings a sale, so the cap is deliberate.
 */
export default function POSQuickSaleSettings({ restaurantId, restaurant }) {
    const [items, setItems] = useState([]);
    const [saving, setSaving] = useState(false);

    const { data: menuItems = [] } = useQuery({
        queryKey: ['quick-sale-menu', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true }),
        enabled: !!restaurantId,
    });

    useEffect(() => {
        setItems(restaurant?.quick_sale_items || []);
    }, [restaurant?.quick_sale_items]);

    const save = async (next) => {
        setSaving(true);
        try {
            await base44.entities.Restaurant.update(restaurantId, { quick_sale_items: next });
            setItems(next);
            toast.success('Quick sale buttons updated');
        } catch (e) {
            toast.error('Could not save: ' + (e?.message || 'unknown error'));
        } finally {
            setSaving(false);
        }
    };

    const addRow = () => {
        if (items.length >= MAX_QUICK_SALE) {
            toast.error(`Maximum ${MAX_QUICK_SALE} quick sale buttons`);
            return;
        }
        setItems([...items, { menu_item_id: '', label: '' }]);
    };

    const updateRow = (idx, patch) => {
        setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    };

    const removeRow = (idx) => {
        const next = items.filter((_, i) => i !== idx);
        setItems(next);
        save(next);
    };

    const configured = items.filter(i => i.menu_item_id);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Quick Sale Buttons
                </CardTitle>
                <CardDescription>
                    One-tap buttons on the POS bottom bar for common low-value counter sales
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                        Tapping a quick sale button adds the item and opens payment ready for <strong>exact cash</strong>.
                        The cashier confirms with a second tap, which rings the sale and opens the drawer.
                        It is deliberately not a single tap &mdash; an accidental tap would otherwise create a real
                        order and open the till with no money going in.
                    </span>
                </div>

                {items.length === 0 && (
                    <p className="text-sm text-gray-500 py-2">
                        No quick sale buttons configured. Add one below to show it on the POS.
                    </p>
                )}

                <div className="space-y-2">
                    {items.map((row, idx) => {
                        const menuItem = menuItems.find(m => m.id === row.menu_item_id);
                        const price = menuItem ? (menuItem.pos_price != null ? menuItem.pos_price : menuItem.price) : null;
                        return (
                            <div key={idx} className="flex items-end gap-2 p-3 border border-gray-200 rounded-xl bg-gray-50">
                                <div className="flex-1 min-w-0">
                                    <Label className="text-xs">Menu Item</Label>
                                    <select
                                        value={row.menu_item_id}
                                        onChange={(e) => updateRow(idx, { menu_item_id: e.target.value })}
                                        className="w-full mt-1 h-11 px-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm"
                                    >
                                        <option value="">— Select an item —</option>
                                        {menuItems.map(m => (
                                            <option key={m.id} value={m.id}>
                                                {m.name} — £{Number(m.pos_price != null ? m.pos_price : m.price).toFixed(2)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-40">
                                    <Label className="text-xs">Button Label</Label>
                                    <Input
                                        value={row.label || ''}
                                        onChange={(e) => updateRow(idx, { label: e.target.value })}
                                        placeholder={menuItem?.name || 'Optional'}
                                        className="mt-1 h-11"
                                    />
                                </div>
                                {price != null && (
                                    <div className="pb-2.5 text-sm font-bold text-gray-700 tabular-nums whitespace-nowrap">
                                        £{Number(price).toFixed(2)}
                                    </div>
                                )}
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => removeRow(idx)}
                                    className="h-11 w-11 p-0 text-red-600 border-red-200 hover:bg-red-50 flex-shrink-0"
                                    title="Remove"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={addRow} disabled={items.length >= MAX_QUICK_SALE}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add Button
                    </Button>
                    <Button
                        type="button"
                        onClick={() => save(configured)}
                        disabled={saving}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                        {saving ? 'Saving…' : 'Save Quick Sale Buttons'}
                    </Button>
                    <span className="text-xs text-gray-500 ml-auto">{configured.length} / {MAX_QUICK_SALE} configured</span>
                </div>
            </CardContent>
        </Card>
    );
}
