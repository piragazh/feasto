import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/*
  Price field modes:
  - "item_to_item"   : adjust item_price → write to item_price
  - "pos_to_pos"     : adjust pos_price  → write to pos_price
  - "item_to_pos"    : adjust item_price → write to pos_price
  - "pos_to_item"    : adjust pos_price  → write to item_price
  - "both_to_both"   : adjust both item_price and pos_price independently
*/

export default function BulkPriceAdjustment() {
    const [selectedRestaurantId, setSelectedRestaurantId] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [adjustmentType, setAdjustmentType] = useState('percentage'); // percentage | fixed
    const [direction, setDirection] = useState('increase');
    const [value, setValue] = useState('');
    const [priceMode, setPriceMode] = useState('item_to_item');
    const [preview, setPreview] = useState(null);
    const [isApplying, setIsApplying] = useState(false);

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: menuItems = [], isLoading: itemsLoading } = useQuery({
        queryKey: ['bulk-menu-items', selectedRestaurantId],
        queryFn: () => selectedRestaurantId === 'all'
            ? base44.entities.MenuItem.list()
            : base44.entities.MenuItem.filter({ restaurant_id: selectedRestaurantId }),
    });

    const categories = ['all', ...new Set(menuItems.map(i => i.category).filter(Boolean))];

    const filteredItems = menuItems.filter(item =>
        selectedCategory === 'all' || item.category === selectedCategory
    );

    const adjust = (price, numVal) => {
        if (price == null || price <= 0) return price;
        let result;
        if (adjustmentType === 'percentage') {
            result = direction === 'increase'
                ? price * (1 + numVal / 100)
                : price * (1 - numVal / 100);
        } else {
            result = direction === 'increase' ? price + numVal : price - numVal;
        }
        return Math.max(0, Math.round(result * 100) / 100);
    };

    const buildPreview = () => {
        const numVal = parseFloat(value);
        if (!numVal || numVal <= 0) {
            toast.error('Please enter a valid adjustment value');
            return;
        }

        const changes = filteredItems.map(item => {
            const currentItemPrice = item.price;
            const currentPosPrice = item.pos_price ?? null;

            // Determine new values based on mode
            let newItemPrice = currentItemPrice; // default: unchanged
            let newPosPrice = currentPosPrice;   // default: unchanged
            let itemPriceChanged = false;
            let posPriceChanged = false;

            switch (priceMode) {
                case 'item_to_item':
                    newItemPrice = adjust(currentItemPrice, numVal);
                    itemPriceChanged = newItemPrice !== currentItemPrice;
                    break;
                case 'pos_to_pos': {
                    // If no POS price set, fall back to item price as the source
                    const source = currentPosPrice ?? currentItemPrice;
                    newPosPrice = adjust(source, numVal);
                    posPriceChanged = newPosPrice !== currentPosPrice;
                    break;
                }
                case 'item_to_pos':
                    newPosPrice = adjust(currentItemPrice, numVal);
                    posPriceChanged = newPosPrice !== currentPosPrice;
                    break;
                case 'pos_to_item': {
                    const source = currentPosPrice ?? currentItemPrice;
                    newItemPrice = adjust(source, numVal);
                    itemPriceChanged = newItemPrice !== currentItemPrice;
                    break;
                }
                case 'both_to_both':
                    newItemPrice = adjust(currentItemPrice, numVal);
                    itemPriceChanged = newItemPrice !== currentItemPrice;
                    const sourcePOS = currentPosPrice ?? currentItemPrice;
                    newPosPrice = adjust(sourcePOS, numVal);
                    posPriceChanged = newPosPrice !== currentPosPrice;
                    break;
            }

            const changed = itemPriceChanged || posPriceChanged;

            return {
                id: item.id,
                name: item.name,
                category: item.category,
                restaurant_id: item.restaurant_id,
                oldItemPrice: currentItemPrice,
                oldPosPrice: currentPosPrice,
                newItemPrice,
                newPosPrice,
                itemPriceChanged,
                posPriceChanged,
                changed,
            };
        }).filter(c => c.changed);

        setPreview(changes);
    };

    const applyChanges = async () => {
        if (!preview || preview.length === 0) return;

        const confirmed = window.confirm(`Apply price changes to ${preview.length} items? This cannot be undone.`);
        if (!confirmed) return;

        setIsApplying(true);
        let successCount = 0;
        let failCount = 0;

        for (const change of preview) {
            try {
                const updateData = {};
                if (change.itemPriceChanged) updateData.price = change.newItemPrice;
                if (change.posPriceChanged) updateData.pos_price = change.newPosPrice;
                await base44.entities.MenuItem.update(change.id, updateData);
                successCount++;
            } catch (e) {
                failCount++;
            }
        }

        setIsApplying(false);
        setPreview(null);

        if (failCount === 0) {
            toast.success(`Successfully updated ${successCount} items`);
        } else {
            toast.warning(`Updated ${successCount} items, ${failCount} failed`);
        }
    };

    const restaurantName = (id) => restaurants.find(r => r.id === id)?.name || id;

    const priceModeLabels = {
        item_to_item: 'Item Price → Item Price',
        pos_to_pos: 'POS Price → POS Price',
        item_to_pos: 'Item Price → POS Price',
        pos_to_item: 'POS Price → Item Price',
        both_to_both: 'Both Item + POS (each adjusted)',
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Bulk Price Adjustment</h2>
                <p className="text-gray-500 text-sm mt-1">Centrally adjust menu item prices across restaurants without interrupting operations</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-orange-500" />
                        Configure Adjustment
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Restaurant & Category */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Restaurant</Label>
                            <Select value={selectedRestaurantId} onValueChange={(v) => { setSelectedRestaurantId(v); setSelectedCategory('all'); setPreview(null); }}>
                                <SelectTrigger><SelectValue placeholder="Select restaurant..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Restaurants</SelectItem>
                                    {restaurants.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Category</Label>
                            <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setPreview(null); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {categories.map(c => (
                                        <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Price Mode */}
                    <div>
                        <Label>Price Operation</Label>
                        <Select value={priceMode} onValueChange={(v) => { setPriceMode(v); setPreview(null); }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(priceModeLabels).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                            Source → Target. e.g. "Item Price → POS Price" reads item price and writes adjusted value to POS price field.
                        </p>
                    </div>

                    {/* Adjustment */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label>Direction</Label>
                            <Select value={direction} onValueChange={(v) => { setDirection(v); setPreview(null); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="increase">Increase ↑</SelectItem>
                                    <SelectItem value="decrease">Decrease ↓</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Type</Label>
                            <Select value={adjustmentType} onValueChange={(v) => { setAdjustmentType(v); setPreview(null); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                                    <SelectItem value="fixed">Fixed Amount (£)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Value {adjustmentType === 'percentage' ? '(%)' : '(£)'}</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={adjustmentType === 'percentage' ? 'e.g. 5' : 'e.g. 1.00'}
                                value={value}
                                onChange={(e) => { setValue(e.target.value); setPreview(null); }}
                            />
                        </div>
                    </div>

                    {/* Summary */}
                    {value && parseFloat(value) > 0 && (
                        <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                            <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                            <span>
                                Will <strong>{direction}</strong> by <strong>{adjustmentType === 'percentage' ? `${value}%` : `£${value}`}</strong>
                                {' '}· <strong>{priceModeLabels[priceMode]}</strong>
                                {' '}· <strong>{filteredItems.length} items</strong>
                                {selectedRestaurantId !== 'all' && ` from ${restaurantName(selectedRestaurantId)}`}
                                {selectedCategory !== 'all' && ` in "${selectedCategory}"`}
                            </span>
                        </div>
                    )}

                    <Button
                        onClick={buildPreview}
                        disabled={!value || parseFloat(value) <= 0 || itemsLoading}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        Preview Changes ({filteredItems.length} items)
                    </Button>
                </CardContent>
            </Card>

            {/* Preview Table */}
            {preview && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                Preview — {preview.length} items will change
                            </CardTitle>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
                                <Button
                                    onClick={applyChanges}
                                    disabled={isApplying || preview.length === 0}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                    {isApplying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Apply {preview.length} Changes
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-gray-500">
                                        <th className="pb-2 font-medium">Item</th>
                                        <th className="pb-2 font-medium">Category</th>
                                        {selectedRestaurantId === 'all' && <th className="pb-2 font-medium">Restaurant</th>}
                                        <th className="pb-2 font-medium text-right">Item Price (old)</th>
                                        <th className="pb-2 font-medium text-right">Item Price (new)</th>
                                        <th className="pb-2 font-medium text-right">POS Price (old)</th>
                                        <th className="pb-2 font-medium text-right">POS Price (new)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {preview.slice(0, 200).map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="py-2 font-medium">{item.name}</td>
                                            <td className="py-2 text-gray-500">{item.category || '—'}</td>
                                            {selectedRestaurantId === 'all' && (
                                                <td className="py-2 text-gray-500">{restaurantName(item.restaurant_id)}</td>
                                            )}
                                            <td className="py-2 text-right text-gray-500">£{item.oldItemPrice?.toFixed(2)}</td>
                                            <td className={`py-2 text-right font-semibold ${item.itemPriceChanged ? 'text-orange-600' : 'text-gray-400'}`}>
                                                £{item.newItemPrice?.toFixed(2)}
                                            </td>
                                            <td className="py-2 text-right text-gray-500">
                                                {item.oldPosPrice != null ? `£${item.oldPosPrice.toFixed(2)}` : '—'}
                                            </td>
                                            <td className={`py-2 text-right font-semibold ${item.posPriceChanged ? 'text-orange-600' : 'text-gray-400'}`}>
                                                {item.newPosPrice != null ? `£${item.newPosPrice.toFixed(2)}` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {preview.length > 200 && (
                                <p className="text-center text-sm text-gray-500 mt-3">
                                    Showing first 200 of {preview.length} items
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}